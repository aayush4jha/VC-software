// Reading back the model's drafted reply.
//
// This was JSON, and it broke on the first real draft: a reply body has line
// breaks in it, a raw newline inside a JSON string is invalid, and the whole
// draft was lost to "Unterminated string in JSON". A reply is prose, so it is
// asked for as prose with markers around it — there is nothing in a reply that
// can break a marker the way a newline breaks JSON.
//
// Pure — scripts/verify-reply-draft.mjs pins it.

export const DRAFT_FORMAT = `Answer in exactly this shape, with the markers on their own lines:

@@REPLY@@
the reply body, as many lines as it needs
@@NOTE@@
one short line on what you assumed or left for the partner to fill in

Always write a reply. Even for a newsletter, a notification or a cold sales
pitch there is a sensible one — a short decline, a request to be removed, a
one-line acknowledgement. Never refuse and never return an empty reply.`;

export interface ParsedDraft {
    reply: string;
    note: string;
    skip: boolean;
}

/**
 * Pulls the reply out of whatever the model actually sent: the markers when it
 * followed instructions, JSON if it fell back to that, and otherwise the whole
 * response — because a draft the person can edit beats an error message.
 *
 * `skip` survives only to read older answers that still send it; the drafter no
 * longer asks for it, because every email gets a template now.
 */
export function parseDraft(raw: string): ParsedDraft {
    const text = (raw || '').replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
    if (!text) return { reply: '', note: '', skip: false };

    const section = (name: string): string | null => {
        const start = text.indexOf(`@@${name}@@`);
        if (start === -1) return null;
        const from = start + name.length + 4;
        const rest = text.slice(from);
        const next = rest.search(/@@[A-Z]+@@/);
        return (next === -1 ? rest : rest.slice(0, next)).trim();
    };

    const reply = section('REPLY');
    if (reply !== null) {
        const skip = (section('SKIP') || '').toLowerCase().startsWith('y');
        return { reply: skip ? '' : reply, note: section('NOTE') || '', skip };
    }

    // It used JSON after all. Only trust it if it actually parses.
    if (text.startsWith('{')) {
        try {
            const json = JSON.parse(text) as { reply?: string; note?: string; shouldReply?: boolean };
            return {
                reply: json.shouldReply === false ? '' : String(json.reply || '').trim(),
                note: String(json.note || '').trim(),
                skip: json.shouldReply === false,
            };
        } catch {
            // Fall through: the prose below is better than nothing.
        }
    }

    return { reply: text, note: '', skip: false };
}

// ─── Rejecting commentary ─────────────────────────────────────────────────

// A model asked to write a reply sometimes describes the email instead:
// "This email is a standard automated rejection. Dholakia Ventures is a VC
// firm. There is no clear reason to…". That is analysis, not a reply, and it
// must never reach the box the partner is about to send from.
const COMMENTARY = [
    /\bthis (?:e-?mail|message) (?:is|appears|seems|looks)\b/i,
    /\bthe (?:sender|email|message|user|recipient) (?:is|has|wants|appears)\b/i,
    /\bthere is no (?:clear )?(?:reason|need|benefit)\b/i,
    /\b(?:as an|i am an) AI\b/i,
    /\bi (?:cannot|can't|won't) (?:write|draft|reply|respond)\b/i,
    /\b(?:no reply|a reply) (?:is )?(?:needed|necessary|required|warranted)\b/i,
    /\bdoes not (?:require|warrant|deserve) a (?:reply|response)\b/i,
    /\bhere(?:'s| is) (?:a|the) (?:draft|suggested|possible) (?:reply|response)\b/i,
];

/** True when the text talks ABOUT the email rather than being a reply to it. */
export function looksLikeCommentary(text: string): boolean {
    const head = (text || '').trim().slice(0, 400);
    if (!head) return true;
    return COMMENTARY.some(re => re.test(head));
}

/**
 * What to send when the model will not produce a usable reply — short, correct
 * for the kind of email, and plainly editable. A person opening the box should
 * find something they could send, never an apology or an analysis.
 */
export function fallbackReply(
    category: string,
    senderFirstName: string,
    signOffName: string,
): string {
    const hi = senderFirstName ? `Hi ${senderFirstName},` : 'Hello,';
    const body: Record<string, string> = {
        'Deals': 'Thanks for sending this across — I have had a first look.\n\nCould you share a little more on traction and what you are raising on?\n\nIf it is easier to talk it through, send me a few times that suit you this week.',
        'Portfolio Companies': 'Thanks for the update.\n\nNoted on the below — let me know where you need a hand, whether that is intros, hiring or the next round.',
        'Calls': 'Happy to speak.\n\nCould you send me a few times that work for you this week, and a line on what you would like to cover?',
        'Events': 'Thanks for the invitation.\n\nCould you share the date, the format and who else is likely to attend? I will come back to you once I have those.',
        'Promotions': 'Thanks for reaching out. This is not something we are looking at right now.\n\nPlease take us off the list for future mailers.',
        'Other': 'Thanks for writing in.\n\nCould you let me know what you need from our side, and I will get back to you?',
    };
    const sign = signOffName ? `\n\nBest,\n${signOffName}` : '\n\nBest,';
    return `${hi}\n\n${body[category] ?? body['Other']}${sign}`;
}
