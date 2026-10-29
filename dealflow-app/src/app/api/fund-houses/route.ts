import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/** The columns a row has, as the page names them → as the table does. */
const FIELDS = { fund: 'fund', house: 'house', fundManager: 'fund_manager', stage: 'stage', size: 'size', commitment: 'commitment' } as const;
type Field = keyof typeof FIELDS;

const missingTable = (m: string) => /relation .* does not exist|schema cache|could not find the table/i.test(m);
const NEEDS_MIGRATION = { needsMigration: true, error: 'The Fund House page needs supabase/fund-houses.sql run in the Supabase SQL editor.' };

async function guard(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return { response: auth.response };
    // The page sits under Deal Flow, and opens with the same grant.
    if (!hasAnyPermission(auth.actor, ['dealflow'])) return { response: forbidden('You do not have access to Fund House.') };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { response: NextResponse.json({ error: 'Server config missing' }, { status: 500 }) };
    return { actor: auth.actor, db: createServiceClient(url, key) };
}

function readFields(body: Record<string, unknown>) {
    const row: Record<string, string> = {};
    for (const [name, column] of Object.entries(FIELDS)) {
        if (name in body) row[column] = String(body[name as Field] ?? '').trim().slice(0, 300);
    }
    return row;
}

function toFund(r: Record<string, string>) {
    return {
        id: r.id, fund: r.fund, house: r.house, fundManager: r.fund_manager,
        stage: r.stage, size: r.size, commitment: r.commitment, updatedAt: r.updated_at,
    };
}

/** GET — every fund on the page, oldest first, so a new one joins the bottom. */
export async function GET(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const { data, error } = await g.db.from('fund_houses').select('*')
        .eq('organization_id', ORGANIZATION_ID).order('created_at');
    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ funds: (data || []).map(toFund) });
}

/** POST { fund, house, fundManager, stage, size, commitment } — adds a fund. */
export async function POST(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const row = readFields(await request.json());
    if (!row.fund && !row.house) return NextResponse.json({ error: 'Give the fund or the house a name' }, { status: 400 });
    const { data, error } = await g.db.from('fund_houses')
        .insert({ ...row, organization_id: ORGANIZATION_ID, created_by: g.actor.userId }).select('*').single();
    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ fund: toFund(data) });
}

/** PATCH { id, ...fields } — changes a fund. */
export async function PATCH(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { data, error } = await g.db.from('fund_houses')
        .update({ ...readFields(body), updated_at: new Date().toISOString() })
        .eq('organization_id', ORGANIZATION_ID).eq('id', body.id).select('*').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'That fund has been deleted' }, { status: 404 });
    return NextResponse.json({ fund: toFund(data) });
}

/** DELETE ?id= — removes a fund. */
export async function DELETE(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { error } = await g.db.from('fund_houses').delete().eq('organization_id', ORGANIZATION_ID).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
