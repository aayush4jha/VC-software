import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { COMPANY_DOCS_BUCKET } from '@/lib/server/file-store';
import { appendSignature } from '@/lib/signature';
import { fetchGmailSignature } from '@/lib/server/gmail-signature';

// One send per founder rather than one mail with everyone on it: founders must
// never see each other's addresses, and a reply has to come back as a normal
// one-to-one thread against that company.
const MAX_RECIPIENTS = 200;

// One send per recipient, each carrying the attachments.
export const maxDuration = 300;

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

export interface OutgoingAttachment {
    name: string;
    mimeType: string;
    /** Base64 of the file, read once and reused for every recipient. */
    data: string;
}

// A header must be 7-bit; a filename with an accent or a rupee sign has to be
// encoded or the attachment arrives with a mangled name.
function encodeHeaderWord(value: string): string {
    return /^[\x20-\x7E]*$/.test(value)
        ? value
        : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function encodeMessage(
    from: string, to: string, subject: string, body: string,
    attachments: OutgoingAttachment[] = [],
    cc = '',
): string {
    const lines = [
        `From: ${from}`,
        `To: ${to}`,
        // One Cc for every founder in the batch: whoever is copied sees each
        // message, which is the point of copying a colleague on an outreach
        // round. The modal says so before anything is sent.
        ...(cc ? [`Cc: ${cc}`] : []),
        `Subject: ${encodeHeaderWord(subject)}`,
        'MIME-Version: 1.0',
    ];
    if (attachments.length === 0) {
        lines.push('Content-Type: text/plain; charset="UTF-8"', '', body);
    } else {
        const boundary = `dv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        lines.push(
            `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"', '',
            body,
        );
        for (const a of attachments) {
            lines.push(
                `--${boundary}`,
                `Content-Type: ${a.mimeType}; name="${encodeHeaderWord(a.name)}"`,
                `Content-Disposition: attachment; filename="${encodeHeaderWord(a.name)}"`,
                'Content-Transfer-Encoding: base64', '',
                a.data.replace(/(.{76})/g, '$1\r\n'),
            );
        }
        lines.push(`--${boundary}--`);
    }
    return Buffer.from(lines.join('\r\n'))
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

    const { recipients, subject, body, attachmentPaths, cc } = await request.json();

    if (!Array.isArray(recipients) || recipients.length === 0) {
        return NextResponse.json({ error: 'No recipients' }, { status: 400 });
    }
    if (!subject || !body) {
        return NextResponse.json({ error: 'Missing subject or body' }, { status: 400 });
    }
    // Only real addresses go in a header; anything else is dropped rather
    // than handed to Gmail, which would reject the whole message.
    const ccList = String(cc || '')
        .split(/[,;]/).map(x => x.trim()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    const ccHeader = ccList.join(', ');

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

    // Read the files out of storage once, not once per recipient.
    const attachments: OutgoingAttachment[] = [];
    if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
        const store = createServiceClient(url, key);
        for (const p of attachmentPaths as { path: string; name: string }[]) {
            const { data, error } = await store.storage.from(COMPANY_DOCS_BUCKET).download(p.path);
            if (error || !data) {
                return NextResponse.json({
                    error: `Could not read the attachment "${p.name}" — nothing was sent.`,
                }, { status: 500 });
            }
            const buffer = Buffer.from(await data.arrayBuffer());
            attachments.push({
                name: p.name,
                mimeType: data.type || 'application/octet-stream',
                data: buffer.toString('base64'),
            });
        }
    }

    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });

    let senderEmail = 'me';
    try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        senderEmail = profile.data.emailAddress || 'me';
    } catch { /* 'me' is accepted by the API */ }

    // Read once for the batch, not once per founder.
    const signature = await fetchGmailSignature(gmail);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = supabaseUrl && serviceRoleKey ? createServiceClient(supabaseUrl, serviceRoleKey) : null;

    const results: { email: string; ok: boolean; error?: string }[] = [];

    // Sequential on purpose. Gmail rate-limits bursts, and a partial failure
    // must be reportable per address rather than collapsing the whole batch.
    for (const r of unique) {
        const filledSubject = fillTemplate(subject, r);
        // Signed after the merge fields are filled, so the signature is
        // never mistaken for part of the template.
        const filledBody = appendSignature(fillTemplate(body, r), signature);
        try {
            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodeMessage(senderEmail, r.email, filledSubject, filledBody, attachments, ccHeader) },
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

    // The uploads were staged only to be sent; clear them either way.
    if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
            const store = createServiceClient(url, key);
            await store.storage.from(COMPANY_DOCS_BUCKET)
                .remove((attachmentPaths as { path: string }[]).map(p => p.path))
                .catch(() => { /* a leftover staged file is harmless */ });
        }
    }

    const sent = results.filter(r => r.ok).length;
    return NextResponse.json({
        success: sent > 0,
        sent,
        failed: results.length - sent,
        skipped: recipients.length - unique.length,
        cc: ccList,
        results,
    });
}
