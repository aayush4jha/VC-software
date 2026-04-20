import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json(
            { error: 'Not authenticated. Please sign in.' },
            { status: 401 }
        );
    }

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) {
        return NextResponse.json(
            { error: 'Google account not connected. Please connect your Google account.', code: 'reconnect_required' },
            { status: 401 }
        );
    }

    try {
        const { title, startISO, durationMinutes, attendeeEmail, attendeeName, notes, hostEmail, hostName, companyId, companyName } = await request.json();

        if (!title || !startISO || !attendeeEmail) {
            return NextResponse.json(
                { error: 'Missing required fields: title, startISO, attendeeEmail' },
                { status: 400 }
            );
        }

        const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });

        const duration = durationMinutes || 30;
        const startDate = new Date(startISO);
        if (Number.isNaN(startDate.getTime())) {
            return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });
        }
        const endDate = new Date(startDate.getTime() + duration * 60000);

        const event = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1, // Required for Google Meet
            sendUpdates: 'all', // Send invite emails to attendees
            requestBody: {
                summary: title,
                description: notes || `Meeting with ${attendeeName || attendeeEmail}`,
                start: {
                    dateTime: startDate.toISOString(),
                    timeZone: 'Asia/Kolkata',
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: 'Asia/Kolkata',
                },
                attendees: [
                    { email: attendeeEmail, displayName: attendeeName },
                    ...(hostEmail ? [{ email: hostEmail, self: true }] : []),
                ],
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet',
                        },
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

        // Extract Google Meet link from the response
        const meetLink = event.data.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === 'video'
        )?.uri;

        // Record the scheduled meeting in booking_tokens so the dashboard can
        // list it (we don't rely on the missing companies.meet_event_date column)
        try {
            const db = createServiceClient(supabaseUrl, serviceRoleKey);
            const token = crypto.randomUUID().replace(/-/g, '');
            const baseRow: Record<string, unknown> = {
                token,
                user_id: user.id,
                company_id: companyId || null,
                company_name: companyName || '',
                attendee_name: attendeeName || '',
                attendee_email: attendeeEmail,
                host_name: hostName || '',
                host_email: hostEmail || '',
                event_title: title,
                duration_minutes: duration,
                booked: true,
                booked_slot: startDate.toISOString(),
            };
            const fullRow = {
                ...baseRow,
                meet_link: meetLink || null,
                event_link: event.data.htmlLink || null,
            };
            let { error: insertErr } = await db.from('booking_tokens').insert(fullRow);
            if (insertErr && /column|schema cache/i.test(insertErr.message) && /(meet_link|event_link)/i.test(insertErr.message)) {
                // Columns not migrated yet — retry with legacy shape
                ({ error: insertErr } = await db.from('booking_tokens').insert(baseRow));
            }
            if (insertErr) {
                console.error('[calendar/create] booking_tokens insert failed:', insertErr.message);
            }
        } catch (logErr) {
            console.error('[calendar/create] failed to persist scheduled meeting:', logErr);
        }

        return NextResponse.json({
            success: true,
            eventId: event.data.id,
            eventLink: event.data.htmlLink,
            meetLink: meetLink || null,
            start: event.data.start,
            end: event.data.end,
        });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        const msg = err.message || '';
        console.error('Error creating calendar event:', msg);

        if (err.code === 401 || msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
            // Host tokens are stale — clear them so the next status check triggers a reconnect
            try {
                const db = createServiceClient(supabaseUrl, serviceRoleKey);
                await db.from('google_tokens').delete().eq('user_id', user.id);
            } catch { /* best-effort cleanup */ }
            return NextResponse.json(
                { error: 'Google session expired. Please reconnect your account.', code: 'reconnect_required' },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: msg || 'Failed to create calendar event' },
            { status: 500 }
        );
    }
}
