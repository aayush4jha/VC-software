'use client';

import React, { useMemo, useState } from 'react';
import { Search, Download, X } from 'lucide-react';
import { CATEGORY_LABELS, LEDGER_CATEGORIES, type LedgerCategory } from '@/lib/fund-ledger';
import EditableCell from '@/components/common/EditableCell';
import { toCsv, exportFilename } from '@/lib/csv-export';

export interface StatementRow {
    id: string;
    edited?: boolean;
    original?: Record<string, unknown> | null;
    entity: string;
    bank: string;
    txn_date: string | null;
    description: string;
    amount: number;
    currency: string;
    amount_inr: number | null;
    category: LedgerCategory;
    major_head: string;
    dashboard_head: string;
    ac_name: string;
    financial_year: string;
    source_file: string;
    source_sheet: string;
    source_row: number | null;
    data_issues: string[];
}

/**
 * Which heads count as investment.
 *
 * Matched on the bookkeeper's own words rather than on our category, because
 * the question asked is about HER filing: "every statement whose Major Head
 * relates to Investments". Our categories summarise those heads and would
 * answer a slightly different question — one that folds money moved in order
 * to invest together with the investment itself.
 */
export function isInvestmentHead(...heads: string[]): boolean {
    return heads.some(h => /invest/i.test(h || ''));
}

const money = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};
const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

function downloadCsv(csv: string, filename: string) {
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/**
 * The bank statements, laid out the way the firm's own "fund detail" sheet
 * lays them out, and filtered the way the firm asks about them.
 *
 * It opens on the investment heads, because that is the question this view
 * exists to answer. Every other head is one click away rather than hidden:
 * a statement filtered to a subset without saying so is how a total comes to
 * be quietly wrong.
 */
export default function StatementView({ rows, onChanged }: {
    rows: StatementRow[];
    onChanged?: () => void;
}) {
    // Every figure here came from a file, and a file can be wrong. An edit is
    // recorded against the row so the next upload leaves it alone.
    const edit = async (id: string, field: string, value: string) => {
        await fetch('/api/fund/edit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'fund_transactions', id, field, value }),
        });
        onChanged?.();
    };
    const revert = async (id: string) => {
        await fetch('/api/fund/edit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'fund_transactions', id, revert: true }),
        });
        onChanged?.();
    };

    const [query, setQuery] = useState('');
    const [onlyInvestment, setOnlyInvestment] = useState(true);
    const [head, setHead] = useState('all');
    const [year, setYear] = useState('all');

    const heads = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of rows) {
            const h = r.major_head || '(no head)';
            counts.set(h, (counts.get(h) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [rows]);

    const years = useMemo(
        () => [...new Set(rows.map(r => r.financial_year).filter(Boolean))].sort(),
        [rows],
    );

    const visible = useMemo(() => rows.filter(r => {
        if (onlyInvestment && !isInvestmentHead(r.major_head, r.dashboard_head)) return false;
        if (head !== 'all' && (r.major_head || '(no head)') !== head) return false;
        if (year !== 'all' && r.financial_year !== year) return false;
        if (query.trim()) {
            const q = query.toLowerCase();
            const hay = [r.description, r.ac_name, r.major_head, r.dashboard_head, r.entity, r.bank]
                .join(' ').toLowerCase();
            if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
        }
        return true;
    }), [rows, onlyInvestment, head, year, query]);

    const inflow = visible.filter(r => r.amount > 0).reduce((s, r) => s + (r.amount_inr ?? r.amount), 0);
    const outflow = visible.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount_inr ?? r.amount), 0);

    const exportRows = () => downloadCsv(toCsv(visible, [
        { header: 'To', value: r => r.entity },
        { header: 'Year', value: r => r.financial_year },
        { header: 'Net Amount', value: r => r.amount },
        { header: 'TXN DATE', value: r => r.txn_date },
        { header: 'AC NAME', value: r => r.ac_name },
        { header: 'DETAILS', value: r => r.description },
        { header: 'MAJOR HEAD', value: r => r.major_head },
        { header: 'DASHBOARD', value: r => r.dashboard_head },
        { header: 'Category', value: r => CATEGORY_LABELS[r.category] },
        { header: 'Source', value: r => `${r.source_sheet} row ${r.source_row}` },
    ]), exportFilename(onlyInvestment ? 'Investment statements' : 'Bank statements'));

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                    type="button"
                    onClick={() => setOnlyInvestment(v => !v)}
                    style={{
                        padding: '6px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)', fontWeight: 600,
                        border: `1px solid ${onlyInvestment ? 'var(--primary)' : 'var(--border)'}`,
                        background: onlyInvestment ? 'var(--primary)' : 'var(--bg-primary)',
                        color: onlyInvestment ? '#fff' : 'var(--text-secondary)',
                    }}
                >
                    Investment heads only
                </button>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={head} onChange={e => setHead(e.target.value)}>
                    <option value="all">All major heads</option>
                    {heads.map(([h, n]) => <option key={h} value={h}>{h} ({n})</option>)}
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={year} onChange={e => setYear(e.target.value)}>
                    <option value="all">All years</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
                    <Search size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--text-tertiary)' }} />
                    <input className="form-input" style={{ paddingLeft: 28, fontSize: 12, width: '100%' }}
                        placeholder="Details, AC name, head…" value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                {(query || head !== 'all' || year !== 'all' || !onlyInvestment) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setHead('all'); setYear('all'); setOnlyInvestment(true); }}>
                        <X size={12} /> Reset
                    </button>
                )}
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={exportRows} disabled={visible.length === 0}>
                    <Download size={13} /> CSV
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {[
                    { label: 'Statements', value: visible.length.toLocaleString('en-IN') },
                    { label: 'Money in', value: money(inflow), tone: '#047857' },
                    { label: 'Money out', value: money(outflow), tone: '#b91c1c' },
                    { label: 'Net', value: money(inflow - outflow) },
                ].map(t => (
                    <div key={t.label} style={{
                        padding: '9px 13px', borderRadius: 9, minWidth: 130,
                        border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                    }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{t.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: t.tone ?? 'var(--text-primary)' }}>{t.value}</div>
                    </div>
                ))}
            </div>

            {/* The firm's own "fund detail" column order. */}
            <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 900 }}>
                    <thead>
                        <tr>
                            <th>To</th><th>Year</th>
                            <th style={{ textAlign: 'right' }}>Net Amount</th>
                            <th>TXN Date</th><th>AC Name</th><th>Details</th>
                            <th>Major Head</th><th>Dashboard</th><th>Category</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.slice(0, 500).map(r => (
                            <tr key={r.id}>
                                <td style={{ fontSize: 11.5 }}>
                                    <EditableCell value={r.entity} edited={r.edited}
                                        onSave={v => edit(r.id, 'entity', v)} onRevert={() => revert(r.id)} />
                                </td>
                                <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                    <EditableCell value={r.financial_year} onSave={v => edit(r.id, 'financial_year', v)} />
                                </td>
                                <td style={{
                                    fontSize: 11.5, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600,
                                    color: r.amount < 0 ? '#b91c1c' : '#047857',
                                }}>
                                    <EditableCell
                                        value={r.amount} kind="money" align="right"
                                        display={money(r.amount_inr ?? r.amount)}
                                        onSave={v => edit(r.id, 'amount', v)}
                                    />
                                </td>
                                <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                    <EditableCell value={r.txn_date} kind="date" display={fmtDate(r.txn_date)}
                                        onSave={v => edit(r.id, 'txn_date', v)} />
                                </td>
                                <td style={{ fontSize: 11.5 }}>
                                    <EditableCell value={r.ac_name} onSave={v => edit(r.id, 'ac_name', v)} />
                                </td>
                                <td style={{ fontSize: 11.5 }}>
                                    <EditableCell value={r.description} onSave={v => edit(r.id, 'description', v)} />
                                    {r.data_issues.length > 0 && (
                                        <div style={{ fontSize: 10, color: '#b45309' }}>{r.data_issues.join(', ')}</div>
                                    )}
                                </td>
                                <td style={{ fontSize: 11.5, fontWeight: 600 }}>
                                    <EditableCell value={r.major_head} onSave={v => edit(r.id, 'major_head', v)} />
                                </td>
                                <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                    <EditableCell value={r.dashboard_head} onSave={v => edit(r.id, 'dashboard_head', v)} />
                                </td>
                                <td style={{ fontSize: 11.5 }}>
                                    <EditableCell
                                        value={r.category} kind="select"
                                        options={LEDGER_CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c] }))}
                                        display={CATEGORY_LABELS[r.category]}
                                        onSave={v => edit(r.id, 'category', v)}
                                    />
                                </td>
                            </tr>
                        ))}
                        {visible.length === 0 && (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>
                                Nothing matches those filters.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {visible.length > 500 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                    Showing the first 500 of {visible.length.toLocaleString('en-IN')}. The CSV has all of them.
                </div>
            )}
        </div>
    );
}
