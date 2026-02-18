import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';

export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated. Please connect your Google account.' },
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

        const oauth2Client = getAuthenticatedClient(accessToken, refreshToken);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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
        console.error('Error creating calendar event:', error);

        const err = error as { code?: number; message?: string };
        if (err.code === 401) {
            const response = NextResponse.json(
                { error: 'Google session expired. Please reconnect your account.' },
                { status: 401 }
            );
            response.cookies.delete('google_access_token');
            response.cookies.delete('google_connected');
            return response;
        }

        return NextResponse.json(
            { error: err.message || 'Failed to create calendar event' },
            { status: 500 }
        );
    }
}
