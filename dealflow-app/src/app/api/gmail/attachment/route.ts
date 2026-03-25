import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const filename = searchParams.get('filename');

    if (!messageId || !filename) {
        return NextResponse.json({ error: 'Missing messageId or filename' }, { status: 400 });
    }

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) {
        return NextResponse.json({ error: 'Not connected to Google' }, { status: 401 });
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

        // Fetch full message to find the attachment
        const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        // Collect all parts (including nested)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allParts: any[] = [];
        const collectParts = (parts: any[]) => {
            if (!parts) return;
            for (const part of parts) {
                allParts.push(part);
                if (part.parts) collectParts(part.parts as typeof allParts);
            }
        };
        collectParts(fullMsg.data.payload?.parts || []);

        // Find the matching attachment
        const matchingPart = allParts.find(p => p.filename === filename && p.body?.attachmentId);
        if (!matchingPart || !matchingPart.body?.attachmentId) {
            return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
        }

        // Download the attachment data
        const attachmentRes = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: matchingPart.body.attachmentId,
        });

        const base64Data = attachmentRes.data.data;
        if (!base64Data) {
            return NextResponse.json({ error: 'Empty attachment' }, { status: 404 });
        }

        // Convert URL-safe base64 to Buffer
        const buffer = Buffer.from(base64Data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        // Determine content type
        const mimeType = matchingPart.mimeType || 'application/octet-stream';

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `inline; filename="${filename}"`,
                'Content-Length': buffer.length.toString(),
            },
        });
    } catch (error) {
        console.error('[gmail/attachment] error:', error);
        return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
    }
}
