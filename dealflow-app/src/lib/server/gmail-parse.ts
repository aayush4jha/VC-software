// Reading the parts of a Gmail message the ingestion paths care about.

export interface AttachmentPart {
    filename?: string | null;
    mimeType?: string | null;
    body?: { attachmentId?: string | null; size?: number | null } | null;
    parts?: AttachmentPart[] | null;
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
