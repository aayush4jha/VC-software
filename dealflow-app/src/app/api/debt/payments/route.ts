import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';
import {
    type FacilityRow, type PaymentRow,
    advanceFacility, toFacilityDto, todayIST,
} from '@/lib/server/debt';

/**
 * PATCH { paymentId, action: 'receive', receivedOn?, amountReceived?, notes? }
 *   Marks the term received and creates the next one — or closes the facility
 *   when this was the last term.
 *
 * PATCH { paymentId, action: 'undo' }
 *   Reverses a mistaken "received". Only the latest received term can be
 *   undone, and only while the term it created has not itself been received —
 *   otherwise the history would have a hole in it.
 */
export async function PATCH(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    if (!hasAnyPermission(auth.actor, ['portfolio'])) {
        return forbidden('You do not have access to portfolio debt.');
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    const body = await request.json();
    const { paymentId, action } = body as { paymentId?: string; action?: string };
    if (!paymentId || (action !== 'receive' && action !== 'undo')) {
        return NextResponse.json({ error: 'Missing paymentId or action' }, { status: 400 });
    }

    const { data: payment } = await db.from('debt_payments').select('*').eq('id', paymentId).single();
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    const p = payment as PaymentRow;
    const { data: facility } = await db.from('debt_facilities').select('*').eq('id', p.facility_id).single();
    if (!facility) return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    const f = facility as FacilityRow;

    if (action === 'receive') {
        if (p.status === 'Received') {
            return NextResponse.json({ error: `Term ${p.term_number} is already marked received.` }, { status: 409 });
        }
        const receivedOn = typeof body.receivedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedOn)
            ? body.receivedOn : todayIST();
        const amount = body.amountReceived == null || body.amountReceived === ''
            ? Number(p.total_due) : Number(body.amountReceived);
        if (!Number.isFinite(amount) || amount < 0) {
            return NextResponse.json({ error: 'Amount received must be a number.' }, { status: 400 });
        }
        // Guarded on status so two people marking the same term at once cannot
        // both "win" and create the next term twice.
        const { data: marked, error } = await db.from('debt_payments').update({
            status: 'Received',
            received_on: receivedOn,
            amount_received: amount,
            notes: typeof body.notes === 'string' ? body.notes : p.notes,
            updated_at: new Date().toISOString(),
        }).eq('id', p.id).eq('status', 'Pending').select().maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!marked) return NextResponse.json({ error: `Term ${p.term_number} was already marked received.` }, { status: 409 });

        const adv = await advanceFacility(db, f, p.term_number);
        if (adv.error) {
            return NextResponse.json({ error: `Marked received, but the next term could not be created: ${adv.error}` }, { status: 500 });
        }
        await db.from('activity_logs').insert({
            company_id: f.company_id,
            user_id: auth.actor.userId,
            action: 'debt_payment_received',
            details: `Debt term ${p.term_number} received on ${receivedOn}: ₹${amount.toLocaleString('en-IN')}${adv.closed ? ' — final term, facility closed' : ''}`,
        });
    } else {
        if (p.status !== 'Received') {
            return NextResponse.json({ error: 'Only a received term can be undone.' }, { status: 400 });
        }
        const { data: all } = await db.from('debt_payments').select('*').eq('facility_id', f.id);
        const rows = (all || []) as PaymentRow[];
        const laterReceived = rows.some(r => r.term_number > p.term_number && r.status === 'Received');
        if (laterReceived) {
            return NextResponse.json({ error: 'A later term is already received — undo that one first.' }, { status: 409 });
        }
        // The term this receipt created is no longer owed.
        await db.from('debt_payments').delete()
            .eq('facility_id', f.id).gt('term_number', p.term_number).eq('status', 'Pending');
        const { error } = await db.from('debt_payments').update({
            status: 'Pending', received_on: null, amount_received: null,
            updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (f.status === 'Closed') await db.from('debt_facilities').update({ status: 'Active' }).eq('id', f.id);
    }

    const { data: freshFacility } = await db.from('debt_facilities').select('*').eq('id', f.id).single();
    const { data: payments } = await db.from('debt_payments').select('*').eq('facility_id', f.id);
    return NextResponse.json({
        facility: toFacilityDto((freshFacility || f) as FacilityRow, (payments || []) as PaymentRow[]),
    });
}
