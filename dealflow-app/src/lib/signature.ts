// The signature Gmail keeps for an address, turned into something that can be
// appended to a plain-text mail.
//
// Gmail stores a signature as HTML, and the platform sends text/plain, so it
// has to be flattened — and only appended when the body does not already end
// in it, or a reply the partner has already signed goes out signed twice.
//
// Pure, and pinned by scripts/verify-signature.mjs.

import { htmlToText } from './server/gmail-parse';

/** Gmail's own separator. Keeping it means a client collapses the signature. */
export const SIGNATURE_SEPARATOR = '--';

/**
 * Gmail's HTML signature as plain text, or '' when there is nothing in it.
 * An image-only signature flattens to nothing, which is correct: there is no
 * text to append.
 */
export function signatureToText(html: string): string {
    if (!html) return '';
    return htmlToText(html)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .trim();
}

/**
 * Does this body already carry the signature?
 *
 * Compared on words alone, because the body in the box has been through a
 * textarea and the signature has been through an HTML flattener — the line
 * breaks and spacing will not match even when the text does.
 */
export function alreadySigned(body: string, signature: string): boolean {
    if (!signature) return true;
    const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const sig = flatten(signature);
    if (!sig) return true;
    return flatten(body).includes(sig);
}

/**
 * The body as it should be sent: the partner's signature on the end.
 *
 * Returns the body untouched when there is no signature, or when it is already
 * there. The separator is only added when the signature does not open with one.
 */
export function appendSignature(body: string, signature: string): string {
    const sig = signature.trim();
    if (!sig) return body;
    if (alreadySigned(body, sig)) return body;

    const trimmed = body.replace(/\s+$/, '');
    const separator = sig.startsWith(SIGNATURE_SEPARATOR) ? '' : `${SIGNATURE_SEPARATOR}\n`;
    return `${trimmed}\n\n${separator}${sig}`;
}
