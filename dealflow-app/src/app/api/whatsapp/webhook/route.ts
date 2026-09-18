import { NextRequest, NextResponse, after } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { parseWebhookMessages, verifyWebhookSignature } from '@/lib/whatsapp';
import { processWhatsAppMessage } from '@/lib/server/whatsapp-ingest';

// Reading a deck with Gemini and filing it can take a while; it runs after
// the response (see POST), within this budget.
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Meta's one-time subscription handshake: echo hub.challenge back if the verify
 * token matches the one entered in the Meta app dashboard.
 */
export async function GET(request: NextRequest) {
    const params = new URL(request.url).searchParams;
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (
        token
        && params.get('hub.mode') === 'subscribe'
        && safeEqual(params.get('hub.verify_token') || '', token)
    ) {
        return new NextResponse(params.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Inbound messages. Public by necessity — Meta has no session — so the
 * X-Hub-Signature-256 HMAC is what proves a request came from Meta, and it is
 * checked against the raw body before anything is parsed. No app secret
 * configured means nothing is accepted.
 *
 * Meta wants a 200 quickly and retries otherwise, so the work happens in
 * after(), once the response has gone. A retry that does arrive is recognised
 * by its message id and ignored.
 */
export async function POST(request: NextRequest) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) return NextResponse.json({ error: 'WhatsApp is not configured' }, { status: 503 });

    const raw = await request.text();
    if (!verifyWebhookSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

    const messages = parseWebhookMessages(payload);
    if (messages.length === 0) return NextResponse.json({ ok: true });   // delivery receipts etc.

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    after(async () => {
        // In order: "here's the deck" then "it's StrainX" must be handled in
        // the order they were sent.
        for (const m of messages.sort((a, b) => a.timestamp - b.timestamp)) {
            try {
                await processWhatsAppMessage(db, m);
            } catch (err) {
                console.error('[whatsapp] unhandled:', (err as Error).message);
            }
        }
    });

    return NextResponse.json({ ok: true });
}
