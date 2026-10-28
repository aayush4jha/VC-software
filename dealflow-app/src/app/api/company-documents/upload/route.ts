import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET, documentPath, isWorthStoring, MAX_STORED_FILE_BYTES } from '@/lib/server/file-store';

/**
 * POST { companyId, fileName, size } — a one-time link to upload one file
 * into the company's folder.
 *
 * The browser sends the bytes straight to storage with it. Passing a deck
 * through this function instead would hit Vercel's 4.5 MB request limit, and
 * most decks are bigger than that. Once the upload lands, the browser records
 * it with POST /api/company-documents.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const { companyId, fileName, size } = await request.json();
    if (!companyId || !fileName) return NextResponse.json({ error: 'companyId and fileName are required' }, { status: 400 });
    if (!isWorthStoring(String(fileName), Number(size) || 0)) {
        return NextResponse.json({
            error: Number(size) > MAX_STORED_FILE_BYTES
                ? `${fileName} is over ${MAX_STORED_FILE_BYTES / (1024 * 1024)} MB.`
                : `${fileName} is not a document type the platform keeps (PDF, PowerPoint, Keynote, Word, Excel, CSV, text or zip).`,
        }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = documentPath(String(companyId), 'upload', stamp, String(fileName));
    const { data, error } = await db.storage.from(COMPANY_DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not prepare the upload' }, { status: 500 });

    return NextResponse.json({ path: data.path, token: data.token });
}
