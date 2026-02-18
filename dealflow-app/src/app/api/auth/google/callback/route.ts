import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/google';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        // User denied access — redirect back to app with error
        return NextResponse.redirect(new URL('/?google_auth=error', request.url));
    }

    if (!code) {
        return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        // Store tokens in HTTP-only cookies so the client can use them
        const response = NextResponse.redirect(new URL('/?google_auth=success', request.url));

        response.cookies.set('google_access_token', tokens.access_token || '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: tokens.expiry_date
                ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
                : 3600,
            path: '/',
        });

        if (tokens.refresh_token) {
            response.cookies.set('google_refresh_token', tokens.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 365, // 1 year
                path: '/',
            });
        }

        // Also set a non-httpOnly cookie so the client knows auth status
        response.cookies.set('google_connected', 'true', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: tokens.expiry_date
                ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
                : 3600,
            path: '/',
        });

        return response;
    } catch (err) {
        console.error('Error exchanging code for tokens:', err);
        return NextResponse.redirect(new URL('/?google_auth=error', request.url));
    }
}
