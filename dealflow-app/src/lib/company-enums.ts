// Turning what an AI (or a person) wrote into a value the database will accept.
//
// companies.company_round, priority_level, deal_source_type and share_type are
// each constrained by a CHECK. A model told to answer "one of: Pre-Seed, Seed,
// …" answers "Seed Round" often enough, and the insert then fails with
// `violates check constraint "companies_company_round_check"` — the whole email
// rejected over one word. Everything written to those columns goes through here
// first.
//
// Pure, no imports: scripts/verify-company-enums.mjs pins it.

export const COMPANY_ROUNDS = [
    'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A',
    'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO',
] as const;
export type CompanyRoundValue = typeof COMPANY_ROUNDS[number];

export const PRIORITY_LEVELS = ['Low', 'Medium', 'High'] as const;
export const DEAL_SOURCE_TYPES = ['Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'] as const;
export const SHARE_TYPES = ['Primary', 'Secondary', 'Debt'] as const;

/** Lowercase, collapse punctuation and spacing: "Pre–Series_A" -> "pre series a". */
function fold(value: string): string {
    return value
        .toLowerCase()
        .replace(/[‐-―]/g, '-')     // en/em dashes
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function matchFromList<T extends string>(list: readonly T[], value: string): T | null {
    const f = fold(value);
    if (!f) return null;
    const exact = list.find(v => fold(v) === f);
    if (exact) return exact;
    // Allow the extra words people and models add: "seed round", "the seed
    // stage", "series a funding" — as long as one option is named inside.
    const spaced = ` ${f} `;
    const contained = list
        .filter(v => spaced.includes(` ${fold(v)} `))
        .sort((a, b) => fold(b).length - fold(a).length);   // "pre series a" before "series a"
    return contained[0] ?? null;
}

/**
 * The stage a company is at. Unrecognised wording falls back to the default
 * rather than failing the insert — the row is flagged needs_review anyway, and
 * a company in the wrong stage is fixable in a click; a company that never
 * arrived is not.
 */
export function normalizeCompanyRound(value: unknown, fallback: CompanyRoundValue = 'Seed'): CompanyRoundValue {
    if (typeof value !== 'string') return fallback;
    const direct = matchFromList(COMPANY_ROUNDS, value);
    if (direct) return direct;
    const f = fold(value);
    // Wordings that name no option but clearly mean one.
    if (/\bangel\b|\bfriends and family\b|\bbootstrap/.test(f)) return 'Pre-Seed';
    if (/\bpre a\b|\bpre seed a\b/.test(f)) return 'Pre-Series A';
    if (/\bseries c\b|\bseries d\b|\bseries e\b|\blate stage\b|\bgrowth\b/.test(f)) return 'Growth Stage';
    if (/\bipo\b/.test(f)) return 'IPO';
    return fallback;
}

export function normalizePriority(value: unknown, fallback: 'Low' | 'Medium' | 'High' = 'Medium') {
    return (typeof value === 'string' && matchFromList(PRIORITY_LEVELS, value)) || fallback;
}

export function normalizeDealSourceType(
    value: unknown,
    fallback: typeof DEAL_SOURCE_TYPES[number] = 'Founder Network',
) {
    if (typeof value !== 'string') return fallback;
    const direct = matchFromList(DEAL_SOURCE_TYPES, value);
    if (direct) return direct;
    const f = fold(value);
    if (/\bbanker\b|\bbank\b|\bib\b/.test(f)) return 'Investment Banker';
    if (/\bfriend|\bfamily\b/.test(f)) return 'Friends & Family';
    if (/\bvc\b|\bventure\b|\bpe\b|\bprivate equity\b|\bfund\b/.test(f)) return 'VC & PE';
    return fallback;
}

export function normalizeShareType(value: unknown, fallback: typeof SHARE_TYPES[number] = 'Primary') {
    if (typeof value !== 'string') return fallback;
    const direct = matchFromList(SHARE_TYPES, value);
    if (direct) return direct;
    const f = fold(value);
    if (/\bequity\b|\bnew shares\b|\bprimary\b/.test(f)) return 'Primary';
    if (/\bsecondary\b|\bexisting shares\b/.test(f)) return 'Secondary';
    if (/\bdebt\b|\bloan\b|\bnote\b|\bccd\b|\bconvertible\b/.test(f)) return 'Debt';
    return fallback;
}
