import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';
import {
    buildDrawdownSchedule, validateFundTerms, fundInvestmentMetrics,
    type ContributionType, type FundInvestmentTerms,
} from '@/lib/fund-investment';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));

interface InvestmentRow {
    id: string;
    fund_name: string;
    contribution_type: ContributionType;
    start_date: string;
    commitment: number | string;
    down_payment: number | string;
    installments: number;
    nav_at_investment: number | string | null;
    investment_entity: string | null;
    status: 'Active' | 'Exited' | 'Closed';
    notes: string;
}
interface DrawdownRow {
    id: string; fund_investment_id: string; sequence: number; due_date: string;
    amount: number | string; is_down_payment: boolean; status: 'Pending' | 'Paid';
    paid_on: string | null; amount_paid: number | string | null; notes: string;
}
interface NavRow {
    id: string; fund_investment_id: string; as_of_date: string; nav: number | string; notes: string;
}

function db(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

async function guard(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return { response: auth.response };
    if (!hasAnyPermission(auth.actor, ['fund'])) {
        return { response: forbidden('You do not have access to fund investments.') };
    }
    const client = db();
    if (!client) return { response: NextResponse.json({ error: 'Server config missing' }, { status: 500 }) };
    return { actor: auth.actor, db: client };
}

function readTerms(body: Record<string, unknown>): FundInvestmentTerms {
    return {
        commitment: num(body.commitment),
        downPayment: num(body.downPayment),
        installments: Math.round(num(body.installments)),
        contributionType: body.contributionType as ContributionType,
        startDate: typeof body.startDate === 'string' ? body.startDate.slice(0, 10) : '',
        customDates: Array.isArray(body.customDates)
            ? (body.customDates as unknown[]).map(d => String(d).slice(0, 10))
            : undefined,
    };
}

function toDto(inv: InvestmentRow, drawdowns: DrawdownRow[], navs: NavRow[]) {
    const mine = drawdowns.filter(d => d.fund_investment_id === inv.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map(d => ({
            id: d.id, sequence: d.sequence, dueDate: d.due_date.slice(0, 10), amount: num(d.amount),
            isDownPayment: d.is_down_payment, status: d.status,
            paidOn: d.paid_on ? d.paid_on.slice(0, 10) : null,
            amountPaid: d.amount_paid == null ? null : num(d.amount_paid),
            notes: d.notes,
        }));
    const myNavs = navs.filter(n => n.fund_investment_id === inv.id)
        .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date))
        .map(n => ({ id: n.id, asOfDate: n.as_of_date.slice(0, 10), nav: num(n.nav), notes: n.notes }));
    return {
        id: inv.id,
        fundName: inv.fund_name,
        contributionType: inv.contribution_type,
        startDate: inv.start_date.slice(0, 10),
        commitment: num(inv.commitment),
        downPayment: num(inv.down_payment),
        installments: inv.installments,
        navAtInvestment: inv.nav_at_investment == null ? null : num(inv.nav_at_investment),
        investmentEntity: inv.investment_entity,
        status: inv.status,
        notes: inv.notes,
        drawdowns: mine,
        navEntries: myNavs,
        metrics: fundInvestmentMetrics(
            num(inv.commitment),
            mine.map(d => ({ amount: d.amount, status: d.status, amountPaid: d.amountPaid })),
            myNavs,
            inv.nav_at_investment == null ? null : num(inv.nav_at_investment),
        ),
    };
}

async function loadAll(client: SupabaseClient) {
    const { data: investments, error } = await client.from('fund_investments')
        .select('*').eq('organization_id', ORGANIZATION_ID).order('created_at', { ascending: false });
    if (error) return { error: error.message, investments: [] };
    const ids = (investments || []).map((i: InvestmentRow) => i.id);
    const { data: drawdowns } = ids.length
        ? await client.from('fund_drawdowns').select('*').in('fund_investment_id', ids)
        : { data: [] as DrawdownRow[] };
    const { data: navs } = ids.length
        ? await client.from('fund_nav_entries').select('*').in('fund_investment_id', ids)
        : { data: [] as NavRow[] };
    return {
        error: null,
        investments: (investments as InvestmentRow[] || []).map(i =>
            toDto(i, (drawdowns || []) as DrawdownRow[], (navs || []) as NavRow[])),
    };
}

export async function GET(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const { error, investments } = await loadAll(g.db);
    // Missing until supabase/fund-investments.sql is applied — say so rather
    // than showing an empty page that looks like "no funds".
    return NextResponse.json({ investments, unavailable: error });
}

/** POST — record a commitment and generate its drawdown schedule. */
export async function POST(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    const fundName = String(body.fundName || '').trim();
    if (!fundName) return NextResponse.json({ error: 'Which fund is this?' }, { status: 400 });

    const terms = readTerms(body);
    const invalid = validateFundTerms(terms);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { data: inv, error } = await g.db.from('fund_investments').insert({
        organization_id: ORGANIZATION_ID,
        fund_name: fundName,
        contribution_type: terms.contributionType,
        start_date: terms.startDate,
        commitment: terms.commitment,
        down_payment: terms.downPayment,
        installments: terms.installments,
        nav_at_investment: body.navAtInvestment === '' || body.navAtInvestment == null ? null : num(body.navAtInvestment),
        investment_entity: body.investmentEntity ? String(body.investmentEntity) : null,
        notes: typeof body.notes === 'string' ? body.notes : '',
        owner_user_id: g.actor.userId,
    }).select().single();
    if (error || !inv) return NextResponse.json({ error: error?.message || 'Could not save' }, { status: 500 });

    const rows = buildDrawdownSchedule(terms).map(d => ({
        organization_id: ORGANIZATION_ID,
        fund_investment_id: inv.id,
        sequence: d.sequence,
        due_date: d.dueDate,
        amount: d.amount,
        is_down_payment: d.isDownPayment,
    }));
    if (rows.length > 0) {
        const { error: dErr } = await g.db.from('fund_drawdowns').insert(rows);
        if (dErr) {
            // A commitment with no schedule tracks nothing; undo rather than
            // leave that behind.
            await g.db.from('fund_investments').delete().eq('id', inv.id);
            return NextResponse.json({ error: `Could not create the drawdowns: ${dErr.message}` }, { status: 500 });
        }
    }
    const { investments } = await loadAll(g.db);
    return NextResponse.json({ investments });
}

/**
 * PATCH — change the terms. Paid drawdowns are history and are left alone; the
 * unpaid ones are rebuilt from the new terms.
 */
export async function PATCH(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const terms = readTerms(body);
    const invalid = validateFundTerms(terms);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { error } = await g.db.from('fund_investments').update({
        fund_name: String(body.fundName || '').trim(),
        contribution_type: terms.contributionType,
        start_date: terms.startDate,
        commitment: terms.commitment,
        down_payment: terms.downPayment,
        installments: terms.installments,
        nav_at_investment: body.navAtInvestment === '' || body.navAtInvestment == null ? null : num(body.navAtInvestment),
        investment_entity: body.investmentEntity ? String(body.investmentEntity) : null,
        status: ['Active', 'Exited', 'Closed'].includes(body.status) ? body.status : 'Active',
        notes: typeof body.notes === 'string' ? body.notes : '',
        updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: existing } = await g.db.from('fund_drawdowns').select('*').eq('fund_investment_id', id);
    const paid = ((existing || []) as DrawdownRow[]).filter(d => d.status === 'Paid');
    await g.db.from('fund_drawdowns').delete().eq('fund_investment_id', id).eq('status', 'Pending');

    const schedule = buildDrawdownSchedule(terms);
    const paidSequences = new Set(paid.map(d => d.sequence));
    const fresh = schedule.filter(d => !paidSequences.has(d.sequence)).map(d => ({
        organization_id: ORGANIZATION_ID,
        fund_investment_id: id,
        sequence: d.sequence,
        due_date: d.dueDate,
        amount: d.amount,
        is_down_payment: d.isDownPayment,
    }));
    if (fresh.length > 0) {
        await g.db.from('fund_drawdowns')
            .upsert(fresh, { onConflict: 'fund_investment_id,sequence', ignoreDuplicates: true });
    }
    const { investments } = await loadAll(g.db);
    return NextResponse.json({ investments });
}

export async function DELETE(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const { error } = await g.db.from('fund_investments').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { investments } = await loadAll(g.db);
    return NextResponse.json({ investments });
}
