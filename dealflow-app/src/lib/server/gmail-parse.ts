// Reading the parts of a Gmail message the ingestion paths care about.

export interface AttachmentPart {
    filename?: string | null;
    mimeType?: string | null;
    // A part carries either an attachment to download or the body text itself.
    body?: { attachmentId?: string | null; size?: number | null; data?: string | null } | null;
    parts?: AttachmentPart[] | null;
    // Content-ID lives here; it is how an inline image in the HTML finds the
    // attachment that holds its bytes.
    headers?: { name?: string | null; value?: string | null }[] | null;
}

export interface FoundAttachment {
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
}

// Walks the whole MIME tree. Reading only the top level missed every deck sent
// as multipart/mixed inside multipart/related — the common shape from Outlook
// and from any client that inlines a signature image.
export function collectAttachments(payload: AttachmentPart | null | undefined): FoundAttachment[] {
    const out: FoundAttachment[] = [];
    const walk = (part: AttachmentPart | null | undefined) => {
        if (!part) return;
        if (part.filename && part.body?.attachmentId) {
            out.push({
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                attachmentId: part.body.attachmentId,
                size: part.body.size || 0,
            });
        }
        (part.parts || []).forEach(walk);
    };
    walk(payload);
    return out;
}

const DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];

export function isDeckFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return DECK_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function extractSenderInfo(fromHeader: string): { name: string; email: string } {
    const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    if (match) {
        return {
            name: (match[1] || '').trim() || match[2].split('@')[0],
            email: match[2].trim(),
        };
    }
    return { name: fromHeader.split('@')[0], email: fromHeader };
}

// ─── Reading an email as text ─────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    mdash: '—', ndash: '–', hellip: '…', middot: '·',
    trade: '™', copy: '©', reg: '®', eacute: 'é', rupee: '₹',
};

/** "we&#39;re" -> "we're". Gmail snippets arrive HTML-escaped too, not just bodies. */
export function decodeEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * The readable text of an HTML email.
 *
 * Stripping tags alone is not enough: that leaves the CONTENTS of <style> and
 * <script>, so a marketing email's stylesheet lands in the body and the reader
 * sees a page of CSS. Those elements are removed whole, before anything else.
 */
export function htmlToText(html: string): string {
    return decodeEntities(
        html
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<(style|script|head|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
            // Keep the line structure the writer intended.
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/[ \t ]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function decodeBase64Url(data: string): string {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

/** Plain text if the message carries it, otherwise the HTML part made readable. */
/**
 * The message's own HTML, undecoded by anything — what the sender actually
 * built. extractBodyText flattens this to words; the reading pane renders it.
 */
/**
 * The part an inline image refers to.
 *
 * The HTML says <img src="cid:logo@acme">; the bytes are on a part whose
 * Content-ID header is <logo@acme>. The angle brackets are part of the header
 * and not of the reference, so both sides are stripped before comparing, and
 * the filename is tried as a last resort since some senders use that instead.
 */
export function findInlinePart(
    payload: AttachmentPart | null | undefined,
    contentId: string,
): AttachmentPart | null {
    const wanted = decodeURIComponent(contentId).replace(/^<|>$/g, '').trim().toLowerCase();
    if (!wanted) return null;

    const walk = (part: AttachmentPart | null | undefined): AttachmentPart | null => {
        if (!part) return null;
        const cid = (part.headers || [])
            .find(h => (h?.name || '').toLowerCase() === 'content-id')?.value || '';
        if (cid.replace(/^<|>$/g, '').trim().toLowerCase() === wanted) return part;
        if ((part.filename || '').toLowerCase() === wanted) return part;
        for (const child of part.parts || []) {
            const found = walk(child);
            if (found) return found;
        }
        return null;
    };
    return walk(payload);
}

export function extractBodyHtml(payload: AttachmentPart | null | undefined): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/html' && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }
    for (const part of payload.parts || []) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return decodeBase64Url(part.body.data);
        }
    }
    // multipart/alternative nests the HTML one level down inside
    // multipart/related whenever the mail carries inline images.
    for (const part of payload.parts || []) {
        const nested = extractBodyHtml(part);
        if (nested) return nested;
    }
    return '';
}

export function extractBodyText(payload: AttachmentPart | null | undefined): string {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decodeEntities(decodeBase64Url(payload.body.data)).trim();
    }
    if (payload.mimeType === 'text/html' && payload.body?.data) {
        return htmlToText(decodeBase64Url(payload.body.data));
    }
    for (const part of payload.parts || []) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            return decodeEntities(decodeBase64Url(part.body.data)).trim();
        }
    }
    for (const part of payload.parts || []) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return htmlToText(decodeBase64Url(part.body.data));
        }
    }
    for (const part of payload.parts || []) {
        const nested = extractBodyText(part);
        if (nested) return nested;
    }
    return '';
}
