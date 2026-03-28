import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockListDomains = vi.fn();
const mockGetCertificate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: { getUser: mockGetUser },
        from: mockFrom,
    }),
}));

vi.mock('@/services/vercel.service', () => ({
    VercelService: vi.fn().mockImplementation(() => ({
        listDomains: mockListDomains,
        getCertificate: mockGetCertificate,
    })),
    VercelApiError: class VercelApiError extends Error {
        constructor(message: string, public code: string) {
            super(message);
        }
    },
}));

const fakeUser = { id: 'user-1' };
const params = { id: 'dep-1' };

function makeRequest() {
    return new NextRequest('http://localhost/api/deployments/dep-1/domains', { method: 'GET' });
}

type QueryResult = { data: Record<string, unknown> | null; error: { message: string } | null };

function makeSupabaseQuery(results: QueryResult[]) {
    return {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(results.shift() ?? { data: null, error: null }),
            })),
        })),
    };
}

describe('GET /api/deployments/[id]/domains', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    });

    it('returns 401 when unauthenticated', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), { params })).status).toBe(401);
    });

    it('returns 403 when deployment belongs to another user', async () => {
        mockFrom.mockReturnValue(
            makeSupabaseQuery([{ data: { user_id: 'other' }, error: null }]),
        );
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), { params })).status).toBe(403);
    });

    it('returns 404 when deployment is not found', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: null, error: { message: 'not found' } }]));
        const { GET } = await import('./route');
        expect((await GET(makeRequest(), { params })).status).toBe(404);
    });

    it('returns 404 when no Vercel project is configured', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { vercel_project_id: null }, error: null }]));
        const { GET } = await import('./route');
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(404);
        expect((await res.json()).error).toMatch(/no vercel project/i);
    });

    it('returns 200 with verified domain and active SSL', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { vercel_project_id: 'prj_1' }, error: null }]));
        mockListDomains.mockResolvedValue([
            { name: 'example.com', verified: true, forceHttps: true, redirect: false },
        ]);
        mockGetCertificate.mockResolvedValue({ domain: 'example.com', state: 'active', expiresAt: '2027-01-01T00:00:00Z' });

        const { GET } = await import('./route');
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.domains).toHaveLength(1);
        expect(body.domains[0].domain).toBe('example.com');
        expect(body.domains[0].verified).toBe(true);
        expect(body.domains[0].ssl.state).toBe('active');
        expect(body.domains[0].ssl.expiresAt).toBe('2027-01-01T00:00:00Z');
        expect(body.domains[0].dns).toBeUndefined();
    });

    it('includes dns config for unverified domains', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { vercel_project_id: 'prj_1' }, error: null }]));
        mockListDomains.mockResolvedValue([
            { name: 'unverified.com', verified: false, forceHttps: false, redirect: false },
        ]);
        mockGetCertificate.mockResolvedValue({ domain: 'unverified.com', state: 'pending' });

        const { GET } = await import('./route');
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.domains[0].verified).toBe(false);
        expect(body.domains[0].ssl.state).toBe('pending');
        expect(body.domains[0].dns).toBeDefined();
        expect(body.domains[0].dns.domain).toBe('unverified.com');
    });

    it('returns 200 with empty array when no domains configured', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { vercel_project_id: 'prj_1' }, error: null }]));
        mockListDomains.mockResolvedValue([]);

        const { GET } = await import('./route');
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(200);
        expect((await res.json()).domains).toEqual([]);
    });

    it('returns 500 when Vercel API fails', async () => {
        mockFrom
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { user_id: fakeUser.id }, error: null }]))
            .mockReturnValueOnce(makeSupabaseQuery([{ data: { vercel_project_id: 'prj_1' }, error: null }]));
        mockListDomains.mockRejectedValue(new Error('Vercel API error'));

        const { GET } = await import('./route');
        expect((await GET(makeRequest(), { params })).status).toBe(500);
    });
});
