import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { normalizePhone, isValidPhone } from '@/lib/whatsapp';
import { whatsappConfigured } from '@/lib/server/whatsapp-api';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * The signed-in person's own linked WhatsApp numbers. Each person manages only
 * their own: a number linked here is how the bot knows a message is from them.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { data, error } = await client.from('whatsapp_senders')
        .select('id, phone, created_at').eq('user_id', auth.actor.userId).order('created_at');
    const config = whatsappConfigured();
    return NextResponse.json({
        numbers: data || [],
        unavailable: error ? error.message : null,
        configured: config.ok,
        missingConfig: auth.actor.isAdmin ? config.missing : undefined,
        botNumber: process.env.WHATSAPP_DISPLAY_NUMBER || null,
    });
}

export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { phone } = await request.json();
    const digits = normalizePhone(String(phone || ''));
    if (!isValidPhone(digits)) {
        return NextResponse.json({ error: 'Enter the number with its country code, e.g. +91 98765 43210' }, { status: 400 });
    }
    const { data: taken } = await client.from('whatsapp_senders').select('user_id').eq('phone', digits).maybeSingle();
    if (taken) {
        return NextResponse.json({
            error: taken.user_id === auth.actor.userId
                ? 'That number is already linked to your account.'
                : 'That number is linked to someone else\'s account.',
        }, { status: 409 });
    }
    const { data, error } = await client.from('whatsapp_senders').insert({
        organization_id: ORGANIZATION_ID, user_id: auth.actor.userId, phone: digits,
    }).select('id, phone, created_at').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ number: data });
}

export async function DELETE(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    // Scoped to the caller: nobody can unlink someone else's number.
    const { error } = await client.from('whatsapp_senders').delete().eq('id', id).eq('user_id', auth.actor.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
