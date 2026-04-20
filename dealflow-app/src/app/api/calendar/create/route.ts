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
        const { title, date, time, durationMinutes, attendeeEmail, attendeeName, notes, hostEmail } = await request.json();

        if (!title || !date || !time || !attendeeEmail) {
            return NextResponse.json(
                { error: 'Missing required fields: title, date, time, attendeeEmail' },
                { status: 400 }
            );
        }

        const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });

        const duration = durationMinutes || 30;
        const startDateTime = `${date}T${time}:00`;
        const startDate = new Date(startDateTime);
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
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
