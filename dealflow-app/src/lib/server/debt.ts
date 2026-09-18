import type { SupabaseClient } from '@supabase/supabase-js';
import {
    type DebtTerms, type DebtFrequency, type RepaymentType,
    buildSchedule, termCount,
} from '@/lib/debt-schedule';

export const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export interface FacilityRow {
    id: string;
    company_id: string;
    principal: number | string;
    annual_rate: number | string;
    tenure_months: number;
    frequency: DebtFrequency;
    repayment_type: RepaymentType;
    start_date: string;
    borrower_email: string | null;
    reminders_enabled: boolean;
    reminder_days_before: number;
    owner_user_id: string | null;
    status: 'Active' | 'Closed';
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentRow {
    id: string;
    facility_id: string;
    company_id: string;
    term_number: number;
    due_date: string;
    interest_due: number | string;
    principal_due: number | string;
    total_due: number | string;
    status: 'Pending' | 'Received';
    received_on: string | null;
    amount_received: number | string | null;
    notes: string;
    reminder_before_sent_at: string | null;
    reminder_due_sent_at: string | null;
    last_overdue_reminder_at: string | null;
}

// Postgres NUMERIC arrives as a string through PostgREST.
const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));

export function facilityTerms(f: FacilityRow): DebtTerms {
    return {
        principal: num(f.principal),
        annualRatePct: num(f.annual_rate),
        tenureMonths: f.tenure_months,
        frequency: f.frequency,
        repaymentType: f.repayment_type,
        startDate: f.start_date.slice(0, 10),
    };
}

/** The payment row for term k, computed from the facility's terms. */
export function paymentRowFor(f: FacilityRow, termNumber: number) {
    const term = buildSchedule(facilityTerms(f))[termNumber - 1];
    if (!term) return null;
    return {
        organization_id: ORGANIZATION_ID,
        facility_id: f.id,
        company_id: f.company_id,
        term_number: term.termNumber,
        due_date: term.dueDate,
        interest_due: term.interest,
        principal_due: term.principal,
        total_due: term.total,
        status: 'Pending' as const,
    };
}

/**
 * Makes sure the term after `afterTerm` exists, or closes the facility when
 * `afterTerm` was the last. Idempotent: the (facility_id, term_number) key
 * means a repeated call — a double-click, two people at once — adds nothing.
 */
export async function advanceFacility(
    db: SupabaseClient,
    f: FacilityRow,
    afterTerm: number,
): Promise<{ error: string | null; closed: boolean }> {
    const total = termCount(facilityTerms(f));
    if (afterTerm >= total) {
        const { error } = await db.from('debt_facilities')
            .update({ status: 'Closed', updated_at: new Date().toISOString() })
            .eq('id', f.id);
        return { error: error?.message ?? null, closed: true };
    }
    const next = paymentRowFor(f, afterTerm + 1);
    if (!next) return { error: null, closed: false };
    const { error } = await db.from('debt_payments')
        .upsert(next, { onConflict: 'facility_id,term_number', ignoreDuplicates: true });
    if (!error && f.status === 'Closed') {
        await db.from('debt_facilities').update({ status: 'Active' }).eq('id', f.id);
    }
    return { error: error?.message ?? null, closed: false };
}

/** A facility with its payments, in the shape the UI reads. */
export function toFacilityDto(f: FacilityRow, payments: PaymentRow[]) {
    const terms = facilityTerms(f);
    return {
        id: f.id,
        companyId: f.company_id,
        principal: terms.principal,
        annualRatePct: terms.annualRatePct,
        tenureMonths: terms.tenureMonths,
        frequency: terms.frequency,
        repaymentType: terms.repaymentType,
        startDate: terms.startDate,
        borrowerEmail: f.borrower_email,
        remindersEnabled: f.reminders_enabled,
        reminderDaysBefore: f.reminder_days_before,
        status: f.status,
        notes: f.notes,
        totalTerms: termCount(terms),
        payments: payments
            .filter(p => p.facility_id === f.id)
            .sort((a, b) => a.term_number - b.term_number)
            .map(p => ({
                id: p.id,
                termNumber: p.term_number,
                dueDate: p.due_date.slice(0, 10),
                interestDue: num(p.interest_due),
                principalDue: num(p.principal_due),
                totalDue: num(p.total_due),
                status: p.status,
                receivedOn: p.received_on ? p.received_on.slice(0, 10) : null,
                amountReceived: p.amount_received == null ? null : num(p.amount_received),
                notes: p.notes,
                lastReminderAt: [p.reminder_before_sent_at, p.reminder_due_sent_at, p.last_overdue_reminder_at]
                    .filter(Boolean).sort().at(-1) ?? null,
            })),
    };
}

/** Today's date in India, YYYY-MM-DD — reminders are about Indian business days. */
export function todayIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
