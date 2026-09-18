import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { runDebtReminders } from '@/lib/server/debt-reminders';
import { runDailyDeckReports } from '@/lib/server/deck-report';
import { todayIST } from '@/lib/server/debt';

// Everyone's inbox is scanned in one run.
export const maxDuration = 300;

/**
 * The morning job, run by Vercel Cron (vercel.json): repayment reminders to
 * borrowers, then each person's pitch-deck report.
 *
 * Reachable without a session (Vercel has none), so it authenticates itself:
 * Vercel sends "Authorization: Bearer $CRON_SECRET". With CRON_SECRET unset
 * the route refuses everything — an open endpoint that emails borrowers is
 * worse than a job that does not run.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
    }
    const given = Buffer.from(request.headers.get('authorization') || '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    const db = createServiceClient(url, key);

    // Independent: a failure in one must not stop the other.
    const [debt, decks] = await Promise.allSettled([
        runDebtReminders(db),
        runDailyDeckReports(db, todayIST()),
    ]);
    const summary = {
        date: todayIST(),
        debtReminders: debt.status === 'fulfilled' ? debt.value : { error: String(debt.reason) },
        deckReports: decks.status === 'fulfilled' ? decks.value : { error: String(decks.reason) },
    };
    console.log('[cron/daily]', JSON.stringify(summary));
    return NextResponse.json(summary);
}
