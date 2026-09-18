import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET ?id= — opens a stored document (one that came in over WhatsApp). The
 * bucket is private; this checks the caller is a member, then redirects to a
 * link that expires in a minute, so a copied URL stops working.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    const { data: doc } = await db.from('company_documents')
        .select('storage_path, file_name').eq('id', id).eq('organization_id', ORGANIZATION_ID).maybeSingle();
    if (!doc?.storage_path) return NextResponse.json({ error: 'No stored file for this document' }, { status: 404 });

    const { data: signed, error } = await db.storage.from('company-documents')
        .createSignedUrl(doc.storage_path, 60, { download: false });
    if (error || !signed?.signedUrl) {
        return NextResponse.json({ error: error?.message || 'Could not open the file' }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
}
