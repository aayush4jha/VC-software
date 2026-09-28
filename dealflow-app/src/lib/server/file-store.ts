import type { SupabaseClient } from '@supabase/supabase-js';

// Keeping a real copy of a company's documents.
//
// A row that only points at the Gmail message it arrived in stops working the
// day that account is disconnected or the mail is deleted. Decks are kept as
// actual files instead, in a private bucket, and served through a link that
// expires in a minute (see /api/company-documents/file).

export const COMPANY_DOCS_BUCKET = 'company-documents';

/** Bigger than this is left in Gmail rather than copied. */
export const MAX_STORED_FILE_BYTES = 25 * 1024 * 1024;

// What is worth a copy: the documents a deal is actually judged on. Inline
// signature logos and the like stay as pointers.
const STORABLE_EXTENSIONS = /\.(pdf|pptx?|key|odp|docx?|xlsx?|csv|txt|rtf|zip)$/i;

export function isWorthStoring(filename: string, size: number): boolean {
    return STORABLE_EXTENSIONS.test(filename) && size > 0 && size <= MAX_STORED_FILE_BYTES;
}

/** Strips anything that would make an awkward object key. */
export function safeFileName(name: string): string {
    return (name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
}

/**
 * Uploads to the private bucket, creating it the first time. Returns the path,
 * or null if it could not be stored — callers keep going either way, since a
 * document row pointing at Gmail is better than no document at all.
 */
export async function storeFile(
    db: SupabaseClient,
    path: string,
    buffer: Buffer,
    mimeType: string,
    label = 'file-store',
): Promise<string | null> {
    const upload = () => db.storage.from(COMPANY_DOCS_BUCKET)
        .upload(path, buffer, { contentType: mimeType, upsert: true });
    let { error } = await upload();
    if (error && /not found|does not exist|bucket/i.test(error.message)) {
        await db.storage.createBucket(COMPANY_DOCS_BUCKET, { public: false });
        ({ error } = await upload());
    }
    if (error) {
        console.error(`[${label}] upload failed:`, error.message);
        return null;
    }
    return path;
}

/** Where a company's copy of a file lives: company/<id>/<source>/<key>-<name>. */
export function documentPath(companyId: string, source: string, key: string, filename: string): string {
    return `company/${companyId}/${source}/${key}-${safeFileName(filename)}`;
}
