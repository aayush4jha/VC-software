import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';

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
        const { to, subject, body, from } = await request.json();

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
            // Clear the stale cookie
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
