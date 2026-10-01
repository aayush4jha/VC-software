// Sorting the inbox: what each email is, and how overdue a reply is.
//
// Pure — scripts/verify-email-triage.mjs pins it, including the case that
// defines the whole ordering: a pitch deck that asks for a call is a DEAL, not
// a call. What the email is *about* beats what it asks for.

export const EMAIL_CATEGORIES = ['Deals', 'Portfolio Companies', 'Calls', 'Events', 'Promotions', 'Other'] as const;
export type EmailCategory = typeof EMAIL_CATEGORIES[number];

export const CATEGORY_COLORS: Record<EmailCategory, string> = {
    'Deals': '#4f46e5',
    'Portfolio Companies': '#047857',
    'Calls': '#0369a1',
    'Events': '#b45309',
    'Promotions': '#6b7280',
    'Other': '#6b7280',
};

const DECK_EXTENSIONS = /\.(pdf|pptx?|key|odp)$/i;

// Money being raised, or a company introducing itself to an investor.
const DEAL_WORDS = /pitch\s*deck|\bdeck\b|fundrais|raising|seed round|pre-?seed|series\s+[a-d]\b|investment opportunity|term sheet|cap table|valuation|our startup|introduce (?:you to )?(?:our|my) (?:company|startup)|investor (?:deck|presentation|update)|funding round|bridge round|safe note|convertible/i;

// Scheduling, with nothing being raised.
const CALL_WORDS = /\b(?:schedule|set ?up|book|arrange|reschedule)\b[^.!?]{0,40}\b(?:call|meeting|chat|catch[- ]?up|sync)\b|\binvitation:|\bcalendar invite\b|\bzoom\.us\/|\bmeet\.google\.com\b|\bteams\.microsoft\.com\b|\bcalendly\.com\b|\bavailability\b|\bwhen (?:are|is) you\b/i;

// Something being run, with an audience.
const EVENT_WORDS = /\b(?:summit|conference|webinar|meetup|demo day|hackathon|workshop|masterclass|expo|roadshow|cohort|bootcamp)\b|\brsvp\b|\byou(?:'re| are) invited\b|\bregister (?:now|today|here)\b|\bagenda for the\b|\bspeaker\b/i;

// Marketing. Newsletters, blasts, offers.
const PROMO_WORDS = /\bunsubscribe\b|\bnewsletter\b|\bsponsored\b|\blimited time\b|\bdiscount\b|\b\d+% off\b|\bearly bird\b|\blast call\b|\bdon'?t miss\b|\bsale ends\b|\bupgrade (?:now|your plan)\b|\bpromo(?:tion|tional| code)?\b|\bdeals? of the (?:day|week)\b|\bbooths? (?:left|available)\b/i;

const AUTOMATED_SENDER = /no-?reply|noreply|newsletter|notifications?@|updates@|digest|marketing@|promo@|info@mail|team@.*\.(?:marketing|email)/i;

export interface ClassifyInput {
    subject: string;
    /** Body or snippet — whatever text is to hand. */
    text: string;
    attachmentNames?: string[];
    senderEmail: string;
    /** True when the sender is a company already in the portfolio. */
    fromPortfolioCompany?: boolean;
    /** The List-Unsubscribe header, if the message had one. */
    hasUnsubscribeHeader?: boolean;
    direction?: 'received' | 'sent';
}

export interface Classification {
    category: EmailCategory;
    /** Why, in a few words — shown on hover so the sorting is never a mystery. */
    reason: string;
}

/**
 * One category per email, decided in a fixed order:
 *
 *   1. a portfolio company writing       → Portfolio Companies
 *   2. a deck, or money being raised     → Deals
 *   3. scheduling, nothing being raised  → Calls
 *   4. an event with an audience         → Events
 *   5. marketing, or an automated sender → Promotions
 *
 * Deals sits above Calls deliberately: "here is our deck, can we connect over a
 * quick call?" is a deal that happens to ask for a call, and filing it under
 * Calls would hide it from the one list that matters.
 */
export function classifyEmail(input: ClassifyInput): Classification {
    const haystack = `${input.subject} ${input.text}`;
    const hasDeck = (input.attachmentNames || []).some(n => DECK_EXTENSIONS.test(n));
    const dealish = DEAL_WORDS.test(haystack);

    if (input.fromPortfolioCompany) {
        return { category: 'Portfolio Companies', reason: 'From a portfolio company' };
    }
    if (hasDeck && dealish) return { category: 'Deals', reason: 'Pitch deck attached' };
    if (dealish) return { category: 'Deals', reason: 'About raising money' };
    // A deck with no fundraising words is still far more likely a deal than
    // anything else somebody attaches a deck to.
    if (hasDeck) return { category: 'Deals', reason: 'Document attached' };

    const automated = AUTOMATED_SENDER.test(input.senderEmail) || !!input.hasUnsubscribeHeader;
    if (PROMO_WORDS.test(haystack) || automated) {
        // An event invitation from a real person is an event; the same words
        // from a mailing list are marketing.
        if (EVENT_WORDS.test(haystack) && !automated) {
            return { category: 'Events', reason: 'Event invitation' };
        }
        return {
            category: 'Promotions',
            reason: automated ? 'Automated or bulk sender' : 'Marketing language',
        };
    }
    if (CALL_WORDS.test(haystack)) return { category: 'Calls', reason: 'Scheduling a call or meeting' };
    if (EVENT_WORDS.test(haystack)) return { category: 'Events', reason: 'Event invitation' };
    return { category: 'Other', reason: 'Nothing specific matched' };
}

// ─── Waiting for a reply ──────────────────────────────────────────────────

/** Replies are owed within three days; past that it is late. */
export const REPLY_THRESHOLD_DAYS = 3;

export type ReplyUrgency = 'replied' | 'fresh' | 'due' | 'overdue';

export interface ReplyState {
    urgency: ReplyUrgency;
    daysWaiting: number;
    color: string;
    label: string;
}

export function replyState(daysWaiting: number, replied: boolean): ReplyState {
    if (replied) return { urgency: 'replied', daysWaiting, color: '#047857', label: 'Replied' };
    if (daysWaiting >= REPLY_THRESHOLD_DAYS) {
        return { urgency: 'overdue', daysWaiting, color: '#b91c1c', label: `${daysWaiting}d — overdue` };
    }
    if (daysWaiting >= REPLY_THRESHOLD_DAYS - 1) {
        return { urgency: 'due', daysWaiting, color: '#b45309', label: `${daysWaiting}d — reply today` };
    }
    return {
        urgency: 'fresh', daysWaiting, color: '#6b7280',
        label: daysWaiting <= 0 ? 'Today' : `${daysWaiting}d`,
    };
}

export interface ThreadMessage {
    id: string;
    threadId: string | null;
    direction: 'received' | 'sent';
    receivedAt: string | null;
}

/**
 * Which received emails are still waiting on us, and for how long.
 *
 * A thread counts as answered when something was SENT after the last message
 * received in it — so a founder who writes again after our reply goes back to
 * waiting, which is exactly the follow-up worth chasing.
 */
export function awaitingReply(
    messages: ThreadMessage[],
    now: Date = new Date(),
): Map<string, { replied: boolean; daysWaiting: number }> {
    const lastSentByThread = new Map<string, number>();
    for (const m of messages) {
        if (m.direction !== 'sent' || !m.receivedAt) continue;
        const t = new Date(m.receivedAt).getTime();
        if (isNaN(t)) continue;
        const key = m.threadId || m.id;
        lastSentByThread.set(key, Math.max(lastSentByThread.get(key) ?? 0, t));
    }

    const out = new Map<string, { replied: boolean; daysWaiting: number }>();
    for (const m of messages) {
        if (m.direction !== 'received') continue;
        const received = m.receivedAt ? new Date(m.receivedAt).getTime() : NaN;
        if (isNaN(received)) {
            out.set(m.id, { replied: false, daysWaiting: 0 });
            continue;
        }
        const key = m.threadId || m.id;
        const replied = (lastSentByThread.get(key) ?? 0) > received;
        const daysWaiting = Math.max(0, Math.floor((now.getTime() - received) / 86_400_000));
        out.set(m.id, { replied, daysWaiting });
    }
    return out;
}
