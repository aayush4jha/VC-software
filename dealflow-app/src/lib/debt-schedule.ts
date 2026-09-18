// Repayment schedules for debt investments.
//
// Pure arithmetic, no imports, so scripts/verify-debt-schedule.mjs can pin it:
// a repayment schedule that is wrong by a rupee gets emailed to a borrower.

export const DEBT_FREQUENCIES = ['Monthly', 'Quarterly', 'Half-yearly', 'Annually'] as const;
export type DebtFrequency = typeof DEBT_FREQUENCIES[number];

export const REPAYMENT_TYPES = ['interest_only_bullet', 'emi'] as const;
export type RepaymentType = typeof REPAYMENT_TYPES[number];

export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
    interest_only_bullet: 'Interest each term, principal at the end',
    emi: 'EMI — interest + part of principal each term',
};

export function monthsPerPeriod(frequency: DebtFrequency): number {
    switch (frequency) {
        case 'Monthly': return 1;
        case 'Quarterly': return 3;
        case 'Half-yearly': return 6;
        case 'Annually': return 12;
    }
}

export interface DebtTerms {
    principal: number;
    annualRatePct: number;
    tenureMonths: number;
    frequency: DebtFrequency;
    repaymentType: RepaymentType;
    /** Disbursement date, YYYY-MM-DD. Term 1 falls one period after it. */
    startDate: string;
}

export interface ScheduledTerm {
    termNumber: number;
    dueDate: string;          // YYYY-MM-DD
    openingBalance: number;
    interest: number;
    principal: number;
    total: number;
    closingBalance: number;
}

/** Why these terms cannot produce a schedule, or null when they can. */
export function validateDebtTerms(t: Partial<DebtTerms>): string | null {
    if (!(typeof t.principal === 'number' && t.principal > 0)) return 'Amount must be more than zero.';
    if (!(typeof t.annualRatePct === 'number' && t.annualRatePct >= 0 && t.annualRatePct <= 100)) {
        return 'Rate of interest must be between 0% and 100% a year.';
    }
    if (!(typeof t.tenureMonths === 'number' && Number.isInteger(t.tenureMonths) && t.tenureMonths > 0)) {
        return 'Tenure must be a whole number of months.';
    }
    if (!t.frequency || !DEBT_FREQUENCIES.includes(t.frequency)) return 'Choose how often payments fall due.';
    if (!t.repaymentType || !REPAYMENT_TYPES.includes(t.repaymentType)) return 'Choose a repayment structure.';
    if (!t.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) || isNaN(Date.parse(t.startDate))) {
        return 'Start date is required.';
    }
    // A tenure that is not a whole number of periods leaves a stub term whose
    // interest has no agreed basis. Refusing it is better than inventing one.
    const m = monthsPerPeriod(t.frequency);
    if (t.tenureMonths % m !== 0) {
        return `A ${t.frequency.toLowerCase()} schedule needs a tenure in multiples of ${m} months.`;
    }
    return null;
}

export function termCount(t: DebtTerms): number {
    return t.tenureMonths / monthsPerPeriod(t.frequency);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The due date of term k, anchored to the start date's day of month. A loan
 * starting on the 31st falls due on the last day of shorter months and back on
 * the 31st when the month has one — never drifting to the 28th for good.
 */
export function dueDateFor(startDate: string, monthsAfter: number): string {
    const [y, m, d] = startDate.split('-').map(Number);
    const totalMonths = (m - 1) + monthsAfter;
    const year = y + Math.floor(totalMonths / 12);
    const month = totalMonths % 12;                          // 0-based
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(d, daysInMonth);
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The whole repayment schedule. Amounts are rounded to the paisa each term,
 * and the final term absorbs the rounding so principal repaid is exactly the
 * amount lent and the closing balance is exactly zero.
 */
export function buildSchedule(t: DebtTerms): ScheduledTerm[] {
    const error = validateDebtTerms(t);
    if (error) throw new Error(error);

    const n = termCount(t);
    const step = monthsPerPeriod(t.frequency);
    const r = (t.annualRatePct / 100) * (step / 12);        // rate per term
    const out: ScheduledTerm[] = [];
    let balance = t.principal;

    // EMI: the level payment that clears the principal in n terms.
    const emi = t.repaymentType === 'emi'
        ? (r === 0 ? t.principal / n : (t.principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
        : 0;

    for (let k = 1; k <= n; k++) {
        const opening = round2(balance);
        const interest = round2(opening * r);
        let principal: number;
        if (t.repaymentType === 'interest_only_bullet') {
            principal = k === n ? opening : 0;
        } else {
            principal = k === n ? opening : round2(emi - interest);
        }
        const closing = round2(opening - principal);
        out.push({
            termNumber: k,
            dueDate: dueDateFor(t.startDate, k * step),
            openingBalance: opening,
            interest,
            principal,
            total: round2(interest + principal),
            closingBalance: closing,
        });
        balance = closing;
    }
    return out;
}

/** One term of the schedule, or null past the end of the tenure. */
export function scheduledTerm(t: DebtTerms, termNumber: number): ScheduledTerm | null {
    const schedule = buildSchedule(t);
    return schedule[termNumber - 1] ?? null;
}

/** Whole days from `fromDate` to `toDate`, both YYYY-MM-DD. Negative when past. */
export function daysBetween(fromDate: string, toDate: string): number {
    const a = Date.parse(`${fromDate}T00:00:00Z`);
    const b = Date.parse(`${toDate}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
}

export type ReminderStage = 'upcoming' | 'due' | 'overdue';
export const OVERDUE_REPEAT_DAYS = 7;

/**
 * Which reminder, if any, the term owed should get today. At most one:
 *   * upcoming — once, when the due date comes within `reminderDaysBefore`
 *   * due      — once, on the due date
 *   * overdue  — on the first run after the due date, then every 7 days
 * A term already past due never gets a late "upcoming" or "due" — only the
 * overdue notice, which is the one that is true.
 */
export function reminderStageFor(
    p: {
        dueDate: string;
        reminderDaysBefore: number;
        beforeSentAt: string | null;
        dueSentAt: string | null;
        lastOverdueAt: string | null;
    },
    today: string,
): ReminderStage | null {
    const days = daysBetween(today, p.dueDate.slice(0, 10));
    if (days < 0) {
        if (!p.lastOverdueAt) return 'overdue';
        return daysBetween(p.lastOverdueAt.slice(0, 10), today) >= OVERDUE_REPEAT_DAYS ? 'overdue' : null;
    }
    if (days === 0) return p.dueSentAt ? null : 'due';
    if (p.reminderDaysBefore > 0 && days <= p.reminderDaysBefore) return p.beforeSentAt ? null : 'upcoming';
    return null;
}
