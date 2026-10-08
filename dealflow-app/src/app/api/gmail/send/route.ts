import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { appendSignature } from '@/lib/signature';
import { fetchGmailSignature } from '@/lib/server/gmail-signature';

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const result = await getAuthenticatedClientForUser(user.id);
    if (!result) {
        return NextResponse.json(
            { error: 'Google account not connected. Please connect your account.' },
            { status: 401 },
        );
    }

    try {
        const { to, subject, body, companyId, attachments, threadId, inReplyTo, cc } = await request.json();

        // Dropped rather than passed through: Gmail rejects a message whose
        // Cc header is not a list of addresses.
        const ccHeader = String(cc || '')
            .split(/[,;]/).map(x => x.trim())
            .filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
            .join(', ');

        if (!to || !subject || !body) {
            return NextResponse.json(
                { error: 'Missing required fields: to, subject, body' },
                { status: 400 },
            );
        }

        const gmail = google.gmail({ version: 'v1', auth: result.oauth2Client });

        // Get the connected Google account's email address
        let senderEmail = 'me';
        try {
            const profile = await gmail.users.getProfile({ userId: 'me' });
            senderEmail = profile.data.emailAddress || 'me';
        } catch {
            // fallback to 'me'
        }

        // The signature the person already has on their Gmail address goes on
        // the end, so a mail sent from the platform looks like their own mail.
        // Appended here rather than in each compose box: the workspace reply,
        // the contact card and the company page all send through this route.
        const signedBody = appendSignature(body, await fetchGmailSignature(gmail));

        let message: string;
        const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

        if (hasAttachments) {
            const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const parts: string[] = [
                `From: ${senderEmail}`,
                `To: ${to}`,
                ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
                `Subject: ${subject}`,
                'MIME-Version: 1.0',
                `Content-Type: multipart/mixed; boundary="${boundary}"`,
                '',
                `--${boundary}`,
                'Content-Type: text/plain; charset="UTF-8"',
                '',
                signedBody,
            ];

            for (const att of attachments as { filename: string; mimeType: string; data: string }[]) {
                parts.push(
                    `--${boundary}`,
                    `Content-Type: ${att.mimeType}; name="${att.filename}"`,
                    `Content-Disposition: attachment; filename="${att.filename}"`,
                    'Content-Transfer-Encoding: base64',
                    '',
                    att.data,
                );
            }

            parts.push(`--${boundary}--`);
            message = parts.join('\n');
        } else {
            // In-Reply-To and References are what make a reply land inside the
            // founder's own thread rather than starting a new conversation.
            message = [
                `From: ${senderEmail}`,
                `To: ${to}`,
                ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
                `Subject: ${subject}`,
                ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
                'Content-Type: text/plain; charset="UTF-8"',
                'MIME-Version: 1.0',
                '',
                signedBody,
            ].join('\n');
        }

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const sendResult = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage, ...(threadId ? { threadId } : {}) },
        });

        // Log the sent email
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && serviceRoleKey) {
            const db = createServiceClient(supabaseUrl, serviceRoleKey);

            await db.from('email_logs').insert({
                company_id: companyId || null,
                sender_id: user.id,
                recipient_email: to,
                subject,
                body,
                email_type: companyId ? 'outreach' : 'general',
            }).then(({ error }) => {
                if (error) console.error('[gmail/send] Failed to log email:', error.message);
            });

            if (companyId) {
                await db.from('activity_logs').insert({
                    company_id: companyId,
                    user_id: user.id,
                    action: 'email_sent',
                    details: `Email sent to ${to}: "${subject}"`,
                }).then(({ error }) => {
                    if (error) console.error('[gmail/send] Failed to log activity:', error.message);
                });
            }
        }

        return NextResponse.json({
            success: true,
            messageId: sendResult.data.id,
            threadId: sendResult.data.threadId,
        });
    } catch (error: unknown) {
        console.error('Error sending email:', error);
        const err = error as { code?: number; message?: string };
        return NextResponse.json(
            { error: err.message || 'Failed to send email' },
            { status: err.code === 401 ? 401 : 500 },
        );
    }
}
