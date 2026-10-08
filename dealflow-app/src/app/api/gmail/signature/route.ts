import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { signatureToText } from '@/lib/signature';

/**
 * GET — the signature Gmail holds for the signed-in person's own address,
 * flattened to text so it can be appended to an outgoing plain-text mail.
 *
 * Reading settings needs the gmail.settings.basic scope, which accounts
 * connected before this feature existed were never asked for. That comes back
 * as a 403, and is reported as something the user can fix (reconnect) rather
 * than as a failure.
 */
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const auth = await getAuthenticatedClientForUser(user.id);
    if (!auth) return NextResponse.json({ error: 'Google account not connected' }, { status: 401 });

    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
    try {
        const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' });
        const addresses = data.sendAs || [];
        // The default sendAs is the one a message goes out as.
        const mine = addresses.find(a => a.isDefault) || addresses[0];
        const signature = signatureToText(mine?.signature || '');
        return NextResponse.json({
            signature,
            address: mine?.sendAsEmail || null,
            // An image-only signature flattens to nothing; say so rather than
            // looking like there is no signature set at all.
            imageOnly: !signature && !!mine?.signature,
        });
    } catch (err) {
        const e = err as { code?: number; status?: number; message?: string };
        const code = e.code ?? e.status;
        if (code === 403) {
            return NextResponse.json({
                signature: '',
                needsReconnect: true,
                error: 'Reconnect your Google account to let the platform read your Gmail signature.',
            });
        }
        console.error('[gmail/signature]', e.message);
        return NextResponse.json({ signature: '', error: e.message || 'Could not read the signature' });
    }
}
