import { createClient } from '@/lib/supabase/client';

export interface UploadedFile {
    name: string;
    path: string;
    size: number;
    mimeType: string;
}

/**
 * Puts one file into a company's folder in storage and returns where it went.
 *
 * The bytes go from the browser straight to storage on a one-time link from
 * /api/company-documents/upload: through our own function they would hit
 * Vercel's 4.5 MB request limit, and a deck is usually bigger. 'documents'
 * files then need recording with POST /api/company-documents; 'notes' files
 * are referenced from the note or comment that holds them.
 */
export async function uploadCompanyFile(
    companyId: string,
    file: File,
    purpose: 'documents' | 'notes' = 'documents',
): Promise<UploadedFile> {
    const ticket = await fetch('/api/company-documents/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, fileName: file.name, size: file.size, purpose }),
    }).then(r => r.json());
    if (!ticket.path) throw new Error(ticket.error || 'could not start the upload');

    const { error } = await createClient().storage.from('company-documents')
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || 'application/octet-stream' });
    if (error) throw new Error(error.message);

    return { name: file.name, path: ticket.path, size: file.size, mimeType: file.type };
}

/** The address a note uses for one of its files. */
export const noteFileUrl = (path: string) => `/api/company-notes/file?path=${encodeURIComponent(path)}`;

export function formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
