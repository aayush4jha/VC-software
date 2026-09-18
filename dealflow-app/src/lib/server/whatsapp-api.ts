// Talking to the WhatsApp Cloud API (Meta Graph API).

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}`;

export function whatsappConfigured(): { ok: boolean; missing: string[] } {
    const required = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
    const missing = required.filter(k => !process.env[k]);
    return { ok: missing.length === 0, missing };
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
