'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Paperclip, FileText, Plus, Check, Mail, ExternalLink, Send, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/context';
import type { DeckReportGroup } from '@/lib/deck-report';

const RANGES = [
    { days: 1, label: 'Today' },
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
];

function fmtWhen(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days === 0) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * The signed-in person's own pitch-deck report: every company that sent THEM a
 * deck or an investment email, grouped by company (spellings and co-founders
 * folded together), and whether each is already on the platform.
 */
export default function DeckReport() {
    const router = useRouter();
    const { companies, setSelectedCompany, refreshData } = useAppContext();
    const [days, setDays] = useState(7);
    const [groups, setGroups] = useState<DeckReportGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [dailyEmail, setDailyEmail] = useState(true);
    const [savingPref, setSavingPref] = useState(false);
    const [schedule, setSchedule] = useState<{ ready: boolean; lastSentOn: string | null }>({ ready: true, lastSentOn: null });
    const [prefError, setPrefError] = useState<string | null>(null);
    const [sendingNow, setSendingNow] = useState(false);
    const [sendNote, setSendNote] = useState<string | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const [added, setAdded] = useState<Record<string, string>>({});

    const load = useCallback(async (range: number) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/gmail/deck-report?days=${range}`);
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Could not build the report');
            setGroups(j.groups || []);
            setTruncated(!!j.truncated);
            setDailyEmail(j.dailyEmail !== false);
            setSchedule({ ready: j.scheduleReady !== false, lastSentOn: j.lastSentOn ?? null });
        } catch (e) {
            const msg = (e as Error).message;
            setError(/relation|does not exist|schema cache/i.test(msg)
                ? 'The deck report needs supabase/pitch-deck-report.sql applied in the Supabase SQL editor.'
                : msg);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(days); }, [days, load]);

    // The checkbox used to snap back in silence when the save failed, which
    // is indistinguishable from the feature being broken. It now says why.
    const togglePref = async () => {
        setSavingPref(true); setPrefError(null);
        const next = !dailyEmail;
        try {
            const res = await fetch('/api/gmail/deck-report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dailyEmail: next }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || `the server returned ${res.status}`);
            setDailyEmail(next);
        } catch (e) {
            setPrefError(`Could not save that: ${(e as Error).message}`);
        }
        setSavingPref(false);
    };

    // Sends today's report immediately, through the same code the morning job
    // uses — the only way to see that it works without waiting for tomorrow.
    const sendNow = async () => {
        setSendingNow(true); setSendNote(null); setPrefError(null);
        try {
            const res = await fetch('/api/gmail/deck-report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sendNow: true }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || `the server returned ${res.status}`);
            setSendNote(j.note || 'Sent to your inbox.');
        } catch (e) {
            setPrefError(`Could not send it: ${(e as Error).message}`);
        }
        setSendingNow(false);
    };

    const openCompany = (id: string) => {
        const c = companies.find(x => x.id === id);
        if (!c) return;
        setSelectedCompany(c);
        router.push(c.terminalStatus === 'Portfolio' ? '/portfolio' : '/dealflow');
    };

    // Files the newest email with a deck (or the newest email) through the same
    // path as "Send to Kanban" — which also refuses to create a duplicate.
    const addToPipeline = async (g: DeckReportGroup) => {
        const email = g.emails.find(e => e.hasDeck) || g.emails[0];
        const sender = g.senders[0];
        if (!email || !sender) return;
        setAdding(g.companyName);
        try {
            const res = await fetch('/api/gmail/send-to-kanban', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gmailMessageId: email.messageId,
                    senderName: sender.name,
                    senderEmail: sender.email,
                    subject: email.subject,
                    receivedAt: email.receivedAt,
                    hasAttachments: email.attachments.length > 0,
                    attachmentNames: email.attachments,
                    hasPitchDeck: email.hasDeck,
                    relevanceLabel: email.hasDeck ? 'Startup Pitch' : 'Funding Relevant',
                    derivedCompanyName: g.companyName,
                }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Could not add');
            setAdded(prev => ({ ...prev, [g.companyName]: j.matchedExisting ? `Filed under ${j.company.companyName}` : 'Added to Deal Flow' }));
            await refreshData?.();
        } catch (e) {
            setAdded(prev => ({ ...prev, [g.companyName]: `Failed: ${(e as Error).message}` }));
        }
        setAdding(null);
    };

    const totalDecks = groups.reduce((s, g) => s + g.deckCount, 0);
    const newCount = groups.filter(g => !g.onPlatform).length;

    // How many decks arrived on each of the last days in the range — the
    // "how many did we get today?" question, answered for every day at once.
    const perDay = (() => {
        const counts = new Map<string, number>();
        for (const g of groups) {
            for (const e of g.emails) {
                if (!e.hasDeck || !e.receivedAt) continue;
                const day = new Date(e.receivedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                counts.set(day, (counts.get(day) ?? 0) + 1);
            }
        }
        const out: { day: string; count: number }[] = [];
        const span = Math.min(days, 30);     // a year of bars is unreadable
        for (let i = span - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86_400_000);
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            out.push({ day: key, count: counts.get(key) ?? 0 });
        }
        return out;
    })();
    const perDayMax = Math.max(1, ...perDay.map(d => d.count));

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
                    {RANGES.map(r => (
                        <button
                            key={r.days}
                            onClick={() => setDays(r.days)}
                            style={{
                                padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
                                borderRadius: 4, fontFamily: 'var(--font-sans)',
                                background: days === r.days ? 'var(--bg-secondary)' : 'transparent',
                                color: days === r.days ? 'var(--primary)' : 'var(--text-secondary)',
                                boxShadow: days === r.days ? 'var(--shadow-sm)' : 'none',
                            }}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => load(days)} disabled={loading} title="Rescan">
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={dailyEmail} onChange={togglePref} disabled={savingPref} />
                        <Mail size={12} /> Email me this report every morning
                    </label>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={sendNow} disabled={sendingNow}>
                        {sendingNow
                            ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
                            : <><Send size={11} /> Send it to me now</>}
                    </button>
                </div>
            </div>

            {/* What the schedule is actually doing */}
            {dailyEmail && !schedule.ready && (
                <div style={{
                    display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                    <AlertCircle size={15} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                    <span>
                        The morning send is switched on, but the scheduled job cannot run on this deployment:
                        the <code>CRON_SECRET</code> environment variable is not set, so{' '}
                        <code>/api/cron/daily</code> refuses every request. Set it in the hosting project&apos;s
                        environment variables and redeploy. Until then, &ldquo;Send it to me now&rdquo; works.
                    </span>
                </div>
            )}
            {dailyEmail && schedule.ready && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                    {schedule.lastSentOn
                        ? `Last sent ${new Date(`${schedule.lastSentOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Next at 9:00 am IST.`
                        : 'Scheduled for 9:00 am IST. Nothing has been sent yet.'}
                </div>
            )}
            {sendNote && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
                    marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#047857',
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                }}>
                    <Check size={14} /> {sendNote}
                </div>
            )}
            {prefError && (
                <div style={{
                    display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                    fontSize: 12, color: 'var(--danger, #b91c1c)',
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {prefError}
                </div>
            )}

            {/* Summary */}
            {!loading && !error && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'Companies', value: groups.length },
                        { label: 'Pitch decks', value: totalDecks },
                        { label: 'Not yet on the platform', value: newCount, accent: newCount > 0 },
                    ].map(t => (
                        <div key={t.label} style={{
                            padding: '12px 14px', borderRadius: 10,
                            border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                        }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: t.accent ? '#b45309' : 'var(--text-primary)' }}>{t.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Decks a day */}
            {!loading && !error && perDay.length > 1 && (
                <div style={{
                    padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                    border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                        Pitch decks a day{days > 30 ? ' (last 30 days)' : ''} · {perDay.reduce((s, d) => s + d.count, 0)} in total
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54 }}>
                        {perDay.map(d => (
                            <div
                                key={d.day}
                                title={`${new Date(`${d.day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${d.count} deck${d.count === 1 ? '' : 's'}`}
                                style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
                            >
                                <div style={{
                                    height: `${Math.max(d.count === 0 ? 2 : 8, (d.count / perDayMax) * 100)}%`,
                                    background: d.count === 0 ? 'var(--border-light)' : '#4f46e5',
                                    borderRadius: 3,
                                }} />
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        <span>{new Date(`${perDay[0].day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        <span>Today · {perDay[perDay.length - 1].count}</span>
                    </div>
                </div>
            )}

            {truncated && !loading && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                    Large range — the newest 200 candidate emails were read. Rescan to continue further back.
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-tertiary)', padding: 24 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Reading your inbox…
                </div>
            ) : error ? (
                <div style={{ fontSize: 13, color: 'var(--danger, #b91c1c)', padding: 12 }}>{error}</div>
            ) : groups.length === 0 ? (
                <div className="empty-state" style={{ height: 240 }}>
                    <div className="empty-state-icon"><FileText size={24} /></div>
                    <div className="empty-state-title">No pitch decks in this period</div>
                    <div className="empty-state-text">Decks and investment emails sent to your inbox appear here.</div>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr><th>Company</th><th>From</th><th>Decks & files</th><th>Latest</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            {groups.map(g => (
                                <tr key={`${g.companyName}-${g.emails[0]?.messageId}`}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{g.companyName}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            {g.emails.length} email{g.emails.length === 1 ? '' : 's'}
                                        </div>
                                    </td>
                                    <td style={{ fontSize: 12 }}>
                                        {g.senders.map(s => (
                                            <div key={s.email}>
                                                {s.name || s.email}
                                                {s.name && <span style={{ color: 'var(--text-tertiary)' }}> · {s.email}</span>}
                                            </div>
                                        ))}
                                    </td>
                                    <td style={{ fontSize: 12 }}>
                                        {g.emails.flatMap(e => e.attachments.map(a => ({ a, id: e.messageId }))).slice(0, 4).map(({ a, id }) => (
                                            <a key={`${id}-${a}`} target="_blank" rel="noreferrer"
                                                href={`/api/gmail/attachment?messageId=${encodeURIComponent(id)}&filename=${encodeURIComponent(a)}`}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', textDecoration: 'none' }}>
                                                <Paperclip size={11} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{a}</span>
                                            </a>
                                        ))}
                                        {g.emails.every(e => e.attachments.length === 0) && (
                                            <span style={{ color: 'var(--text-tertiary)' }}>{g.emails[0]?.subject}</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtWhen(g.lastReceived)}</td>
                                    <td style={{ fontSize: 12 }}>
                                        {g.onPlatform ? (
                                            <button onClick={() => openCompany(g.onPlatform!.id)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#047857', fontSize: 12 }}>
                                                <Check size={12} /> {g.onPlatform.where} <ExternalLink size={10} />
                                            </button>
                                        ) : added[g.companyName] ? (
                                            <span style={{ color: added[g.companyName].startsWith('Failed') ? 'var(--danger, #b91c1c)' : '#047857' }}>
                                                {added[g.companyName]}
                                            </span>
                                        ) : (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 600, color: '#b45309' }}>New</span>
                                                <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                                                    disabled={adding !== null} onClick={() => addToPipeline(g)}>
                                                    {adding === g.companyName
                                                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                                        : <Plus size={11} />} Add to Deal Flow
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
