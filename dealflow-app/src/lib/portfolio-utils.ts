// Portfolio Financial Calculations
// Based on Dholakia Ventures Formulas & Calculations Reference

import type { Company, FollowOnRound } from '@/types/database';

// ─── Currency Formatting ──────────────────────────

export function formatPortfolioCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(2)}K`;
    return `₹${amount.toFixed(2)}`;
}

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
    if (company.entryValuation && company.entryValuation > 0 && company.initialInvestment && company.initialInvestment > 0) {
        return (company.initialInvestment / company.entryValuation) * 100;
    }
    return company.entryOwnership || company.currentOwnership || 0;
}

export function getCurrentOwnership(company: Company, followOns: FollowOnRound[]): number {
    // Priority: latest follow-on ownershipAfter > currentOwnership field > calculated initial
    const sortedFollowOns = [...followOns].sort((a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());
    for (let i = sortedFollowOns.length - 1; i >= 0; i--) {
        if (sortedFollowOns[i].ownershipAfter != null) {
            return sortedFollowOns[i].ownershipAfter!;
        }
    }
    if (company.currentOwnership != null) return company.currentOwnership;
    return getInitialOwnership(company);
}

// ─── Valuation ────────────────────────────────────

export function getLatestValuation(company: Company, followOns: FollowOnRound[]): number {
    // Most recent follow-on's roundValuation sorted by DATE, or company.latestValuation
    const sorted = [...followOns]
        .filter(fo => fo.roundValuation && fo.roundValuation > 0)
        .sort((a, b) => new Date(b.roundDate).getTime() - new Date(a.roundDate).getTime());
    if (sorted.length > 0) return sorted[0].roundValuation!;
    if (company.latestValuation) return company.latestValuation;
    if (company.entryValuation) return company.entryValuation;
    return company.valuation || 0;
}

// ─── Unrealized Value ─────────────────────────────

export function getUnrealizedValue(company: Company, followOns: FollowOnRound[]): number {
    if (company.portfolioStatus === 'Exited' || company.portfolioStatus === 'Written Off') return 0;
    const latestVal = getLatestValuation(company, followOns);
    const ownership = getCurrentOwnership(company, followOns);
    return latestVal * (ownership / 100);
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
        if (rate < -0.99 || rate > 10) break; // out of reasonable range
    }

    // Bisection fallback
    let low = -0.99;
    let high = 10.0;
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

export function getCompanyIRR(company: Company, followOns: FollowOnRound[]): number | null {
    if (company.portfolioStatus === 'Written Off') return -1; // -100%

    const cashFlows: CashFlow[] = [];
    const entryDate = new Date(company.createdAt);

    // Initial investment (outflow)
    if (company.initialInvestment && company.initialInvestment > 0) {
        cashFlows.push({ date: entryDate, amount: -company.initialInvestment });
    }

    // Follow-on investments (outflows)
    followOns.forEach(fo => {
        if (fo.didWeInvest && fo.ourInvestment && fo.ourInvestment > 0) {
            cashFlows.push({ date: new Date(fo.roundDate), amount: -fo.ourInvestment });
        }
    });

    if (cashFlows.length === 0) return null;

    // Terminal value (inflow)
    if (company.portfolioStatus === 'Exited' && company.exitValue && company.exitDate) {
        cashFlows.push({ date: new Date(company.exitDate), amount: company.exitValue });
    } else {
        // Active: use current unrealized value as of today
        const unrealized = getUnrealizedValue(company, followOns);
        if (unrealized > 0) {
            cashFlows.push({ date: new Date(), amount: unrealized });
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
        const entryDate = new Date(c.createdAt);

        if (c.initialInvestment && c.initialInvestment > 0) {
            allCashFlows.push({ date: entryDate, amount: -c.initialInvestment });
        }

        followOns.forEach(fo => {
            if (fo.didWeInvest && fo.ourInvestment && fo.ourInvestment > 0) {
                allCashFlows.push({ date: new Date(fo.roundDate), amount: -fo.ourInvestment });
            }
        });

        if (c.portfolioStatus === 'Exited' && c.exitValue && c.exitDate) {
            allCashFlows.push({ date: new Date(c.exitDate), amount: c.exitValue });
        } else if (c.portfolioStatus === 'Active') {
            const unrealized = getUnrealizedValue(c, followOns);
            if (unrealized > 0) {
                allCashFlows.push({ date: new Date(), amount: unrealized });
            }
        }
        // Written Off: no return
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
    const entry = new Date(company.createdAt);
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
