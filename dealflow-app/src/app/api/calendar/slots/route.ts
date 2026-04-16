import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const userId = url.searchParams.get('userId');

    if (!token || !userId) {
        return NextResponse.json({ error: 'Missing token or userId' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Validate the booking token
    const { data: booking } = await db
        .from('booking_tokens')
        .select('*')
        .eq('token', token)
        .eq('user_id', userId)
        .single();

    if (!booking) {
        return NextResponse.json({ error: 'Invalid or expired booking link' }, { status: 404 });
    }

    // Get authenticated Google client for the host user
    const authResult = await getAuthenticatedClientForUser(userId);
    if (!authResult) {
        return NextResponse.json({
            error: 'The host needs to reconnect their Google account before you can pick a slot. Please let them know.',
            code: 'host_reconnect_required',
        }, { status: 401 });
    }

    const calendar = google.calendar({ version: 'v3', auth: authResult.oauth2Client });
    const duration = booking.duration_minutes || 30;

    // Fetch free/busy for next 7 days
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

        const busySlots = freeBusyRes.data.calendars?.primary?.busy || [];

        // Generate available slots (9 AM to 7 PM IST, in duration-minute increments)
        const slots: { start: string; end: string; date: string; time: string }[] = [];
        const startHour = 9;
        const endHour = 19; // 7 PM

        for (let day = 0; day < 7; day++) {
            const date = new Date(timeMin);
            date.setDate(date.getDate() + day);

            // Skip weekends
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            for (let hour = startHour; hour < endHour; hour++) {
                for (let min = 0; min < 60; min += duration) {
                    if (hour === endHour - 1 && min + duration > 60) continue;

                    const slotStart = new Date(date);
                    slotStart.setHours(hour, min, 0, 0);

                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + duration);

                    if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > 0)) continue;

                    // Check if slot conflicts with any busy period
                    const conflicts = busySlots.some(busy => {
                        const busyStart = new Date(busy.start!);
                        const busyEnd = new Date(busy.end!);
                        return slotStart < busyEnd && slotEnd > busyStart;
                    });

                    if (!conflicts) {
                        slots.push({
                            start: slotStart.toISOString(),
                            end: slotEnd.toISOString(),
                            date: slotStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
                            time: slotStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
                        });
                    }
                }
            }
        }

        return NextResponse.json({
            slots,
            companyName: booking.company_name,
            hostName: booking.host_name,
            duration,
        });
    } catch (err) {
        const msg = (err as Error).message || '';
        console.error('[calendar/slots] error:', msg);
        if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
            // Host tokens are stale — clear them so they're forced to reconnect
            await db.from('google_tokens').delete().eq('user_id', userId);
            return NextResponse.json({
                error: 'The host needs to reconnect their Google account before you can pick a slot. Please let them know.',
                code: 'host_reconnect_required',
            }, { status: 401 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
