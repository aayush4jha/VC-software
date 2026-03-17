import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated. Please connect your Google account.' },
            { status: 401 }
        );
    }

    try {
        const { to, subject, body, from, companyId } = await request.json();

        if (!to || !subject || !body) {
            return NextResponse.json(
                { error: 'Missing required fields: to, subject, body' },
                { status: 400 }
            );
        }

        const oauth2Client = getAuthenticatedClient(accessToken, refreshToken);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Build the RFC 2822 email message
        const messageParts = [
            `From: ${from || 'me'}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            '',
            body,
        ];
        const message = messageParts.join('\n');

        // Encode to base64url
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });

        // Log the sent email to email_logs table
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && serviceRoleKey) {
            const db = createServiceClient(supabaseUrl, serviceRoleKey);

            // Get user ID from auth header if available
            const authHeader = request.headers.get('Authorization');
            let senderId: string | null = null;
            if (authHeader?.startsWith('Bearer ')) {
                const jwt = parseJwt(authHeader.slice(7));
                senderId = (jwt?.sub as string) || null;
            }

            await db.from('email_logs').insert({
                company_id: companyId || null,
                sender_id: senderId,
                recipient_email: to,
                subject,
                body,
                email_type: companyId ? 'outreach' : 'general',
            }).then(({ error }) => {
                if (error) console.error('[gmail/send] Failed to log email:', error.message);
            });

            // Also log to activity_logs if it's tied to a company
            if (companyId && senderId) {
                await db.from('activity_logs').insert({
                    company_id: companyId,
                    user_id: senderId,
                    action: 'email_sent',
                    details: `Email sent to ${to}: "${subject}"`,
                }).then(({ error }) => {
                    if (error) console.error('[gmail/send] Failed to log activity:', error.message);
                });
            }
        }

        return NextResponse.json({
            success: true,
            messageId: result.data.id,
            threadId: result.data.threadId,
        });
    } catch (error: unknown) {
        console.error('Error sending email:', error);

        // Check if token expired
        const err = error as { code?: number; message?: string };
        if (err.code === 401) {
            const response = NextResponse.json(
                { error: 'Google session expired. Please reconnect your account.' },
                { status: 401 }
            );
            response.cookies.delete('google_access_token');
            response.cookies.delete('google_connected');
            return response;
        }

        return NextResponse.json(
            { error: err.message || 'Failed to send email' },
            { status: 500 }
        );
    }
}
