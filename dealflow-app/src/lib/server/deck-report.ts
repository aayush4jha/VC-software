import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { companyNameFromDeckFilename, deriveCompanyName } from '@/lib/email-company';
import { buildDeckReport, type DeckReportGroup, type PitchEmailRow, type PlatformCompany } from '@/lib/deck-report';
import { REPLY_THRESHOLD_DAYS } from '@/lib/email-triage';
import { collectAttachments, extractSenderInfo, isDeckFile, type AttachmentPart } from './gmail-parse';
import { sendAsUser } from './gmail-send';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// What gets a message into the report. Deliberately narrower than the
// ingestion keyword list: that one runs on a dedicated pipeline inbox, this
// one on a person's own mailbox, where "investment" and "portfolio" mostly
// mean bank newsletters.
const PITCH_SIGNAL = /pitch|deck|fundrais|raising|seed round|pre-?seed|series [a-c]\b|investment opportunity|term sheet|investor presentation|funding round|startup/i;
const AUTOMATED_SENDER = /no-?reply|noreply|newsletter|notifications?@|mailer-daemon|updates@|digest/i;

// The Gmail-side filter: only pull messages that could be pitches at all.
const GMAIL_QUERY = '(filename:pdf OR filename:ppt OR filename:pptx OR filename:key OR "pitch deck" OR pitch OR fundraising OR raising OR "seed round" OR "pre-seed" OR "series a" OR "investment opportunity" OR "term sheet")';

const MAX_MESSAGES_PER_SCAN = 200;
const FETCH_CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            out[idx] = await fn(items[idx]);
        }
    }));
    return out;
}

/**
 * Looks through one person's inbox since `sinceMs` and records each candidate
 * message — pitch or not — so it is never downloaded twice. Returns how many
 * messages were newly examined and how many of those were pitches.
 */
export async function scanInboxForPitches(
    db: SupabaseClient,
    userId: string,
    sinceMs: number,
): Promise<{ scanned: number; pitches: number; truncated: boolean; error?: string }> {
    const auth = await getAuthenticatedClientForUser(userId);
    if (!auth) return { scanned: 0, pitches: 0, truncated: false, error: 'Google account not connected' };
    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });

    let ownAddress = '';
    try {
        ownAddress = ((await gmail.users.getProfile({ userId: 'me' })).data.emailAddress || '').toLowerCase();
    } catch { /* only used to skip mail sent to oneself */ }

    const after = Math.floor(sinceMs / 1000);
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
        const res = await gmail.users.messages.list({
            userId: 'me', q: `in:inbox after:${after} ${GMAIL_QUERY}`, maxResults: 100, pageToken,
        });
        for (const m of res.data.messages || []) if (m.id) ids.push(m.id);
        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken && ids.length < MAX_MESSAGES_PER_SCAN);
    const truncated = ids.length >= MAX_MESSAGES_PER_SCAN;
    if (ids.length === 0) return { scanned: 0, pitches: 0, truncated: false };

    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db.from('inbox_pitch_emails')
            .select('gmail_message_id').eq('user_id', userId).in('gmail_message_id', ids.slice(i, i + 100));
        (data || []).forEach((r: { gmail_message_id: string }) => seen.add(r.gmail_message_id));
    }
    const fresh = ids.slice(0, MAX_MESSAGES_PER_SCAN).filter(id => !seen.has(id));

    const rows = (await mapLimit(fresh, FETCH_CONCURRENCY, async id => {
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
            const headers = msg.data.payload?.headers || [];
            const header = (n: string) => headers.find(h => (h.name || '').toLowerCase() === n.toLowerCase())?.value || '';
            const { name: senderName, email: senderEmail } = extractSenderInfo(header('From'));
            const subject = header('Subject') || '(No Subject)';
            const snippet = msg.data.snippet || '';
            const dateHeader = header('Date');
            const receivedAt = msg.data.internalDate
                ? new Date(Number(msg.data.internalDate)).toISOString()
                : dateHeader ? new Date(dateHeader).toISOString() : null;

            const attachments = collectAttachments(msg.data.payload as AttachmentPart);
            const decks = attachments.filter(a => isDeckFile(a.filename));
            const hasDeck = decks.length > 0;
            const fileNamed = decks.map(d => companyNameFromDeckFilename(d.filename)).find(Boolean) || null;

            const text = `${subject} ${snippet} ${decks.map(d => d.filename).join(' ')}`;
            const signal = PITCH_SIGNAL.test(text);
            const automated = AUTOMATED_SENDER.test(senderEmail) || !!header('List-Unsubscribe');
            const fromSelf = !!ownAddress && senderEmail.toLowerCase() === ownAddress;
            // A deck from a person, or a clearly-worded pitch email from a person.
            const isPitch = !fromSelf && !automated && (hasDeck ? (signal || !!fileNamed) : signal);

            return {
                organization_id: ORGANIZATION_ID,
                user_id: userId,
                gmail_message_id: id,
                gmail_thread_id: msg.data.threadId || null,
                sender_name: senderName,
                sender_email: senderEmail,
                subject,
                snippet: snippet.slice(0, 500),
                received_at: receivedAt,
                company_name: isPitch
                    ? deriveCompanyName({ aiName: fileNamed, senderName, senderEmail, subject })
                    : '',
                attachment_names: attachments.map(a => a.filename),
                has_pitch_deck: hasDeck,
                is_pitch: isPitch,
                relevance_label: isPitch ? (hasDeck ? 'Pitch Deck' : 'Investment Email') : null,
            };
        } catch {
            return null;   // one unreadable message must not sink the scan
        }
    })).filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
        const { error } = await db.from('inbox_pitch_emails')
            .upsert(rows, { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true });
        if (error) return { scanned: 0, pitches: 0, truncated, error: error.message };
    }
    return { scanned: rows.length, pitches: rows.filter(r => r.is_pitch).length, truncated };
}

/** The grouped report for one person over [sinceMs, now]. */
export async function loadDeckReport(db: SupabaseClient, userId: string, sinceMs: number): Promise<DeckReportGroup[]> {
    const { data: rows } = await db.from('inbox_pitch_emails')
        .select('gmail_message_id, sender_name, sender_email, subject, received_at, company_name, attachment_names, has_pitch_deck')
        .eq('user_id', userId).eq('is_pitch', true)
        .gte('received_at', new Date(sinceMs).toISOString())
        .order('received_at', { ascending: false })
        .limit(1000);
    const { data: companies } = await db.from('companies')
        .select('id, company_name, founder_email, terminal_status, pipeline_stage_id')
        .eq('organization_id', ORGANIZATION_ID);
    const { data: stages } = await db.from('pipeline_stages').select('id, name').eq('organization_id', ORGANIZATION_ID);
    const stageNames = Object.fromEntries((stages || []).map((s: { id: string; name: string }) => [s.id, s.name]));
    return buildDeckReport((rows || []) as PitchEmailRow[], (companies || []) as PlatformCompany[], stageNames);
}

/**
 * Pitch emails nobody has replied to, oldest first.
 *
 * A thread that contains anything we sent counts as answered. That is read
 * from the sent-mail LIST, which carries thread ids without fetching a single
 * message — the cheap way to ask "did we get back to them?".
 */
export async function findUnanswered(
    db: SupabaseClient,
    userId: string,
    minDaysWaiting: number,
    sinceMs: number,
): Promise<{ companyName: string; senderEmail: string; subject: string; daysWaiting: number; messageId: string }[]> {
    const auth = await getAuthenticatedClientForUser(userId);
    if (!auth) return [];
    const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });

    const repliedThreads = new Set<string>();
    try {
        let pageToken: string | undefined;
        do {
            const res = await gmail.users.messages.list({
                userId: 'me', q: `in:sent after:${Math.floor(sinceMs / 1000)}`, maxResults: 200, pageToken,
            });
            for (const m of res.data.messages || []) if (m.threadId) repliedThreads.add(m.threadId);
            pageToken = res.data.nextPageToken || undefined;
        } while (pageToken && repliedThreads.size < 1000);
    } catch (err) {
        console.error('[deck-report] could not read sent mail:', (err as Error).message);
        return [];
    }

    const { data: rows } = await db.from('inbox_pitch_emails')
        .select('gmail_message_id, gmail_thread_id, sender_email, subject, received_at, company_name')
        .eq('user_id', userId).eq('is_pitch', true)
        .gte('received_at', new Date(sinceMs).toISOString())
        .order('received_at', { ascending: true }).limit(500);

    const now = Date.now();
    const out: { companyName: string; senderEmail: string; subject: string; daysWaiting: number; messageId: string }[] = [];
    const seenThreads = new Set<string>();
    for (const r of rows || []) {
        const thread = r.gmail_thread_id || r.gmail_message_id;
        if (!thread || repliedThreads.has(thread) || seenThreads.has(thread)) continue;
        const received = r.received_at ? new Date(r.received_at).getTime() : NaN;
        if (isNaN(received)) continue;
        const daysWaiting = Math.floor((now - received) / 86_400_000);
        if (daysWaiting < minDaysWaiting) continue;
        seenThreads.add(thread);
        out.push({
            companyName: r.company_name || r.sender_email,
            senderEmail: r.sender_email,
            subject: r.subject,
            daysWaiting,
            messageId: r.gmail_message_id,
        });
    }
    return out.sort((a, b) => b.daysWaiting - a.daysWaiting);
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function deckReportEmail(
    groups: DeckReportGroup[],
    dateLabel: string,
    appUrl: string | null,
    unanswered: { companyName: string; senderEmail: string; subject: string; daysWaiting: number }[] = [],
) {
    const decks = groups.reduce((s, g) => s + g.deckCount, 0);
    const fresh = groups.filter(g => !g.onPlatform).length;
    const subject = unanswered.length > 0
        ? `${unanswered.length} founder${unanswered.length === 1 ? '' : 's'} waiting on a reply · ${groups.length} new — ${dateLabel}`
        : `Your pitch deck report — ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'}, ${dateLabel}`;
    const lines = groups.map(g => {
        const who = g.senders.map(s => s.name || s.email).join(', ');
        const files = g.emails.flatMap(e => e.attachments).filter(Boolean).join(', ');
        return `• ${g.companyName} — from ${who}${files ? ` — ${files}` : ''} — ${g.onPlatform ? `already on platform (${g.onPlatform.where})` : 'NEW'}`;
    });
    const link = appUrl ? `${appUrl.replace(/\/$/, '')}/emails?view=decks` : null;
    const chaseText = unanswered.length === 0 ? [] : [
        '',
        `WAITING ON YOU (${unanswered.length}) — the reply window is ${REPLY_THRESHOLD_DAYS} days:`,
        ...unanswered.map(u => `• ${u.companyName} — ${u.daysWaiting} days — "${u.subject}" — ${u.senderEmail}`),
    ];
    const text = [
        `Pitch decks and investment emails received in your inbox — ${dateLabel}.`,
        `${groups.length} compan${groups.length === 1 ? 'y' : 'ies'}, ${decks} deck${decks === 1 ? '' : 's'}, ${fresh} not yet on the platform.`,
        '',
        ...lines,
        ...chaseText,
        '',
        link ? `Open the full report: ${link}` : 'Open the Email Workspace for the full report.',
    ].join('\n');
    const rowsHtml = groups.map(g => `<tr>
<td style="padding:8px;border-bottom:1px solid #eee"><b>${escapeHtml(g.companyName)}</b></td>
<td style="padding:8px;border-bottom:1px solid #eee;color:#555">${escapeHtml(g.senders.map(s => s.name ? `${s.name} <${s.email}>` : s.email).join(', '))}</td>
<td style="padding:8px;border-bottom:1px solid #eee;color:#555">${escapeHtml(g.emails.flatMap(e => e.attachments).join(', ') || '—')}</td>
<td style="padding:8px;border-bottom:1px solid #eee">${g.onPlatform
        ? `<span style="color:#047857">On platform · ${escapeHtml(g.onPlatform.where)}</span>`
        : '<span style="color:#b45309;font-weight:600">New</span>'}</td>
</tr>`).join('\n');
    const html = `<div style="font-family:sans-serif;font-size:14px;color:#111">
<p>Pitch decks and investment emails received in your inbox — <b>${escapeHtml(dateLabel)}</b>.</p>
<p>${groups.length} compan${groups.length === 1 ? 'y' : 'ies'} · ${decks} deck${decks === 1 ? '' : 's'} · <b>${fresh} not yet on the platform</b></p>
<table style="border-collapse:collapse;width:100%">
<tr style="text-align:left;color:#666;font-size:12px"><th style="padding:8px">Company</th><th style="padding:8px">From</th><th style="padding:8px">Attachments</th><th style="padding:8px">Status</th></tr>
${rowsHtml}
</table>
${unanswered.length === 0 ? '' : `<h3 style="margin:18px 0 6px;font-size:15px">Waiting on you (${unanswered.length})</h3>
<p style="margin:0 0 8px;color:#666;font-size:12px">Founders who wrote and have had no reply. The window is ${REPLY_THRESHOLD_DAYS} days.</p>
<table style="border-collapse:collapse;width:100%">
${unanswered.map(u => `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #eee"><b>${escapeHtml(u.companyName)}</b><br><span style="color:#666;font-size:12px">${escapeHtml(u.subject)}</span></td>
<td style="padding:6px 8px;border-bottom:1px solid #eee;color:${u.daysWaiting >= REPLY_THRESHOLD_DAYS ? '#b91c1c' : '#b45309'};font-weight:600;white-space:nowrap">${u.daysWaiting} days</td>
</tr>`).join('\n')}
</table>`}
${link ? `<p><a href="${escapeHtml(link)}">Open the full report</a></p>` : ''}
<p style="color:#888;font-size:12px">You receive this because your Gmail is connected to Dholakia Ventures. Turn it off from the Deck Report in the Email Workspace.</p>
</div>`;
    return { subject, text, html };
}

/**
 * The morning run: for everyone with Gmail connected and the report switched
 * on, scan the last day and email them their own report. At most once a day
 * per person (last_report_sent_on), and nothing is sent on a day with no pitches.
 */
/**
 * One person's report, scanned and emailed to them.
 *
 * The morning job and the "Send it to me now" button both go through here, so
 * what arrives on demand is exactly what arrives at 9am — there is no second
 * implementation to drift.
 *
 * `force` is the difference between the two: the scheduled run stays quiet on
 * a day with nothing in it, while an on-demand send always produces an email,
 * because an email that does not arrive is indistinguishable from a feature
 * that does not work.
 */
export async function sendDeckReportTo(
    db: SupabaseClient,
    userId: string,
    options: { sinceMs?: number; force?: boolean } = {},
): Promise<{ ok: boolean; note?: string; error?: string; sent?: boolean }> {
    const { sinceMs = Date.now() - 24 * 60 * 60 * 1000, force = false } = options;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);

    // A little overlap, so a message that arrived during the last run is not
    // lost at the boundary.
    const scan = await scanInboxForPitches(db, userId, sinceMs - 2 * 60 * 60 * 1000);
    if (scan.error) return { ok: false, error: scan.error };

    const groups = await loadDeckReport(db, userId, sinceMs);
    const unanswered = await findUnanswered(
        db, userId, REPLY_THRESHOLD_DAYS, Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    if (groups.length === 0 && unanswered.length === 0 && !force) {
        return { ok: true, sent: false, note: 'Nothing new to report.' };
    }

    const dateLabel = new Date().toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    const mail = deckReportEmail(groups, dateLabel, appUrl, unanswered);
    const sent = await sendAsUser(userId, { to: 'self', ...mail });
    if (!sent.ok) return { ok: false, error: sent.error };

    const decks = groups.reduce((n, g) => n + g.deckCount, 0);
    return {
        ok: true,
        sent: true,
        note: `Sent to your inbox — ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'}, `
            + `${decks} deck${decks === 1 ? '' : 's'}`
            + (unanswered.length > 0 ? `, ${unanswered.length} awaiting a reply` : '')
            + '.',
    };
}

export async function runDailyDeckReports(db: SupabaseClient, todayIST: string): Promise<{
    users: number; sent: number; empty: number; skipped: number; errors: string[];
}> {
    const result = { users: 0, sent: 0, empty: 0, skipped: 0, errors: [] as string[] };
    const { data: tokens, error } = await db.from('google_tokens').select('user_id');
    if (error) { result.errors.push(`google_tokens: ${error.message}`); return result; }
    const { data: prefs, error: prefErr } = await db.from('user_report_prefs').select('*');
    if (prefErr) { result.errors.push(`user_report_prefs: ${prefErr.message}`); return result; }
    const prefBy = new Map((prefs || []).map((p: { user_id: string; daily_deck_report: boolean; last_report_sent_on: string | null }) => [p.user_id, p]));

    for (const { user_id: userId } of (tokens || []) as { user_id: string }[]) {
        result.users++;
        const pref = prefBy.get(userId);
        if (pref && (!pref.daily_deck_report || pref.last_report_sent_on === todayIST)) { result.skipped++; continue; }
        try {
            const outcome = await sendDeckReportTo(db, userId);
            if (!outcome.ok) { result.errors.push(`${userId}: ${outcome.error}`); continue; }
            if (outcome.sent) result.sent++; else result.empty++;

            await db.from('user_report_prefs').upsert({
                user_id: userId,
                daily_deck_report: pref?.daily_deck_report ?? true,
                last_report_sent_on: todayIST,
                updated_at: new Date().toISOString(),
            });
        } catch (err) {
            result.errors.push(`${userId}: ${(err as Error).message}`);
        }
    }
    return result;
}
