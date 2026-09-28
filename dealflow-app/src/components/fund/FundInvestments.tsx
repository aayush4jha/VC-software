'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import InvestmentEntitySelect from '@/components/common/InvestmentEntitySelect';
import {
    CONTRIBUTION_TYPES, buildDrawdownSchedule, validateFundTerms,
    type ContributionType,
} from '@/lib/fund-investment';

// ─── Shapes returned by /api/fund-investments ─────────────────────────────
interface Drawdown {
    id: string; sequence: number; dueDate: string; amount: number;
    isDownPayment: boolean; status: 'Pending' | 'Paid';
    paidOn: string | null; amountPaid: number | null; notes: string;
}
interface NavEntryDto { id: string; asOfDate: string; nav: number; notes: string }
interface FundInvestment {
    id: string;
    fundName: string;
    contributionType: ContributionType;
    startDate: string;
    commitment: number;
    downPayment: number;
    installments: number;
    navAtInvestment: number | null;
    investmentEntity: string | null;
    status: 'Active' | 'Exited' | 'Closed';
    notes: string;
    drawdowns: Drawdown[];
    navEntries: NavEntryDto[];
    metrics: {
        committed: number; drawn: number; outstanding: number;
        currentNav: number | null; navAsOf: string | null;
        gain: number | null; multiple: number | null;
    };
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const compact = (n: number) => {
    if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
    return inr(n);
};
const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

interface Draft {
    fundName: string;
    contributionType: ContributionType;
    startDate: string;
    commitment: string;
    downPayment: string;
    installments: string;
    navAtInvestment: string;
    investmentEntity: string;
    status: 'Active' | 'Exited' | 'Closed';
    notes: string;
    customDates: string[];
}

const emptyDraft = (): Draft => ({
    fundName: '', contributionType: 'Quarterly', startDate: '', commitment: '',
    downPayment: '', installments: '4', navAtInvestment: '', investmentEntity: '',
    status: 'Active', notes: '', customDates: [],
});

function draftToPayload(d: Draft) {
    return {
        fundName: d.fundName.trim(),
        contributionType: d.contributionType,
        startDate: d.startDate,
        commitment: Number(d.commitment || 0),
        downPayment: Number(d.downPayment || 0),
        installments: Number(d.installments || 0),
        navAtInvestment: d.navAtInvestment === '' ? null : Number(d.navAtInvestment),
        investmentEntity: d.investmentEntity || null,
        status: d.status,
        notes: d.notes,
        customDates: d.contributionType === 'Custom' ? d.customDates : undefined,
    };
}

/**
 * Funds we invest in as an LP: the commitment, how it is drawn down, and what
 * the fund says it is worth over time.
 */
export default function FundInvestments() {
    const [investments, setInvestments] = useState<FundInvestment[] | null>(null);
    const [unavailable, setUnavailable] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [openId, setOpenId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payDraft, setPayDraft] = useState({ on: todayISO(), amount: '' });
    const [navDraft, setNavDraft] = useState<Record<string, { date: string; nav: string }>>({});

    const fetchAll = useCallback(async () => {
        const r = await fetch('/api/fund-investments');
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
    }, []);

    const apply = (j: { investments?: FundInvestment[]; unavailable?: string | null }) => {
        setInvestments(j.investments || []);
        setUnavailable(j.unavailable || null);
    };

    useEffect(() => {
        let cancelled = false;
        fetchAll().then(({ ok, j }) => {
            if (cancelled) return;
            if (!ok) { setError(j.error || 'Could not load'); setInvestments([]); return; }
            apply(j);
        });
        return () => { cancelled = true; };
    }, [fetchAll]);

    const reload = async () => {
        const { ok, j } = await fetchAll();
        if (ok) apply(j);
    };

    // Live preview of the schedule the terms describe, before anything is saved.
    const preview = useMemo(() => {
        const p = draftToPayload(draft);
        if (validateFundTerms(p)) return null;
        try { return buildDrawdownSchedule(p); } catch { return null; }
    }, [draft]);

    const save = async () => {
        const payload = draftToPayload(draft);
        if (!payload.fundName) { setError('Which fund is this?'); return; }
        const problem = validateFundTerms(payload);
        if (problem) { setError(problem); return; }
        setBusy(true); setError(null);
        const isNew = editingId === 'new';
        const res = await fetch('/api/fund-investments', {
            method: isNew ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isNew ? payload : { ...payload, id: editingId }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) { setError(j.error || 'Could not save'); return; }
        apply(j);
        setEditingId(null);
    };

    const remove = async (id: string) => {
        setBusy(true);
        const res = await fetch(`/api/fund-investments?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        setConfirmDelete(null);
        if (res.ok) apply(j); else setError(j.error || 'Could not delete');
    };

    const drawdownAction = async (id: string, action: 'pay' | 'unpay', extra: Record<string, unknown> = {}) => {
        setBusy(true); setError(null);
        const res = await fetch('/api/fund-investments/entries', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'drawdown', id, action, ...extra }),
        });
        setBusy(false);
        if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Could not update the drawdown');
        setPayingId(null);
        await reload();
    };

    const addNav = async (fundInvestmentId: string) => {
        const d = navDraft[fundInvestmentId];
        if (!d?.date || d.nav === '') { setError('A NAV entry needs a date and a value.'); return; }
        setBusy(true); setError(null);
        const res = await fetch('/api/fund-investments/entries', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'nav', fundInvestmentId, asOfDate: d.date, nav: Number(d.nav) }),
        });
        setBusy(false);
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Could not add the NAV'); return; }
        setNavDraft(prev => ({ ...prev, [fundInvestmentId]: { date: '', nav: '' } }));
        await reload();
    };

    const removeNav = async (id: string) => {
        setBusy(true);
        await fetch(`/api/fund-investments/entries?kind=nav&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        setBusy(false);
        await reload();
    };

    const startEdit = (f: FundInvestment) => {
        setDraft({
            fundName: f.fundName, contributionType: f.contributionType, startDate: f.startDate,
            commitment: String(f.commitment), downPayment: String(f.downPayment),
            installments: String(f.installments),
            navAtInvestment: f.navAtInvestment == null ? '' : String(f.navAtInvestment),
            investmentEntity: f.investmentEntity || '', status: f.status, notes: f.notes,
            customDates: f.drawdowns.filter(d => !d.isDownPayment).map(d => d.dueDate),
        });
        setEditingId(f.id);
        setError(null);
    };

    const totals = useMemo(() => {
        const list = investments || [];
        return {
            committed: list.reduce((s, f) => s + f.metrics.committed, 0),
            drawn: list.reduce((s, f) => s + f.metrics.drawn, 0),
            outstanding: list.reduce((s, f) => s + f.metrics.outstanding, 0),
            nav: list.reduce((s, f) => s + (f.metrics.currentNav ?? 0), 0),
        };
    }, [investments]);

    if (investments === null) {
        return <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading fund investments…</div>;
    }

    return (
        <div>
            {/* Totals */}
            <div className="portfolio-kpi-grid" style={{ marginBottom: 20 }}>
                {[
                    { label: 'Committed', value: compact(totals.committed), sub: `${investments.length} fund${investments.length === 1 ? '' : 's'}` },
                    { label: 'Drawn down', value: compact(totals.drawn), sub: 'Capital actually paid in' },
                    { label: 'Still to draw', value: compact(totals.outstanding), sub: 'Committed, not yet called' },
                    { label: 'Current NAV', value: compact(totals.nav), sub: 'Latest reported' },
                ].map(t => (
                    <div key={t.label} className="portfolio-kpi-card">
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">{t.label}</div>
                            <div className="portfolio-kpi-value">{t.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Funds we invest in</h2>
                {editingId === null && !unavailable && (
                    <button className="btn btn-primary btn-sm" onClick={() => { setDraft(emptyDraft()); setEditingId('new'); setError(null); }}>
                        <Plus size={14} /> Add a fund
                    </button>
                )}
            </div>

            {unavailable && (
                <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12,
                    border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)', color: '#92400e' }}>
                    This page needs <code>supabase/fund-investments.sql</code> applied in the Supabase SQL editor.
                </div>
            )}
            {error && <div style={{ fontSize: 12, color: 'var(--danger, #b91c1c)', marginBottom: 10 }}>{error}</div>}

            {/* Add / edit */}
            {editingId !== null && (
                <div className="portfolio-section-card" style={{ marginBottom: 16 }}>
                    <div className="form-row">
                        <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Which fund *</label>
                            <input className="form-input" placeholder="e.g. Blume Ventures Fund IV" value={draft.fundName}
                                onChange={e => setDraft({ ...draft, fundName: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Investment type *</label>
                            <select className="form-select" value={draft.contributionType}
                                onChange={e => setDraft({ ...draft, contributionType: e.target.value as ContributionType })}>
                                {CONTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">{draft.contributionType === 'Custom' ? 'First payment on *' : 'Start date *'}</label>
                            <input className="form-input" type="date" value={draft.startDate}
                                onChange={e => setDraft({ ...draft, startDate: e.target.value })} />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Total commitment (₹) *</label>
                            <input className="form-input" type="number" min={0} value={draft.commitment}
                                onChange={e => setDraft({ ...draft, commitment: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Down payment (₹)</label>
                            <input className="form-input" type="number" min={0} value={draft.downPayment}
                                onChange={e => setDraft({ ...draft, downPayment: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Installments</label>
                            <input className="form-input" type="number" min={0} step={1} value={draft.installments}
                                onChange={e => {
                                    const n = Math.max(0, Math.round(Number(e.target.value || 0)));
                                    setDraft(d => ({
                                        ...d,
                                        installments: e.target.value,
                                        // Keep a date box per installment when Custom.
                                        customDates: Array.from({ length: n }, (_, i) => d.customDates[i] || ''),
                                    }));
                                }} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">NAV at investment (₹)</label>
                            <input className="form-input" type="number" min={0} value={draft.navAtInvestment}
                                onChange={e => setDraft({ ...draft, navAtInvestment: e.target.value })} />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Invested from</label>
                            <InvestmentEntitySelect value={draft.investmentEntity}
                                onChange={v => setDraft({ ...draft, investmentEntity: v })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Status</label>
                            <select className="form-select" value={draft.status}
                                onChange={e => setDraft({ ...draft, status: e.target.value as Draft['status'] })}>
                                {['Active', 'Exited', 'Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Notes</label>
                            <input className="form-input" value={draft.notes}
                                onChange={e => setDraft({ ...draft, notes: e.target.value })} />
                        </div>
                    </div>

                    {/* Custom: one date per installment */}
                    {draft.contributionType === 'Custom' && draft.customDates.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <label className="form-label">Date of each installment *</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {draft.customDates.map((d, i) => (
                                    <input key={i} className="form-input" type="date" value={d} style={{ width: 170 }}
                                        onChange={e => setDraft(prev => {
                                            const next = [...prev.customDates];
                                            next[i] = e.target.value;
                                            return { ...prev, customDates: next };
                                        })} />
                                ))}
                            </div>
                        </div>
                    )}

                    {preview && (
                        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                            {preview.length} payment{preview.length === 1 ? '' : 's'}:
                            {preview.slice(0, 4).map(p => ` ${fmtDate(p.dueDate)} ${inr(p.amount)}`).join(' ·')}
                            {preview.length > 4 ? ` · … last ${fmtDate(preview[preview.length - 1].dueDate)} ${inr(preview[preview.length - 1].amount)}` : ''}
                        </div>
                    )}
                    {editingId !== 'new' && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                            Drawdowns already marked paid stay as recorded; the unpaid ones are rebuilt from these terms.
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(null); setError(null); }} disabled={busy}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                            {busy ? 'Saving…' : editingId === 'new' ? 'Save fund' : 'Save changes'}
                        </button>
                    </div>
                </div>
            )}

            {investments.length === 0 && !unavailable && editingId === null && (
                <div className="empty-state" style={{ height: 220 }}>
                    <div className="empty-state-icon"><TrendingUp size={24} /></div>
                    <div className="empty-state-title">No fund investments yet</div>
                    <div className="empty-state-text">Add a fund to track its drawdowns and NAV.</div>
                </div>
            )}

            {/* One card per fund */}
            {investments.map(f => {
                const open = openId === f.id;
                const nav = f.metrics.currentNav;
                const gainPositive = (f.metrics.gain ?? 0) >= 0;
                const chartData = [
                    ...(f.navAtInvestment != null ? [{ date: f.startDate, nav: f.navAtInvestment }] : []),
                    ...f.navEntries.map(n => ({ date: n.asOfDate, nav: n.nav })),
                ];
                return (
                    <div key={f.id} className="portfolio-section-card" style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ fontSize: 15, fontWeight: 700 }}>{f.fundName}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                    {f.contributionType}
                                    {f.investmentEntity ? ` · ${f.investmentEntity}` : ''}
                                    {` · from ${fmtDate(f.startDate)}`}
                                    {f.status !== 'Active' ? ` · ${f.status}` : ''}
                                </div>
                            </div>
                            <Stat label="Committed" value={compact(f.metrics.committed)} />
                            <Stat label="Drawn" value={compact(f.metrics.drawn)} />
                            <Stat label="To draw" value={compact(f.metrics.outstanding)} />
                            <Stat label={f.metrics.navAsOf ? `NAV · ${fmtDate(f.metrics.navAsOf)}` : 'NAV at investment'}
                                value={nav == null ? '—' : compact(nav)} strong />
                            <Stat label="Gain" value={f.metrics.gain == null ? '—' : compact(f.metrics.gain)}
                                color={f.metrics.gain == null ? undefined : gainPositive ? '#047857' : '#b91c1c'} />
                            <Stat label="Multiple" value={f.metrics.multiple == null ? '—' : `${f.metrics.multiple.toFixed(2)}x`} />
                            <span style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-ghost btn-sm" title="Edit terms" onClick={() => startEdit(f)} disabled={busy || editingId !== null}>
                                    <Pencil size={13} />
                                </button>
                                {confirmDelete === f.id ? (
                                    <>
                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Delete this fund and its history?</span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => remove(f.id)} disabled={busy}>
                                            <Check size={13} style={{ color: 'var(--danger, #b91c1c)' }} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}><X size={13} /></button>
                                    </>
                                ) : (
                                    <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setConfirmDelete(f.id)} disabled={busy}>
                                        <Trash2 size={13} />
                                    </button>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(open ? null : f.id)}>
                                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                            </span>
                        </div>

                        {open && (
                            <div style={{ marginTop: 14 }}>
                                <div className="portfolio-two-col">
                                    {/* Drawdowns */}
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Drawdown schedule</div>
                                        <div className="table-container">
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th><th>Paid</th><th></th></tr>
                                                </thead>
                                                <tbody>
                                                    {f.drawdowns.map(d => (
                                                        <tr key={d.id}>
                                                            <td>{d.isDownPayment ? 'Down' : d.sequence}</td>
                                                            <td>{fmtDate(d.dueDate)}</td>
                                                            <td>{inr(d.amount)}</td>
                                                            <td>
                                                                <span style={{
                                                                    fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 8px',
                                                                    color: d.status === 'Paid' ? '#047857' : 'var(--text-secondary)',
                                                                    background: d.status === 'Paid' ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)',
                                                                }}>{d.status}</span>
                                                            </td>
                                                            <td style={{ fontSize: 12 }}>
                                                                {d.status === 'Paid' ? `${fmtDate(d.paidOn)} · ${inr(d.amountPaid ?? d.amount)}` : '—'}
                                                            </td>
                                                            <td>
                                                                {d.status === 'Pending' ? (
                                                                    payingId === d.id ? (
                                                                        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                                            <input className="form-input" type="date" style={{ width: 140, fontSize: 12 }}
                                                                                value={payDraft.on} onChange={e => setPayDraft({ ...payDraft, on: e.target.value })} />
                                                                            <input className="form-input" type="number" style={{ width: 120, fontSize: 12 }}
                                                                                value={payDraft.amount} onChange={e => setPayDraft({ ...payDraft, amount: e.target.value })} />
                                                                            <button className="btn btn-primary btn-sm" disabled={busy}
                                                                                onClick={() => drawdownAction(d.id, 'pay', { paidOn: payDraft.on, amountPaid: payDraft.amount })}>
                                                                                <Check size={12} />
                                                                            </button>
                                                                            <button className="btn btn-ghost btn-sm" onClick={() => setPayingId(null)}><X size={12} /></button>
                                                                        </span>
                                                                    ) : (
                                                                        <button className="btn btn-sm" style={{ fontSize: 11 }} disabled={busy}
                                                                            onClick={() => { setPayingId(d.id); setPayDraft({ on: todayISO(), amount: String(d.amount) }); }}>
                                                                            Mark paid
                                                                        </button>
                                                                    )
                                                                ) : (
                                                                    <button className="btn btn-ghost btn-sm" title="Undo" disabled={busy}
                                                                        onClick={() => drawdownAction(d.id, 'unpay')}>
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* NAV over time */}
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>NAV at intervals</div>
                                        {chartData.length > 1 && (
                                            <ResponsiveContainer width="100%" height={160}>
                                                <LineChart data={chartData} margin={{ left: 4, right: 8, top: 6, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                                        tickFormatter={(v: any) => fmtDate(String(v)).replace(/ \d{4}$/, '')} />
                                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickFormatter={(v: any) => compact(Number(v))} width={70} />
                                                    <Tooltip formatter={(v: any) => inr(Number(v))} labelFormatter={(l: any) => fmtDate(String(l))} />
                                                    <Line type="monotone" dataKey="nav" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                        <div className="table-container" style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                                            <table className="data-table">
                                                <thead><tr><th>Date</th><th>NAV</th><th></th></tr></thead>
                                                <tbody>
                                                    {f.navEntries.length === 0 && (
                                                        <tr><td colSpan={3} style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                            No NAV reported yet{f.navAtInvestment != null ? ` — ${inr(f.navAtInvestment)} at investment` : ''}.
                                                        </td></tr>
                                                    )}
                                                    {[...f.navEntries].reverse().map(n => (
                                                        <tr key={n.id}>
                                                            <td>{fmtDate(n.asOfDate)}</td>
                                                            <td>{inr(n.nav)}</td>
                                                            <td>
                                                                <button className="btn btn-ghost btn-sm" title="Remove" disabled={busy}
                                                                    onClick={() => removeNav(n.id)}><Trash2 size={12} /></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <input className="form-input" type="date" style={{ width: 160, fontSize: 12 }}
                                                value={navDraft[f.id]?.date || ''}
                                                onChange={e => setNavDraft(p => ({ ...p, [f.id]: { date: e.target.value, nav: p[f.id]?.nav || '' } }))} />
                                            <input className="form-input" type="number" placeholder="NAV (₹)" style={{ width: 150, fontSize: 12 }}
                                                value={navDraft[f.id]?.nav || ''}
                                                onChange={e => setNavDraft(p => ({ ...p, [f.id]: { date: p[f.id]?.date || '', nav: e.target.value } }))} />
                                            <button className="btn btn-primary btn-sm" onClick={() => addNav(f.id)} disabled={busy}>
                                                <Plus size={13} /> Add NAV
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {f.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>{f.notes}</div>}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Stat({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
    return (
        <div style={{ minWidth: 92 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: strong ? 700 : 600, color: color || 'var(--text-primary)' }}>{value}</div>
        </div>
    );
}
