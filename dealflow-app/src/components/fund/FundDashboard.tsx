'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Wallet, TrendingDown, TrendingUp, Plus, Upload, Trash2, Pencil, Check, X, Calendar, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
    type FundRecord,
    type FundEntity,
    type FundExpense,
    type Currency,
    afterFundReceived,
    closingBalance,
    formatMoney,
    genId,
    loadFundRecord,
    saveFundRecord,
    yearMonthKey,
} from '@/lib/fund-data';
import BankStatementUpload from './BankStatementUpload';

const CURRENCY_TONE: Record<Currency, string> = { INR: 'inr', AED: 'aed', USD: 'usd' };

export default function FundDashboard() {
    const [tick, setTick] = useState(0);
    const [showUpload, setShowUpload] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddEntity, setShowAddEntity] = useState(false);
    const [showAddExpense, setShowAddExpense] = useState(false);

    const record = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        tick;
        return loadFundRecord();
    }, [tick]);

    useEffect(() => {
        const onUpdate = () => setTick(t => t + 1);
        window.addEventListener('fund-record-updated', onUpdate);
        return () => window.removeEventListener('fund-record-updated', onUpdate);
    }, []);

    const update = (mutator: (r: FundRecord) => FundRecord) => {
        const current = loadFundRecord();
        saveFundRecord(mutator(current));
        // saveFundRecord dispatches 'fund-record-updated' which bumps tick.
    };

    // ─── Aggregations ─────────────────────────────────
    const totalsByCurrency: Record<Currency, { bank: number; due: number; closing: number; pending: number; after: number }> = {
        INR: { bank: 0, due: 0, closing: 0, pending: 0, after: 0 },
        AED: { bank: 0, due: 0, closing: 0, pending: 0, after: 0 },
        USD: { bank: 0, due: 0, closing: 0, pending: 0, after: 0 },
    };
    record.entities.forEach(e => {
        const t = totalsByCurrency[e.currency];
        t.bank += e.bankBalance;
        t.due += e.paymentDue;
        t.closing += closingBalance(e);
        t.pending += e.pendingFund;
        t.after += afterFundReceived(e);
    });

    return (
        <div className="fund-dashboard">
            <div className="fund-hero">
                <div>
                    <h1 className="fund-hero-title">Fund Overview</h1>
                    <p className="fund-hero-sub">
                        As of {record.asOfDate} · {record.entities.length} entities · {record.expenses.length} expenses logged
                    </p>
                </div>
                <div className="fund-hero-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => setShowUpload(true)}>
                        <Upload size={14} /> Upload bank statement
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowAddExpense(true)}>
                        <Plus size={14} /> Add expense
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddEntity(true)}>
                        <Plus size={14} /> Add entity
                    </button>
                </div>
            </div>

            {/* ─── Totals strip ───────────────────────── */}
            <div className="fund-totals-strip">
                {(['INR', 'AED', 'USD'] as Currency[]).map(cur => {
                    const t = totalsByCurrency[cur];
                    const hasData = t.bank !== 0 || t.due !== 0 || t.pending !== 0;
                    if (!hasData) return null;
                    return (
                        <div key={cur} className={`fund-total-card tone-${CURRENCY_TONE[cur]}`}>
                            <div className="fund-total-cur">{cur}</div>
                            <div className="fund-total-grid">
                                <Stat label="Bank Balance" value={formatMoney(t.bank, cur)} signed={t.bank} />
                                <Stat label="Payment Due" value={formatMoney(t.due, cur)} muted />
                                <Stat label="Closing" value={formatMoney(t.closing, cur)} signed={t.closing} bold />
                                <Stat label="Pending Fund" value={formatMoney(t.pending, cur)} muted />
                                <Stat label="After Receipt" value={formatMoney(t.after, cur)} signed={t.after} bold />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─── Entity cards ───────────────────────── */}
            <div className="fund-section-header">
                <h2>Entities</h2>
                <span className="fund-section-sub">Click an entity to edit. Negative closing balance is a red flag.</span>
            </div>
            <div className="fund-entity-grid">
                {record.entities.map(e => (
                    <EntityCard
                        key={e.id}
                        entity={e}
                        editing={editingId === e.id}
                        onEdit={() => setEditingId(e.id)}
                        onSave={(updated) => {
                            update(r => ({ ...r, entities: r.entities.map(x => x.id === e.id ? updated : x) }));
                            setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                        onRemove={() => {
                            if (!confirm(`Remove ${e.name} (${e.currency})?`)) return;
                            update(r => ({
                                ...r,
                                entities: r.entities.filter(x => x.id !== e.id),
                                expenses: r.expenses.filter(x => x.entityId !== e.id),
                            }));
                        }}
                    />
                ))}
            </div>

            {/* ─── Expense bifurcation ────────────────── */}
            <div className="fund-section-header">
                <h2>Expense Bifurcation</h2>
                <span className="fund-section-sub">Pivot of expenses by month and project across entities.</span>
            </div>
            <ExpensePivot record={record} />

            {/* ─── Recent expenses ────────────────────── */}
            <div className="fund-section-header">
                <h2>Recent Expenses</h2>
                <span className="fund-section-sub">Latest first · {record.expenses.length} total</span>
            </div>
            <ExpenseList
                record={record}
                onRemove={id => update(r => ({ ...r, expenses: r.expenses.filter(x => x.id !== id) }))}
            />

            {/* ─── Statements log ─────────────────────── */}
            {record.statements.length > 0 && (
                <>
                    <div className="fund-section-header">
                        <h2>Bank Statement Uploads</h2>
                        <span className="fund-section-sub">{record.statements.length} statement{record.statements.length === 1 ? '' : 's'} processed</span>
                    </div>
                    <div className="fund-statements">
                        {[...record.statements].reverse().map(s => {
                            const ent = record.entities.find(e => e.id === s.entityId);
                            return (
                                <div key={s.id} className="fund-statement-row">
                                    <span className="fund-statement-name">{ent?.name || 'Unknown'} <span className="fund-muted">({ent?.currency})</span></span>
                                    <span className="fund-muted">{s.fileName}</span>
                                    <span><Calendar size={11} /> {s.asOfDate}</span>
                                    <span>{ent ? formatMoney(s.closingBalance, ent.currency) : s.closingBalance.toLocaleString()}</span>
                                    <span className="fund-muted">{s.transactionCount} txns</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ─── Modals ─────────────────────────────── */}
            {showUpload && (
                <BankStatementUpload
                    entities={record.entities}
                    onCancel={() => setShowUpload(false)}
                    onApply={(entityId, balance, asOfDate, fileName, expenses) => {
                        update(r => ({
                            ...r,
                            asOfDate,
                            entities: r.entities.map(e => e.id === entityId ? { ...e, bankBalance: balance } : e),
                            expenses: [...r.expenses, ...expenses],
                            statements: [
                                ...r.statements,
                                {
                                    id: genId('stmt'),
                                    entityId,
                                    fileName,
                                    uploadedAt: new Date().toISOString(),
                                    asOfDate,
                                    closingBalance: balance,
                                    transactionCount: expenses.length,
                                },
                            ],
                        }));
                        setShowUpload(false);
                    }}
                />
            )}

            {showAddEntity && (
                <AddEntityModal
                    onCancel={() => setShowAddEntity(false)}
                    onAdd={(entity) => {
                        update(r => ({ ...r, entities: [...r.entities, entity] }));
                        setShowAddEntity(false);
                    }}
                />
            )}

            {showAddExpense && (
                <AddExpenseModal
                    entities={record.entities}
                    onCancel={() => setShowAddExpense(false)}
                    onAdd={(expense) => {
                        update(r => ({ ...r, expenses: [...r.expenses, expense] }));
                        setShowAddExpense(false);
                    }}
                />
            )}
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────

interface StatProps { label: string; value: string; signed?: number; muted?: boolean; bold?: boolean }
function Stat({ label, value, signed, muted, bold }: StatProps) {
    const cls = signed !== undefined && signed < 0 ? 'fund-stat-negative'
        : signed !== undefined && signed > 0 ? 'fund-stat-positive'
        : muted ? 'fund-stat-muted' : '';
    return (
        <div className="fund-stat">
            <div className="fund-stat-label">{label}</div>
            <div className={`fund-stat-value ${cls} ${bold ? 'fund-stat-bold' : ''}`}>{value}</div>
        </div>
    );
}

interface EntityCardProps {
    entity: FundEntity;
    editing: boolean;
    onEdit: () => void;
    onSave: (e: FundEntity) => void;
    onCancel: () => void;
    onRemove: () => void;
}

function EntityCard({ entity, editing, onEdit, onSave, onCancel, onRemove }: EntityCardProps) {
    if (editing) {
        return <EntityEditForm entity={entity} onSave={onSave} onCancel={onCancel} onRemove={onRemove} />;
    }

    const cb = closingBalance(entity);
    const after = afterFundReceived(entity);
    const tone = cb < 0 ? 'negative' : 'positive';

    return (
        <div className={`fund-entity-card fund-entity-${tone}`}>
            <div className="fund-entity-head">
                <div className="fund-entity-title">
                    <Wallet size={14} />
                    <span className="fund-entity-name">{entity.name}</span>
                    <span className={`fund-entity-cur fund-cur-${CURRENCY_TONE[entity.currency]}`}>{entity.currency}</span>
                </div>
                <button className="fund-entity-edit" onClick={onEdit} title="Edit"><Pencil size={12} /></button>
            </div>

            <div className="fund-entity-balance">
                {formatMoney(entity.bankBalance, entity.currency)}
                <span className="fund-entity-balance-label">Bank Balance</span>
            </div>

            <div className="fund-entity-rows">
                <Row label="Payment Due" value={formatMoney(entity.paymentDue, entity.currency)} icon={<TrendingDown size={11} />} negative />
                <Row label="Closing Balance" value={formatMoney(cb, entity.currency)} bold negative={cb < 0} />
                <Row label="Pending Fund" value={formatMoney(entity.pendingFund, entity.currency)} icon={<TrendingUp size={11} />} positive={entity.pendingFund > 0} />
                <Row label="After Receipt" value={formatMoney(after, entity.currency)} bold negative={after < 0} positive={after >= 0} />
            </div>

            {entity.notes && <div className="fund-entity-notes-display">{entity.notes}</div>}
        </div>
    );
}

interface EntityEditFormProps {
    entity: FundEntity;
    onSave: (e: FundEntity) => void;
    onCancel: () => void;
    onRemove: () => void;
}

function EntityEditForm({ entity, onSave, onCancel, onRemove }: EntityEditFormProps) {
    const [draft, setDraft] = useState(entity);

    return (
        <div className="fund-entity-card fund-entity-editing">
            <div className="fund-entity-head">
                <input
                    className="fund-entity-name-input"
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                />
                <select
                    className="inline-input fund-entity-cur-select"
                    value={draft.currency}
                    onChange={e => setDraft({ ...draft, currency: e.target.value as Currency })}
                >
                    <option value="INR">INR</option>
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                </select>
            </div>
            <NumField label="Bank Balance" value={draft.bankBalance} onChange={v => setDraft({ ...draft, bankBalance: v })} />
            <NumField label="Payment Due" value={draft.paymentDue} onChange={v => setDraft({ ...draft, paymentDue: v })} />
            <NumField label="Pending Fund" value={draft.pendingFund} onChange={v => setDraft({ ...draft, pendingFund: v })} />
            <textarea
                className="fund-entity-notes"
                placeholder="Notes (optional)"
                value={draft.notes || ''}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
            />
            <div className="fund-entity-edit-actions">
                <button className="btn btn-outline btn-sm" onClick={onCancel}><X size={12} /> Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={onRemove}><Trash2 size={12} /> Delete</button>
                <button className="btn btn-primary btn-sm" onClick={() => onSave(draft)}><Check size={12} /> Save</button>
            </div>
        </div>
    );
}

function Row({ label, value, icon, bold, negative, positive }: { label: string; value: string; icon?: React.ReactNode; bold?: boolean; negative?: boolean; positive?: boolean }) {
    const cls = negative ? 'fund-row-negative' : positive ? 'fund-row-positive' : '';
    return (
        <div className="fund-entity-row">
            <span className="fund-entity-row-label">{icon}{label}</span>
            <span className={`fund-entity-row-value ${cls} ${bold ? 'fund-entity-row-bold' : ''}`}>{value}</span>
        </div>
    );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <label className="fund-field">
            <span>{label}</span>
            <input
                className="inline-input"
                type="number"
                step="0.01"
                value={value}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
            />
        </label>
    );
}

// ─── Expense Pivot Table ────────────────────────────────

function ExpensePivot({ record }: { record: FundRecord }) {
    const data = useMemo(() => {
        // Build pivot: rows = (yearMonth, project), cols = entityId, values = sum
        const months = new Set<string>();
        const projects = new Set<string>();
        const cube: Record<string, Record<string, number>> = {}; // [`${ym}::${project}`][entityId] = total

        record.expenses.forEach(exp => {
            const ym = yearMonthKey(exp.date);
            months.add(ym);
            projects.add(exp.project);
            const key = `${ym}::${exp.project}`;
            if (!cube[key]) cube[key] = {};
            cube[key][exp.entityId] = (cube[key][exp.entityId] || 0) + exp.amount;
        });

        const sortedMonths = [...months].sort();
        return { sortedMonths, projects: [...projects].sort(), cube };
    }, [record.expenses]);

    if (record.expenses.length === 0) {
        return <div className="fund-empty-state">No expenses yet. Upload a bank statement or click <em>Add expense</em>.</div>;
    }

    return (
        <div className="fund-pivot-wrapper">
            <table className="fund-pivot-table">
                <thead>
                    <tr>
                        <th>Year-Month</th>
                        <th>Project</th>
                        {record.entities.map(e => (
                            <th key={e.id} className={`fund-pivot-cur fund-cur-${CURRENCY_TONE[e.currency]}`}>
                                {e.name}<br /><span className="fund-pivot-cur-tag">{e.currency}</span>
                            </th>
                        ))}
                        <th className="fund-pivot-total-col">Row total</th>
                    </tr>
                </thead>
                <tbody>
                    {data.sortedMonths.map(ym => (
                        <React.Fragment key={ym}>
                            {data.projects.map(proj => {
                                const key = `${ym}::${proj}`;
                                const row = data.cube[key];
                                if (!row) return null;
                                const rowTotal = Object.values(row).reduce((s, v) => s + v, 0);
                                return (
                                    <tr key={key}>
                                        <td className="fund-pivot-ym">{ym}</td>
                                        <td className="fund-pivot-proj">{proj}</td>
                                        {record.entities.map(e => (
                                            <td key={e.id} className="fund-pivot-num">
                                                {row[e.id] ? formatMoney(row[e.id], e.currency) : '—'}
                                            </td>
                                        ))}
                                        <td className="fund-pivot-num fund-pivot-total-col">
                                            {rowTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </td>
                                    </tr>
                                );
                            })}
                            {(() => {
                                const monthExp = record.expenses.filter(e => yearMonthKey(e.date) === ym);
                                if (monthExp.length === 0) return null;
                                const totalsByEntity: Record<string, number> = {};
                                monthExp.forEach(e => { totalsByEntity[e.entityId] = (totalsByEntity[e.entityId] || 0) + e.amount; });
                                const monthTotal = monthExp.reduce((s, e) => s + e.amount, 0);
                                return (
                                    <tr className="fund-pivot-month-total">
                                        <td>{ym} Total</td>
                                        <td></td>
                                        {record.entities.map(e => (
                                            <td key={e.id} className="fund-pivot-num">
                                                {totalsByEntity[e.id] ? formatMoney(totalsByEntity[e.id], e.currency) : ''}
                                            </td>
                                        ))}
                                        <td className="fund-pivot-num fund-pivot-total-col">
                                            {monthTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </td>
                                    </tr>
                                );
                            })()}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Recent expense list ────────────────────────────────

function ExpenseList({ record, onRemove }: { record: FundRecord; onRemove: (id: string) => void }) {
    const sorted = useMemo(
        () => [...record.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25),
        [record.expenses]
    );

    if (sorted.length === 0) return null;

    return (
        <div className="fund-expense-list">
            {sorted.map(exp => {
                const ent = record.entities.find(e => e.id === exp.entityId);
                return (
                    <div key={exp.id} className="fund-expense-row">
                        <div className="fund-expense-date">
                            <ArrowDownRight size={12} />
                            {exp.date}
                        </div>
                        <div className="fund-expense-desc">
                            <div className="fund-expense-project">{exp.project}</div>
                            {exp.description && <div className="fund-expense-detail">{exp.description}</div>}
                        </div>
                        <div className="fund-expense-entity">{ent?.name} <span className="fund-muted">({ent?.currency})</span></div>
                        <div className="fund-expense-amount">{ent ? formatMoney(exp.amount, ent.currency) : exp.amount}</div>
                        <button className="fund-expense-remove" onClick={() => onRemove(exp.id)} title="Remove"><Trash2 size={11} /></button>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Add modals ─────────────────────────────────────────

function AddEntityModal({ onCancel, onAdd }: { onCancel: () => void; onAdd: (e: FundEntity) => void }) {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState<Currency>('INR');
    const [bank, setBank] = useState('0');
    const [due, setDue] = useState('0');
    const [pending, setPending] = useState('0');

    const submit = () => {
        if (!name.trim()) return;
        onAdd({
            id: genId('ent'),
            name: name.trim(),
            currency,
            bankBalance: parseFloat(bank) || 0,
            paymentDue: parseFloat(due) || 0,
            pendingFund: parseFloat(pending) || 0,
        });
    };

    return (
        <div className="fund-upload-modal">
            <div className="fund-upload-card fund-modal-narrow">
                <div className="fund-upload-header">
                    <Plus size={18} />
                    <h3>Add fund entity</h3>
                    <button className="fund-upload-close" onClick={onCancel}><X size={18} /></button>
                </div>
                <div className="fund-upload-body">
                    <label className="fund-field"><span>Name</span>
                        <input className="inline-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="DVLLP, Dravya, ..." />
                    </label>
                    <label className="fund-field"><span>Currency</span>
                        <select className="inline-input" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                            <option value="INR">INR</option><option value="AED">AED</option><option value="USD">USD</option>
                        </select>
                    </label>
                    <label className="fund-field"><span>Bank Balance</span>
                        <input className="inline-input" type="number" step="0.01" value={bank} onChange={e => setBank(e.target.value)} />
                    </label>
                    <label className="fund-field"><span>Payment Due</span>
                        <input className="inline-input" type="number" step="0.01" value={due} onChange={e => setDue(e.target.value)} />
                    </label>
                    <label className="fund-field"><span>Pending Fund</span>
                        <input className="inline-input" type="number" step="0.01" value={pending} onChange={e => setPending(e.target.value)} />
                    </label>
                </div>
                <div className="fund-upload-footer">
                    <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim()}><Check size={14} /> Add</button>
                </div>
            </div>
        </div>
    );
}

function AddExpenseModal({ entities, onCancel, onAdd }: { entities: FundEntity[]; onCancel: () => void; onAdd: (e: FundExpense) => void }) {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [project, setProject] = useState('Fundamental');
    const [amount, setAmount] = useState('0');
    const [entityId, setEntityId] = useState(entities[0]?.id || '');
    const [description, setDescription] = useState('');

    const submit = () => {
        const amt = parseFloat(amount);
        if (!entityId || isNaN(amt) || amt <= 0) return;
        onAdd({ id: genId('exp'), date, project, amount: amt, entityId, description: description.trim() || undefined });
    };

    return (
        <div className="fund-upload-modal">
            <div className="fund-upload-card fund-modal-narrow">
                <div className="fund-upload-header">
                    <ArrowUpRight size={18} />
                    <h3>Add expense</h3>
                    <button className="fund-upload-close" onClick={onCancel}><X size={18} /></button>
                </div>
                <div className="fund-upload-body">
                    <label className="fund-field"><span>Date</span>
                        <input className="inline-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </label>
                    <label className="fund-field"><span>Entity</span>
                        <select className="inline-input" value={entityId} onChange={e => setEntityId(e.target.value)}>
                            {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.currency})</option>)}
                        </select>
                    </label>
                    <label className="fund-field"><span>Project / Category</span>
                        <input className="inline-input" value={project} onChange={e => setProject(e.target.value)} placeholder="Fundamental, 100X.vc, SPARROW..." />
                    </label>
                    <label className="fund-field"><span>Amount</span>
                        <input className="inline-input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
                    </label>
                    <label className="fund-field"><span>Description (optional)</span>
                        <input className="inline-input" value={description} onChange={e => setDescription(e.target.value)} />
                    </label>
                </div>
                <div className="fund-upload-footer">
                    <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={submit} disabled={!entityId || !amount}><Check size={14} /> Add</button>
                </div>
            </div>
        </div>
    );
}
