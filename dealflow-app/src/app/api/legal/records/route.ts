import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * Every company's legal record, keyed by company id.
 *
 * Returned in one call because the Legal list page needs all of them to show
 * alerts and stage counts, and fetching per company would be a request per
 * row. The payloads are small — stages, rights rows and a few documents.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { data, error } = await client
        .from('legal_records')
        .select('company_id, payload')
        .eq('organization_id', ORGANIZATION_ID);

    if (error) {
        return NextResponse.json({ records: {}, unavailable: true, reason: error.message });
    }
    const records: Record<string, unknown> = {};
    for (const row of data || []) records[row.company_id] = row.payload;
    return NextResponse.json({ records });
}

/**
 * PUT { records: { [companyId]: record } } — one or many at once.
 *
 * Many, because the first load after this shipped has to push up whatever a
 * person had accumulated in their browser, and that is the whole set.
 */
export async function PUT(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const body = await request.json();
    const records = body?.records;
    if (!records || typeof records !== 'object') {
        return NextResponse.json({ error: 'Expected records' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows = Object.entries(records as Record<string, unknown>)
        .filter(([companyId, payload]) => companyId && payload && typeof payload === 'object')
        .map(([companyId, payload]) => ({
            organization_id: ORGANIZATION_ID,
            company_id: companyId,
            payload,
            updated_at: now,
            updated_by: auth.actor.userId,
        }));
    if (rows.length === 0) return NextResponse.json({ ok: true, written: 0 });

    const { error } = await client
        .from('legal_records')
        .upsert(rows, { onConflict: 'organization_id,company_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, written: rows.length });
}
