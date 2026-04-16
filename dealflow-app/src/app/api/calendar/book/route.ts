import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

export async function POST(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const { token, userId, slotStart, slotEnd } = await request.json();
    if (!token || !userId || !slotStart || !slotEnd) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Validate booking token
    const { data: booking } = await db
        .from('booking_tokens')
        .select('*')
        .eq('token', token)
        .eq('user_id', userId)
        .eq('booked', false)
        .single();

    if (!booking) {
        return NextResponse.json({ error: 'Invalid, expired, or already used booking link' }, { status: 404 });
    }

    // Get authenticated Google client for the host
    const authResult = await getAuthenticatedClientForUser(userId);
    if (!authResult) {
        return NextResponse.json({
            error: 'The host needs to reconnect their Google account before this booking can be confirmed.',
            code: 'host_reconnect_required',
        }, { status: 401 });
    }

    const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });

    try {
        const event = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            sendUpdates: 'all',
            requestBody: {
                summary: booking.event_title,
                description: `Meeting with ${booking.attendee_name} from ${booking.company_name}.\n\nBooked via scheduling link.`,
                start: { dateTime: slotStart, timeZone: 'Asia/Kolkata' },
                end: { dateTime: slotEnd, timeZone: 'Asia/Kolkata' },
                attendees: [
                    { email: booking.attendee_email, displayName: booking.attendee_name },
                    { email: booking.host_email, self: true },
                ],
                conferenceData: {
                    createRequest: {
                        requestId: `book-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 60 },
                        { method: 'popup', minutes: 10 },
                    ],
                },
            },
        });

        const meetLink = event.data.conferenceData?.entryPoints?.find(
            ep => ep.entryPointType === 'video'
        )?.uri;

        // Mark token as booked
        await db.from('booking_tokens').update({
            booked: true,
            booked_slot: slotStart,
        }).eq('id', booking.id);

        // Update company's meetEventTitle and meetEventDate if company_id exists
        if (booking.company_id) {
            await db.from('companies').update({
                meet_event_title: booking.event_title,
                meet_event_date: slotStart,
            }).eq('id', booking.company_id);
        }

        return NextResponse.json({
            success: true,
            meetLink: meetLink || null,
            eventLink: event.data.htmlLink,
            start: slotStart,
            end: slotEnd,
        });
    } catch (err) {
        const msg = (err as Error).message || '';
        console.error('[calendar/book] error:', msg);
        if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
            await db.from('google_tokens').delete().eq('user_id', userId);
            return NextResponse.json({
                error: 'The host needs to reconnect their Google account before this booking can be confirmed.',
                code: 'host_reconnect_required',
            }, { status: 401 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
