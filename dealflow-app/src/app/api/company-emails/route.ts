import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

function decodeBase64Url(data: string): string {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

// The readable text of a message, preferring plain text over stripped HTML.
interface BodyPart { mimeType?: string | null; body?: { data?: string | null } | null; parts?: BodyPart[] | null }
function extractBody(payload: BodyPart | null | undefined): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
    for (const p of payload.parts || []) {
        if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64Url(p.body.data);
    }
    for (const p of payload.parts || []) {
        if (p.mimeType === 'text/html' && p.body?.data) {
            return decodeBase64Url(p.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }
    for (const p of payload.parts || []) {
        const nested = extractBody(p);
        if (nested) return nested;
    }
    return '';
}

/**
 * GET ?companyId=…            every email filed against a company
 * GET ?messageId=…            one email's text — fetched from Gmail and stored
 *                             when it predates body_text, so the history fills
 *                             itself in as it is read
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const params = new URL(request.url).searchParams;
    const messageId = params.get('messageId');

    if (messageId) {
        const { data: row } = await client.from('ingested_emails')
            .select('id, body_text, snippet').eq('gmail_message_id', messageId)
            .eq('organization_id', ORGANIZATION_ID).limit(1).maybeSingle();
        if (row?.body_text) return NextResponse.json({ body: row.body_text, source: 'stored' });

        // Not stored: read it from the caller's Gmail, then keep it.
        const user = await getRouteUser(request);
        const google_ = user ? await getAuthenticatedClientForUser(user.id) : null;
        if (!google_) {
            return NextResponse.json({
                body: row?.snippet || '',
                source: 'snippet',
                note: 'Connect Google to read the full message.',
            });
        }
        try {
            const gmail = google.gmail({ version: 'v1', auth: google_.oauth2Client });
            const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
            const body = extractBody(msg.data.payload as BodyPart);
            if (body && row?.id) {
                await client.from('ingested_emails').update({ body_text: body }).eq('id', row.id);
            }
            return NextResponse.json({ body: body || row?.snippet || '', source: 'gmail' });
        } catch (err) {
            return NextResponse.json({
                body: row?.snippet || '',
                source: 'snippet',
                note: `Could not read it from Gmail: ${(err as Error).message}`,
            });
        }
    }

    const companyId = params.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });

    const { data, error } = await client.from('ingested_emails')
        .select('id, gmail_message_id, sender_name, sender_email, subject, received_at, attachment_names, has_attachments, body_text, snippet, status, error_message, created_at')
        .eq('organization_id', ORGANIZATION_ID).eq('company_id', companyId)
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
        // body_text is missing until supabase/email-body.sql is applied.
        return NextResponse.json({ emails: [], unavailable: error.message });
    }
    return NextResponse.json({
        emails: (data || []).map(e => ({
            id: e.id,
            messageId: e.gmail_message_id,
            senderName: e.sender_name,
            senderEmail: e.sender_email,
            subject: e.subject,
            receivedAt: e.received_at || e.created_at,
            attachments: e.attachment_names || [],
            hasAttachments: e.has_attachments,
            body: e.body_text || null,
            preview: (e.body_text || e.snippet || '').slice(0, 160),
            // Says when an email joined this company rather than creating it.
            filedNote: e.error_message && e.error_message.startsWith('Filed under') ? e.error_message : null,
        })),
    });
}
