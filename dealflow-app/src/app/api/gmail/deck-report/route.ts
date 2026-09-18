import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { scanInboxForPitches, loadDeckReport } from '@/lib/server/deck-report';

// Scanning a month of mail is a few hundred Gmail reads.
export const maxDuration = 60;

const RANGES: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90 };

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/**
 * GET ?days=1|7|30|90 — the caller's own report: companies that sent THEM a
 * pitch deck or investment email. Scans their inbox for anything not yet seen,
 * then reads the report. Always the signed-in user's inbox, never anyone else's.
 */
export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const days = RANGES[new URL(request.url).searchParams.get('days') || '7'] ?? 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const scan = await scanInboxForPitches(client, user.id, since);
    if (scan.error) {
        const status = scan.error.includes('not connected') ? 401 : 500;
        return NextResponse.json({ error: scan.error }, { status });
    }
    const groups = await loadDeckReport(client, user.id, since);
    const { data: pref } = await client.from('user_report_prefs')
        .select('daily_deck_report').eq('user_id', user.id).maybeSingle();

    return NextResponse.json({
        days,
        groups,
        scanned: scan.scanned,
        truncated: scan.truncated,
        dailyEmail: pref?.daily_deck_report ?? true,
    });
}

/** POST { dailyEmail: boolean } — switch the morning email on or off. */
export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { dailyEmail } = await request.json();
    if (typeof dailyEmail !== 'boolean') return NextResponse.json({ error: 'dailyEmail must be true or false' }, { status: 400 });
    const { error } = await client.from('user_report_prefs').upsert({
        user_id: user.id, daily_deck_report: dailyEmail, updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ dailyEmail });
}
