import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@/lib/stripe/pricing', () => ({
  getEntitlements: (tier: string) => {
    if (tier === 'pro') return { maxDeployments: 10 };
    if (tier === 'enterprise') return { maxDeployments: -1 };
    return { maxDeployments: 1 }; // free
  },
}));

const fakeUser = { id: 'user-1', email: 'user@example.com' };

const validConfig = {
  branding: {
    appName: 'App',
    primaryColor: '#000000',
    secondaryColor: '#111111',
    fontFamily: 'Inter',
  },
  features: {
    enableCharts: true,
    enableTransactionHistory: true,
    enableAnalytics: false,
    enableNotifications: false,
  },
  stellar: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
};

function post(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Minimal chainable Supabase mock. Each table gets its own result queue. */
function makeTableMock(results: { data: unknown; error: unknown; count?: number }[]) {
  const pop = () => results.shift() ?? { data: null, error: null, count: null };

  const eqChain = (result: ReturnType<typeof pop>) => ({
    eq: vi.fn(() => Promise.resolve(result)),
    single: vi.fn().mockResolvedValue(result),
  });

  return {
    select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
      const result = pop();
      if (opts?.head) {
        // count query: .select(..., {count, head}).eq().eq()
        return { eq: vi.fn(() => eqChain(result)) };
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue(result) })),
          single: vi.fn().mockResolvedValue(result),
        })),
      };
    }),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue(pop()) })),
    })),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
  };
}

describe('POST /api/deployments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments'), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('./route');
    const req = new NextRequest('http://localhost/api/deployments', { method: 'POST', body: 'not-json' });
    const res = await POST(req, { params: {} as any });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  it('returns 400 for missing templateId', async () => {
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { customizationConfig: {} }), { params: {} as any });
    expect(res.status).toBe(400);
  });

  it('returns 404 when template not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: null, error: { message: 'not found' } }]);
      return makeTableMock([]);
    });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1' }), { params: {} as any });
    expect(res.status).toBe(404);
  });

  it('returns 403 with upgradeUrl when free-tier limit is reached', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: { id: 'tpl-1', name: 'T' }, error: null }]);
      if (table === 'profiles') return makeTableMock([{ data: { subscription_tier: 'free' }, error: null }]);
      if (table === 'deployments') return makeTableMock([{ data: null, error: null, count: 1 }]); // at limit
      return makeTableMock([]);
    });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1', customizationConfig: validConfig }), { params: {} as any });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgradeUrl).toBe('/pricing');
    expect(body.error).toMatch(/limit reached/i);
  });

  it('returns 403 when pro-tier limit (10) is reached', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: { id: 'tpl-1', name: 'T' }, error: null }]);
      if (table === 'profiles') return makeTableMock([{ data: { subscription_tier: 'pro' }, error: null }]);
      if (table === 'deployments') return makeTableMock([{ data: null, error: null, count: 10 }]);
      return makeTableMock([]);
    });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1', customizationConfig: validConfig }), { params: {} as any });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgradeUrl).toBe('/pricing');
  });

  it('does not enforce a limit for enterprise tier', async () => {
    const insertedDeployment = {
      id: 'dep-1', template_id: 'tpl-1', user_id: fakeUser.id,
      name: 'T', customization_config: {}, created_at: new Date().toISOString(),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: { id: 'tpl-1', name: 'T' }, error: null }]);
      if (table === 'profiles') return makeTableMock([{ data: { subscription_tier: 'enterprise' }, error: null }]);
      if (table === 'deployments') return makeTableMock([{ data: insertedDeployment, error: null }]);
      return makeTableMock([]);
    });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1', customizationConfig: validConfig }), { params: {} as any });
    // Should proceed past limit check — may fail at insert mock but not at 403
    expect(res.status).not.toBe(403);
  });

  it('returns 422 for invalid customization config', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: { id: 'tpl-1', name: 'T' }, error: null }]);
      if (table === 'profiles') return makeTableMock([{ data: { subscription_tier: 'free' }, error: null }]);
      if (table === 'deployments') return makeTableMock([{ data: null, error: null, count: 0 }]);
      return makeTableMock([]);
    });
    const invalidConfig = { ...validConfig, branding: { ...validConfig.branding, appName: '' } };
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1', customizationConfig: invalidConfig }), { params: {} as any });
    expect(res.status).toBe(422);
    expect((await res.json()).details).toBeDefined();
  });

  it('creates deployment and returns 201', async () => {
    const insertedDeployment = {
      id: 'dep-1', template_id: 'tpl-1', user_id: fakeUser.id,
      name: 'My Template', customization_config: {}, created_at: new Date().toISOString(),
    };
    // deployments table is called twice: count check, then insert+update
    const deploymentsTable = makeTableMock([
      { data: null, error: null, count: 0 },        // count check
      { data: insertedDeployment, error: null },     // insert
    ]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'templates') return makeTableMock([{ data: { id: 'tpl-1', name: 'My Template' }, error: null }]);
      if (table === 'profiles') return makeTableMock([{ data: { subscription_tier: 'free' }, error: null }]);
      if (table === 'deployments') return deploymentsTable;
      return makeTableMock([]);
    });
    const { POST } = await import('./route');
    const res = await POST(post('http://localhost/api/deployments', { templateId: 'tpl-1', customizationConfig: validConfig }), { params: {} as any });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('dep-1');
    expect(body.status).toBe('generating');
  });
});
