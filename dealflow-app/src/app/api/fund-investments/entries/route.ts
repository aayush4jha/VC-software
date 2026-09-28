import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * The rows that hang off a fund investment: drawdowns being paid, and NAV as
 * the fund reports it.
 *
 *   POST   { kind: 'nav', fundInvestmentId, asOfDate, nav, notes? }
 *   PATCH  { kind: 'drawdown', id, action: 'pay' | 'unpay', paidOn?, amountPaid?, notes? }
 *   DELETE ?kind=nav&id=...
 */
async function guard(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return { response: auth.response };
    if (!hasAnyPermission(auth.actor, ['fund'])) {
        return { response: forbidden('You do not have access to fund investments.') };
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { response: NextResponse.json({ error: 'Server config missing' }, { status: 500 }) };
    return { db: createServiceClient(url, key) };
}

export async function POST(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    if (body.kind !== 'nav') return NextResponse.json({ error: 'Unknown entry kind' }, { status: 400 });

    const fundInvestmentId = String(body.fundInvestmentId || '');
    const asOfDate = String(body.asOfDate || '').slice(0, 10);
    const nav = num(body.nav);
    if (!fundInvestmentId) return NextResponse.json({ error: 'Missing fund investment' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return NextResponse.json({ error: 'A NAV entry needs a date.' }, { status: 400 });
    if (nav == null || !isFinite(nav) || nav < 0) return NextResponse.json({ error: 'NAV must be a number.' }, { status: 400 });

    // One NAV per date: a corrected figure replaces the earlier one.
    const { error } = await g.db.from('fund_nav_entries').upsert({
        organization_id: ORGANIZATION_ID,
        fund_investment_id: fundInvestmentId,
        as_of_date: asOfDate,
        nav,
        notes: typeof body.notes === 'string' ? body.notes : '',
    }, { onConflict: 'fund_investment_id,as_of_date' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    if (body.kind !== 'drawdown') return NextResponse.json({ error: 'Unknown entry kind' }, { status: 400 });
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    if (body.action === 'pay') {
        const { data: row } = await g.db.from('fund_drawdowns').select('amount').eq('id', id).maybeSingle();
        const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paidOn || '')) ? String(body.paidOn) : today();
        const amount = num(body.amountPaid) ?? (row ? Number(row.amount) : null);
        // Guarded on status so two people paying the same call cannot both win.
        const { data, error } = await g.db.from('fund_drawdowns').update({
            status: 'Paid', paid_on: paidOn, amount_paid: amount,
            notes: typeof body.notes === 'string' ? body.notes : undefined,
            updated_at: new Date().toISOString(),
        }).eq('id', id).eq('status', 'Pending').select().maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'That drawdown is already marked paid.' }, { status: 409 });
    } else if (body.action === 'unpay') {
        const { error } = await g.db.from('fund_drawdowns').update({
            status: 'Pending', paid_on: null, amount_paid: null, updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (params.get('kind') !== 'nav' || !id) return NextResponse.json({ error: 'Missing kind or id' }, { status: 400 });
    const { error } = await g.db.from('fund_nav_entries').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
