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

    const { data, error } = await db
        .from('booking_tokens')
        .select('id, company_id, company_name, attendee_name, attendee_email, host_name, host_email, event_title, duration_minutes, booked_slot')
        .eq('booked', true)
        .gte('booked_slot', cutoff)
        .order('booked_slot', { ascending: true });

    if (error) {
        console.error('[scheduled-calls] error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        calls: (data || []).map(r => ({
            id: r.id,
            companyId: r.company_id,
            companyName: r.company_name,
            attendeeName: r.attendee_name,
            attendeeEmail: r.attendee_email,
            hostName: r.host_name,
            hostEmail: r.host_email,
            eventTitle: r.event_title,
            durationMinutes: r.duration_minutes,
            bookedSlot: r.booked_slot,
        })),
    });
}
