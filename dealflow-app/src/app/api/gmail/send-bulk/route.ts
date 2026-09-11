import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

// One send per founder rather than one mail with everyone on it: founders must
// never see each other's addresses, and a reply has to come back as a normal
// one-to-one thread against that company.
const MAX_RECIPIENTS = 200;

interface BulkRecipient {
    email: string;
    founderName?: string;
    companyName?: string;
    companyId?: string | null;
}

/** {{founder_name}} / {{company_name}} / {{first_name}} in the subject or body. */
function fillTemplate(text: string, r: BulkRecipient): string {
    const founder = (r.founderName || '').trim();
    return text
        .replace(/\{\{\s*founder_name\s*\}\}/gi, founder || 'there')
        .replace(/\{\{\s*first_name\s*\}\}/gi, founder.split(/\s+/)[0] || 'there')
        .replace(/\{\{\s*company_name\s*\}\}/gi, (r.companyName || '').trim());
}

function encodeMessage(from: string, to: string, subject: string, body: string): string {
    const message = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        body,
    ].join('\n');
    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const auth = await getAuthenticatedClientForUser(user.id);
    if (!auth) {
        return NextResponse.json(
            { error: 'Google account not connected. Please connect your account.' },
            { status: 401 },
        );
    }

    const { recipients, subject, body } = await request.json();

    if (!Array.isArray(recipients) || recipients.length === 0) {
        return NextResponse.json({ error: 'No recipients' }, { status: 400 });
    }
    if (!subject || !body) {
        return NextResponse.json({ error: 'Missing subject or body' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
        return NextResponse.json(
            { error: `Too many recipients (${recipients.length}). Send to at most ${MAX_RECIPIENTS} at a time.` },
            { status: 400 },
        );
    }

    // One founder listed twice — two companies, the same person — gets one email.
    const seen = new Set<string>();
    const unique: BulkRecipient[] = [];
    for (const r of recipients as BulkRecipient[]) {
        const email = (r.email || '').trim().toLowerCase();
        if (!email || !email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        unique.push({ ...r, email });
    }
    if (unique.length === 0) {
        return NextResponse.json({ error: 'No valid email addresses' }, { status: 400 });
    }

    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });

    let senderEmail = 'me';
    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        senderEmail = profile.data.emailAddress || 'me';
    } catch { /* 'me' is accepted by the API */ }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = supabaseUrl && serviceRoleKey ? createServiceClient(supabaseUrl, serviceRoleKey) : null;

    const results: { email: string; ok: boolean; error?: string }[] = [];

    // Sequential on purpose. Gmail rate-limits bursts, and a partial failure
    // must be reportable per address rather than collapsing the whole batch.
    for (const r of unique) {
        const filledSubject = fillTemplate(subject, r);
        const filledBody = fillTemplate(body, r);
        try {
            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodeMessage(senderEmail, r.email, filledSubject, filledBody) },
            });
            results.push({ email: r.email, ok: true });

            if (db) {
                await db.from('email_logs').insert({
                    company_id: r.companyId || null,
                    sender_id: user.id,
                    recipient_email: r.email,
                    subject: filledSubject,
                    body: filledBody,
                    email_type: 'bulk-outreach',
                }).then(({ error }) => {
                    if (error) console.error('[send-bulk] log:', error.message);
                });

                if (r.companyId) {
                    await db.from('activity_logs').insert({
                        company_id: r.companyId,
                        user_id: user.id,
                        action: 'email_sent',
                        details: `Bulk email to ${r.email}: "${filledSubject}"`,
                    }).then(({ error }) => {
                        if (error) console.error('[send-bulk] activity:', error.message);
                    });
                }
            }
        } catch (err) {
            results.push({ email: r.email, ok: false, error: (err as Error).message });
        }
    }

    const sent = results.filter(r => r.ok).length;
    return NextResponse.json({
        success: sent > 0,
        sent,
        failed: results.length - sent,
        skipped: recipients.length - unique.length,
        results,
    });
}
