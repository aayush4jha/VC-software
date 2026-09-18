'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Paperclip, FileText, Plus, Check, Mail, ExternalLink } from 'lucide-react';
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
        } catch (e) {
            const msg = (e as Error).message;
            setError(/relation|does not exist|schema cache/i.test(msg)
                ? 'The deck report needs supabase/pitch-deck-report.sql applied in the Supabase SQL editor.'
                : msg);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(days); }, [days, load]);

    const togglePref = async () => {
        setSavingPref(true);
        const next = !dailyEmail;
        const res = await fetch('/api/gmail/deck-report', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dailyEmail: next }),
        });
        if (res.ok) setDailyEmail(next);
        setSavingPref(false);
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
                <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={dailyEmail} onChange={togglePref} disabled={savingPref} />
                    <Mail size={12} /> Email me this report every morning
                </label>
            </div>

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
