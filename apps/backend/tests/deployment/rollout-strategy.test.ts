/**
 * Deployment Rollout Strategy Tests
 *
 * Verifies canary, blue-green, and percentage-based rollout strategies,
 * traffic splitting, and automatic rollback on errors.
 *
 * No live infrastructure is required — all routing and health checks are
 * simulated in-memory.
 *
 * Rollout best practices documented here:
 *   - Canary: start at ≤10 % traffic; promote only when error rate < 1 %
 *   - Blue-green: keep old environment warm until new one is fully healthy
 *   - Rollback trigger: error rate ≥ 5 % OR p99 latency > 2 000 ms
 *   - Traffic split increments: 5 % → 25 % → 50 % → 100 %
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Types ─────────────────────────────────────────────────────────────────────

type DeploymentColor = 'blue' | 'green';
type RolloutStatus = 'pending' | 'in_progress' | 'promoted' | 'rolled_back';

interface DeploymentVersion {
  id: string;
  errorRate: number;   // 0–1
  p99LatencyMs: number;
}

interface TrafficRequest {
  id: string;
}

interface TrafficResult {
  requestId: string;
  servedBy: string; // deployment version id
}

// ── Rollout engine ────────────────────────────────────────────────────────────

const ROLLBACK_ERROR_RATE_THRESHOLD = 0.05;
const ROLLBACK_LATENCY_THRESHOLD_MS = 2_000;

class RolloutEngine {
  private _canaryPercent = 0;
  private _status: RolloutStatus = 'pending';
  private _requestCounter = 0;

  constructor(
    private readonly stable: DeploymentVersion,
    private readonly candidate: DeploymentVersion,
  ) {}

  get status(): RolloutStatus { return this._status; }
  get canaryPercent(): number { return this._canaryPercent; }

  /** Set the percentage of traffic routed to the candidate. */
  setTrafficPercent(pct: number): void {
    if (pct < 0 || pct > 100) throw new RangeError('pct must be 0–100');
    this._canaryPercent = pct;
    this._status = pct === 0 ? 'pending' : pct === 100 ? 'promoted' : 'in_progress';
  }

  /** Route a single request; returns which version served it. */
  route(req: TrafficRequest): TrafficResult {
    this._requestCounter++;
    const useCanary = (this._requestCounter % 100) < this._canaryPercent;
    const version = useCanary ? this.candidate : this.stable;
    return { requestId: req.id, servedBy: version.id };
  }

  /** Simulate N requests and return counts per version. */
  simulateTraffic(n: number): Record<string, number> {
    const counts: Record<string, number> = { [this.stable.id]: 0, [this.candidate.id]: 0 };
    for (let i = 0; i < n; i++) {
      const { servedBy } = this.route({ id: `req-${i}` });
      counts[servedBy] = (counts[servedBy] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Evaluate candidate health and auto-rollback if thresholds are breached.
   * Returns true if rollback was triggered.
   */
  evaluateAndMaybeRollback(): boolean {
    const shouldRollback =
      this.candidate.errorRate >= ROLLBACK_ERROR_RATE_THRESHOLD ||
      this.candidate.p99LatencyMs > ROLLBACK_LATENCY_THRESHOLD_MS;

    if (shouldRollback) {
      this._canaryPercent = 0;
      this._status = 'rolled_back';
    }
    return shouldRollback;
  }

  promote(): void {
    this._canaryPercent = 100;
    this._status = 'promoted';
  }
}

// ── Blue-green switcher ───────────────────────────────────────────────────────

class BlueGreenSwitcher {
  private _active: DeploymentColor;
  private _standby: DeploymentColor;

  constructor(
    private readonly blue: DeploymentVersion,
    private readonly green: DeploymentVersion,
    initial: DeploymentColor = 'blue',
  ) {
    this._active = initial;
    this._standby = initial === 'blue' ? 'green' : 'blue';
  }

  get active(): DeploymentColor { return this._active; }
  get standby(): DeploymentColor { return this._standby; }

  activeVersion(): DeploymentVersion {
    return this._active === 'blue' ? this.blue : this.green;
  }

  standbyVersion(): DeploymentVersion {
    return this._standby === 'blue' ? this.blue : this.green;
  }

  /** Switch traffic to standby if it is healthy; returns success. */
  switchToStandby(): boolean {
    const candidate = this.standbyVersion();
    const healthy =
      candidate.errorRate < ROLLBACK_ERROR_RATE_THRESHOLD &&
      candidate.p99LatencyMs <= ROLLBACK_LATENCY_THRESHOLD_MS;

    if (healthy) {
      [this._active, this._standby] = [this._standby, this._active];
    }
    return healthy;
  }

  route(req: TrafficRequest): TrafficResult {
    return { requestId: req.id, servedBy: this.activeVersion().id };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVersion(id: string, errorRate = 0.001, p99LatencyMs = 120): DeploymentVersion {
  return { id, errorRate, p99LatencyMs };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Canary rollout — traffic percentage controls', () => {
  let engine: RolloutEngine;

  beforeEach(() => {
    engine = new RolloutEngine(makeVersion('stable-v1'), makeVersion('canary-v2'));
  });

  it('starts with 0 % canary traffic (pending status)', () => {
    expect(engine.canaryPercent).toBe(0);
    expect(engine.status).toBe('pending');
  });

  it('routes 0 % to canary when percent is 0', () => {
    const counts = engine.simulateTraffic(100);
    expect(counts['canary-v2']).toBe(0);
    expect(counts['stable-v1']).toBe(100);
  });

  it('routes ~10 % to canary at 10 % setting', () => {
    engine.setTrafficPercent(10);
    const counts = engine.simulateTraffic(1_000);
    // Allow ±2 % tolerance for the modulo-based router
    expect(counts['canary-v2']).toBeGreaterThanOrEqual(80);
    expect(counts['canary-v2']).toBeLessThanOrEqual(120);
    expect(engine.status).toBe('in_progress');
  });

  it('routes ~50 % to canary at 50 % setting', () => {
    engine.setTrafficPercent(50);
    const counts = engine.simulateTraffic(1_000);
    expect(counts['canary-v2']).toBeGreaterThanOrEqual(480);
    expect(counts['canary-v2']).toBeLessThanOrEqual(520);
  });

  it('routes 100 % to canary after promotion', () => {
    engine.promote();
    const counts = engine.simulateTraffic(100);
    expect(counts['canary-v2']).toBe(100);
    expect(engine.status).toBe('promoted');
  });

  it('rejects out-of-range traffic percentages', () => {
    expect(() => engine.setTrafficPercent(-1)).toThrow(RangeError);
    expect(() => engine.setTrafficPercent(101)).toThrow(RangeError);
  });
});

describe('Canary rollout — automatic rollback', () => {
  it('rolls back when candidate error rate exceeds threshold', () => {
    const engine = new RolloutEngine(
      makeVersion('stable-v1'),
      makeVersion('canary-v2', 0.08), // 8 % error rate — above 5 % threshold
    );
    engine.setTrafficPercent(10);

    const didRollback = engine.evaluateAndMaybeRollback();

    expect(didRollback).toBe(true);
    expect(engine.status).toBe('rolled_back');
    expect(engine.canaryPercent).toBe(0);
  });

  it('rolls back when candidate p99 latency exceeds threshold', () => {
    const engine = new RolloutEngine(
      makeVersion('stable-v1'),
      makeVersion('canary-v2', 0.001, 2_500), // 2 500 ms — above 2 000 ms threshold
    );
    engine.setTrafficPercent(10);

    expect(engine.evaluateAndMaybeRollback()).toBe(true);
    expect(engine.status).toBe('rolled_back');
  });

  it('does NOT roll back when candidate is healthy', () => {
    const engine = new RolloutEngine(
      makeVersion('stable-v1'),
      makeVersion('canary-v2', 0.002, 150), // healthy
    );
    engine.setTrafficPercent(25);

    expect(engine.evaluateAndMaybeRollback()).toBe(false);
    expect(engine.status).toBe('in_progress');
    expect(engine.canaryPercent).toBe(25);
  });

  it('routes all traffic back to stable after rollback', () => {
    const engine = new RolloutEngine(
      makeVersion('stable-v1'),
      makeVersion('canary-v2', 0.1),
    );
    engine.setTrafficPercent(20);
    engine.evaluateAndMaybeRollback();

    const counts = engine.simulateTraffic(100);
    expect(counts['canary-v2']).toBe(0);
    expect(counts['stable-v1']).toBe(100);
  });
});

describe('Canary rollout — incremental rollout steps', () => {
  it('progresses through 5 → 25 → 50 → 100 % without rollback on healthy candidate', () => {
    const engine = new RolloutEngine(
      makeVersion('stable-v1'),
      makeVersion('canary-v2', 0.001, 100),
    );

    for (const pct of [5, 25, 50, 100]) {
      engine.setTrafficPercent(pct);
      const rolledBack = engine.evaluateAndMaybeRollback();
      expect(rolledBack).toBe(false);
      expect(engine.canaryPercent).toBe(pct);
    }

    expect(engine.status).toBe('promoted');
  });
});

describe('Blue-green deployment — switching', () => {
  it('starts serving traffic from the initial active environment', () => {
    const switcher = new BlueGreenSwitcher(
      makeVersion('blue-v1'),
      makeVersion('green-v2'),
      'blue',
    );
    const result = switcher.route({ id: 'r1' });
    expect(result.servedBy).toBe('blue-v1');
    expect(switcher.active).toBe('blue');
  });

  it('switches to green when green is healthy', () => {
    const switcher = new BlueGreenSwitcher(
      makeVersion('blue-v1'),
      makeVersion('green-v2', 0.001, 100),
      'blue',
    );

    const switched = switcher.switchToStandby();

    expect(switched).toBe(true);
    expect(switcher.active).toBe('green');
    expect(switcher.standby).toBe('blue');
  });

  it('routes all traffic to new active after switch', () => {
    const switcher = new BlueGreenSwitcher(
      makeVersion('blue-v1'),
      makeVersion('green-v2'),
      'blue',
    );
    switcher.switchToStandby();

    for (let i = 0; i < 10; i++) {
      expect(switcher.route({ id: `r${i}` }).servedBy).toBe('green-v2');
    }
  });

  it('refuses to switch when standby has high error rate', () => {
    const switcher = new BlueGreenSwitcher(
      makeVersion('blue-v1'),
      makeVersion('green-v2', 0.1), // unhealthy
      'blue',
    );

    const switched = switcher.switchToStandby();

    expect(switched).toBe(false);
    expect(switcher.active).toBe('blue'); // unchanged
  });

  it('refuses to switch when standby has high latency', () => {
    const switcher = new BlueGreenSwitcher(
      makeVersion('blue-v1'),
      makeVersion('green-v2', 0.001, 3_000), // unhealthy latency
      'blue',
    );

    expect(switcher.switchToStandby()).toBe(false);
    expect(switcher.active).toBe('blue');
  });

  it('can switch back to blue (rollback) if green becomes unhealthy', () => {
    const green = makeVersion('green-v2', 0.001, 100);
    const switcher = new BlueGreenSwitcher(makeVersion('blue-v1'), green, 'blue');

    switcher.switchToStandby(); // blue → green
    expect(switcher.active).toBe('green');

    // Simulate green degrading — mutate in place
    green.errorRate = 0.2;

    // Standby is now blue (healthy); switch back
    const rolledBack = switcher.switchToStandby();
    expect(rolledBack).toBe(true);
    expect(switcher.active).toBe('blue');
  });
});

describe('Traffic splitting — realistic patterns', () => {
  it('splits traffic proportionally across 1 000 requests at each step', () => {
    const steps = [10, 25, 50, 75];
    for (const pct of steps) {
      const engine = new RolloutEngine(
        makeVersion('stable'),
        makeVersion('candidate'),
      );
      engine.setTrafficPercent(pct);
      const counts = engine.simulateTraffic(1_000);
      const actualPct = (counts['candidate'] / 1_000) * 100;
      // Allow ±3 % tolerance
      expect(actualPct).toBeGreaterThanOrEqual(pct - 3);
      expect(actualPct).toBeLessThanOrEqual(pct + 3);
    }
  });

  it('total requests always equals the number sent', () => {
    const engine = new RolloutEngine(makeVersion('s'), makeVersion('c'));
    engine.setTrafficPercent(33);
    const counts = engine.simulateTraffic(500);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(500);
  });
});
