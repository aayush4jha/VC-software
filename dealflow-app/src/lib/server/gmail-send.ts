import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

// Sending mail on a user's behalf from a background job (debt reminders, the
// daily deck report), where there is no request and no signed-in browser.

// Headers must be 7-bit. A raw "₹" in a subject is mangled by most clients, so
// anything non-ASCII goes out as an RFC 2047 encoded-word.
function encodeHeader(value: string): string {
    return /^[\x20-\x7E]*$/.test(value)
        ? value
        : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function b64Lines(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

export interface OutgoingMail {
    /** An address, or 'self' for the sending user's own inbox. */
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export function buildRawMessage(from: string, mail: OutgoingMail): string {
    const boundary = `dv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const lines = [
        `From: ${from}`,
        `To: ${mail.to}`,
        `Subject: ${encodeHeader(mail.subject)}`,
        'MIME-Version: 1.0',
    ];
    if (mail.html) {
        lines.push(
            `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
            b64Lines(mail.text),
            `--${boundary}`,
            'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
            b64Lines(mail.html),
            `--${boundary}--`,
        );
    } else {
        lines.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64Lines(mail.text));
    }
    return Buffer.from(lines.join('\r\n'))
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sends from the user's own connected Gmail. Returns the sender address used. */
export async function sendAsUser(
    userId: string,
    mail: OutgoingMail,
): Promise<{ ok: true; from: string } | { ok: false; error: string }> {
    const auth = await getAuthenticatedClientForUser(userId);
    if (!auth) return { ok: false, error: 'Google account not connected' };
    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
    let from = 'me';
    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        from = profile.data.emailAddress || 'me';
    } catch { /* 'me' is accepted */ }
    if (mail.to === 'self' && from === 'me') {
        return { ok: false, error: 'Could not read the Gmail address to send the report to' };
    }
    const resolved = mail.to === 'self' ? { ...mail, to: from } : mail;
    try {
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: buildRawMessage(from, resolved) } });
        return { ok: true, from };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

/**
 * Whose Gmail should a background email go out from? The preferred user if
 * their Google account is connected; otherwise an admin who is; otherwise
 * anyone who is. Null when nobody in the workspace has connected Google.
 */
export async function resolveSender(db: SupabaseClient, preferredUserId: string | null): Promise<string | null> {
    const { data: tokens } = await db.from('google_tokens').select('user_id');
    const connected = new Set((tokens || []).map((t: { user_id: string }) => t.user_id));
    if (preferredUserId && connected.has(preferredUserId)) return preferredUserId;
    if (connected.size === 0) return null;
    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
    const admin = (admins || []).find((a: { id: string }) => connected.has(a.id));
    return admin?.id ?? [...connected][0];
}
