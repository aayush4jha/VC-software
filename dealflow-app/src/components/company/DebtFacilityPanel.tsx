'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Pencil, Trash2, Undo2, Bell, BellOff, ChevronDown, ChevronUp } from 'lucide-react';
import {
    DEBT_FREQUENCIES, REPAYMENT_TYPES, REPAYMENT_TYPE_LABELS,
    type DebtFrequency, type RepaymentType,
    buildSchedule, validateDebtTerms, daysBetween, dueDateFor,
} from '@/lib/debt-schedule';

// ─── Shapes returned by /api/debt ─────────────────────────────────────────
export interface DebtPayment {
    id: string;
    termNumber: number;
    dueDate: string;
    interestDue: number;
    principalDue: number;
    totalDue: number;
    status: 'Pending' | 'Received';
    receivedOn: string | null;
    amountReceived: number | null;
    notes: string;
    lastReminderAt: string | null;
}

export interface DebtFacility {
    id: string;
    companyId: string;
    principal: number;
    annualRatePct: number;
    tenureMonths: number;
    frequency: DebtFrequency;
    repaymentType: RepaymentType;
    startDate: string;
    borrowerEmail: string | null;
    remindersEnabled: boolean;
    reminderDaysBefore: number;
    status: 'Active' | 'Closed';
    notes: string;
    totalTerms: number;
    payments: DebtPayment[];
}

// ─── Draft form values (strings, as typed) ────────────────────────────────
export interface DebtDraft {
    principal: string;
    annualRatePct: string;
    tenureMonths: string;
    frequency: DebtFrequency;
    repaymentType: RepaymentType;
    startDate: string;
    borrowerEmail: string;
    remindersEnabled: boolean;
    reminderDaysBefore: string;
}

export function emptyDebtDraft(defaults: Partial<DebtDraft> = {}): DebtDraft {
    return {
        principal: '', annualRatePct: '', tenureMonths: '12',
        frequency: 'Monthly', repaymentType: 'interest_only_bullet',
        startDate: '', borrowerEmail: '', remindersEnabled: true, reminderDaysBefore: '7',
        ...defaults,
    };
}

export function draftToPayload(d: DebtDraft) {
    return {
        principal: Number(d.principal),
        annualRatePct: Number(d.annualRatePct),
        tenureMonths: Number(d.tenureMonths),
        frequency: d.frequency,
        repaymentType: d.repaymentType,
        startDate: d.startDate,
        borrowerEmail: d.borrowerEmail.trim(),
        remindersEnabled: d.remindersEnabled,
        reminderDaysBefore: Number(d.reminderDaysBefore || 0),
    };
}

/** Why the draft cannot be saved, or null. Same rules the API enforces. */
export function draftError(d: DebtDraft): string | null {
    const p = draftToPayload(d);
    const e = validateDebtTerms(p);
    if (e) return e;
    if (p.borrowerEmail && !/^\S+@\S+\.\S+$/.test(p.borrowerEmail)) return 'Borrower email does not look right.';
    if (p.remindersEnabled && !p.borrowerEmail) return 'Add the borrower email to send payment reminders, or turn reminders off.';
    return null;
}

// Repayment figures need the paise, unlike the whole-rupee portfolio figures.
export function inr(n: number): string {
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayLocal(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * The debt fields themselves — shared by the portfolio panel and the Add
 * Portfolio Company form, so both ask the same questions with the same rules.
 */
export function DebtTermsFields({ draft, onChange, compact }: {
    draft: DebtDraft;
    onChange: (d: DebtDraft) => void;
    compact?: boolean;
}) {
    const set = <K extends keyof DebtDraft>(k: K, v: DebtDraft[K]) => onChange({ ...draft, [k]: v });
    const fs = compact ? 12 : 13;

    // A live look at what these terms mean, so a mistyped rate or tenure is
    // obvious before anything is saved or emailed to a borrower.
    const preview = useMemo(() => {
        const p = draftToPayload(draft);
        if (validateDebtTerms(p)) return null;
        try {
            const s = buildSchedule(p);
            return {
                terms: s.length,
                first: s[0],
                last: s[s.length - 1],
                totalInterest: Math.round(s.reduce((sum, t) => sum + t.interest, 0) * 100) / 100,
            };
        } catch { return null; }
    }, [draft]);

    const label = (text: string) => <label className="form-label" style={{ fontSize: fs }}>{text}</label>;

    return (
        <div>
            <div className="form-row">
                <div className="form-group">
                    {label('Amount (₹) *')}
                    <input className="form-input" type="number" min={0} value={draft.principal}
                        onChange={e => set('principal', e.target.value)} placeholder="e.g. 5000000" />
                </div>
                <div className="form-group">
                    {label('Rate of interest (% a year) *')}
                    <input className="form-input" type="number" min={0} max={100} step="0.01" value={draft.annualRatePct}
                        onChange={e => set('annualRatePct', e.target.value)} placeholder="e.g. 14" />
                </div>
                <div className="form-group">
                    {label('Tenure (months) *')}
                    <input className="form-input" type="number" min={1} step={1} value={draft.tenureMonths}
                        onChange={e => set('tenureMonths', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    {label('Payment frequency *')}
                    <select className="form-select" value={draft.frequency}
                        onChange={e => set('frequency', e.target.value as DebtFrequency)}>
                        {DEBT_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                    {label('Repayment structure *')}
                    <select className="form-select" value={draft.repaymentType}
                        onChange={e => set('repaymentType', e.target.value as RepaymentType)}>
                        {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{REPAYMENT_TYPE_LABELS[t]}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    {label('Disbursed on *')}
                    <input className="form-input" type="date" value={draft.startDate}
                        onChange={e => set('startDate', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                    {label('Borrower email (receives payment reminders)')}
                    <input className="form-input" type="email" value={draft.borrowerEmail}
                        onChange={e => set('borrowerEmail', e.target.value)} placeholder="finance@company.com" />
                </div>
                <div className="form-group">
                    {label('Remind days before due')}
                    <input className="form-input" type="number" min={0} max={60} value={draft.reminderDaysBefore}
                        disabled={!draft.remindersEnabled}
                        onChange={e => set('reminderDaysBefore', e.target.value)} />
                </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fs, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.remindersEnabled}
                    onChange={e => set('remindersEnabled', e.target.checked)} />
                Email the borrower a reminder before each payment, on the due date, and weekly while overdue
            </label>

            {preview && (
                <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                }}>
                    {preview.terms} {draft.frequency.toLowerCase()} payment{preview.terms === 1 ? '' : 's'} ·
                    {' '}first {inr(preview.first.total)} on {fmtDate(preview.first.dueDate)} ·
                    {' '}last {inr(preview.last.total)} on {fmtDate(preview.last.dueDate)} ·
                    {' '}total interest {inr(preview.totalInterest)}
                </div>
            )}
        </div>
    );
}

// ─── Status of one term, as read on a given day ───────────────────────────
function termState(p: DebtPayment, today: string): { label: string; color: string; bg: string } {
    if (p.status === 'Received') return { label: 'Received', color: '#047857', bg: 'rgba(16,185,129,0.12)' };
    const d = daysBetween(today, p.dueDate);
    if (d < 0) return { label: `Overdue ${-d}d`, color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' };
    if (d === 0) return { label: 'Due today', color: '#b45309', bg: 'rgba(245,158,11,0.15)' };
    return { label: `Due in ${d}d`, color: 'var(--text-secondary)', bg: 'var(--bg-secondary)' };
}

/**
 * Debt terms and the repayment ledger for one company. Appears when the
 * investment is Debt (by type or instrument), or once a facility exists.
 */
export default function DebtFacilityPanel({ companyId, isDebt, defaults, sectionTitleStyle, cardStyle }: {
    companyId: string;
    /** The investment is Debt by type or instrument. */
    isDebt: boolean;
    defaults: Partial<DebtDraft>;
    sectionTitleStyle: React.CSSProperties;
    cardStyle: React.CSSProperties;
}) {
    const [facilities, setFacilities] = useState<DebtFacility[] | null>(null);
    const [unavailable, setUnavailable] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [draft, setDraft] = useState<DebtDraft>(() => emptyDebtDraft(defaults));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [receiving, setReceiving] = useState<{ id: string; on: string; amount: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [showSchedule, setShowSchedule] = useState<string | null>(null);

    const fetchFacilities = useCallback(async (): Promise<{ facilities: DebtFacility[]; unavailable: string | null; error: string | null }> => {
        try {
            const r = await fetch(`/api/debt?companyId=${encodeURIComponent(companyId)}`);
            const j = await r.json();
            if (!r.ok) return { facilities: [], unavailable: null, error: j.error || 'Could not load debt terms' };
            return { facilities: j.facilities || [], unavailable: j.unavailable || null, error: null };
        } catch (e) {
            return { facilities: [], unavailable: null, error: (e as Error).message };
        }
    }, [companyId]);

    const apply = (res: { facilities: DebtFacility[]; unavailable: string | null; error: string | null }) => {
        setFacilities(res.facilities);
        setUnavailable(res.unavailable);
        if (res.error) setError(res.error);
    };

    // Cancellable, so a slow response for the previous company can never land
    // on this one after the panel has switched.
    useEffect(() => {
        let cancelled = false;
        fetchFacilities().then(res => { if (!cancelled) apply(res); });
        return () => { cancelled = true; };
    }, [fetchFacilities]);

    const load = async () => apply(await fetchFacilities());

    const replace = (f: DebtFacility) =>
        setFacilities(prev => prev ? (prev.some(x => x.id === f.id) ? prev.map(x => x.id === f.id ? f : x) : [...prev, f]) : [f]);

    const startNew = () => { setDraft(emptyDebtDraft(defaults)); setEditingId('new'); setError(null); };
    const startEdit = (f: DebtFacility) => {
        setDraft({
            principal: String(f.principal), annualRatePct: String(f.annualRatePct),
            tenureMonths: String(f.tenureMonths), frequency: f.frequency, repaymentType: f.repaymentType,
            startDate: f.startDate, borrowerEmail: f.borrowerEmail || '',
            remindersEnabled: f.remindersEnabled, reminderDaysBefore: String(f.reminderDaysBefore),
        });
        setEditingId(f.id);
        setError(null);
    };

    const save = async () => {
        const problem = draftError(draft);
        if (problem) { setError(problem); return; }
        setBusy(true); setError(null);
        const isNew = editingId === 'new';
        const res = await fetch('/api/debt', {
            method: isNew ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(isNew ? { companyId } : { id: editingId }), ...draftToPayload(draft) }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) { setError(j.error || 'Could not save'); return; }
        replace(j.facility);
        setEditingId(null);
    };

    const remove = async (id: string) => {
        setBusy(true);
        const res = await fetch(`/api/debt?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        setBusy(false);
        setConfirmDelete(null);
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Could not delete'); return; }
        setFacilities(prev => (prev || []).filter(f => f.id !== id));
    };

    const act = async (paymentId: string, action: 'receive' | 'undo', extra: Record<string, unknown> = {}) => {
        setBusy(true); setError(null);
        const res = await fetch('/api/debt/payments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, action, ...extra }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) { setError(j.error || 'Could not update the payment'); await load(); return; }
        replace(j.facility);
        setReceiving(null);
    };

    const today = todayLocal();

    // Only for debt — but a facility already recorded stays visible even if the
    // investment type is later changed, rather than its repayment history
    // silently disappearing from the page.
    const hasFacilities = (facilities?.length ?? 0) > 0;
    if (!isDebt && !hasFacilities && editingId === null) return null;

    if (facilities === null) {
        return (
            <div style={{ marginBottom: 28 }}>
                <h3 style={sectionTitleStyle}>Debt Terms & Repayments</h3>
                <div style={{ ...cardStyle, fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>
            </div>
        );
    }

    return (
        <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Debt Terms & Repayments</h3>
                {!unavailable && editingId === null && (
                    <button className="btn btn-sm btn-primary" onClick={startNew}>
                        {facilities.length === 0 ? 'Add debt terms' : 'Add another facility'}
                    </button>
                )}
            </div>

            {unavailable && (
                <div style={{ ...cardStyle, fontSize: 13, color: '#b45309' }}>
                    Debt tracking needs <code>supabase/debt-facilities.sql</code> applied in the Supabase SQL editor.
                </div>
            )}

            {error && (
                <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--danger, #b91c1c)' }}>{error}</div>
            )}

            {editingId !== null && (
                <div style={{ ...cardStyle, marginBottom: 14 }}>
                    <DebtTermsFields draft={draft} onChange={setDraft} />
                    {editingId !== 'new' && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                            Received payments are history and stay as recorded; the term currently owed is recalculated.
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setEditingId(null); setError(null); }} disabled={busy}>Cancel</button>
                        <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
                            {busy ? 'Saving…' : editingId === 'new' ? 'Save terms' : 'Save changes'}
                        </button>
                    </div>
                </div>
            )}

            {!unavailable && facilities.length === 0 && editingId === null && (
                <div style={{ ...cardStyle, fontSize: 13, color: 'var(--text-tertiary)' }}>
                    No debt terms yet. Add the amount, rate, tenure and payment schedule to track repayments and send reminders.
                </div>
            )}

            {facilities.map(f => {
                const received = f.payments.filter(p => p.status === 'Received');
                const pending = f.payments.find(p => p.status === 'Pending') || null;
                const principalRepaid = received.reduce((s, p) => s + p.principalDue, 0);
                const interestReceived = received.reduce((s, p) => s + p.interestDue, 0);
                const outstanding = Math.max(0, Math.round((f.principal - principalRepaid) * 100) / 100);
                const maturity = dueDateFor(f.startDate, f.tenureMonths);
                const lastReceived = received[received.length - 1];
                const state = pending ? termState(pending, today) : null;
                const schedule = (() => {
                    try { return buildSchedule(f); } catch { return []; }
                })();

                return (
                    <div key={f.id} style={{ ...cardStyle, marginBottom: 14 }}>
                        {/* Terms summary */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{
                                fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 8px',
                                background: f.status === 'Closed' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                                color: f.status === 'Closed' ? '#047857' : '#4f46e5',
                            }}>
                                {f.status === 'Closed' ? 'Fully repaid' : `Term ${pending?.termNumber ?? '—'} of ${f.totalTerms}`}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {REPAYMENT_TYPE_LABELS[f.repaymentType]}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button className="btn btn-ghost btn-sm" title="Edit terms" onClick={() => startEdit(f)} disabled={busy || editingId !== null}>
                                    <Pencil size={13} />
                                </button>
                                {confirmDelete === f.id ? (
                                    <>
                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Delete facility and its payment history?</span>
                                        <button className="btn btn-ghost btn-sm" title="Confirm" onClick={() => remove(f.id)} disabled={busy}>
                                            <Check size={13} style={{ color: 'var(--danger, #b91c1c)' }} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" title="Keep" onClick={() => setConfirmDelete(null)}>
                                            <X size={13} />
                                        </button>
                                    </>
                                ) : (
                                    <button className="btn btn-ghost btn-sm" title="Delete facility" onClick={() => setConfirmDelete(f.id)} disabled={busy}>
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
                            <Stat label="Amount" value={inr(f.principal)} />
                            <Stat label="Rate" value={`${f.annualRatePct}% a year`} />
                            <Stat label="Tenure" value={`${f.tenureMonths} months · ${f.frequency}`} />
                            <Stat label="Disbursed / matures" value={`${fmtDate(f.startDate)} → ${fmtDate(maturity)}`} />
                            <Stat label="Principal outstanding" value={inr(outstanding)} strong />
                            <Stat label="Interest received" value={inr(Math.round(interestReceived * 100) / 100)} />
                        </div>

                        {/* The term currently owed */}
                        {pending && state && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                                border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                            }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                        Next payment · term {pending.termNumber} · due {fmtDate(pending.dueDate)}
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {inr(pending.totalDue)}
                                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                            interest {inr(pending.interestDue)} + principal {inr(pending.principalDue)}
                                        </span>
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 9px', color: state.color, background: state.bg }}>
                                    {state.label}
                                </span>
                                {receiving?.id === pending.id ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <input className="form-input" type="date" value={receiving.on} style={{ width: 150, fontSize: 12 }}
                                            onChange={e => setReceiving({ ...receiving, on: e.target.value })} />
                                        <input className="form-input" type="number" value={receiving.amount} style={{ width: 130, fontSize: 12 }}
                                            onChange={e => setReceiving({ ...receiving, amount: e.target.value })} />
                                        <button className="btn btn-sm btn-primary" disabled={busy}
                                            onClick={() => act(pending.id, 'receive', { receivedOn: receiving.on, amountReceived: receiving.amount })}>
                                            <Check size={13} /> Confirm
                                        </button>
                                        <button className="btn btn-sm btn-ghost" onClick={() => setReceiving(null)}><X size={13} /></button>
                                    </span>
                                ) : (
                                    <button className="btn btn-sm btn-primary" disabled={busy}
                                        onClick={() => setReceiving({ id: pending.id, on: today, amount: String(pending.totalDue) })}>
                                        <Check size={13} /> Mark received
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Reminders */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                            {f.remindersEnabled && f.borrowerEmail ? <Bell size={12} /> : <BellOff size={12} />}
                            {f.remindersEnabled && f.borrowerEmail
                                ? <>Reminders to <strong style={{ color: 'var(--text-secondary)' }}>{f.borrowerEmail}</strong> {f.reminderDaysBefore > 0 ? `${f.reminderDaysBefore} days before, ` : ''}on the due date, and weekly while overdue{pending?.lastReminderAt ? ` · last sent ${fmtDate(pending.lastReminderAt)}` : ''}</>
                                : 'Reminders off'}
                        </div>

                        {/* Payment history */}
                        {f.payments.length > 0 && (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr><th>Term</th><th>Due</th><th>Interest</th><th>Principal</th><th>Total</th><th>Status</th><th>Received</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {f.payments.map(p => {
                                            const s = termState(p, today);
                                            return (
                                                <tr key={p.id}>
                                                    <td>{p.termNumber}</td>
                                                    <td>{fmtDate(p.dueDate)}</td>
                                                    <td>{inr(p.interestDue)}</td>
                                                    <td>{inr(p.principalDue)}</td>
                                                    <td><strong>{inr(p.totalDue)}</strong></td>
                                                    <td>
                                                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 8px', color: s.color, background: s.bg }}>
                                                            {s.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: 12 }}>
                                                        {p.status === 'Received'
                                                            ? `${fmtDate(p.receivedOn)} · ${inr(p.amountReceived ?? p.totalDue)}`
                                                            : '—'}
                                                    </td>
                                                    <td>
                                                        {p.status === 'Received' && lastReceived?.id === p.id && (
                                                            <button className="btn btn-ghost btn-sm" title="Undo — mark this term not received"
                                                                disabled={busy} onClick={() => act(p.id, 'undo')}>
                                                                <Undo2 size={12} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Full projected schedule */}
                        {schedule.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                                    onClick={() => setShowSchedule(showSchedule === f.id ? null : f.id)}>
                                    {showSchedule === f.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    {' '}Full schedule ({schedule.length} terms)
                                </button>
                                {showSchedule === f.id && (
                                    <div className="table-container" style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr><th>Term</th><th>Due</th><th>Opening</th><th>Interest</th><th>Principal</th><th>Total</th><th>Closing</th></tr>
                                            </thead>
                                            <tbody>
                                                {schedule.map(t => {
                                                    const done = f.payments.some(p => p.termNumber === t.termNumber && p.status === 'Received');
                                                    return (
                                                        <tr key={t.termNumber} style={{ opacity: done ? 0.55 : 1 }}>
                                                            <td>{t.termNumber}{done ? ' ✓' : ''}</td>
                                                            <td>{fmtDate(t.dueDate)}</td>
                                                            <td>{inr(t.openingBalance)}</td>
                                                            <td>{inr(t.interest)}</td>
                                                            <td>{inr(t.principal)}</td>
                                                            <td>{inr(t.total)}</td>
                                                            <td>{inr(t.closingBalance)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: 'var(--text-primary)' }}>{value}</div>
        </div>
    );
}
