import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET, FUND_FILES_FOLDER, MAX_STORED_FILE_BYTES, safeFileName } from '@/lib/server/file-store';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

const WORKBOOK = /\.(xlsx|xls|xlsm|csv)$/i;

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * GET — every Fund upload, newest first, for the Upload history.
 * GET ?id= — that upload's file, through a link that expires in a minute.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (id) {
        const { data } = await client.from('fund_imports').select('*')
            .eq('organization_id', ORGANIZATION_ID).eq('id', id).maybeSingle();
        if (!data?.file_path) return NextResponse.json({ error: 'That upload has no file kept' }, { status: 404 });
        const { data: signed, error } = await client.storage.from(COMPANY_DOCS_BUCKET)
            .createSignedUrl(data.file_path, 60, params.get('download') ? { download: data.file_name } : undefined);
        if (error || !signed) return NextResponse.json({ error: error?.message || 'Could not open the file' }, { status: 500 });
        return NextResponse.redirect(signed.signedUrl);
    }

    const { data, error } = await client.from('fund_imports').select('*')
        .eq('organization_id', ORGANIZATION_ID).order('created_at', { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Uploads from before names were kept: look the uploader up.
    const unnamed = [...new Set((data || []).filter(i => !i.imported_by_name && i.imported_by).map(i => i.imported_by as string))];
    const names = new Map<string, string>();
    if (unnamed.length) {
        const { data: people } = await client.from('profiles').select('id, name, email').in('id', unnamed);
        for (const p of people || []) names.set(p.id, p.name || p.email || '');
    }

    return NextResponse.json({
        uploads: (data || []).map(i => {
            const { __dashboard, ...sheets } = (i.sheet_summary || {}) as Record<string, unknown>;
            return {
                id: i.id,
                fileName: i.file_name,
                uploadedAt: i.created_at,
                uploadedBy: i.imported_by_name || names.get(i.imported_by) || '',
                rowsImported: i.rows_imported,
                rowsSkipped: i.rows_skipped,
                rowsFlagged: i.rows_flagged,
                hasDashboard: !!__dashboard,
                sheets: Object.entries(sheets).map(([sheet, description]) => ({ sheet, description: String(description) })),
                hasFile: !!i.file_path,
                fileSize: i.file_size ?? null,
            };
        }),
    });
}

/**
 * POST { fileName, size } — a one-time link to put an uploaded workbook in
 * storage. The browser sends the bytes straight there (a workbook is often
 * over Vercel's 4.5 MB request limit), then names the path when it imports.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { fileName, size } = await request.json();
    const bytes = Number(size) || 0;
    if (!fileName || !WORKBOOK.test(String(fileName))) {
        return NextResponse.json({ error: 'Only Excel and CSV files are kept here' }, { status: 400 });
    }
    if (bytes <= 0 || bytes > MAX_STORED_FILE_BYTES) {
        return NextResponse.json({ error: `${fileName} is over ${MAX_STORED_FILE_BYTES / (1024 * 1024)} MB` }, { status: 400 });
    }

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${FUND_FILES_FOLDER}${stamp}-${safeFileName(String(fileName))}`;
    let ticket = await client.storage.from(COMPANY_DOCS_BUCKET).createSignedUploadUrl(path);
    if (ticket.error && /not found|does not exist|bucket/i.test(ticket.error.message)) {
        await client.storage.createBucket(COMPANY_DOCS_BUCKET, { public: false });
        ticket = await client.storage.from(COMPANY_DOCS_BUCKET).createSignedUploadUrl(path);
    }
    if (ticket.error || !ticket.data) {
        return NextResponse.json({ error: ticket.error?.message || 'Could not prepare the upload' }, { status: 500 });
    }
    return NextResponse.json({ path: ticket.data.path, token: ticket.data.token });
}
