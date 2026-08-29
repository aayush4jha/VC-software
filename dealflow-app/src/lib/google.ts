import { google } from 'googleapis';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.readonly',
];

const CALLBACK_PATH = '/api/auth/google/callback';

/**
 * The redirect URI to hand Google.
 *
 * Google compares this string exactly between the authorize call and the token
 * exchange, so both legs of the flow have to derive it identically — pass the
 * same request shape to each.
 *
 * Deriving it from the live request matters because the previous fallback was a
 * hardcoded localhost URL: any deployment without GOOGLE_REDIRECT_URI set sent
 * production users to a callback on their own machine, which Google rejects as
 * redirect_uri_mismatch.
 */
export function resolveRedirectUri(request?: Pick<Request, 'headers'>): string {
    // An explicit value always wins — it is what gets registered in the Google
    // console when the app is served from a custom domain.
    const configured = process.env.GOOGLE_REDIRECT_URI;
    if (configured) return configured;

    // Otherwise use the host actually being served, so production and preview
    // deployments work without another environment variable.
    const headers = request?.headers;
    const host = headers?.get('x-forwarded-host') || headers?.get('host');
    if (host) {
        const proto = headers?.get('x-forwarded-proto')
            || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
        return `${proto}://${host}${CALLBACK_PATH}`;
    }

    // No request to read (e.g. a background token refresh, where the redirect
    // URI is unused anyway).
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${CALLBACK_PATH}`;
    return `http://localhost:3000${CALLBACK_PATH}`;
}

export function getOAuth2Client(request?: Pick<Request, 'headers'>) {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        resolveRedirectUri(request)
    );
}

export function getAuthUrl(request?: Pick<Request, 'headers'>) {
    const oauth2Client = getOAuth2Client(request);
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent select_account',
    });
}

export function getAuthenticatedClient(accessToken: string, refreshToken?: string) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
    return oauth2Client;
}
