// Is this company already on the platform under a slightly different name?
//
// "Dholakia", "Dholakiya" and "Dholakia's" are one company typed three ways.
// Exact comparison misses all of them, so every entry path — the two forms,
// email ingestion and the WhatsApp bot — checks here before creating a row.
//
// Two strengths of answer, because the cost of being wrong differs:
//   * isSameCompanyName — strict. Automated paths (email, WhatsApp) merge on
//     it with no human in the loop, and merging two real companies has no undo.
//   * findSimilarCompanies — looser. The forms show these to a person, who
//     either opens the existing company or confirms it really is a new one.
//
// Pure functions, no imports: scripts/verify-company-dedupe.mjs pins them.

// Legal forms that change nothing about which company is meant.
const LEGAL_SUFFIXES = [
    'private limited', 'pvt ltd', 'pvt limited', 'p ltd', 'limited', 'ltd',
    'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'opc',
];

/**
 * An aggressive comparison key: case, punctuation, spacing, possessives, legal
 * suffixes and the common spelling variants of romanised Indian names are all
 * folded away, so the variants of one name collapse onto one key.
 *
 *   Dholakia / Dholakiya / Dholakia's / DHOLAKIA PVT LTD   -> "dolakia"
 *   Shree Ganesh / Sree Ganesh / Shri Ganesh               -> "sriganes"
 *
 * Descriptive words (Labs, Technologies, Ventures) are KEPT: they are what
 * tells "Acme Labs" from "Acme Technologies", two different firms.
 */
export function companyNameKey(name: string): string {
    let s = (name || '').toLowerCase().trim();

    // Possessive and apostrophes: dholakia's -> dholakia
    s = s.replace(/[‘’'`]s\b/g, '').replace(/[‘’'`]/g, '');
    s = s.replace(/&/g, ' and ');
    s = s.replace(/[^a-z0-9]+/g, ' ').trim();
    s = s.replace(/^the\s+/, '');

    let changed = true;
    while (changed) {
        changed = false;
        for (const suffix of LEGAL_SUFFIXES) {
            if (s.endsWith(` ${suffix}`)) {
                s = s.slice(0, -(suffix.length + 1)).trim();
                changed = true;
            }
        }
    }

    s = s.replace(/\s+/g, '');

    // Romanisation variants. Order matters: digraphs before the y/vowel rules.
    s = s
        .replace(/shr/g, 'sr')             // shree / sree / shri
        .replace(/ph/g, 'f')
        .replace(/ck/g, 'k')
        .replace(/q/g, 'k')
        .replace(/([bdgkt])h/g, '$1')      // aspirates: dh->d, bh->b, kh->k, gh->g, th->t
        .replace(/sh/g, 's')
        .replace(/iya/g, 'ia')             // dholakiya -> dholakia
        .replace(/ee/g, 'i')
        .replace(/oo/g, 'u')
        .replace(/aa/g, 'a')
        .replace(/(.)\1+/g, '$1')          // doubled letters: swiggy -> swigy
        .replace(/y$/, 'i');               // swigy -> swigi, matching swiggi

    return s;
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        prev = cur;
    }
    return prev[b.length];
}

/** 0..1 — how alike two names are once folded to their keys. */
export function nameSimilarity(a: string, b: string): number {
    const ka = companyNameKey(a);
    const kb = companyNameKey(b);
    if (!ka || !kb) return 0;
    if (ka === kb) return 1;
    return 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
}

// Below this many characters of key, one typo is a different word: "Acme" and
// "Acne" are two companies. Short names only ever match exactly.
const MIN_FUZZY_LENGTH = 7;
const AUTO_MERGE_SIMILARITY = 0.9;
const SUGGEST_SIMILARITY = 0.8;

/**
 * Strict: the same company, confident enough to merge with no human looking.
 * Equal keys (any spelling variant of the same name), or a one-letter slip in
 * a long name. Anything looser goes to a person via findSimilarCompanies.
 */
export function isSameCompanyName(a: string, b: string): boolean {
    const ka = companyNameKey(a);
    const kb = companyNameKey(b);
    if (ka.length < 3 || kb.length < 3) return false;
    if (ka === kb) return true;
    if (Math.min(ka.length, kb.length) < MIN_FUZZY_LENGTH) return false;
    return nameSimilarity(a, b) >= AUTO_MERGE_SIMILARITY;
}

export type SimilarityReason = 'same-name' | 'spelling-variant' | 'contains';

export interface SimilarCompany<T> {
    company: T;
    score: number;
    reason: SimilarityReason;
}

/**
 * Loose: companies a person should look at before creating a new one, best
 * first. Adds near-misses and one name containing the other ("Dholakia" vs
 * "Dholakia Ventures") — plausible duplicates, never merged automatically.
 */
export function findSimilarCompanies<T extends { companyName: string }>(
    candidates: T[],
    name: string,
    options: { excludeId?: string; limit?: number } = {},
): SimilarCompany<T & { id?: string }>[] {
    const key = companyNameKey(name);
    if (key.length < 3) return [];

    const out: SimilarCompany<T & { id?: string }>[] = [];
    for (const raw of candidates) {
        const c = raw as T & { id?: string };
        if (options.excludeId && c.id === options.excludeId) continue;
        const ck = companyNameKey(c.companyName);
        if (ck.length < 3) continue;

        if (ck === key) {
            out.push({ company: c, score: 1, reason: 'same-name' });
            continue;
        }
        const shorter = Math.min(ck.length, key.length);
        if (shorter >= MIN_FUZZY_LENGTH - 2) {
            const score = nameSimilarity(c.companyName, name);
            if (score >= SUGGEST_SIMILARITY) {
                out.push({ company: c, score, reason: 'spelling-variant' });
                continue;
            }
        }
        // One name wholly inside the other, on a long enough stem that it is
        // not a coincidence: "dolakia" in "dolakiaventures".
        if (shorter >= 5 && (ck.startsWith(key) || key.startsWith(ck))) {
            out.push({ company: c, score: 0.8, reason: 'contains' });
        }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 5);
}
