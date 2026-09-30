import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET, safeFileName } from '@/lib/server/file-store';

// Gmail refuses a message over 25 MB, and base64 inflates a file by a third.
export const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;

/**
 * Hands the browser a signed URL per file so it can upload straight to storage.
 *
 * The files do NOT travel through this API: a serverless request body is capped
 * around 4.5 MB, which base64 would exhaust at roughly a 3 MB attachment. The
 * send route reads them back out of storage instead, so the only real ceiling
 * is Gmail's own.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    const { files } = await request.json() as { files?: { name: string; size: number }[] };
    if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json({ error: 'No files' }, { status: 400 });
    }
    const total = files.reduce((s, f) => s + (Number(f.size) || 0), 0);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        return NextResponse.json({
            error: `Attachments total ${(total / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024} MB, because every recipient gets a copy and Gmail rejects a message over 25 MB.`,
        }, { status: 400 });
    }

    const stamp = Date.now();
    const out: { path: string; token: string; name: string }[] = [];
    for (const [i, f] of files.entries()) {
        const path = `bulk-email/${auth.actor.userId}/${stamp}-${i}-${safeFileName(f.name)}`;
        let { data, error } = await db.storage.from(COMPANY_DOCS_BUCKET).createSignedUploadUrl(path);
        if (error && /not found|does not exist|bucket/i.test(error.message)) {
            await db.storage.createBucket(COMPANY_DOCS_BUCKET, { public: false });
            ({ data, error } = await db.storage.from(COMPANY_DOCS_BUCKET).createSignedUploadUrl(path));
        }
        if (error || !data) {
            return NextResponse.json({ error: error?.message || 'Could not prepare the upload' }, { status: 500 });
        }
        out.push({ path: data.path, token: data.token, name: f.name });
    }
    return NextResponse.json({ uploads: out });
}
