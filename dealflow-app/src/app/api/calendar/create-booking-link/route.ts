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

    const baseRow = {
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
    };

    const fullRow = {
        ...baseRow,
        allowed_slots: cleanSlots && cleanSlots.length > 0 ? cleanSlots : null,
        additional_guests: cleanGuests && cleanGuests.length > 0 ? cleanGuests : null,
    };

    const MIGRATION_SQL = [
        "ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS allowed_slots JSONB;",
        "ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS additional_guests JSONB;",
    ].join('\n');

    let { data, error } = await db.from('booking_tokens').insert(fullRow).select().single();
    let missingColumns = false;

    // Fallback for installs that haven't run the new migration yet — retry with
    // only the legacy columns so link generation keeps working. The UI will
    // surface the migration SQL so the admin can enable the per-link features.
    if (error && /column|schema cache/i.test(error.message) && /(allowed_slots|additional_guests)/i.test(error.message)) {
        console.warn('[create-booking-link] booking_tokens missing new columns, falling back:', error.message);
        missingColumns = true;
        const retry = await db.from('booking_tokens').insert(baseRow).select().single();
        data = retry.data;
        error = retry.error;
    }

    if (error || !data) {
        console.error('[create-booking-link] error:', error?.message);
        return NextResponse.json({ error: error?.message || 'Failed to create booking token' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
    const bookingUrl = `${baseUrl}/book?token=${token}&user=${user.id}`;

    return NextResponse.json({
        bookingUrl,
        token: data.token,
        degraded: missingColumns,
        migrationSql: missingColumns ? MIGRATION_SQL : undefined,
    });
}
