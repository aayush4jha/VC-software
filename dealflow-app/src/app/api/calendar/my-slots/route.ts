import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

// Returns the signed-in host's own free slots over the next 7 weekdays,
// so the Calendar Invite modal can show a pick-list before sending a booking link.
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const durationParam = new URL(request.url).searchParams.get('duration');
    const duration = Math.max(15, Math.min(120, parseInt(durationParam || '30', 10) || 30));

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) {
        return NextResponse.json({
            error: 'Connect your Google account to load your availability.',
            code: 'reconnect_required',
        }, { status: 401 });
    }

    const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });

    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    timeMin.setDate(timeMin.getDate() + 1); // start from tomorrow
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 7);

    try {
        const freeBusyRes = await calendar.freebusy.query({
            requestBody: {
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                timeZone: 'Asia/Kolkata',
                items: [{ id: 'primary' }],
            },
        });
        const busy = freeBusyRes.data.calendars?.primary?.busy || [];

        const slots: { start: string; end: string; date: string; time: string }[] = [];
        const startHour = 9;
        const endHour = 19;

        for (let day = 0; day < 7; day++) {
            const date = new Date(timeMin);
            date.setDate(date.getDate() + day);
            const dow = date.getDay();
            if (dow === 0 || dow === 6) continue;

            for (let hour = startHour; hour < endHour; hour++) {
                for (let min = 0; min < 60; min += duration) {
                    const slotStart = new Date(date);
                    slotStart.setHours(hour, min, 0, 0);
                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + duration);
                    if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > 0)) continue;

                    const conflicts = busy.some(b => {
                        const bs = new Date(b.start!);
                        const be = new Date(b.end!);
                        return slotStart < be && slotEnd > bs;
                    });
                    if (conflicts) continue;

                    slots.push({
                        start: slotStart.toISOString(),
                        end: slotEnd.toISOString(),
                        date: slotStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
                        time: slotStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
                    });
                }
            }
        }

        return NextResponse.json({ slots, duration });
    } catch (err) {
        const msg = (err as Error).message || '';
        console.error('[calendar/my-slots] error:', msg);
        if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
            return NextResponse.json({
                error: 'Your Google connection expired. Please reconnect.',
                code: 'reconnect_required',
            }, { status: 401 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
