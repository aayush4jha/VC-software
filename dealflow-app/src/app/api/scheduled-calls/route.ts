import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

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

    const rows = data || [];

    // Best-effort backfill: for rows where meet_link is missing (e.g. created
    // before we started persisting it), look the event up on Google Calendar
    // and fill it in. Runs once per row per request and writes back so future
    // loads are cheap.
    const missing = rows.filter(r => !r.meet_link && r.booked_slot);
    if (missing.length > 0) {
        try {
            const authResult = await getAuthenticatedClientForUser(user.id);
            if (authResult) {
                const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });
                for (const row of missing) {
                    const slot = new Date(row.booked_slot as string);
                    const duration = (row.duration_minutes as number) || 30;
                    const timeMin = new Date(slot.getTime() - 60 * 1000).toISOString();
                    const timeMax = new Date(slot.getTime() + duration * 60 * 1000 + 60 * 1000).toISOString();
                    try {
                        const res = await calendar.events.list({
                            calendarId: 'primary',
                            timeMin,
                            timeMax,
                            singleEvents: true,
                            maxResults: 10,
                        });
                        const titleNeedle = String(row.event_title || '').toLowerCase();
                        const attendee = String(row.attendee_email || '').toLowerCase();
                        const match = (res.data.items || []).find(ev => {
                            const summaryMatch = titleNeedle && ev.summary?.toLowerCase().includes(titleNeedle.slice(0, 30));
                            const attendeeMatch = attendee && (ev.attendees || []).some(a => a.email?.toLowerCase() === attendee);
                            return summaryMatch || attendeeMatch;
                        }) || res.data.items?.[0];
                        const link = match?.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
                        const htmlLink = match?.htmlLink || null;
                        if (link || htmlLink) {
                            row.meet_link = link;
                            row.event_link = htmlLink;
                            // Persist the backfill (best-effort; ignore if columns missing)
                            await db.from('booking_tokens')
                                .update({ meet_link: link, event_link: htmlLink })
                                .eq('id', row.id as string)
                                .then(({ error: e }) => { if (e) console.warn('[scheduled-calls] backfill write failed:', e.message); });
                        }
                    } catch (lookupErr) {
                        console.warn('[scheduled-calls] event lookup failed:', (lookupErr as Error).message);
                    }
                }
            }
        } catch (backfillErr) {
            console.warn('[scheduled-calls] backfill skipped:', (backfillErr as Error).message);
        }
    }

    return NextResponse.json({
        calls: rows.map(r => ({
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
