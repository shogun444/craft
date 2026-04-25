// @vitest-environment node
/**
 * GitHub Webhook Security & Processing Tests
 *
 * Covers:
 *   - Signature validation (valid / invalid / missing)
 *   - Event routing by x-github-event header (push, pull_request, ping)
 *   - Replay attack prevention (duplicate x-github-delivery IDs)
 *   - Idempotency / retry handling (same event delivered twice)
 *
 * Run: vitest run tests/webhooks/github-verification.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Fixtures ──────────────────────────────────────────────────────────────────

import pushPayload from '../fixtures/github/push-event.json';
import prPayload from '../fixtures/github/pr-event.json';
import pingPayload from '../fixtures/github/ping-event.json';

// ── Constants ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-secret';

// ── Helper: sign a payload ────────────────────────────────────────────────────

/**
 * Generates a valid `x-hub-signature-256` header value for the given payload
 * using the provided secret — mirrors GitHub's own signing logic.
 */
function signPayload(payload: string, secret: string = WEBHOOK_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

// ── In-memory delivery ID store (idempotency / replay cache) ──────────────────

/**
 * Minimal stand-in for a DB/cache that tracks processed delivery IDs.
 * Reset between tests via clearDeliveryStore().
 */
const deliveryStore = new Set<string>();

function clearDeliveryStore() {
  deliveryStore.clear();
}

function hasDelivery(id: string): boolean {
  return deliveryStore.has(id);
}

function recordDelivery(id: string): void {
  deliveryStore.add(id);
}

// ── Mock event processor ──────────────────────────────────────────────────────

const mockProcessPush = vi.fn().mockResolvedValue({ ok: true });
const mockProcessPR = vi.fn().mockResolvedValue({ ok: true });
const mockProcessPing = vi.fn().mockResolvedValue({ ok: true });

// ── Webhook handler (unit under test) ─────────────────────────────────────────

/**
 * Simulates the core logic of POST /api/webhooks/github.
 * Returns a plain { status, body } object so tests stay framework-agnostic
 * (no supertest / Next.js dependency needed for pure-logic coverage).
 */
async function handleGitHubWebhook(request: {
  body: string;
  headers: Record<string, string | undefined>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { body, headers } = request;

  // 1. Require signature header
  const signature = headers['x-hub-signature-256'];
  if (!signature) {
    return { status: 401, body: { error: 'Missing x-hub-signature-256 header' } };
  }

  // 2. Verify HMAC signature
  const expected = signPayload(body, WEBHOOK_SECRET);
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expBuffer)
  ) {
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  // 3. Require event type
  const eventType = headers['x-github-event'];
  if (!eventType) {
    return { status: 400, body: { error: 'Missing x-github-event header' } };
  }

  // 4. Idempotency / replay-attack guard
  const deliveryId = headers['x-github-delivery'];
  if (deliveryId) {
    if (hasDelivery(deliveryId)) {
      // Already processed — acknowledge without re-processing
      return { status: 200, body: { received: true, duplicate: true } };
    }
    recordDelivery(deliveryId);
  }

  // 5. Route to the correct processor
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  switch (eventType) {
    case 'push':
      await mockProcessPush(payload);
      break;
    case 'pull_request':
      await mockProcessPR(payload);
      break;
    case 'ping':
      await mockProcessPing(payload);
      break;
    default:
      // Unknown events are acknowledged but not processed
      return { status: 200, body: { received: true, processed: false } };
  }

  return { status: 200, body: { received: true, processed: true } };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRequest(
  payload: object,
  overrides: {
    secret?: string;
    signature?: string | null;
    event?: string;
    deliveryId?: string;
  } = {}
) {
  const body = JSON.stringify(payload);
  const sig =
    overrides.signature !== undefined
      ? overrides.signature ?? undefined
      : signPayload(body, overrides.secret ?? WEBHOOK_SECRET);

  return {
    body,
    headers: {
      'content-type': 'application/json',
      ...(sig !== null && sig !== undefined ? { 'x-hub-signature-256': sig } : {}),
      ...(overrides.event ? { 'x-github-event': overrides.event } : {}),
      ...(overrides.deliveryId ? { 'x-github-delivery': overrides.deliveryId } : {}),
    } as Record<string, string | undefined>,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearDeliveryStore();
});

// ── 1. Signature Validation ───────────────────────────────────────────────────

describe('Signature Validation', () => {
  it('accepts a request with a valid x-hub-signature-256 header', async () => {
    const req = makeRequest(pushPayload, { event: 'push', deliveryId: 'delivery-1' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
  });

  it('rejects a request with no signature header (401)', async () => {
    const req = makeRequest(pushPayload, { signature: null, event: 'push' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing x-hub-signature-256 header');
  });

  it('rejects a request with a tampered signature (401)', async () => {
    const req = makeRequest(pushPayload, { event: 'push' });
    req.headers['x-hub-signature-256'] = 'sha256=deadbeefdeadbeefdeadbeefdeadbeef';
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a request signed with the wrong secret (401)', async () => {
    const req = makeRequest(pushPayload, { secret: 'wrong-secret', event: 'push' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a request where the body was modified after signing (401)', async () => {
    const req = makeRequest(pushPayload, { event: 'push' });
    // Tamper with the body after the signature was computed
    req.body = JSON.stringify({ ...pushPayload, ref: 'refs/heads/evil' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('uses timing-safe comparison (signature length mismatch → 401)', async () => {
    const req = makeRequest(pushPayload, { event: 'push' });
    req.headers['x-hub-signature-256'] = 'sha256=tooshort';
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(401);
  });
});

// ── 2. Event Routing ──────────────────────────────────────────────────────────

describe('Event Routing', () => {
  it('routes push events to the push processor', async () => {
    const req = makeRequest(pushPayload, { event: 'push', deliveryId: 'del-push-1' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(mockProcessPush).toHaveBeenCalledOnce();
    expect(mockProcessPush).toHaveBeenCalledWith(pushPayload);
  });

  it('routes pull_request events to the PR processor', async () => {
    const req = makeRequest(prPayload, { event: 'pull_request', deliveryId: 'del-pr-1' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(mockProcessPR).toHaveBeenCalledOnce();
    expect(mockProcessPR).toHaveBeenCalledWith(prPayload);
  });

  it('routes ping events to the ping processor', async () => {
    const req = makeRequest(pingPayload, { event: 'ping', deliveryId: 'del-ping-1' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(mockProcessPing).toHaveBeenCalledOnce();
  });

  it('acknowledges unknown event types without processing (200, processed: false)', async () => {
    const req = makeRequest(pushPayload, { event: 'deployment', deliveryId: 'del-dep-1' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(false);
    expect(mockProcessPush).not.toHaveBeenCalled();
  });

  it('returns 400 when x-github-event header is missing', async () => {
    const body = JSON.stringify(pushPayload);
    const res = await handleGitHubWebhook({
      body,
      headers: { 'x-hub-signature-256': signPayload(body) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing x-github-event header');
  });

  it.each(['push', 'pull_request', 'ping'])(
    'correctly identifies the "%s" event type from the header',
    async (eventType) => {
      const payload = eventType === 'pull_request' ? prPayload : eventType === 'ping' ? pingPayload : pushPayload;
      const req = makeRequest(payload, { event: eventType, deliveryId: `del-${eventType}` });
      const res = await handleGitHubWebhook(req);
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    }
  );
});

// ── 3. Replay Attack Prevention ───────────────────────────────────────────────

describe('Replay Attack Prevention', () => {
  it('processes a delivery ID the first time it is seen', async () => {
    const req = makeRequest(pushPayload, { event: 'push', deliveryId: 'unique-delivery-abc' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
    expect(mockProcessPush).toHaveBeenCalledOnce();
  });

  it('rejects (200 no-op) a duplicate x-github-delivery ID', async () => {
    const deliveryId = 'replay-delivery-xyz';
    const req = makeRequest(pushPayload, { event: 'push', deliveryId });

    // First delivery — processed normally
    await handleGitHubWebhook(req);
    vi.clearAllMocks();

    // Second delivery — same ID, should be a no-op
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(mockProcessPush).not.toHaveBeenCalled();
  });

  it('processes different delivery IDs independently', async () => {
    const req1 = makeRequest(pushPayload, { event: 'push', deliveryId: 'delivery-001' });
    const req2 = makeRequest(pushPayload, { event: 'push', deliveryId: 'delivery-002' });

    await handleGitHubWebhook(req1);
    await handleGitHubWebhook(req2);

    expect(mockProcessPush).toHaveBeenCalledTimes(2);
  });

  it('does not block requests that omit the delivery ID header', async () => {
    // Some internal/test senders may omit x-github-delivery; should still work
    const req = makeRequest(pushPayload, { event: 'push' });
    const res = await handleGitHubWebhook(req);
    expect(res.status).toBe(200);
    expect(mockProcessPush).toHaveBeenCalledOnce();
  });
});

// ── 4. Idempotency & Retries ──────────────────────────────────────────────────

describe('Idempotency & Retries', () => {
  it('handles a GitHub retry (same delivery ID) without duplicate processing', async () => {
    const deliveryId = 'github-retry-delivery-1';
    const req = makeRequest(pushPayload, { event: 'push', deliveryId });

    const first = await handleGitHubWebhook(req);
    const second = await handleGitHubWebhook(req); // simulated retry

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // Processor must only be called once — no duplicate DB writes
    expect(mockProcessPush).toHaveBeenCalledOnce();
    expect(second.body.duplicate).toBe(true);
  });

  it('returns 200 on retry so GitHub stops retrying', async () => {
    const deliveryId = 'github-retry-delivery-2';
    const req = makeRequest(prPayload, { event: 'pull_request', deliveryId });

    await handleGitHubWebhook(req);
    const retry = await handleGitHubWebhook(req);

    // Must be 200, not 4xx/5xx — otherwise GitHub will keep retrying
    expect(retry.status).toBe(200);
  });

  it('processes a new event after a duplicate is detected', async () => {
    const deliveryId = 'idempotent-delivery-1';
    const req = makeRequest(pushPayload, { event: 'push', deliveryId });

    await handleGitHubWebhook(req); // original
    await handleGitHubWebhook(req); // duplicate — no-op

    // A brand-new event with a different delivery ID must still be processed
    const newReq = makeRequest(pushPayload, { event: 'push', deliveryId: 'idempotent-delivery-2' });
    const res = await handleGitHubWebhook(newReq);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
    expect(mockProcessPush).toHaveBeenCalledTimes(2); // original + new
  });

  it('does not call any processor when a duplicate is detected', async () => {
    const deliveryId = 'idempotent-delivery-3';
    const req = makeRequest(pingPayload, { event: 'ping', deliveryId });

    await handleGitHubWebhook(req);
    vi.clearAllMocks();
    await handleGitHubWebhook(req);

    expect(mockProcessPush).not.toHaveBeenCalled();
    expect(mockProcessPR).not.toHaveBeenCalled();
    expect(mockProcessPing).not.toHaveBeenCalled();
  });
});

// ── 5. Edge Cases ─────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('returns 400 for malformed JSON body (valid signature, bad JSON)', async () => {
    const body = 'not-valid-json';
    const res = await handleGitHubWebhook({
      body,
      headers: {
        'x-hub-signature-256': signPayload(body),
        'x-github-event': 'push',
        'x-github-delivery': 'del-bad-json',
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON body');
  });

  it('handles an empty body with a valid signature for that empty string', async () => {
    const body = '';
    const res = await handleGitHubWebhook({
      body,
      headers: {
        'x-hub-signature-256': signPayload(body),
        'x-github-event': 'ping',
        'x-github-delivery': 'del-empty',
      },
    });
    // Empty body is valid JSON-parse-wise? No — it will fail JSON.parse
    expect(res.status).toBe(400);
  });

  it('signPayload helper produces sha256= prefixed HMAC', () => {
    const sig = signPayload('hello');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('two different payloads produce different signatures', () => {
    const sig1 = signPayload(JSON.stringify({ a: 1 }));
    const sig2 = signPayload(JSON.stringify({ a: 2 }));
    expect(sig1).not.toBe(sig2);
  });
});
