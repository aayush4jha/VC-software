import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { sendWhatsAppTextVerbose, whatsappConfigured } from '@/lib/server/whatsapp-api';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * POST — sends a test message to the caller's own linked number.
 *
 * The two halves of this bot fail for completely different reasons. Inbound
 * breaks on the webhook: the URL, the verify token, the signature. Outbound
 * breaks on the token, the phone number id, or WhatsApp's rule that a business
 * may only message someone who messaged it in the last 24 hours. Testing the
 * outbound half on its own separates the two, and Meta's error says which.
 *
 * Only to a number the caller has linked to their own account: a send button
 * that takes an arbitrary number is a way to message strangers.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const config = whatsappConfigured();
    if (!config.ok) {
        return NextResponse.json({
            ok: false,
            error: `Not set up yet — missing ${config.missing.join(', ')}.`,
        });
    }

    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { data: numbers, error } = await client.from('whatsapp_senders')
        .select('phone').eq('user_id', auth.actor.userId).order('created_at').limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!numbers || numbers.length === 0) {
        return NextResponse.json({
            ok: false,
            error: 'Link your own number below first — the test goes to you, not to anyone else.',
        });
    }

    const result = await sendWhatsAppTextVerbose(
        numbers[0].phone,
        'Dholakia Ventures — your deal-flow bot is connected. '
        + 'Send a pitch deck or a note about a company and it will be filed for you.',
    );

    return NextResponse.json(
        result.ok
            ? { ok: true, to: numbers[0].phone }
            : { ok: false, to: numbers[0].phone, error: result.error, hint: result.hint },
    );
}
