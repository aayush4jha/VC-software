import { createHmac, timingSafeEqual } from 'crypto';

// WhatsApp Cloud API: the parts of the webhook that must be exactly right.
// scripts/verify-whatsapp.mjs pins them — the signature check is the only thing
// standing between the public webhook URL and a forged "add this company".

/**
 * Meta signs every webhook POST with the app secret:
 *   X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw request body>
 * It must be checked against the RAW body — re-serialised JSON differs byte
 * for byte and would never match.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
    if (!header || !appSecret || !header.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    const given = header.slice('sha256='.length);
    if (given.length !== expected.length || !/^[0-9a-f]+$/i.test(given)) return false;
    return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Digits with country code and no "+", the form WhatsApp reports senders in.
 * A bare 10-digit Indian mobile (starting 6–9) gets 91 in front, since that is
 * how people naturally type their own number.
 */
export function normalizePhone(input: string): string {
    let digits = (input || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
    return digits;
}

export function isValidPhone(digits: string): boolean {
    return /^[1-9]\d{9,14}$/.test(digits);
}

export type InboundKind = 'text' | 'document' | 'image' | 'unsupported';

export interface InboundMessage {
    id: string;
    from: string;
    timestamp: number;
    kind: InboundKind;
    rawType: string;
    text: string;                     // body, or the file's caption
    media: { id: string; mimeType: string; filename: string | null } | null;
    profileName: string | null;
}

interface WebhookPayload {
    entry?: {
        changes?: {
            value?: {
                contacts?: { wa_id?: string; profile?: { name?: string } }[];
                messages?: {
                    id?: string; from?: string; timestamp?: string; type?: string;
                    text?: { body?: string };
                    document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
                    image?: { id?: string; mime_type?: string; caption?: string };
                }[];
            };
        }[];
    }[];
}

/**
 * The messages in a webhook delivery. Delivery receipts ("statuses") arrive
 * on the same URL and are not messages, so they yield nothing.
 */
export function parseWebhookMessages(payload: unknown): InboundMessage[] {
    const out: InboundMessage[] = [];
    const p = payload as WebhookPayload;
    for (const entry of p?.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value || {};
            const names = new Map((value.contacts || []).map(c => [c.wa_id || '', c.profile?.name || null]));
            for (const m of value.messages || []) {
                if (!m.id || !m.from) continue;
                const base = {
                    id: m.id,
                    from: normalizePhone(m.from),
                    timestamp: Number(m.timestamp || 0),
                    rawType: m.type || 'unknown',
                    profileName: names.get(m.from) ?? null,
                };
                if (m.type === 'text') {
                    out.push({ ...base, kind: 'text', text: m.text?.body || '', media: null });
                } else if (m.type === 'document' && m.document?.id) {
                    out.push({
                        ...base, kind: 'document', text: m.document.caption || '',
                        media: { id: m.document.id, mimeType: m.document.mime_type || 'application/octet-stream', filename: m.document.filename || null },
                    });
                } else if (m.type === 'image' && m.image?.id) {
                    out.push({
                        ...base, kind: 'image', text: m.image.caption || '',
                        media: { id: m.image.id, mimeType: m.image.mime_type || 'image/jpeg', filename: null },
                    });
                } else {
                    out.push({ ...base, kind: 'unsupported', text: '', media: null });
                }
            }
        }
    }
    return out;
}

export function isHelpCommand(text: string): boolean {
    return /^\s*(help|hi|hello|hey|\?|menu|start)\s*[.!]*\s*$/i.test(text);
}

export const WHATSAPP_HELP = [
    'Send me a startup and I will add it to the Dholakia Ventures deal flow:',
    '',
    '• Forward the founder\'s pitch deck (PDF / PPT) — add a caption with anything you know',
    '• Or type the details: company name, founder, what they do, how much they are raising',
    '',
    'If the company is already on the platform, I file it under the existing one instead of creating a duplicate. A message with no company name right after a deck is added to that company.',
].join('\n');
