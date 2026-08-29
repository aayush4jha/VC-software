import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getOAuth2Client } from '@/lib/google';
import { saveGoogleTokens } from '@/lib/google-tokens';
import { getRouteUser } from '@/lib/auth-helpers';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL('/emails?google_auth=error', request.url));
    }

    if (!code) {
        return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    try {
        const oauth2Client = getOAuth2Client(request);
        const { tokens } = await oauth2Client.getToken(code);

        // Get the current Supabase user from the session cookie
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll() {
                        // No-op for route handler reads
                    },
                },
            },
        );

        const { data: { user } } = await supabase.auth.getUser();

        // Membership, not just a session: tokens are stored against a profile,
        // so someone who is not on the team has nothing to attach them to.
        const member = user ? await getRouteUser(request) : null;

        if (user && member) {
            // Store tokens in the database — persists across sessions
            await saveGoogleTokens(user.id, ORGANIZATION_ID, {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date,
            });
        }

        // Redirect back — the status route will now check DB
        const response = NextResponse.redirect(new URL('/emails?google_auth=success', request.url));

        // Keep a lightweight marker cookie so the client can quickly check
        // without an API call (long expiry, not tied to access token lifetime)
        response.cookies.set('google_connected', 'true', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 365, // 1 year
            path: '/',
        });

        return response;
    } catch (err) {
        console.error('Error exchanging code for tokens:', err);
        return NextResponse.redirect(new URL('/emails?google_auth=error', request.url));
    }
}
