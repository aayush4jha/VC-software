import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { findInlinePart, type AttachmentPart } from '@/lib/server/gmail-parse';

// A banner can be a few hundred kilobytes; a mail is a stack of them.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

// 1×1 transparent GIF. Returned instead of an error so a picture that cannot
// be had collapses quietly rather than leaving a broken-image box in the
// middle of the mail.
const BLANK = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function blank() {
    return new NextResponse(new Uint8Array(BLANK), {
        headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'private, max-age=300' },
    });
}

/**
 * GET ?messageId=&src= — one image from an email, fetched by the platform
 * rather than by the reader's browser.
 *
 * Two reasons it cannot be left to the browser. A cid: source is an attachment
 * on the message itself and resolves to nothing outside a mail client. And a
 * remote image loaded directly tells the sender that this person, at this
 * address, opened the mail — which is what a tracking pixel is for. Fetching
 * here means the sender sees a server, and the reader stays anonymous.
 */
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const src = params.get('src') || '';
    const messageId = params.get('messageId') || '';
    if (!src) return blank();

    // ─── An attachment on the message itself ─────────────────────────────
    if (src.toLowerCase().startsWith('cid:')) {
        if (!messageId) return blank();
        const auth = await getAuthenticatedClientForUser(user.id);
        if (!auth) return blank();
        try {
            const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
            const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
            const part = findInlinePart(data.payload as AttachmentPart, src.slice(4));
            if (!part?.body?.attachmentId) return blank();

            const att = await gmail.users.messages.attachments.get({
                userId: 'me', messageId, id: part.body.attachmentId,
            });
            const raw = att.data.data;
            if (!raw) return blank();
            const bytes = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            return new NextResponse(new Uint8Array(bytes), {
                headers: {
                    'Content-Type': part.mimeType || 'image/png',
                    // The bytes of a sent message never change.
                    'Cache-Control': 'private, max-age=86400, immutable',
                },
            });
        } catch {
            return blank();
        }
    }

    // ─── A remote image ──────────────────────────────────────────────────
    let url: URL;
    try {
        url = new URL(src);
    } catch {
        return blank();
    }
    // Only the web. No file:, no gopher:, and nothing that could be pointed at
    // something inside the network this server sits in.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return blank();
    if (/^(?:localhost$|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$|0\.)/i.test(url.hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
        return blank();
    }

    try {
        const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            redirect: 'follow',
            headers: {
                // Some CDNs refuse a request with no user agent at all.
                'User-Agent': 'Mozilla/5.0 (compatible; DholakiaVentures-MailViewer/1.0)',
                'Accept': 'image/*,*/*;q=0.8',
            },
        });
        if (!res.ok) return blank();

        const type = res.headers.get('content-type') || 'application/octet-stream';
        // Whatever the sender labelled it, only render it if it is an image.
        if (!type.startsWith('image/')) return blank();

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES) return blank();

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': type,
                'Cache-Control': 'private, max-age=86400',
            },
        });
    } catch {
        return blank();
    }
}
