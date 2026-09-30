// Filling in what a later email tells us, without touching what is already there.
//
// A second email about a company often carries what the first did not — the
// round, the raise, a valuation, the founder's address. Before this, none of it
// reached the company: the email was filed and its content went nowhere.
//
// The rule is one-directional: a field that is empty gets filled, a field that
// has a value is never overwritten. Somebody typed that value, or an earlier
// email did, and a later email is not evidence enough to overrule it.
//
// Pure — scripts/verify-company-fill.mjs pins it.

const CRORE = 10_000_000;

/** What an email's AI extraction can offer. Amounts are in INR crores. */
export interface ExtractedFacts {
    founderName?: string | null;
    founderEmail?: string | null;
    totalFundRaise?: number | null;
    valuation?: number | null;
    subIndustry?: string | null;
    summary?: string | null;
    industryId?: string | null;
}

/** The company as stored, in database column names. */
export interface CompanyFacts {
    founder_name?: string | null;
    founder_email?: string | null;
    total_fund_raise?: number | string | null;
    valuation?: number | string | null;
    sub_industry?: string | null;
    quick_summary?: string | null;
    industry_id?: string | null;
}

const isBlankText = (v: unknown): boolean => v == null || String(v).trim() === '';
const isBlankNumber = (v: unknown): boolean => v == null || v === '' || Number(v) === 0;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const positive = (v: unknown): number | null =>
    (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

/**
 * The columns a later email may fill, and what to put in them. Empty object
 * when the email adds nothing — the caller can skip the write entirely.
 *
 * Note which fields are absent by design: company_round, priority_level,
 * deal_source_type and share_type all have database defaults, so they are never
 * blank and "fill only what is empty" cannot apply to them. Changing a stage
 * because a follow-up mentioned one is a decision for a person.
 */
export function blanksToFill(company: CompanyFacts, facts: ExtractedFacts): Record<string, unknown> {
    const patch: Record<string, unknown> = {};

    if (isBlankText(company.founder_name) && text(facts.founderName)) {
        patch.founder_name = text(facts.founderName);
    }
    if (isBlankText(company.founder_email) && text(facts.founderEmail)?.includes('@')) {
        patch.founder_email = text(facts.founderEmail);
    }
    if (isBlankNumber(company.total_fund_raise) && positive(facts.totalFundRaise) != null) {
        patch.total_fund_raise = Math.round(positive(facts.totalFundRaise)! * CRORE);
    }
    if (isBlankNumber(company.valuation) && positive(facts.valuation) != null) {
        patch.valuation = Math.round(positive(facts.valuation)! * CRORE);
    }
    if (isBlankText(company.sub_industry) && text(facts.subIndustry)) {
        patch.sub_industry = text(facts.subIndustry);
    }
    if (isBlankText(company.industry_id) && text(facts.industryId)) {
        patch.industry_id = text(facts.industryId);
    }
    if (isBlankText(company.quick_summary) && text(facts.summary)) {
        patch.quick_summary = text(facts.summary);
    }
    return patch;
}

/** "founder email, valuation" — for the activity log, so a fill is visible. */
export function describeFill(patch: Record<string, unknown>): string {
    const labels: Record<string, string> = {
        founder_name: 'founder name',
        founder_email: 'founder email',
        total_fund_raise: 'raise',
        valuation: 'valuation',
        sub_industry: 'sub-industry',
        industry_id: 'industry',
        quick_summary: 'summary',
    };
    return Object.keys(patch).map(k => labels[k] ?? k).join(', ');
}
