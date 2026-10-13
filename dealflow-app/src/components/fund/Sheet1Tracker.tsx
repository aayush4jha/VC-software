'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Download, Pencil } from 'lucide-react';
import {
    yearlySummary, summaryTotals, mergeDashboardYears,
    type PortfolioInvestment, type PortfolioExit, type FundType, type DashboardYearRow,
} from '@/lib/fund-portfolio';
import { loadFundRecord, saveFundRecord, type FundRecord, type FundEntity } from '@/lib/fund-data';
import EditableCell from '@/components/common/EditableCell';
import { toCsv, exportFilename } from '@/lib/csv-export';

interface PortfolioDbRow {
    id: string; kind: 'investment' | 'exit'; financial_year: string; fund_type: string;
    invested_from: string; company: string; status: string; stage: string;
    invested_on: string | null; amount: number; sold_on: string | null;
    consideration: number | null; exit_kind: string | null; current_value: number | null;
    post_money: number | null; equity_pct: number | null; multiple: number | null;
    writeoff_year: string;
}

const cr = (n: number | null) => {
    if (n === null || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};
const exact = (n: number | null) =>
    n === null || !isFinite(n) ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`;

function downloadCsv(csv: string, filename: string) {
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/**
 * The tracker as Sheet1 of the requirements draws it.
 *
 * Two tables. The yearly one is computed from the investment and exit sheets
 * the master file carries, so it is a view of those rows and never a third
 * place the same figures are typed. The entity grid is the one the firm keeps
 * by hand — bank balance, payment due, closing balance — with the balances
 * filled in from the uploaded statements and the dues left to the person who
 * knows them, because no statement contains a payment that has not happened.
 */
export default function Sheet1Tracker() {
    const [rows, setRows] = useState<PortfolioDbRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [record, setRecord] = useState<FundRecord | null>(null);
    const [stated, setStated] = useState<DashboardYearRow[]>([]);
    // Figures set by hand on the yearly table. They override a TOTAL rather
    // than any one transaction, so they live apart from the rows.
    const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});


    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/db', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'fund_portfolio_rows', operation: 'select' }),
            });
            const j = await res.json();
            if (j.error && /does not exist|schema cache/i.test(j.error)) { setNeedsMigration(true); return; }
            setRows(j.data || []);

            // Sheet1's table, as stored by the most recent upload that had one.
            const imports = await fetch('/api/db', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'fund_imports', operation: 'select' }),
            }).then(r => r.json()).catch(() => ({ data: [] }));
            const newest = (imports.data || [])
                .filter((i: { sheet_summary?: { __dashboard?: { years?: DashboardYearRow[] } } }) => i.sheet_summary?.__dashboard?.years?.length)
                .sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at))[0];
            setStated(newest?.sheet_summary?.__dashboard?.years ?? []);

            const ov = await fetch('/api/db', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'fund_year_overrides', operation: 'select' }),
            }).then(r => r.json()).catch(() => ({ data: [] }));
            const grouped: Record<string, Record<string, number>> = {};
            for (const o of (ov.data || []) as { financial_year: string; field: string; value: number }[]) {
                (grouped[o.financial_year] ??= {})[o.field] = Number(o.value);
            }
            setOverrides(grouped);
        } catch { /* the grid below still works without it */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); setRecord(loadFundRecord()); }, [load]);

    const investments = useMemo<PortfolioInvestment[]>(
        () => rows.filter(r => r.kind === 'investment').map(r => ({
            status: r.status, fundType: (r.fund_type || 'Other') as FundType,
            investedFrom: r.invested_from, investedOn: r.invested_on, stage: r.stage,
            company: r.company, amount: Number(r.amount) || 0,
            postMoney: r.post_money, totalEquityPct: r.equity_pct,
            currentValue: r.current_value, multiple: r.multiple,
            financialYear: r.financial_year, writeoffYear: r.writeoff_year, sourceRow: 0,
        })), [rows]);

    const exits = useMemo<PortfolioExit[]>(
        () => rows.filter(r => r.kind === 'exit').map(r => ({
            financialYear: r.financial_year,
            kind: r.exit_kind === 'writeoff' ? 'writeoff' : 'exit',
            investedFrom: r.invested_from, company: r.company,
            investedOn: r.invested_on, amount: Number(r.amount) || 0,
            soldOn: r.sold_on, consideration: Number(r.consideration) || 0,
            multiple: r.multiple, sourceRow: 0,
        })), [rows]);

    const years = useMemo(() => {
        const computed = yearlySummary(investments, exits);
        // Sheet1's own figures where it states them; the computed ones where
        // it is silent. Market value and NAV for a past year exist only there.
        const base = stated.length > 0 ? mergeDashboardYears(computed, stated) : computed;
        // A figure set by hand outranks both — it is the most recent statement
        // anyone has made about that year.
        return base.map(r => {
            const o = overrides[r.year];
            if (!o) return r;
            const next: Record<string, unknown> = { ...r };
            for (const [field, value] of Object.entries(o)) next[field] = value;
            return next as unknown as typeof r;
        });
    }, [investments, exits, stated, overrides]);
    const totals = useMemo(() => summaryTotals(years), [years]);

    const setYear = async (year: string, field: string, value: string) => {
        const n = value === '' ? null : Number(value);
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'fund_year_overrides', operation: 'upsert',
                data: {
                    organization_id: '00000000-0000-0000-0000-000000000001',
                    financial_year: year, field,
                    value: n !== null && isFinite(n) ? n : null,
                    updated_at: new Date().toISOString(),
                },
            }),
        });
        load();
    };

    const clearYear = async (year: string, field: string) => {
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'fund_year_overrides', operation: 'delete',
                match: { financial_year: year, field },
            }),
        });
        load();
    };

    const saveEntity = (id: string, patch: Partial<FundEntity>) => {
        if (!record) return;
        const next = {
            ...record,
            entities: record.entities.map(e => e.id === id ? { ...e, ...patch } : e),
            updatedAt: new Date().toISOString(),
        };
        setRecord(next);
        saveFundRecord(next);
    };

    const entities = record?.entities ?? [];

    return (
        <div style={{ padding: '18px 24px 40px' }}>
            {/* ─── Yearly investment summary ─────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Fund deployed, by year</h3>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    from the investment and exit sheets in the master file
                </span>
                {years.length > 0 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                        onClick={() => downloadCsv(toCsv(years, [
                            { header: 'Year', value: r => r.year },
                            { header: 'Direct', value: r => r.direct },
                            { header: 'Fund', value: r => r.fund },
                            { header: 'Syndicate', value: r => r.syndicate },
                            { header: 'Total Investment', value: r => r.totalInvestment },
                            { header: 'Exits', value: r => r.exits },
                            { header: 'Writeoffs', value: r => r.writeoffs },
                            { header: 'Net Investment', value: r => r.netInvestment },
                            { header: 'Cumulative', value: r => r.cumulative },
                            { header: 'Profit/Loss', value: r => r.profitLoss },
                            { header: 'Market Value', value: r => r.marketValue },
                            { header: 'NAV', value: r => r.nav },
                        ]), exportFilename('Fund by year'))}>
                        <Download size={13} /> CSV
                    </button>
                )}
            </div>

            {needsMigration ? (
                <div style={{
                    display: 'flex', gap: 9, padding: '12px 14px', borderRadius: 10, marginBottom: 22,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                    fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)',
                }}>
                    <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                    <span>
                        The yearly table needs <code>supabase/fund-portfolio.sql</code> applied in the Supabase
                        SQL editor, then the master file uploaded again. The balances below work regardless.
                    </span>
                </div>
            ) : loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 18, fontSize: 13, color: 'var(--text-tertiary)' }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
            ) : years.length === 0 ? (
                <div style={{
                    padding: '20px', borderRadius: 10, marginBottom: 22, fontSize: 12,
                    border: '1px dashed var(--border)', color: 'var(--text-secondary)', lineHeight: 1.7,
                }}>
                    Nothing yet. Upload the master file under <strong>Data upload</strong> — the sheet of
                    investments and the sheet of exits are read from it and this table is built from them.
                </div>
            ) : (
                <div className="table-container" style={{ marginBottom: 26, overflowX: 'auto' }}>
                    <table className="data-table" style={{ minWidth: 1000 }}>
                        <thead>
                            <tr>
                                <th>Year</th>
                                <th style={{ textAlign: 'right' }}>Direct</th>
                                <th style={{ textAlign: 'right' }}>Fund</th>
                                <th style={{ textAlign: 'right' }}>Syndicate</th>
                                <th style={{ textAlign: 'right' }}>Total Investment</th>
                                <th style={{ textAlign: 'right' }}>Exits</th>
                                <th style={{ textAlign: 'right' }}>Writeoffs</th>
                                <th style={{ textAlign: 'right' }}>Net Investment</th>
                                <th style={{ textAlign: 'right' }}>Cumulative</th>
                                <th style={{ textAlign: 'right' }}>Profit/Loss</th>
                                <th style={{ textAlign: 'right' }}>Market Value</th>
                                <th style={{ textAlign: 'right' }}>NAV</th>
                            </tr>
                        </thead>
                        <tbody>
                            {years.map(r => {
                                const cell = (field: keyof typeof r, bold = false) => (
                                    <td style={{
                                        fontSize: 11.5, textAlign: 'right',
                                        fontWeight: bold ? 600 : 400,
                                        color: field === 'profitLoss'
                                            ? ((r.profitLoss ?? 0) >= 0 ? '#047857' : '#b91c1c') : undefined,
                                    }}>
                                        <EditableCell
                                            value={r[field] as number | null}
                                            kind="money" align="right"
                                            display={cr(r[field] as number | null)}
                                            edited={overrides[r.year]?.[field as string] !== undefined}
                                            onSave={v => setYear(r.year, field as string, v)}
                                            onRevert={() => clearYear(r.year, field as string)}
                                        />
                                    </td>
                                );
                                return (
                                    <tr key={r.year}>
                                        <td style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.year}</td>
                                        {cell('direct')}{cell('fund')}{cell('syndicate')}
                                        {cell('totalInvestment', true)}
                                        {cell('exits')}{cell('writeoffs')}
                                        {cell('netInvestment', true)}
                                        {cell('cumulative')}{cell('profitLoss')}{cell('marketValue')}
                                        <td style={{ fontSize: 11.5, textAlign: 'right', fontWeight: 700 }}>
                                            <EditableCell
                                                value={r.nav} kind="number" align="right"
                                                display={r.nav === null ? '—' : `${r.nav.toFixed(2)}x`}
                                                edited={overrides[r.year]?.nav !== undefined}
                                                onSave={v => setYear(r.year, 'nav', v)}
                                                onRevert={() => clearYear(r.year, 'nav')}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                                <td style={{ fontSize: 12 }}>Total</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.direct)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.fund)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.syndicate)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.totalInvestment)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.exits)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.writeoffs)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.netInvestment)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.cumulative)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.profitLoss)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>{cr(totals.marketValue)}</td>
                                <td style={{ fontSize: 11.5, textAlign: 'right' }}>
                                    {totals.nav === null ? '—' : `${totals.nav.toFixed(2)}x`}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {years.length > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: -18, marginBottom: 26, lineHeight: 1.6 }}>
                    Exits and write-offs are counted at what the position cost, so Net Investment is the capital
                    still at work. Profit/Loss is what came back less that cost. Market value and NAV appear only
                    against the latest year — the sheets carry one current valuation per holding, not a history,
                    so a market value against an earlier year would be today&apos;s number wearing an old date.
                </div>
            )}

            {/* ─── Entity balances ───────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Balances</h3>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    bank balances come from the uploaded statements; dues are kept here
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Pencil size={11} /> every figure here can be clicked and changed
                </span>
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 150 }}>Particular</th>
                            {entities.map(e => (
                                <th key={e.id} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    {e.name}
                                    <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {e.currency}{record?.asOfDate ? ` · ${record.asOfDate}` : ''}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ fontSize: 12, fontWeight: 600 }}>Bank Balance</td>
                            {entities.map(e => (
                                <td key={e.id} style={{ fontSize: 11.5, textAlign: 'right' }}>
                                    <EditableCell
                                        value={e.bankBalance} kind="money" align="right"
                                        display={exact(e.bankBalance)}
                                        onSave={v => saveEntity(e.id, { bankBalance: Number(v) || 0 })}
                                    />
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td style={{ fontSize: 12, fontWeight: 600 }}>Payment due</td>
                            {entities.map(e => (
                                <td key={e.id} style={{ fontSize: 11.5, textAlign: 'right' }}>
                                    <EditableCell
                                        value={e.paymentDue} kind="money" align="right"
                                        display={exact(e.paymentDue)}
                                        onSave={v => saveEntity(e.id, { paymentDue: Number(v) || 0 })}
                                    />
                                </td>
                            ))}
                        </tr>
                        <tr style={{ borderTop: '2px solid var(--border)' }}>
                            <td style={{ fontSize: 12, fontWeight: 700 }}>Closing Balance</td>
                            {entities.map(e => {
                                const closing = e.bankBalance - e.paymentDue;
                                return (
                                    <td key={e.id} style={{
                                        fontSize: 12, textAlign: 'right', fontWeight: 700,
                                        color: closing < 0 ? '#b91c1c' : 'var(--text-primary)',
                                    }}>
                                        {exact(closing)}
                                    </td>
                                );
                            })}
                        </tr>
                        <tr>
                            <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Pipeline investment
                            </td>
                            {entities.map(e => (
                                <td key={e.id} style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    <EditableCell
                                        value={e.pendingFund} kind="money" align="right"
                                        display={exact(e.pendingFund)}
                                        onSave={v => saveEntity(e.id, { pendingFund: Number(v) || 0 })}
                                    />
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
            {entities.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
                    No entities yet — upload a bank statement and they are created from it.
                </div>
            )}
        </div>
    );
}
