// The replies a VC firm sends over and over.
//
// Most inbound mail gets one of about a dozen answers: ask for the deck, ask
// for traction, propose a call, pass politely, acknowledge an update, get off
// a mailing list. Writing each one from scratch — or waiting on a model to —
// is slower than picking it, so they live here as text.
//
// {{first_name}} and {{company_name}} are filled from the email in hand, and
// anything still unknown is written around rather than left as a blank for
// someone to miss. Pure, and pinned by scripts/verify-reply-templates.mjs.

import type { EmailCategory } from './email-triage';

export interface ReplyTemplate {
    id: string;
    /** What the button says. */
    label: string;
    /** Which inbox categories offer it first. Empty means every category. */
    categories: EmailCategory[];
    body: string;
    /** The line before the name at the end. "Best," when not set. */
    signOff?: string;
}

/**
 * The firm's one rejection, word for word as the team wrote it. The Reject
 * flow on a company sends this, and the Email Workspace offers it as a reply.
 */
export const REJECTION_TEMPLATE: ReplyTemplate = {
    id: 'deal-pass',
    label: 'Pass — track for later',
    categories: ['Deals'],
    signOff: 'Best Regards',
    body: `Hi {{first_name}},

Thank you for sharing the latest deck of {{company_name}} company.

At this stage, we would like to stay on the sidelines and track the company's progress for potential alignment in later rounds. We appreciate you taking the time to share this opportunity with us.`,
};

export const REPLY_TEMPLATES: ReplyTemplate[] = [
    {
        id: 'deal-ask-traction',
        label: 'Ask for traction',
        categories: ['Deals'],
        body: `Hi {{first_name}},

Thanks for sending this across — I have had a first look at {{company_name}}.

Before we go further, could you share where you are on revenue and growth over the last six months, and what the current monthly burn looks like?

If there is a data room already, a link to that is just as good.`,
    },
    {
        id: 'deal-ask-deck',
        label: 'Ask for the deck',
        categories: ['Deals', 'Calls', 'Other'],
        body: `Hi {{first_name}},

Thanks for reaching out. Could you send across the deck and a short note on what you are raising and at what valuation?

I will come back to you once I have been through it.`,
    },
    REJECTION_TEMPLATE,
    {
        id: 'deal-propose-call',
        label: 'Propose a call',
        categories: ['Deals', 'Calls', 'Portfolio Companies'],
        body: `Hi {{first_name}},

Thanks for sending this over — worth a conversation.

Send me a few times that suit you over the next week and I will get it in the calendar.`,
    },
    {
        id: 'deal-revert-later',
        label: 'Will revert after review',
        categories: ['Deals', 'Other'],
        body: `Hi {{first_name}},

Thanks for sending this across — received.

I am going through it with the team this week and will come back to you either way.`,
    },
    {
        id: 'portfolio-ack-update',
        label: 'Acknowledge an update',
        categories: ['Portfolio Companies'],
        body: `Hi {{first_name}},

Thanks for the update — good to see the progress.

Shout if there is anything you need from our side: intros, hiring, or a hand with the next round.`,
    },
    {
        id: 'portfolio-ask-mis',
        label: 'Ask for the monthly numbers',
        categories: ['Portfolio Companies'],
        body: `Hi {{first_name}},

Hope things are going well at {{company_name}}.

Could you send across last month's numbers when you get a moment — revenue, burn and cash in the bank? It keeps our records straight and makes it easier to help when you need something.`,
    },
    {
        id: 'call-ask-agenda',
        label: 'Ask what it is about',
        categories: ['Calls', 'Other'],
        body: `Hi {{first_name}},

Happy to find time. Could you let me know what you would like to cover, so I come prepared?

Send a few slots that work for you and I will confirm one.`,
    },
    {
        id: 'event-interested',
        label: 'Event — interested',
        categories: ['Events'],
        body: `Hi {{first_name}},

Thanks for the invitation — this looks interesting.

Could you share the date, the format and who else is attending? I will confirm once I have those.`,
    },
    {
        id: 'event-decline',
        label: 'Event — decline',
        categories: ['Events'],
        body: `Hi {{first_name}},

Thank you for the invitation. I will not be able to make this one, but do keep us on the list for future editions.`,
    },
    {
        id: 'promo-unsubscribe',
        label: 'Take us off the list',
        categories: ['Promotions'],
        body: `Hi {{first_name}},

Thanks for getting in touch. This is not something we are looking at.

Please take us off the list for future mailers.`,
    },
    {
        id: 'intro-thanks',
        label: 'Thanks for the intro',
        categories: ['Deals', 'Other'],
        body: `Hi {{first_name}},

Thanks for the introduction — much appreciated.

Moving you to BCC. I will take it from here and will let you know how it goes.`,
    },
    {
        id: 'holding',
        label: 'Holding reply',
        categories: [],
        body: `Hi {{first_name}},

Thanks for your note — received, and I am on it.

Give me a few days and I will come back to you properly.`,
    },
];

export interface TemplateContext {
    senderName?: string;
    companyName?: string;
    /** The partner's own name, for the sign-off. */
    signOffName?: string;
}

/**
 * A template with its blanks filled, and a sign-off on the end.
 *
 * An unknown first name becomes "there" rather than an empty greeting, and an
 * unknown company is written around: a sentence reading "I have had a first
 * look at ." is worse than one that simply does not mention the name.
 */
export function fillTemplate(template: ReplyTemplate | string, context: TemplateContext = {}): string {
    const raw = typeof template === 'string' ? template : template.body;
    const first = (context.senderName || '').trim().split(/\s+/)[0] || '';
    const company = (context.companyName || '').trim();

    let out = raw.replace(/\{\{\s*first_name\s*\}\}/gi, first || 'there');

    if (company) {
        out = out.replace(/\{\{\s*company_name\s*\}\}/gi, company);
    } else {
        // Drop the phrase the placeholder was carrying, not just the name.
        out = out
            .replace(/\s*(?:at|with|for|of)\s+\{\{\s*company_name\s*\}\}(?:\s+company\b)?/gi, '')
            .replace(/\{\{\s*company_name\s*\}\}/gi, 'this');
    }

    const sign = (context.signOffName || '').trim();
    const close = typeof template === 'string' ? 'Best,' : template.signOff || 'Best,';
    return `${out.trim()}\n\n${close}${sign ? `\n${sign}` : ''}`;
}

/**
 * The templates to show for an email, the most likely first.
 * Everything stays reachable — a mail is sometimes filed under the wrong
 * heading, and the right reply should not be hidden behind that.
 */
export function templatesFor(category: EmailCategory | undefined): ReplyTemplate[] {
    if (!category) return REPLY_TEMPLATES;
    const matches = REPLY_TEMPLATES.filter(t => t.categories.includes(category));
    const rest = REPLY_TEMPLATES.filter(t => !t.categories.includes(category));
    return [...matches, ...rest];
}
