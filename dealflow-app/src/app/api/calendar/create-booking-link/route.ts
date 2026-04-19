import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const {
        companyId, companyName, attendeeName, attendeeEmail,
        hostName, hostEmail, eventTitle, durationMinutes,
        allowedSlots, additionalGuests,
    } = await request.json();

    if (!attendeeEmail || !eventTitle) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalize the optional pre-selected slots + guest emails
    const cleanSlots = Array.isArray(allowedSlots)
        ? allowedSlots
              .filter((s: unknown): s is { start: string; end: string } =>
                  !!s && typeof (s as { start?: unknown }).start === 'string' && typeof (s as { end?: unknown }).end === 'string')
              .map(s => ({ start: s.start, end: s.end }))
        : null;

    const cleanGuests = Array.isArray(additionalGuests)
        ? Array.from(new Set(
            additionalGuests
                .filter((g: unknown): g is string => typeof g === 'string')
                .map(g => g.trim().toLowerCase())
                .filter(g => /.+@.+\..+/.test(g) && g !== attendeeEmail.toLowerCase()),
        ))
        : null;

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Generate a unique token
    const token = crypto.randomUUID().replace(/-/g, '');

    const { data, error } = await db.from('booking_tokens').insert({
        token,
        user_id: user.id,
        company_id: companyId || null,
        company_name: companyName || '',
        attendee_name: attendeeName || '',
        attendee_email: attendeeEmail,
        host_name: hostName || '',
        host_email: hostEmail || '',
        event_title: eventTitle,
        duration_minutes: durationMinutes || 30,
        allowed_slots: cleanSlots && cleanSlots.length > 0 ? cleanSlots : null,
        additional_guests: cleanGuests && cleanGuests.length > 0 ? cleanGuests : null,
    }).select().single();

    if (error) {
        console.error('[create-booking-link] error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build the booking URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
    const bookingUrl = `${baseUrl}/book?token=${token}&user=${user.id}`;

    return NextResponse.json({ bookingUrl, token: data.token });
}
