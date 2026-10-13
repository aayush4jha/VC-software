// Talking to the WhatsApp Cloud API (Meta Graph API).

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

export function whatsappConfigured(): { ok: boolean; missing: string[] } {
    const required = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
    const missing = required.filter(k => !process.env[k]);
    return { ok: missing.length === 0, missing };
}

/**
 * Sends a message and says what went wrong.
 *
 * The reply path swallows failures on purpose, but a connection test must not:
 * Meta's errors are specific and otherwise invisible, and which one came back
 * is the whole answer to "why is the bot not working".
 */
export async function sendWhatsAppTextVerbose(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token) return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN is not set.' };
    if (!phoneId) return { ok: false, error: 'WHATSAPP_PHONE_NUMBER_ID is not set.' };

    try {
        const res = await fetch(`${GRAPH()}/${phoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp', to, type: 'text',
                text: { body: body.slice(0, 4000), preview_url: false },
            }),
        });
        if (res.ok) return { ok: true };

        const text = await res.text();
        let message = text.slice(0, 400);
        let code: number | undefined;
        try {
            const j = JSON.parse(text) as { error?: { message?: string; code?: number; error_data?: { details?: string } } };
            message = j.error?.error_data?.details || j.error?.message || message;
            code = j.error?.code;
        } catch { /* keep the raw body */ }

        // The three that actually happen, said in words rather than codes.
        const hint =
            code === 190 || /access token/i.test(message)
                ? 'The access token is expired or wrong. A test token lasts 24 hours — use a permanent one from a System User.'
                : /24 hours|re-?engagement|outside.*window/i.test(message)
                    ? 'WhatsApp only allows a free message within 24 hours of the person messaging the business. Send anything to the bot from that phone first, then try again.'
                    : /not.*registered|recipient/i.test(message)
                        ? 'That number is not a valid WhatsApp recipient for this app. While the app is in test mode, only numbers added as test recipients in the Meta dashboard can be messaged.'
                        : undefined;

        return { ok: false, error: `${res.status}: ${message}`, hint };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

/** Replies are best-effort: a failed reply must never undo the work done. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return;
    try {
        const res = await fetch(`${GRAPH()}/${phoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: body.slice(0, 4000), preview_url: false },
            }),
        });
        if (!res.ok) console.error('[whatsapp] reply failed:', res.status, (await res.text()).slice(0, 300));
    } catch (err) {
        console.error('[whatsapp] reply failed:', (err as Error).message);
    }
}

// Decks bigger than this are refused rather than half-read.
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * Downloads a media item: the message carries only an id, which resolves to a
 * short-lived URL that itself needs the bearer token.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is not set');
    const metaRes = await fetch(`${GRAPH()}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) throw new Error(`media lookup failed (${metaRes.status})`);
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) throw new Error('media has no download URL');
    if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) {
        throw new Error(`file is ${(meta.file_size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MEDIA_BYTES / 1024 / 1024} MB`);
    }
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) throw new Error(`media download failed (${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error('file is too large');
    return { buffer, mimeType: meta.mime_type || 'application/octet-stream', size: buffer.length };
}
