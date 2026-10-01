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
