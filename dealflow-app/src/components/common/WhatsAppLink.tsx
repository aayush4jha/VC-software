'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus, Trash2, Check, X, AlertTriangle } from 'lucide-react';

interface LinkedNumber { id: string; phone: string; created_at: string }

function pretty(digits: string): string {
    if (digits.startsWith('91') && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    return `+${digits}`;
}

/**
 * Link your own phone to the WhatsApp bot. The bot acts only on messages from
 * linked numbers — its number is public, so this is what stops a stranger
 * adding companies — and a linked number is how it knows who sent a deal.
 */
export default function WhatsAppLink({ showSetupStatus }: { showSetupStatus?: boolean }) {
    const [numbers, setNumbers] = useState<LinkedNumber[]>([]);
    const [configured, setConfigured] = useState(true);
    const [missing, setMissing] = useState<string[]>([]);
    const [botNumber, setBotNumber] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchState = useCallback(async () => {
        const r = await fetch('/api/whatsapp/senders');
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchState().then(({ ok, j }) => {
            if (cancelled) return;
            if (!ok) { setError(j.error || 'Could not load'); setLoaded(true); return; }
            setNumbers(j.numbers || []);
            setConfigured(!!j.configured);
            setMissing(j.missingConfig || []);
            setBotNumber(j.botNumber || null);
            setUnavailable(j.unavailable || null);
            setLoaded(true);
        });
        return () => { cancelled = true; };
    }, [fetchState]);

    const add = async () => {
        setBusy(true); setError(null);
        const r = await fetch('/api/whatsapp/senders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: draft }),
        });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setError(j.error || 'Could not link the number'); return; }
        setNumbers(prev => [...prev, j.number]);
        setDraft(''); setAdding(false);
    };

    const remove = async (id: string) => {
        setBusy(true);
        const r = await fetch(`/api/whatsapp/senders?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        setBusy(false);
        if (r.ok) setNumbers(prev => prev.filter(n => n.id !== id));
    };

    if (!loaded) return <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>;

    return (
        <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <MessageCircle size={18} style={{ color: '#25D366' }} />
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>WhatsApp</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Forward a founder&apos;s deck or type a startup&apos;s details to the Dholakia Ventures bot on WhatsApp
                and it lands in Deal Flow — or is filed under the company if it is already on the platform.
                The bot only listens to numbers linked here.
            </p>

            {/* Whether the bot can actually be messaged yet — shown to everyone,
                not just admins: linking a number is useless while it cannot. */}
            {(unavailable || !configured) && (
                <div style={{
                    display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12,
                    border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)', color: '#92400e',
                }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                        {unavailable && <div>Needs <code>supabase/whatsapp.sql</code> applied in the Supabase SQL editor.</div>}
                        {!configured && (
                            <div>
                                <strong>The bot has no number yet</strong> — there is nothing to forward a deck to until
                                an admin finishes the WhatsApp setup. You can link your number now; it will start working
                                the moment the bot is connected.
                                {showSetupStatus && (
                                    <div style={{ marginTop: 6 }}>
                                        Admin: create a Meta app with the WhatsApp product, point its webhook at{' '}
                                        <code>/api/whatsapp/webhook</code>, then set these in Vercel → Environment Variables
                                        and redeploy:{' '}
                                        <code>{(missing.length ? missing : ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN']).join(', ')}</code>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Live: the number to message, one tap away. */}
            {configured && botNumber && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                    border: '1px solid rgba(37,211,102,0.4)', background: 'rgba(37,211,102,0.08)',
                }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Message the bot on</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{botNumber}</div>
                    </div>
                    <a
                        className="btn btn-primary btn-sm"
                        href={`https://wa.me/${botNumber.replace(/\D/g, '')}?text=${encodeURIComponent('help')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: 'none' }}
                    >
                        <MessageCircle size={14} /> Open the chat
                    </a>
                </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Your linked numbers</div>
            {numbers.length === 0 && !adding && (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: '0 0 10px' }}>
                    None yet — link the number you will message the bot from.
                </p>
            )}
            <div className="config-list" style={{ marginBottom: 10 }}>
                {numbers.map(n => (
                    <div key={n.id} className="config-item">
                        <span style={{ flex: 1, fontSize: 14 }}>{pretty(n.phone)}</span>
                        <button className="btn btn-ghost btn-sm" title="Unlink" onClick={() => remove(n.id)} disabled={busy}>
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>

            {adding ? (
                <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                    <input className="form-input" autoFocus placeholder="+91 98765 43210" value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }}
                        style={{ flex: 1 }} />
                    <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !draft.trim()}><Check size={13} /> Link</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setError(null); }}><X size={13} /></button>
                </div>
            ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} disabled={!!unavailable}>
                    <Plus size={14} /> Link a number
                </button>
            )}
            {error && <div style={{ fontSize: 12, color: 'var(--danger, #b91c1c)', marginTop: 8 }}>{error}</div>}

            <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>How to send a deal</strong><br />
                • Forward the deck (PDF, PPT or an image) — a caption with anything you know helps<br />
                • Or type the details: company, founder, what they do, how much they are raising<br />
                • A message with no company name right after a deck is added to that company<br />
                • Send <em>help</em> any time for these instructions
            </div>
        </div>
    );
}
