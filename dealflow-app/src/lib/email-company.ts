import { isSameCompanyName } from './company-dedupe';

// Working out which company an inbound email is about.
//
// Shared by every route that turns an email into a company (gmail/ingest and
// gmail/send-to-kanban), because they used to carry their own copy of this and
// drifted: one of them created duplicates the other would have matched.

// Mailbox providers, where the domain says nothing about the company.
const FREE_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
    'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
    'proton.me', 'protonmail.com', 'zoho.com', 'rediffmail.com', 'mail.com',
    'yandex.com', 'gmx.com', 'fastmail.com',
]);

// LEGAL suffixes only — the part that differs between how a founder signs an
// email and how the company is recorded, without changing which company is meant.
//
// Descriptive words (Technologies, Labs, Ventures, India, Group...) are
// deliberately NOT stripped. Stripping them collapses "Acme Labs" and "Acme
// Technologies" onto the same key, and this key decides whether two emails are
// merged into one company. Failing to match is recoverable — a duplicate a
// human merges — whereas merging two real companies is not, so the key stays
// conservative.
const NAME_NOISE = [
    'private limited', 'pvt ltd', 'pvt. ltd.', 'pvt limited', 'p ltd',
    'limited', 'ltd', 'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation',
];

export function emailDomain(email: string): string {
    return (email.split('@')[1] || '').trim().toLowerCase();
}

export function isFreeEmailDomain(email: string): boolean {
    return FREE_EMAIL_DOMAINS.has(emailDomain(email));
}

/**
 * A comparison key for company names: lowercase, punctuation and legal suffixes
 * removed. "Acme Technologies Pvt Ltd", "Acme Technologies" and "acme
 * technologies," all reduce to "acme technologies", so the same company
 * arriving from a second address is recognised rather than created again.
 */
export function normalizeCompanyName(name: string): string {
    let out = name
        .toLowerCase()
        .replace(/[.,'"`()|\-_/\\]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Repeatedly, so "acme technologies pvt ltd" -> "acme technologies"
    let changed = true;
    while (changed) {
        changed = false;
        for (const noise of NAME_NOISE) {
            if (out.endsWith(` ${noise}`)) {
                out = out.slice(0, -(noise.length + 1)).trim();
                changed = true;
            }
        }
    }
    return out;
}

/** "acme-labs.io" -> "Acme Labs". Used when nothing better identifies the company. */
export function companyNameFromDomain(email: string): string | null {
    const domain = emailDomain(email);
    if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
    const root = domain.split('.')[0];
    if (!root || root.length < 2) return null;
    return root
        .split(/[-_]/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// Subject lines that are the email's topic, never a company name.
const SUBJECT_NOISE = /^(re|fwd?|fw)\s*:\s*/i;
const SUBJECT_REJECT = /pitch|deck|deck\b|funding|fundrais|investment|opportunity|introduction|intro\b|connect|meeting|follow[- ]?up|request|proposal|hello|hi\b|greetings|update|seed|series [a-z]|round|raise|query|enquiry|inquiry|partnership|collaborat/i;

/**
 * The company an email is about, best source first.
 *
 * The subject line is LAST and heavily qualified: it used to be the first
 * fallback, so "Pitch Deck - Seed Round" and "Following up on our conversation"
 * became company names. A subject is only accepted when it reads like a bare
 * name — short, no topic words, not a sentence.
 */
export function deriveCompanyName(input: {
    aiName?: string | null;
    senderName: string;
    senderEmail: string;
    subject: string;
}): string {
    const { aiName, senderName, senderEmail, subject } = input;

    const domainName = companyNameFromDomain(senderEmail);

    // 1. The AI's answer, unless it just echoed the subject or the person's name.
    const ai = (aiName || '').trim();
    if (ai && ai.length <= 60) {
        const cleanSubject = subject.replace(SUBJECT_NOISE, '').trim();
        const echoedSubject = normalizeCompanyName(ai) === normalizeCompanyName(cleanSubject);
        const echoedSender = normalizeCompanyName(ai) === normalizeCompanyName(senderName);
        if (!echoedSubject && !echoedSender) return ai;
        // An echo is still right when the domain agrees it is the company.
        if (domainName && normalizeCompanyName(ai) === normalizeCompanyName(domainName)) return ai;
    }

    // 2. A work domain names the company directly and is never a sentence.
    if (domainName) return domainName;

    // 3. A subject that reads like a bare name rather than a topic.
    const cleanSubject = subject.replace(SUBJECT_NOISE, '').trim();
    const looksLikeName = cleanSubject
        && cleanSubject !== '(No Subject)'
        && cleanSubject.length <= 40
        && cleanSubject.split(/\s+/).length <= 4
        && !SUBJECT_REJECT.test(cleanSubject);
    if (looksLikeName) return cleanSubject;

    // 4. Nothing identified it. The sender's name at least routes the email to a
    //    human, and needs_review already flags it for correction.
    return senderName || cleanSubject || 'Unknown Company';
}

export interface CompanyMatch {
    id: string;
    company_name: string;
    founder_email: string | null;
    matchedBy: 'founder-email' | 'domain' | 'name';
}

/**
 * Finds the company an email belongs to, so a second email about the same
 * startup — from the founder's personal address, a co-founder, or an
 * introducer — joins the existing record instead of creating a second one.
 *
 * Order matters: the exact address is certain, a shared work domain is strong,
 * and a matching normalised name is the loosest, so it is checked last.
 */
export function matchCompany(
    candidates: { id: string; company_name: string; founder_email: string | null }[],
    input: { companyName: string; senderEmail: string },
): CompanyMatch | null {
    const senderLower = (input.senderEmail || '').trim().toLowerCase();
    // No address (a WhatsApp message, a form): only the name can match. Without
    // this guard '' equals every blank founder_email on file, and '' is also a
    // "domain" every blank address shares — so a message with no email would
    // be filed under whichever company happened to have none recorded.
    const hasEmail = senderLower.includes('@');

    const byEmail = hasEmail
        ? candidates.find(c => (c.founder_email || '').toLowerCase() === senderLower)
        : undefined;
    if (byEmail) return { ...byEmail, matchedBy: 'founder-email' };

    if (hasEmail && !isFreeEmailDomain(senderLower)) {
        const domain = emailDomain(input.senderEmail);
        const byDomain = candidates.find(c => emailDomain(c.founder_email || '') === domain);
        if (byDomain) return { ...byDomain, matchedBy: 'domain' };
    }

    // Spelling variants of the same name count — "Dholakiya" and "Dholakia's"
    // join an existing "Dholakia". isSameCompanyName is the strict test, since
    // nobody reviews this merge; looser near-misses are left for the forms to
    // put in front of a person.
    const byName = candidates.find(c => isSameCompanyName(c.company_name, input.companyName));
    if (byName) return { ...byName, matchedBy: 'name' };

    return null;
}

// Words a deck's filename carries that are about the document, not the company.
const DECK_FILENAME_NOISE = new Set([
    'pitch', 'deck', 'pitchdeck', 'investor', 'investors', 'presentation', 'ppt', 'pptx', 'pdf', 'key',
    'final', 'draft', 'updated', 'update', 'new', 'latest', 'copy', 'version', 'ver', 'rev',
    'seed', 'preseed', 'pre', 'series', 'a', 'b', 'c', 'round', 'fundraise', 'fundraising', 'raise',
    'company', 'profile', 'overview', 'teaser', 'one', 'pager', 'onepager', 'business', 'plan',
    'confidential', 'intro', 'introduction', 'for', 'dv', 'dholakia', 'ventures', 'vc',
    'and', 'the', 'of', 'to', 'by', 'with', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
    'sep', 'sept', 'oct', 'nov', 'dec', 'q1', 'q2', 'q3', 'q4', 'fy', 'h1', 'h2',
]);

/**
 * The company a deck's filename names, if it plausibly names one:
 * "StrainX_Pitch_Deck_v3.pdf" -> "StrainX", "Nova Robotics - Investor
 * Presentation 2026.pptx" -> "Nova Robotics". Null when nothing is left once
 * the document words, versions and dates are removed ("Pitch Deck.pdf").
 */
export function companyNameFromDeckFilename(filename: string): string | null {
    const base = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
    const words = base
        .split(/[\s_\-.,()[\]+]+/)
        .filter(Boolean)
        .filter(w => {
            const lw = w.toLowerCase();
            if (DECK_FILENAME_NOISE.has(lw)) return false;
            if (/^v\d+$/i.test(w) || /^\d+$/.test(w) || /^(19|20)\d{2}$/.test(w)) return false;
            if (/^\d+(st|nd|rd|th)$/i.test(w)) return false;
            return true;
        });
    if (words.length === 0 || words.length > 4) return null;
    const name = words.join(' ');
    if (name.length < 2 || name.length > 40) return null;
    // Keep the founder's own casing ("StrainX"), but lift an all-lowercase name.
    return name === name.toLowerCase()
        ? name.replace(/\b[a-z]/g, c => c.toUpperCase())
        : name;
}
