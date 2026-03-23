import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/services/auth.service';

const signInSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

/**
 * POST /api/auth/signin
 * Authenticates an existing user and returns the user + session.
 * Returns 401 for invalid credentials.
 */
export async function POST(req: NextRequest) {
    const body = await req.json();
    const parsed = signInSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
            { status: 400 }
        );
    }

    const result = await authService.signIn(parsed.data.email, parsed.data.password);

    if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 401 });
    }

    return NextResponse.json({ user: result.user, session: result.session });
}
