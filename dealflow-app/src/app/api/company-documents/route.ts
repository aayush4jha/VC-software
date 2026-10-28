import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET } from '@/lib/server/file-store';
import { isDeckFile } from '@/lib/server/gmail-parse';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Documents filed against a company — today, the attachments that arrived with
 * its emails. The bytes live in Gmail; these rows say which message holds them,
 * and /api/gmail/attachment streams one on demand.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const companyId = new URL(request.url).searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await db
        .from('company_documents')
        .select('*')
        .eq('organization_id', ORGANIZATION_ID)
        .eq('company_id', companyId)
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
        // The table is missing until supabase/company-documents.sql is applied.
        // An empty list keeps the company panel rendering instead of erroring.
        console.error('[company-documents] ', error.message);
        return NextResponse.json({ documents: [], unavailable: error.message });
    }

    return NextResponse.json({
        documents: (data || []).map(d => ({
            id: d.id,
            fileName: d.file_name,
            mimeType: d.mime_type,
            sizeBytes: d.size_bytes,
            isPitchDeck: d.is_pitch_deck,
            source: d.source,
            gmailMessageId: d.gmail_message_id,
            // Present once supabase/whatsapp.sql adds the column; undefined before.
            hasStoredFile: !!d.storage_path,
            receivedAt: d.received_at,
            senderEmail: d.sender_email,
            subject: d.subject,
        })),
    });
}

function serviceDb() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * POST { companyId, path, fileName, mimeType, size } — records a file someone
 * uploaded from the company page, after it has landed in storage (see
 * ./upload). From here it is listed for everyone, like a deck that came in by
 * email or WhatsApp.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = serviceDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { companyId, path, fileName, mimeType, size } = await request.json();
    // Only a path ./upload could have handed out for this company, so a caller
    // cannot attach some other company's file to this one.
    if (!companyId || typeof path !== 'string' || !path.startsWith(`company/${companyId}/upload/`) || !fileName) {
        return NextResponse.json({ error: 'companyId, path and fileName are required' }, { status: 400 });
    }

    // The upload must actually have arrived, or the row would point at nothing.
    const folder = path.slice(0, path.lastIndexOf('/'));
    const { data: found } = await db.storage.from(COMPANY_DOCS_BUCKET)
        .list(folder, { search: path.slice(folder.length + 1) });
    if (!found?.length) return NextResponse.json({ error: 'The file did not finish uploading. Try again.' }, { status: 409 });

    const { data, error } = await db.from('company_documents').insert({
        organization_id: ORGANIZATION_ID,
        company_id: companyId,
        file_name: String(fileName).slice(0, 255),
        mime_type: mimeType || null,
        size_bytes: Number(size) || null,
        is_pitch_deck: isDeckFile(String(fileName)),
        source: 'upload',
        storage_path: path,
        received_at: new Date().toISOString(),
        sender_email: auth.actor.email,
        subject: null,
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from('activity_logs').insert({
        company_id: companyId, user_id: auth.actor.userId,
        action: 'document_uploaded', details: `Uploaded ${fileName}`,
    });
    return NextResponse.json({ id: data.id });
}

/**
 * DELETE ?id= — removes a document from the company, and its stored copy with
 * it. The activity log keeps who removed what, since the file itself is gone.
 */
export async function DELETE(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = serviceDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { data: doc } = await db.from('company_documents')
        .select('company_id, file_name, storage_path')
        .eq('id', id).eq('organization_id', ORGANIZATION_ID).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const { error } = await db.from('company_documents').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // After the row: a file left without a row is harmless, a row left without
    // its file is a broken link on the company page.
    if (doc.storage_path) {
        const { error: removeError } = await db.storage.from(COMPANY_DOCS_BUCKET).remove([doc.storage_path]);
        if (removeError) console.error('[company-documents] could not remove file:', removeError.message);
    }

    await db.from('activity_logs').insert({
        company_id: doc.company_id, user_id: auth.actor.userId,
        action: 'document_deleted', details: `Deleted ${doc.file_name}`,
    });
    return NextResponse.json({ ok: true });
}
