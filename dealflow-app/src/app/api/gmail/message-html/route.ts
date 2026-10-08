import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { extractBodyHtml, extractBodyText, type AttachmentPart } from '@/lib/server/gmail-parse';
import { sanitizeEmailHtml, textToDocument } from '@/lib/email-html';

/**
 * GET ?messageId= — one message as a document the reading pane can render.
 *
 * Fetched on demand rather than stored: the HTML of a marketing mail is often
 * a hundred times the size of its text, and the workspace cache already sits
 * close to what a browser will keep.
 *
 * The sanitising happens here, on the server, so the browser is never handed
 * the raw article at all.
 */
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const messageId = new URL(request.url).searchParams.get('messageId');
    if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

    const auth = await getAuthenticatedClientForUser(user.id);
    if (!auth) return NextResponse.json({ error: 'Google account not connected' }, { status: 401 });

    try {
        const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
        const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        const payload = data.payload as AttachmentPart | undefined;

        const rawHtml = extractBodyHtml(payload);
        if (rawHtml) {
            const { html, changed, images } = sanitizeEmailHtml(rawHtml, {
                // Every picture comes back through the platform: a cid: source
                // is an attachment the browser cannot resolve at all, and a
                // remote one loaded directly would report the reader to the
                // sender. See /api/gmail/image.
                rewriteImageUrl: (url) =>
                    `/api/gmail/image?messageId=${encodeURIComponent(messageId)}&src=${encodeURIComponent(url)}`,
            });
            if (html) {
                return NextResponse.json({ document: html, kind: 'html', sanitized: changed, images });
            }
        }

        // No HTML part: a plain-text mail, shown through the same frame so
        // both kinds of message look like one reading pane.
        const text = extractBodyText(payload);
        return NextResponse.json({ document: textToDocument(text), kind: 'text', sanitized: false, images: 0 });
    } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code === 404) return NextResponse.json({ error: 'That message is no longer in Gmail' }, { status: 404 });
        console.error('[gmail/message-html]', e.message);
        return NextResponse.json({ error: e.message || 'Could not read that message' }, { status: 502 });
    }
}
