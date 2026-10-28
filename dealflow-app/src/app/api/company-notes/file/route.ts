import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET } from '@/lib/server/file-store';
import { notesDb } from '@/lib/server/company-notes';

/**
 * GET ?path= — opens an image or file from a company's notes.
 *
 * The bucket is private, so a note keeps this address rather than a storage
 * link, and each view is checked and sent on to a link that expires in a
 * minute. Only notes files: this cannot be used to open any other path.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const path = new URL(request.url).searchParams.get('path') || '';
    if (!/^company\/[0-9a-f-]{36}\/notes\/[^/]+$/i.test(path)) {
        return NextResponse.json({ error: 'Not a notes file' }, { status: 400 });
    }

    const { data, error } = await db.storage.from(COMPANY_DOCS_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'File not found' }, { status: 404 });
    return NextResponse.redirect(data.signedUrl);
}
