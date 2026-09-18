import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';
import { validateDebtTerms, termCount, type DebtTerms } from '@/lib/debt-schedule';
import {
    ORGANIZATION_ID, type FacilityRow, type PaymentRow,
    paymentRowFor, advanceFacility, toFacilityDto, facilityTerms,
} from '@/lib/server/debt';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

function readTerms(body: Record<string, unknown>): Partial<DebtTerms> {
    return {
        principal: Number(body.principal),
        annualRatePct: Number(body.annualRatePct),
        tenureMonths: Number(body.tenureMonths),
        frequency: body.frequency as DebtTerms['frequency'],
        repaymentType: body.repaymentType as DebtTerms['repaymentType'],
        startDate: typeof body.startDate === 'string' ? body.startDate.slice(0, 10) : '',
    };
}

function readReminderFields(body: Record<string, unknown>) {
    const days = Number(body.reminderDaysBefore ?? 7);
    return {
        borrower_email: typeof body.borrowerEmail === 'string' && body.borrowerEmail.trim()
            ? body.borrowerEmail.trim() : null,
        reminders_enabled: body.remindersEnabled !== false,
        reminder_days_before: Number.isFinite(days) ? Math.min(60, Math.max(0, Math.round(days))) : 7,
        notes: typeof body.notes === 'string' ? body.notes : '',
    };
}

async function guard(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return { response: auth.response };
    if (!hasAnyPermission(auth.actor, ['portfolio'])) {
        return { response: forbidden('You do not have access to portfolio debt.') };
    }
    const client = db();
    if (!client) return { response: NextResponse.json({ error: 'Server config missing' }, { status: 500 }) };
    return { actor: auth.actor, db: client };
}

// GET ?companyId= — every facility on the company, with its payments.
export async function GET(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const companyId = new URL(request.url).searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });

    const { data: facilities, error } = await g.db
        .from('debt_facilities').select('*')
        .eq('company_id', companyId).order('created_at');
    if (error) {
        // Missing until supabase/debt-facilities.sql is applied; say so rather
        // than rendering an empty section that looks like "no debt".
        return NextResponse.json({ facilities: [], unavailable: error.message });
    }
    const ids = (facilities || []).map(f => f.id);
    const { data: payments } = ids.length
        ? await g.db.from('debt_payments').select('*').in('facility_id', ids)
        : { data: [] as PaymentRow[] };
    return NextResponse.json({
        facilities: (facilities as FacilityRow[] || []).map(f => toFacilityDto(f, (payments || []) as PaymentRow[])),
    });
}

// POST — a new facility and its first term.
export async function POST(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    if (typeof body.companyId !== 'string' || !body.companyId) {
        return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }
    const terms = readTerms(body);
    const invalid = validateDebtTerms(terms);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { data: facility, error } = await g.db.from('debt_facilities').insert({
        organization_id: ORGANIZATION_ID,
        company_id: body.companyId,
        principal: terms.principal,
        annual_rate: terms.annualRatePct,
        tenure_months: terms.tenureMonths,
        frequency: terms.frequency,
        repayment_type: terms.repaymentType,
        start_date: terms.startDate,
        owner_user_id: g.actor.userId,
        ...readReminderFields(body),
    }).select().single();
    if (error || !facility) {
        return NextResponse.json({ error: error?.message || 'Could not save the debt terms' }, { status: 500 });
    }

    const first = paymentRowFor(facility as FacilityRow, 1);
    if (first) {
        const { error: pErr } = await g.db.from('debt_payments').insert(first);
        if (pErr) {
            // A facility with no term would never remind anyone; undo it
            // rather than leave that silently behind.
            await g.db.from('debt_facilities').delete().eq('id', facility.id);
            return NextResponse.json({ error: `Could not create the first payment: ${pErr.message}` }, { status: 500 });
        }
    }
    const { data: payments } = await g.db.from('debt_payments').select('*').eq('facility_id', facility.id);
    return NextResponse.json({ facility: toFacilityDto(facility as FacilityRow, (payments || []) as PaymentRow[]) });
}

// PATCH — change terms. Received terms are history and are never rewritten;
// the term currently owed is recomputed from the new terms.
export async function PATCH(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const body = await request.json();
    if (typeof body.id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const terms = readTerms(body);
    const invalid = validateDebtTerms(terms);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { data: updated, error } = await g.db.from('debt_facilities').update({
        principal: terms.principal,
        annual_rate: terms.annualRatePct,
        tenure_months: terms.tenureMonths,
        frequency: terms.frequency,
        repayment_type: terms.repaymentType,
        start_date: terms.startDate,
        ...readReminderFields(body),
        updated_at: new Date().toISOString(),
    }).eq('id', body.id).select().single();
    if (error || !updated) {
        return NextResponse.json({ error: error?.message || 'Facility not found' }, { status: error ? 500 : 404 });
    }
    const f = updated as FacilityRow;

    const { data: rows } = await g.db.from('debt_payments').select('*').eq('facility_id', f.id);
    const payments = (rows || []) as PaymentRow[];
    const total = termCount(facilityTerms(f));
    const pending = payments.filter(p => p.status === 'Pending');
    const lastReceived = Math.max(0, ...payments.filter(p => p.status === 'Received').map(p => p.term_number));

    for (const p of pending) {
        if (p.term_number > total) {
            // The tenure was shortened past this term: it no longer exists.
            await g.db.from('debt_payments').delete().eq('id', p.id);
        } else {
            const fresh = paymentRowFor(f, p.term_number);
            if (fresh) {
                await g.db.from('debt_payments').update({
                    due_date: fresh.due_date,
                    interest_due: fresh.interest_due,
                    principal_due: fresh.principal_due,
                    total_due: fresh.total_due,
                    updated_at: new Date().toISOString(),
                }).eq('id', p.id);
            }
        }
    }
    // Every term was received and the tenure was extended: the next is owed.
    const stillPending = pending.some(p => p.term_number <= total);
    if (!stillPending) await advanceFacility(g.db, f, lastReceived);

    const { data: after } = await g.db.from('debt_payments').select('*').eq('facility_id', f.id);
    const { data: fresh } = await g.db.from('debt_facilities').select('*').eq('id', f.id).single();
    return NextResponse.json({ facility: toFacilityDto((fresh || f) as FacilityRow, (after || []) as PaymentRow[]) });
}

// DELETE ?id= — the facility and, by cascade, its payments.
export async function DELETE(request: NextRequest) {
    const g = await guard(request);
    if (g.response) return g.response;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const { error } = await g.db.from('debt_facilities').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
