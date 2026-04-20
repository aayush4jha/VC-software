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
        // Final conflict check — re-query freebusy right before creating the event
        // so a slot that just got booked by someone else is rejected cleanly
        const freebusy = await calendar.freebusy.query({
            requestBody: {
                timeMin: slotStart,
                timeMax: slotEnd,
                timeZone: 'Asia/Kolkata',
                items: [{ id: 'primary' }],
            },
        });
        const busy = freebusy.data.calendars?.primary?.busy || [];
        if (busy.length > 0) {
            return NextResponse.json({
                error: 'This slot was just booked by someone else. Please pick another time.',
                code: 'slot_taken',
            }, { status: 409 });
        }

        const extraGuests: string[] = Array.isArray(booking.additional_guests)
            ? (booking.additional_guests as unknown[]).filter((g): g is string => typeof g === 'string')
            : [];

        const description = [
            `Meeting with ${booking.attendee_name}${booking.company_name ? ` from ${booking.company_name}` : ''}.`,
            '',
            `Attendee: ${booking.attendee_name} <${booking.attendee_email}>`,
            booking.host_name ? `Host: ${booking.host_name} <${booking.host_email}>` : `Host: ${booking.host_email}`,
            extraGuests.length > 0 ? `Additional guests: ${extraGuests.join(', ')}` : '',
            `Duration: ${booking.duration_minutes || 30} minutes`,
            '',
            'Booked via Dholakia Ventures scheduling link.',
        ].filter(Boolean).join('\n');

        const attendees = [
            { email: booking.attendee_email, displayName: booking.attendee_name },
            { email: booking.host_email, self: true },
            ...extraGuests.map(email => ({ email })),
        ];

        const event = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            sendUpdates: 'all',
            requestBody: {
                summary: booking.event_title,
                description,
                start: { dateTime: slotStart, timeZone: 'Asia/Kolkata' },
                end: { dateTime: slotEnd, timeZone: 'Asia/Kolkata' },
                attendees,
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

        // Mark token as booked, including the Meet link so the dashboard can
        // render a Join button. Retry without the optional columns if the
        // admin hasn't run the migration yet.
        const fullUpdate: Record<string, unknown> = {
            booked: true,
            booked_slot: slotStart,
            meet_link: meetLink || null,
            event_link: event.data.htmlLink || null,
        };
        let { error: updateErr } = await db.from('booking_tokens').update(fullUpdate).eq('id', booking.id);
        if (updateErr && /column|schema cache/i.test(updateErr.message) && /(meet_link|event_link)/i.test(updateErr.message)) {
            ({ error: updateErr } = await db.from('booking_tokens').update({
                booked: true,
                booked_slot: slotStart,
            }).eq('id', booking.id));
        }
        if (updateErr) console.error('[calendar/book] booking update failed:', updateErr.message);

        // Log for admin audit trail so it's visible in the activity feed
        const slotLocal = new Date(slotStart).toLocaleString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Asia/Kolkata',
        });
        await db.from('activity_logs').insert({
            company_id: booking.company_id || null,
            user_id: userId,
            action: 'slot_booked',
            details: `${booking.attendee_name || booking.attendee_email} booked "${booking.event_title}" for ${slotLocal} IST`,
        }).then(({ error }) => {
            if (error) console.error('[calendar/book] activity log failed:', error.message);
        });

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
