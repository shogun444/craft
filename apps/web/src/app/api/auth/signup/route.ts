import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/services/auth.service';

const signUpSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

/**
 * POST /api/auth/signup
 * Creates a new user account and returns the user + session.
 * Returns 409 if the email is already registered.
 */
export async function POST(req: NextRequest) {
    const body = await req.json();
    const parsed = signUpSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
            { status: 400 }
        );
    }

    const result = await authService.signUp(parsed.data.email, parsed.data.password);

    if (result.error) {
        const status = result.error.code === 'PROFILE_CREATION_ERROR' ? 409 : 400;
        return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ user: result.user, session: result.session }, { status: 201 });
}
