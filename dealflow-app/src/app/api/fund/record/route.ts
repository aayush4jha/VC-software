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
 * The firm's fund tracker — entities, expenses and statement records.
 *
 * It lived in localStorage, so each colleague had a private copy and saw an
 * empty default. One row for the whole organisation, read and written by
 * anyone on the team.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { data, error } = await client
        .from('fund_records')
        .select('payload, updated_at')
        .eq('organization_id', ORGANIZATION_ID)
        .maybeSingle();

    // A missing table is not a failure: the page falls back to its default
    // and still works, which is how it behaved before any of this existed.
    if (error && error.code !== 'PGRST116') {
        return NextResponse.json({ record: null, unavailable: true, reason: error.message });
    }
    return NextResponse.json({ record: data?.payload ?? null, updatedAt: data?.updated_at ?? null });
}

export async function PUT(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const body = await request.json();
    const record = body?.record;
    if (!record || typeof record !== 'object' || !Array.isArray(record.entities)) {
        return NextResponse.json({ error: 'Expected a fund record' }, { status: 400 });
    }

    const { error } = await client.from('fund_records').upsert({
        organization_id: ORGANIZATION_ID,
        payload: record,
        updated_at: new Date().toISOString(),
        updated_by: auth.actor.userId,
    }, { onConflict: 'organization_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
