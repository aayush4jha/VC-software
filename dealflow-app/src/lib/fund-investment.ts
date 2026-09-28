import { dueDateFor } from './debt-schedule';

// Money we commit to a fund as an LP: how it is drawn down, and what it is
// worth as the fund reports NAV.
//
// Distinct from the Fund tracker, which is our own entities' bank balances.
// Pure arithmetic — scripts/verify-fund-investment.mjs pins it.

export const CONTRIBUTION_TYPES = ['Monthly', 'Quarterly', 'Annually', 'Custom'] as const;
export type ContributionType = typeof CONTRIBUTION_TYPES[number];

export function monthsBetweenContributions(type: ContributionType): number {
    switch (type) {
        case 'Monthly': return 1;
        case 'Quarterly': return 3;
        case 'Annually': return 12;
        case 'Custom': return 0;      // dates are given, not derived
    }
}

export interface FundInvestmentTerms {
    /** Total committed to the fund. */
    commitment: number;
    /** Paid up front, on the start date. */
    downPayment: number;
    /** How many drawdowns the rest is split into. */
    installments: number;
    contributionType: ContributionType;
    /** The down payment's date; later drawdowns are spaced from it. */
    startDate: string;
    /** Custom only: the date of each installment, in order. */
    customDates?: string[];
}

export interface ScheduledDrawdown {
    sequence: number;          // 0 is the down payment
    dueDate: string;
    amount: number;
    isDownPayment: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateFundTerms(t: Partial<FundInvestmentTerms>): string | null {
    if (!(typeof t.commitment === 'number' && t.commitment > 0)) return 'Commitment must be more than zero.';
    if (!(typeof t.downPayment === 'number' && t.downPayment >= 0)) return 'Down payment cannot be negative.';
    if (t.downPayment > t.commitment) return 'Down payment cannot be more than the commitment.';
    if (!(typeof t.installments === 'number' && Number.isInteger(t.installments) && t.installments >= 0)) {
        return 'Installments must be a whole number.';
    }
    if (!t.contributionType || !CONTRIBUTION_TYPES.includes(t.contributionType)) return 'Choose how often it is drawn down.';
    if (!t.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(t.startDate)) return 'Start date is required.';
    const remaining = round2((t.commitment ?? 0) - (t.downPayment ?? 0));
    if (remaining > 0 && t.installments === 0) {
        return 'The down payment does not cover the commitment — add installments for the rest.';
    }
    if (t.contributionType === 'Custom') {
        const dates = t.customDates ?? [];
        if (dates.length !== t.installments) return `Give a date for each of the ${t.installments} installments.`;
        if (dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return 'Every installment needs a date.';
    }
    return null;
}

/**
 * The full drawdown schedule: the down payment first (when there is one), then
 * each installment. The last installment absorbs the rounding, so the amounts
 * add up to exactly the commitment.
 */
export function buildDrawdownSchedule(t: FundInvestmentTerms): ScheduledDrawdown[] {
    const problem = validateFundTerms(t);
    if (problem) throw new Error(problem);

    const out: ScheduledDrawdown[] = [];
    if (t.downPayment > 0) {
        out.push({ sequence: 0, dueDate: t.startDate, amount: round2(t.downPayment), isDownPayment: true });
    }

    const remaining = round2(t.commitment - t.downPayment);
    if (t.installments === 0 || remaining <= 0) return out;

    const each = round2(remaining / t.installments);
    const step = monthsBetweenContributions(t.contributionType);
    let paid = 0;
    for (let i = 1; i <= t.installments; i++) {
        const last = i === t.installments;
        const amount = last ? round2(remaining - paid) : each;
        paid = round2(paid + amount);
        out.push({
            sequence: i,
            dueDate: t.contributionType === 'Custom'
                ? (t.customDates ?? [])[i - 1]
                : dueDateFor(t.startDate, i * step),
            amount,
            isDownPayment: false,
        });
    }
    return out;
}

export interface NavEntry {
    asOfDate: string;
    nav: number;
}

export interface DrawdownRecord {
    amount: number;
    status: 'Pending' | 'Paid';
    amountPaid?: number | null;
}

export interface FundInvestmentMetrics {
    committed: number;
    drawn: number;              // actually paid in
    outstanding: number;        // committed but not yet drawn
    currentNav: number | null;  // newest NAV reported, else NAV at investment
    navAsOf: string | null;
    gain: number | null;        // current NAV - drawn
    multiple: number | null;    // current NAV / drawn
}

/** The newest NAV by date; ties resolved by the later entry in the list. */
export function latestNav(entries: NavEntry[]): NavEntry | null {
    if (entries.length === 0) return null;
    return entries.reduce((best, e) => (e.asOfDate >= best.asOfDate ? e : best), entries[0]);
}

export function fundInvestmentMetrics(
    commitment: number,
    drawdowns: DrawdownRecord[],
    navEntries: NavEntry[],
    navAtInvestment: number | null,
): FundInvestmentMetrics {
    const drawn = round2(drawdowns
        .filter(d => d.status === 'Paid')
        .reduce((s, d) => s + (d.amountPaid ?? d.amount), 0));
    const newest = latestNav(navEntries);
    const currentNav = newest ? newest.nav : (navAtInvestment ?? null);
    return {
        committed: round2(commitment),
        drawn,
        outstanding: round2(Math.max(0, commitment - drawn)),
        currentNav,
        navAsOf: newest?.asOfDate ?? null,
        gain: currentNav == null ? null : round2(currentNav - drawn),
        multiple: currentNav == null || drawn <= 0 ? null : Math.round((currentNav / drawn) * 100) / 100,
    };
}
