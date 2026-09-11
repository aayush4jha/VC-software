import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';

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
            receivedAt: d.received_at,
            senderEmail: d.sender_email,
            subject: d.subject,
        })),
    });
}
