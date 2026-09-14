import type { Company, FollowOnRound } from '@/types/database';
import {
    getTotalInvested,
    getInitialOwnership,
    getCurrentOwnership,
    getLatestValuation,
    getUnrealizedValue,
    getCompanyMOIC,
    getCompanyIRR,
    getPortfolioStage,
    getCurrentStage,
} from './portfolio-utils';

/**
 * Every figure a company shows, derived once.
 *
 * Portfolio and Legal each used to work these out for themselves, and they
 * disagreed — Legal dated the investment from created_at rather than
 * entry_date, read the legacy entry_valuation column as the pre-money when a
 * real entry_pre_money_valuation existed, added the cheque to that to invent a
 * post-money, and showed no shares or price at all because it only looked in
 * its own localStorage record. Same company, different numbers on two screens.
 *
 * The rules below are the portfolio panel's, because the portfolio is where an
 * investment is recorded. Anything that needs these figures calls this — a page
 * cannot disagree with another page about a number it did not derive.
 */
export interface CompanyFinancials {
    /** ISO date the investment was made. entry_date, falling back to when the row was created. */
    entryDateISO: string | null;
    initialInvestment: number | null;
    totalInvested: number;
    entryTotalRaised: number | null;

    entryPreMoney: number | null;
    /** entry_post_money_valuation, falling back to the legacy entry_valuation column. */
    entryPostMoney: number | null;
    latestValuation: number | null;

    /** Shares bought at entry (companies.num_shares). */
    sharesBought: number | null;
    /** Total shares held now: company override → latest round carrying one → shares bought. */
    dvTotalShares: number | null;
    /** The company's outstanding shares (companies.total_shares). */
    outstandingShares: number | null;
    /** companies.share_price, else the cheque divided by the shares it bought. */
    pricePerShare: number | null;

    entryOwnership: number | null;
    currentOwnership: number | null;
    /** Percentage points gained or lost since entry; null when unchanged or unknown. */
    dilutionDelta: number | null;

    unrealizedValue: number;
    moic: number;
    irr: number | null;

    entryStage: string;
    currentStage: string;
    portfolioStage: string;
    status: string;

    investmentEntity: string | null;
    syndicateName: string | null;
    investmentInstrument: string | null;
    investmentType: string | null;
}

export function getCompanyFinancials(
    company: Company,
    followOns: FollowOnRound[],
): CompanyFinancials {
    const initialInvestment = company.initialInvestment ?? null;
    const sharesBought = company.numShares ?? null;

    // Company override → the most recent round that states one → what we bought
    // at entry, since before any follow-on those are the same holding.
    const byDateDesc = [...followOns].sort(
        (a, b) => new Date(b.roundDate).getTime() - new Date(a.roundDate).getTime(),
    );
    const dvTotalShares = company.dvTotalShares
        ?? byDateDesc.find(r => r.dvTotalShares != null)?.dvTotalShares
        ?? sharesBought;

    const pricePerShare = company.sharePrice
        ?? (initialInvestment && sharesBought && sharesBought > 0
            ? initialInvestment / sharesBought
            : null);

    const entryPostMoney = company.entryPostMoneyValuation ?? company.entryValuation ?? null;

    const entryOwnershipRaw = getInitialOwnership(company);
    const entryOwnership = entryOwnershipRaw > 0 ? entryOwnershipRaw : null;
    const currentOwnershipRaw = getCurrentOwnership(company, followOns);
    const currentOwnership = currentOwnershipRaw > 0 ? currentOwnershipRaw : null;

    // Only a real movement counts: rounding noise between a stored percentage
    // and a derived one is not dilution worth reporting.
    const dilutionDelta =
        entryOwnership != null && currentOwnership != null
            && Math.abs(currentOwnership - entryOwnership) > 0.01
            ? currentOwnership - entryOwnership
            : null;

    const latestValuationRaw = getLatestValuation(company, followOns);

    return {
        entryDateISO: company.entryDate ?? company.createdAt ?? null,
        initialInvestment,
        totalInvested: getTotalInvested(company, followOns),
        entryTotalRaised: company.entryTotalRaised ?? null,

        entryPreMoney: company.entryPreMoneyValuation ?? null,
        entryPostMoney,
        latestValuation: latestValuationRaw > 0 ? latestValuationRaw : null,

        sharesBought,
        dvTotalShares,
        outstandingShares: company.totalShares ?? null,
        pricePerShare,

        entryOwnership,
        currentOwnership,
        dilutionDelta,

        unrealizedValue: getUnrealizedValue(company, followOns),
        moic: getCompanyMOIC(company, followOns),
        irr: getCompanyIRR(company, followOns),

        entryStage: company.companyRound || '',
        currentStage: getCurrentStage(company, followOns),
        portfolioStage: getPortfolioStage(company),
        status: company.portfolioStatus || 'Active',

        investmentEntity: company.investmentVehicle ?? null,
        syndicateName: company.syndicateName ?? null,
        investmentInstrument: company.investmentInstrument ?? null,
        investmentType: company.shareType ?? null,
    };
}
