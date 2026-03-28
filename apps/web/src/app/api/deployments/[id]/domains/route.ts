/**
 * GET /api/deployments/[id]/domains
 *
 * Returns all custom domains configured for a deployment, including
 * verification status, SSL certificate state, and DNS configuration
 * for any unverified domains.
 *
 * Authentication & ownership:
 *   Requires a valid session (401) and ownership of the deployment (403).
 *
 * Responses:
 *   200 — { domains: DomainEntry[] }
 *   404 — Deployment not found or no Vercel project configured
 *   401 — Not authenticated
 *   403 — Not authorized for this deployment
 *   500 — Unexpected error
 *
 * Feature: domains-list
 */

import { NextRequest, NextResponse } from 'next/server';
import { withDeploymentAuth } from '@/lib/api/with-auth';
import { VercelService } from '@/services/vercel.service';
import { generateDnsConfiguration } from '@/lib/dns/dns-configuration';

const vercel = new VercelService();

export const GET = withDeploymentAuth(async (_req: NextRequest, { params, supabase }) => {
    const { data: deployment, error } = await supabase
        .from('deployments')
        .select('vercel_project_id')
        .eq('id', params.id)
        .single();

    if (error || !deployment) {
        return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    if (!deployment.vercel_project_id) {
        return NextResponse.json(
            { error: 'No Vercel project configured for this deployment' },
            { status: 404 },
        );
    }

    try {
        const vercelDomains = await vercel.listDomains(deployment.vercel_project_id);

        const domains = await Promise.all(
            vercelDomains.map(async (d) => {
                const cert = await vercel.getCertificate(deployment.vercel_project_id, d.name);
                const entry: Record<string, unknown> = {
                    domain: d.name,
                    verified: d.verified,
                    ssl: { state: cert.state, expiresAt: cert.expiresAt ?? null },
                };
                if (!d.verified) {
                    entry.dns = generateDnsConfiguration(d.name);
                }
                return entry;
            }),
        );

        return NextResponse.json({ domains });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: (err as Error).message ?? 'Failed to list domains' },
            { status: 500 },
        );
    }
});
