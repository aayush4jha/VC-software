import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';

// Returns all booked meetings (from both direct "Create Event & Meet" and
// founder-pick-a-slot flows) whose time hasn't fully passed yet. Source of
// truth is the booking_tokens table — companies.meet_event_date doesn't exist
// in the schema, so we can't rely on it.
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Keep calls visible for ~10 min past start so an in-progress call doesn't
    // fall off the dashboard mid-meeting.
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Try with meet_link/event_link columns; retry with the legacy subset if
    // the migration hasn't been applied yet.
    const fullCols = 'id, company_id, company_name, attendee_name, attendee_email, host_name, host_email, event_title, duration_minutes, booked_slot, meet_link, event_link';
    const legacyCols = 'id, company_id, company_name, attendee_name, attendee_email, host_name, host_email, event_title, duration_minutes, booked_slot';

    let data: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;
    ({ data, error } = await db
        .from('booking_tokens')
        .select(fullCols)
        .eq('booked', true)
        .gte('booked_slot', cutoff)
        .order('booked_slot', { ascending: true }));

    if (error && /column|schema cache/i.test(error.message) && /(meet_link|event_link)/i.test(error.message)) {
        ({ data, error } = await db
            .from('booking_tokens')
            .select(legacyCols)
            .eq('booked', true)
            .gte('booked_slot', cutoff)
            .order('booked_slot', { ascending: true }));
    }

    if (error) {
        console.error('[scheduled-calls] error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        calls: (data || []).map(r => ({
            id: r.id as string,
            companyId: (r.company_id as string | null) ?? null,
            companyName: (r.company_name as string) ?? '',
            attendeeName: (r.attendee_name as string) ?? '',
            attendeeEmail: (r.attendee_email as string) ?? '',
            hostName: (r.host_name as string) ?? '',
            hostEmail: (r.host_email as string) ?? '',
            eventTitle: (r.event_title as string) ?? '',
            durationMinutes: (r.duration_minutes as number) ?? 30,
            bookedSlot: r.booked_slot as string,
            meetLink: (r.meet_link as string | null | undefined) ?? null,
            eventLink: (r.event_link as string | null | undefined) ?? null,
        })),
    });
}
