// Portfolio Financial Calculations
// Based on Dholakia Ventures Formulas & Calculations Reference

import type { Company, FollowOnRound } from '@/types/database';

// ─── Currency Formatting ──────────────────────────

// Indian-grouped rupee formatting — `₹1,00,000` style. Uses
// toLocaleString('en-IN') so groups are 3 digits then 2s as per Indian
// numbering. No Cr/L/K compression so the displayed value always equals
// the saved value, end-to-end.
export function formatPortfolioCurrency(amount: number): string {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// Retained alias used by callers that explicitly want the same precise
// formatting. Both functions now produce identical output.
export const formatPortfolioCurrencyExact = formatPortfolioCurrency;

export function formatUSD(inrAmount: number): string {
    const usd = inrAmount / 83;
    if (usd >= 1000000000) return `$${(usd / 1000000000).toFixed(2)}B`;
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(2)}M`;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}K`;
    return `$${usd.toFixed(2)}`;
}

// ─── Total Invested Calculation ───────────────────
// Total Invested = Initial Investment + SUM(followOn.ourInvestment WHERE didWeInvest = true)

export function getTotalInvested(company: Company, followOns: FollowOnRound[]): number {
    const initial = company.initialInvestment || 0;
    const followOnTotal = followOns
        .filter(fo => fo.didWeInvest && fo.ourInvestment)
        .reduce((sum, fo) => sum + (fo.ourInvestment || 0), 0);
    return initial + followOnTotal;
}

// ─── Ownership Calculation ────────────────────────

export function getInitialOwnership(company: Company): number {
    // Manual override (entry ownership typed by user) wins over auto-calc.
    if (company.entryOwnership != null) return company.entryOwnership;
    const post = company.entryPostMoneyValuation ?? company.entryValuation;
    if (post && post > 0 && company.initialInvestment && company.initialInvestment > 0) {
        return (company.initialInvestment / post) * 100;
    }
    return company.currentOwnership || 0;
}

// ─── Ownership Chain (per IRR engine spec v2) ─────
// Walks Entry → followOns in date order, computing for each round:
//   dilutionFactor, passiveDilution, ownershipSought, ownershipAfter, valueToday
// Each follow-on field auto-calculates unless the row has a manual override
// (dilutionPercent, ownershipSought, ownershipAfter, ourValueTodayOverride).

export type ChainSource = 'auto' | 'override';

export interface RoundChainEntry {
    isEntry: boolean;
    roundId: string;
    roundName: string;
    roundDate: Date;
    preMoney: number | null;
    postMoney: number | null;
    totalRaised: number | null;
    ourInvestment: number | null;
    didWeInvest: boolean;
    dilutionFactor: number | null;     // 0..1 fraction
    passiveDilution: number;            // percent
    ownershipSought: number;            // percent
    ownershipAfter: number;             // percent
    valueToday: number;                 // ₹ snapshot at this round
    passiveDilutionSource: ChainSource;
    ownershipSoughtSource: ChainSource;
    ownershipAfterSource: ChainSource;
    valueTodaySource: ChainSource;
}

export function computeOwnershipChain(
    company: Company,
    followOns: FollowOnRound[],
): RoundChainEntry[] {
    const chain: RoundChainEntry[] = [];

    const entryPost = company.entryPostMoneyValuation ?? company.entryValuation ?? null;
    const entryPre = company.entryPreMoneyValuation ?? null;
    const entryOwnership = getInitialOwnership(company);
    const entryOwnershipSource: ChainSource = company.entryOwnership != null ? 'override' : 'auto';
    const entryValueToday = entryPost && entryPost > 0 ? entryPost * entryOwnership / 100 : 0;

    chain.push({
        isEntry: true,
        roundId: '',
        roundName: 'Entry',
        roundDate: new Date(company.entryDate ?? company.createdAt),
        preMoney: entryPre,
        postMoney: entryPost,
        totalRaised: null,
        ourInvestment: company.initialInvestment,
        didWeInvest: true,
        dilutionFactor: null,
        passiveDilution: 0,
        ownershipSought: entryOwnership,
        ownershipAfter: entryOwnership,
        valueToday: entryValueToday,
        passiveDilutionSource: 'auto',
        ownershipSoughtSource: entryOwnershipSource,
        ownershipAfterSource: entryOwnershipSource,
        valueTodaySource: 'auto',
    });

    const sorted = [...followOns].sort(
        (a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime(),
    );

    let previousOwnership = entryOwnership;

    for (const fo of sorted) {
        const post = fo.postMoneyValuation ?? fo.roundValuation ?? null;
        const pre = fo.preMoneyValuation ?? null;
        const totalRaised = fo.totalRaised ?? null;

        // Dilution Factor — priority order from spec section 7.1
        let dilutionFactor: number | null = null;
        if (post && post > 0) {
            if (totalRaised != null && totalRaised > 0) {
                dilutionFactor = totalRaised / post;
            } else if (pre != null && pre > 0) {
                dilutionFactor = (post - pre) / post;
            }
        }

        // Passive Dilution
        let passiveDilution: number;
        let passiveDilutionSource: ChainSource = 'auto';
        if (fo.dilutionPercent != null) {
            passiveDilution = fo.dilutionPercent;
            passiveDilutionSource = 'override';
        } else if (dilutionFactor != null) {
            passiveDilution = previousOwnership * dilutionFactor;
        } else {
            passiveDilution = 0;
        }

        // Ownership Sought
        let ownershipSought: number;
        let ownershipSoughtSource: ChainSource = 'auto';
        if (fo.ownershipSought != null) {
            ownershipSought = fo.ownershipSought;
            ownershipSoughtSource = 'override';
        } else if (fo.didWeInvest && fo.ourInvestment && post && post > 0) {
            ownershipSought = (fo.ourInvestment / post) * 100;
        } else {
            ownershipSought = 0;
        }

        // Total Ownership After Round
        let ownershipAfter: number;
        let ownershipAfterSource: ChainSource = 'auto';
        if (fo.ownershipAfter != null) {
            ownershipAfter = fo.ownershipAfter;
            ownershipAfterSource = 'override';
        } else if (fo.didWeInvest) {
            ownershipAfter = previousOwnership - passiveDilution + ownershipSought;
        } else {
            ownershipAfter = previousOwnership - passiveDilution;
        }

        // Per-round Our Value Today
        let valueToday: number;
        let valueTodaySource: ChainSource = 'auto';
        if (fo.ourValueTodayOverride != null) {
            valueToday = fo.ourValueTodayOverride;
            valueTodaySource = 'override';
        } else if (post != null && post > 0) {
            valueToday = post * ownershipAfter / 100;
        } else {
            valueToday = 0;
        }

        chain.push({
            isEntry: false,
            roundId: fo.id,
            roundName: fo.roundName,
            roundDate: new Date(fo.roundDate),
            preMoney: pre,
            postMoney: post,
            totalRaised,
            ourInvestment: fo.ourInvestment,
            didWeInvest: fo.didWeInvest,
            dilutionFactor,
            passiveDilution,
            ownershipSought,
            ownershipAfter,
            valueToday,
            passiveDilutionSource,
            ownershipSoughtSource,
            ownershipAfterSource,
            valueTodaySource,
        });

        previousOwnership = ownershipAfter;
    }

    return chain;
}

export function getCurrentOwnership(company: Company, followOns: FollowOnRound[]): number {
    const chain = computeOwnershipChain(company, followOns);
    return chain[chain.length - 1].ownershipAfter;
}

// ─── Valuation ────────────────────────────────────

export function getLatestValuation(company: Company, followOns: FollowOnRound[]): number {
    // A valuation typed into the detail panel wins over anything re-derived
    // here. The field is editable, and saving a round writes post-money back
    // to it, so it is the value of record rather than a stale legacy column —
    // deriving regardless meant a manually entered figure was silently
    // discarded. Clearing the field falls back through the chain below.
    // Mirrors getInitialOwnership, where a typed override also wins.
    if (company.latestValuation && company.latestValuation > 0) {
        return company.latestValuation;
    }

    // Preferred source: most recent round with both noOfShares and sharePrice
    // (valuation = no_of_shares × share_price). Walk follow-ons newest-first
    // and fall through to the entry round, then to legacy fields.
    const byDateDesc = [...followOns].sort(
        (a, b) => new Date(b.roundDate).getTime() - new Date(a.roundDate).getTime(),
    );
    for (const fo of byDateDesc) {
        if (fo.noOfShares && fo.noOfShares > 0 && fo.sharePrice && fo.sharePrice > 0) {
            return fo.noOfShares * fo.sharePrice;
        }
    }
    if (company.noOfShares && company.noOfShares > 0 && company.sharePrice && company.sharePrice > 0) {
        return company.noOfShares * company.sharePrice;
    }

    // Fallback: most recent post-money on the cap table (legacy data).
    const sorted = byDateDesc
        .map(fo => ({ ...fo, _post: fo.postMoneyValuation ?? fo.roundValuation }))
        .filter(fo => fo._post && fo._post > 0);
    if (sorted.length > 0) return sorted[0]._post!;
    // latestValuation is handled at the top of this function.
    if (company.entryPostMoneyValuation) return company.entryPostMoneyValuation;
    if (company.entryValuation) return company.entryValuation;
    return company.valuation || 0;
}

// ─── Terminal Value (per IRR engine spec v2 section 7.6) ─────
// What our stake is worth today: latest valuation × ownership after the
// latest round. A per-round OUR VALUE TODAY override still wins outright.

export function getTerminalValue(company: Company, followOns: FollowOnRound[]): number {
    const chain = computeOwnershipChain(company, followOns);
    const last = chain[chain.length - 1];

    // An explicit OUR VALUE TODAY typed on the latest round is a hard
    // override — the user has stated the number to carry into MOIC / IRR.
    if (last.valueTodaySource === 'override') return last.valueToday;

    // Otherwise mark to the latest valuation of record. getLatestValuation
    // already honours a manually entered Latest Valuation first, then
    // shares × share price, then the newest post-money on the cap table —
    // so raising the valuation anywhere flows straight through to MOIC, IRR
    // and every portfolio roll-up. This used to read the chain's own
    // post-money only, which left IRR frozen when the Latest Valuation on
    // the company was bumped by hand.
    const latest = getLatestValuation(company, followOns);
    const ownership = last.ownershipAfter;
    if (latest > 0 && ownership > 0) return (latest * ownership) / 100;

    return last.valueToday;
}

// ─── Unrealized Value ─────────────────────────────

export function getUnrealizedValue(company: Company, followOns: FollowOnRound[]): number {
    if (company.portfolioStatus === 'Exited' || company.portfolioStatus === 'Written Off') return 0;
    return getTerminalValue(company, followOns);
}

// ─── MOIC ─────────────────────────────────────────

export function getCompanyMOIC(company: Company, followOns: FollowOnRound[]): number {
    const totalInvested = getTotalInvested(company, followOns);
    if (totalInvested <= 0) return 0;

    if (company.portfolioStatus === 'Written Off') return 0;
    if (company.portfolioStatus === 'Exited') {
        return (company.exitValue || 0) / totalInvested;
    }
    // Active
    const unrealized = getUnrealizedValue(company, followOns);
    return unrealized / totalInvested;
}

// ─── XIRR Calculation ─────────────────────────────
// Newton-Raphson with bisection fallback

interface CashFlow {
    date: Date;
    amount: number;
}

function xnpv(rate: number, cashFlows: CashFlow[]): number {
    const d0 = cashFlows[0].date.getTime();
    return cashFlows.reduce((sum, cf) => {
        const years = (cf.date.getTime() - d0) / (365.25 * 24 * 60 * 60 * 1000);
        return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);
}

function xnpvDerivative(rate: number, cashFlows: CashFlow[]): number {
    const d0 = cashFlows[0].date.getTime();
    return cashFlows.reduce((sum, cf) => {
        const years = (cf.date.getTime() - d0) / (365.25 * 24 * 60 * 60 * 1000);
        return sum + (-years * cf.amount) / Math.pow(1 + rate, years + 1);
    }, 0);
}

export function calculateXIRR(cashFlows: CashFlow[]): number | null {
    if (cashFlows.length < 2) return null;
    const hasNeg = cashFlows.some(cf => cf.amount < 0);
    const hasPos = cashFlows.some(cf => cf.amount > 0);
    if (!hasNeg || !hasPos) return null;

    // Sort by date
    const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Newton-Raphson
    let rate = 0.10;
    for (let i = 0; i < 100; i++) {
        const npv = xnpv(rate, sorted);
        const deriv = xnpvDerivative(rate, sorted);
        if (Math.abs(deriv) < 1e-12) break;
        const newRate = rate - npv / deriv;
        if (Math.abs(newRate - rate) < 1e-7) return newRate;
        rate = newRate;
        if (rate < -0.99 || rate > 1000) break; // out of reasonable range — same bracket as bisection below
    }

    // Bisection fallback. Upper bound is 1000x (100,000%) — early-stage VC
    // markups can blow well past the previous 10x ceiling in the first months
    // after entry. Bisection is cheap; a wider bracket costs ~log2(100x) extra
    // iterations and prevents the solver from clipping silently on outliers.
    let low = -0.99;
    let high = 1000.0;
    for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const npv = xnpv(mid, sorted);
        if (Math.abs(npv) < 1e-7) return mid;
        if (npv > 0) low = mid;
        else high = mid;
    }

    return (low + high) / 2;
}

// ─── Company IRR ──────────────────────────────────
// Cash flow series per IRR engine spec v2 section 8.1:
//   • Negative on ENTRY DATE = OUR INITIAL INVESTMENT
//   • Negative on each follow-on DATE (where invested) = OUR INVESTMENT
//   • Positive on today's date = Terminal Value (latest round's valueToday)
// For Exited companies we honor the existing exitValue/exitDate as a true liquidity event.

function pushCompanyOutflows(
    cashFlows: CashFlow[],
    company: Company,
    followOns: FollowOnRound[],
): void {
    if (company.initialInvestment && company.initialInvestment > 0) {
        // Prefer the user-picked Entry Date (the business event); fall back
        // to createdAt for legacy rows where entry_date hasn't been set.
        const entryDateStr = company.entryDate ?? company.createdAt;
        cashFlows.push({ date: new Date(entryDateStr), amount: -company.initialInvestment });
    }
    for (const fo of followOns) {
        if (fo.didWeInvest && fo.ourInvestment && fo.ourInvestment > 0) {
            cashFlows.push({ date: new Date(fo.roundDate), amount: -fo.ourInvestment });
        }
    }
}

export function getCompanyIRR(company: Company, followOns: FollowOnRound[]): number | null {
    if (company.portfolioStatus === 'Written Off') return -1; // -100%

    const cashFlows: CashFlow[] = [];
    pushCompanyOutflows(cashFlows, company, followOns);
    if (cashFlows.length === 0) return null;

    if (company.portfolioStatus === 'Exited' && company.exitValue && company.exitDate) {
        cashFlows.push({ date: new Date(company.exitDate), amount: company.exitValue });
    } else {
        const terminal = getTerminalValue(company, followOns);
        if (terminal > 0) {
            cashFlows.push({ date: new Date(), amount: terminal });
        }
    }

    return calculateXIRR(cashFlows);
}

// ─── Portfolio-Level XIRR ─────────────────────────

export function getPortfolioXIRR(
    companies: Company[],
    followOnsMap: Map<string, FollowOnRound[]>
): number | null {
    const allCashFlows: CashFlow[] = [];

    companies.forEach(c => {
        const followOns = followOnsMap.get(c.id) || [];
        pushCompanyOutflows(allCashFlows, c, followOns);

        if (c.portfolioStatus === 'Exited' && c.exitValue && c.exitDate) {
            allCashFlows.push({ date: new Date(c.exitDate), amount: c.exitValue });
        } else if (c.portfolioStatus === 'Active') {
            const terminal = getTerminalValue(c, followOns);
            if (terminal > 0) {
                allCashFlows.push({ date: new Date(), amount: terminal });
            }
        }
        // Written Off: no terminal cash flow.
    });

    return calculateXIRR(allCashFlows);
}

// ─── Portfolio Metrics ────────────────────────────

export interface PortfolioMetrics {
    totalAUM: number;
    totalInvestedAll: number;
    unrealizedValue: number;
    totalExitValue: number;
    portfolioValue: number;
    activeCompanies: number;
    exitedCompanies: number;
    writtenOffCompanies: number;
    portfolioXIRR: number | null;
    realizedMOIC: number;
    unrealizedMOIC: number;
    blendedMOIC: number;
    dpi: number;
    tvpi: number;
}

export function getPortfolioMetrics(
    companies: Company[],
    followOnsMap: Map<string, FollowOnRound[]>
): PortfolioMetrics {
    let totalAUM = 0;
    let totalInvestedAll = 0;
    let unrealizedValue = 0;
    let totalExitValue = 0;
    let exitedInvestment = 0;
    let activeCompanies = 0;
    let exitedCompanies = 0;
    let writtenOffCompanies = 0;

    companies.forEach(c => {
        const fos = followOnsMap.get(c.id) || [];
        const invested = getTotalInvested(c, fos);
        totalInvestedAll += invested;

        if (c.portfolioStatus === 'Active') {
            activeCompanies++;
            totalAUM += invested;
            unrealizedValue += getUnrealizedValue(c, fos);
        } else if (c.portfolioStatus === 'Exited') {
            exitedCompanies++;
            totalExitValue += (c.exitValue || 0);
            exitedInvestment += invested;
        } else {
            writtenOffCompanies++;
        }
    });

    const portfolioValue = unrealizedValue + totalExitValue;
    const realizedMOIC = exitedInvestment > 0 ? totalExitValue / exitedInvestment : 0;
    const unrealizedMOIC = totalAUM > 0 ? unrealizedValue / totalAUM : 0;
    const blendedMOIC = totalInvestedAll > 0 ? (unrealizedValue + totalExitValue) / totalInvestedAll : 0;
    const dpi = totalInvestedAll > 0 ? totalExitValue / totalInvestedAll : 0;
    const tvpi = totalInvestedAll > 0 ? portfolioValue / totalInvestedAll : 0;
    const portfolioXIRR = getPortfolioXIRR(companies, followOnsMap);

    return {
        totalAUM, totalInvestedAll, unrealizedValue, totalExitValue, portfolioValue,
        activeCompanies, exitedCompanies, writtenOffCompanies,
        portfolioXIRR, realizedMOIC, unrealizedMOIC, blendedMOIC, dpi, tvpi,
    };
}

// ─── Dilution Calculation ─────────────────────────

export function calculateDilution(
    previousOwnership: number,
    totalRaisedInRound: number,
    postMoneyValuation: number,
    ourInvestmentInRound: number
): { dilutedStake: number; newStake: number; finalOwnership: number } {
    if (postMoneyValuation <= 0) return { dilutedStake: previousOwnership, newStake: 0, finalOwnership: previousOwnership };
    const dilutionFactor = totalRaisedInRound / postMoneyValuation;
    const dilutedStake = previousOwnership * (1 - dilutionFactor);
    const newStake = ourInvestmentInRound > 0 ? (ourInvestmentInRound / postMoneyValuation) * 100 : 0;
    const finalOwnership = dilutedStake + newStake;
    return { dilutedStake, newStake, finalOwnership };
}

// ─── Holding Period ───────────────────────────────

export function getHoldingPeriodMonths(company: Company): number {
    const entry = new Date(company.entryDate ?? company.createdAt);
    const now = new Date();
    return (now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

// ─── Format Helpers ───────────────────────────────

export function formatPercent(val: number): string {
    if (val > 10) return '>999%'; // 1000%+
    return `${(val * 100).toFixed(2)}%`;
}

export function formatXIRR(val: number | null): string {
    if (val === null) return 'N/A';
    if (val > 10) return '>999%';
    const pct = val * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

export function formatMOIC(val: number): string {
    return `${val.toFixed(2)}x`;
}

// ─── Stage grouping for portfolio board ───────────

export const PORTFOLIO_STAGES = [
    'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A',
    'Pre-Series B', 'Series B', 'Growth Stage',
    'Pre-IPO', 'IPO', 'Exited', 'Written Off',
] as const;

export const PORTFOLIO_STAGE_COLORS: Record<string, string> = {
    'Pre-Seed': '#94a3b8',
    'Seed': '#f59e0b',
    'Pre-Series A': '#8b5cf6',
    'Series A': '#6366f1',
    'Pre-Series B': '#06b6d4',
    'Series B': '#3b82f6',
    'Growth Stage': '#10b981',
    'Pre-IPO': '#ec4899',
    'IPO': '#10b981',
    'Exited': '#10b981',
    'Written Off': '#ef4444',
};

export function getPortfolioStage(company: Company): string {
    if (company.portfolioStatus === 'Exited') return 'Exited';
    if (company.portfolioStatus === 'Written Off') return 'Written Off';
    return company.companyRound;
}

// Current stage = roundName of the latest follow-on round (by date), else
// the entry stage. Exit / write-off statuses take precedence.
export function getCurrentStage(company: Company, followOns: FollowOnRound[]): string {
    if (company.portfolioStatus === 'Exited') return 'Exited';
    if (company.portfolioStatus === 'Written Off') return 'Written Off';
    const sorted = [...followOns].sort(
        (a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    return latest?.roundName || company.companyRound;
}
