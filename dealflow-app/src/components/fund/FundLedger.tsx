'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    Loader2, Upload, AlertTriangle, Check, Wallet, TrendingUp, TrendingDown,
    Banknote, ChevronRight, X, FileSpreadsheet, Download,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import {
    totalsFor, composition, accountBalance, financialYearOf, financialYearsBetween,
    CATEGORY_LABELS, type LedgerCategory, type FinancialYearStart,
} from '@/lib/fund-ledger';
import {
    detectSheetKind, parseBankRows, parseAdjustmentRows, describeSheet,
    type ParsedLedgerRow, type ParsedAdjustment,
} from '@/lib/master-import';
import type { CellMatrix } from '@/lib/legal-import';
import { toCsv, exportFilename } from '@/lib/csv-export';
import MappingRules, { type RuleRow, type FundSettings } from '@/components/fund/MappingRules';

interface AccountRow {
    id: string; entity: string; country: string; bank: string; account_label: string;
    currency: string; opening_balance: number; stated_balance: number | null; stated_as_of: string | null;
}
interface TxnRow {
    id: string; account_id: string | null; entity: string; bank: string; txn_date: string | null;
    description: string; amount: number; currency: string; amount_inr: number | null;
    category: LedgerCategory; category_source: string; data_issues: string[];
    source_file: string; source_sheet: string; source_row: number | null; counterparty: string;
}
interface ImportRow {
    id: string; file_name: string; created_at: string;
    rows_imported: number; rows_skipped: number; rows_flagged: number;
}
interface AdjRow {
    id: string; adj_date: string; entity: string; category: string;
    amount: number; currency: string; amount_inr: number | null; reason: string; approved_by: string;
}

/** Hands the file to the browser. The CSV itself is built by a pure module. */
function downloadCsv(csv: string, filename: string) {
    // A BOM, so Excel reads ₹ and names with accents as UTF-8 rather than
    // as whatever the machine's locale happens to be.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const cr = (n: number) => {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};
const plain = (n: number, currency = 'INR') =>
    `${currency === 'INR' ? '₹' : `${currency} `}${Math.round(n).toLocaleString('en-IN')}`;
const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * The Fund page as 01_Fund Page specifies it, on one ledger.
 *
 * Every figure is computed from the transactions each time it is drawn, under
 * whichever filters are set. Nothing is stored as a total: the sheet requires
 * that the April–March and November–October views use the same underlying
 * data, and the only way that stays true is if neither view has data of its
 * own.
 */
export default function FundLedger() {
    const { companies } = useAppContext();

    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [txns, setTxns] = useState<TxnRow[]>([]);
    const [adjustments, setAdjustments] = useState<AdjRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [rules, setRules] = useState<RuleRow[]>([]);
    const [settings, setSettings] = useState<FundSettings | null>(null);
    const [imports, setImports] = useState<ImportRow[]>([]);

    // E. REQUIRED FILTERS / CONTROLS
    const [fyStart, setFyStart] = useState<FinancialYearStart>('april');
    const [fyTouched, setFyTouched] = useState(false);
    const [fy, setFy] = useState<string>('all');
    const [entity, setEntity] = useState('all');
    const [bank, setBank] = useState('all');
    const [currency, setCurrency] = useState('all');
    const [view, setView] = useState<'actual' | 'adjusted'>('actual');
    const [asOf, setAsOf] = useState('');
    // P0: "every dashboard figure must be drillable to the underlying
    // transaction". A card that opens nothing is a number taken on trust, so
    // the drawer holds any set of rows rather than one category.
    const [drill, setDrill] = useState<{ title: string; rows: TxnRow[] } | null>(null);
    const [section, setSection] = useState<'overview' | 'upload' | 'mapping'>('overview');

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/fund/ledger');
            const j = await res.json();
            if (j.needsMigration) { setNeedsMigration(true); return; }
            if (!res.ok) throw new Error(j.error || 'Could not load the ledger');
            setNeedsMigration(false);
            setAccounts(j.accounts || []);
            setTxns(j.transactions || []);
            setAdjustments(j.adjustments || []);
            setRules(j.rules || []);
            setSettings(j.settings || null);
            setImports(j.imports || []);
            setTruncated(!!j.truncated);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // The saved default applies until the person changes it by hand; after
    // that their choice stands for the rest of the visit.
    useEffect(() => {
        if (!fyTouched && settings?.fy_start) setFyStart(settings.fy_start);
    }, [settings, fyTouched]);

    const entities = useMemo(() => [...new Set([...accounts.map(a => a.entity), ...txns.map(t => t.entity)].filter(Boolean))].sort(), [accounts, txns]);
    const banks = useMemo(() => [...new Set([...accounts.map(a => a.bank), ...txns.map(t => t.bank)].filter(Boolean))].sort(), [accounts, txns]);
    const currencies = useMemo(() => [...new Set([...accounts.map(a => a.currency), ...txns.map(t => t.currency)].filter(Boolean))].sort(), [accounts, txns]);

    const years = useMemo(() => {
        const dates = txns.map(t => t.txn_date).filter((d): d is string => !!d).sort();
        return dates.length ? financialYearsBetween(dates[0], dates[dates.length - 1], fyStart).reverse() : [];
    }, [txns, fyStart]);

    // Adjustments are transactions for every purpose but their own table, so
    // the Adjusted view is the Actual one with these rows added — not a second
    // set of numbers kept somewhere else.
    const adjustmentsAsTxns = useMemo<TxnRow[]>(() => adjustments.map(a => ({
        id: `adj-${a.id}`, account_id: null, entity: a.entity, bank: '',
        txn_date: a.adj_date, description: `${a.reason} (approved by ${a.approved_by || 'nobody'})`,
        amount: a.amount, currency: a.currency, amount_inr: a.amount_inr ?? a.amount,
        category: 'adjustment' as LedgerCategory, category_source: 'Adjustment table',
        data_issues: [], source_file: '', source_sheet: '', source_row: null, counterparty: '',
    })), [adjustments]);

    const filtered = useMemo(() => {
        const all = view === 'adjusted' ? [...txns, ...adjustmentsAsTxns] : txns;
        return all.filter(t => {
            if (fy !== 'all' && financialYearOf(t.txn_date, fyStart) !== fy) return false;
            if (entity !== 'all' && t.entity !== entity) return false;
            if (bank !== 'all' && t.bank !== bank) return false;
            if (currency !== 'all' && t.currency !== currency) return false;
            // "Current balance must be based on the selected as-of date."
            if (asOf && t.txn_date && t.txn_date.slice(0, 10) > asOf) return false;
            return true;
        });
    }, [txns, adjustmentsAsTxns, view, fy, fyStart, entity, bank, currency, asOf]);

    const totals = useMemo(() => totalsFor(
        filtered.map(t => ({ category: t.category, amountInr: t.amount_inr, amount: t.amount })),
    ), [filtered]);

    const comp = useMemo(() => composition(totals), [totals]);

    // B. Bank & entity balances, each account against its own transactions.
    const balances = useMemo(() => accounts
        .filter(a => (entity === 'all' || a.entity === entity)
            && (bank === 'all' || a.bank === bank)
            && (currency === 'all' || a.currency === currency))
        .map(a => ({
            ...accountBalance(
                {
                    entity: a.entity, bank: a.bank, currency: a.currency,
                    openingBalance: a.opening_balance,
                    statedBalance: a.stated_balance, statedAsOf: a.stated_as_of,
                },
                filtered.filter(t => t.account_id === a.id)
                    .map(t => ({ amount: t.amount, category: t.category })),
            ),
            accountId: a.id,
            accountLabel: a.account_label,
        })), [accounts, filtered, entity, bank, currency]);

    const cashByCountry = useMemo(() => {
        const byCountry = new Map<string, number>();
        for (const a of accounts) {
            const b = balances.find(x => x.accountId === a.id);
            if (!b) continue;
            // Consolidated cash is in rupees; an AED balance is converted at
            // the rate its own transactions carried, never at a guess.
            const inrRows = filtered.filter(t => t.account_id === a.id && t.amount_inr !== null);
            const impliedRate = a.currency === 'INR' ? 1
                : inrRows.length > 0
                    ? inrRows.reduce((s, t) => s + (t.amount_inr! / (t.amount || 1)), 0) / inrRows.length
                    : null;
            if (impliedRate === null) continue;
            byCountry.set(a.country, (byCountry.get(a.country) ?? 0) + b.closingBalance * impliedRate);
        }
        return byCountry;
    }, [accounts, balances, filtered]);

    // D. Year on year, on whichever convention is selected.
    const byYear = useMemo(() => {
        const groups = new Map<string, typeof filtered>();
        for (const t of filtered) {
            const y = financialYearOf(t.txn_date, fyStart);
            if (!y) continue;
            if (!groups.has(y)) groups.set(y, []);
            groups.get(y)!.push(t);
        }
        let cumulative = 0;
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, rows]) => {
            const t = totalsFor(rows.map(r => ({ category: r.category, amountInr: r.amount_inr, amount: r.amount })));
            cumulative += t.netFundPosition;
            return { year, totals: t, cumulative };
        });
    }, [filtered, fyStart]);

    const totalCash = [...cashByCountry.values()].reduce((s, v) => s + v, 0);
    const flaggedCount = filtered.filter(t => t.data_issues.length > 0).length;

    if (needsMigration) {
        return (
            <div style={{
                display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 10, maxWidth: 720, margin: 20,
                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)',
            }}>
                <AlertTriangle size={18} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
                <div>
                    <strong style={{ color: 'var(--text-primary)' }}>One migration to run first.</strong>
                    <div style={{ marginTop: 6 }}>
                        Paste <code>supabase/legal-fund-master.sql</code> into the Supabase SQL editor and run it.
                        It creates the fund ledger, the accounts and the adjustment table, and is safe to run
                        more than once.
                    </div>
                </div>
            </div>
        );
    }

    const inCountry = (country: string) => {
        const ids = new Set(accounts.filter(a => a.country === country).map(a => a.id));
        return filtered.filter(t => t.account_id && ids.has(t.account_id));
    };

    const cards = [
        {
            label: 'Total Cash Balance', value: cr(totalCash), icon: Wallet,
            hint: `${accounts.length} account${accounts.length === 1 ? '' : 's'}`,
            rows: filtered,
        },
        {
            label: 'India Cash', value: cr(cashByCountry.get('India') ?? 0), icon: Banknote,
            hint: 'INR accounts', rows: inCountry('India'),
        },
        {
            label: 'UAE Cash', value: cr(cashByCountry.get('UAE') ?? 0), icon: Banknote,
            hint: 'AED, shown in INR', rows: inCountry('UAE'),
        },
        {
            label: 'Total Invested Capital', value: cr(totals.investment), icon: TrendingDown,
            hint: 'Excludes internal transfers',
            rows: filtered.filter(t => t.category === 'investment'),
        },
        {
            label: 'Total Exits / Realisations', value: cr(totals.exitProceeds), icon: TrendingUp,
            hint: 'Cash received only',
            rows: filtered.filter(t => t.category === 'exit_proceeds'),
        },
        {
            label: 'Net Fund Position', value: cr(totals.netFundPosition), icon: Wallet,
            hint: view === 'adjusted' ? 'Adjusted' : 'Actual',
            rows: filtered.filter(t => t.category !== 'internal_transfer'),
        },
    ];

    if (section === 'mapping') {
        return (
            <>
                <SectionTabs section={section} setSection={setSection} />
                <MappingRules rules={rules} settings={settings} onChanged={load} />
            </>
        );
    }

    if (section === 'upload') {
        return (
            <>
                <SectionTabs section={section} setSection={setSection} />
                <div style={{ padding: '18px 24px 40px' }}>
                    <MasterUpload
                        companies={companies} entities={entities} rules={rules}
                        fxRate={settings?.default_fx_rate ?? null} onImported={load}
                    />
                    <ImportHistory imports={imports} flagged={filtered.filter(t => t.data_issues.length > 0)} />
                </div>
            </>
        );
    }

    return (
        <>
        <SectionTabs section={section} setSection={setSection} />
        <div style={{ padding: '18px 24px 40px' }}>
            <MasterUpload
                companies={companies} entities={entities} rules={rules}
                fxRate={settings?.default_fx_rate ?? null} onImported={load}
            />

            {/* ─── E. Filters ───────────────────────────────────────────── */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, marginBottom: 14,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
            }}>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={fyStart}
                    onChange={e => { setFyStart(e.target.value as FinancialYearStart); setFy('all'); setFyTouched(true); }}>
                    <option value="april">FY April–March</option>
                    <option value="november">FY November–October</option>
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={fy} onChange={e => setFy(e.target.value)}>
                    <option value="all">All years</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={entity} onChange={e => setEntity(e.target.value)}>
                    <option value="all">All entities</option>
                    {entities.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={bank} onChange={e => setBank(e.target.value)}>
                    <option value="all">All banks</option>
                    {banks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="all">All currencies</option>
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="form-input" style={{ fontSize: 12, width: 'auto' }} value={view} onChange={e => setView(e.target.value as 'actual' | 'adjusted')}>
                    <option value="actual">Actual</option>
                    <option value="adjusted">Adjusted</option>
                </select>
                <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    As of
                    <input className="form-input" type="date" style={{ fontSize: 12, width: 'auto' }}
                        value={asOf} onChange={e => setAsOf(e.target.value)} />
                </label>
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto' }}
                    disabled={filtered.length === 0}
                    onClick={() => downloadCsv(toCsv(filtered, [
                        { header: 'Date', value: r => r.txn_date },
                        { header: 'Entity', value: r => r.entity },
                        { header: 'Bank', value: r => r.bank },
                        { header: 'Description', value: r => r.description },
                        { header: 'Amount', value: r => r.amount },
                        { header: 'Currency', value: r => r.currency },
                        { header: 'Amount (INR)', value: r => r.amount_inr },
                        { header: 'Category', value: r => CATEGORY_LABELS[r.category] },
                        { header: 'Why', value: r => r.category_source },
                        { header: 'Flags', value: r => r.data_issues.join('; ') },
                        { header: 'Source file', value: r => r.source_file },
                        { header: 'Source sheet', value: r => r.source_sheet },
                        { header: 'Source row', value: r => r.source_row },
                    ]), exportFilename('Fund ledger'))}
                    title="Downloads exactly the rows these filters show"
                >
                    <Download size={13} /> Export
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {filtered.length.toLocaleString('en-IN')} transactions
                    {flaggedCount > 0 && <span style={{ color: '#b45309' }}> · {flaggedCount} flagged</span>}
                </span>
            </div>

            {truncated && (
                <div style={{ fontSize: 12, color: '#b45309', marginBottom: 10 }}>
                    The ledger is larger than 20,000 rows; only the oldest 20,000 are totalled here.
                </div>
            )}
            {error && <div style={{ fontSize: 13, color: 'var(--danger, #b91c1c)', marginBottom: 12 }}>{error}</div>}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading the ledger…
                </div>
            ) : (
                <>
                    {/* ─── A. Top-level current position ─────────────────── */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                        gap: 10, marginBottom: 18,
                    }}>
                        {cards.map(c => {
                            const Icon = c.icon;
                            return (
                                <button
                                    key={c.label}
                                    type="button"
                                    onClick={() => setDrill({ title: c.label, rows: c.rows })}
                                    style={{
                                        textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                                        border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                                        fontFamily: 'var(--font-sans)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>
                                        <Icon size={12} /> {c.label}
                                    </div>
                                    <div style={{ fontSize: 21, fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {c.hint} · {c.rows.length} txn
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── B. Bank & entity balances ─────────────────────── */}
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Bank &amp; entity balances</h3>
                    <div className="table-container" style={{ marginBottom: 20 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Entity</th><th>Bank</th><th>Ccy</th>
                                    <th style={{ textAlign: 'right' }}>Opening</th>
                                    <th style={{ textAlign: 'right' }}>Inflows</th>
                                    <th style={{ textAlign: 'right' }}>Outflows</th>
                                    <th style={{ textAlign: 'right' }}>Adjustments</th>
                                    <th style={{ textAlign: 'right' }}>Closing</th>
                                    <th>Bank says</th>
                                </tr>
                            </thead>
                            <tbody>
                                {balances.map(b => (
                                    <tr
                                        key={`${b.entity}-${b.bank}-${b.accountLabel}`}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setDrill({
                                            title: `${b.entity} · ${b.bank}${b.accountLabel ? ` · ${b.accountLabel}` : ''}`,
                                            rows: filtered.filter(t => t.account_id === b.accountId),
                                        })}
                                    >
                                        <td style={{ fontSize: 12, fontWeight: 600 }}>{b.entity}</td>
                                        <td style={{ fontSize: 12 }}>{b.bank || '—'}</td>
                                        <td style={{ fontSize: 12 }}>{b.accountLabel || '—'}</td>
                                        <td style={{ fontSize: 12 }}>{b.currency}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{plain(b.openingBalance, b.currency)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right', color: '#047857' }}>{plain(b.totalInflows, b.currency)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right', color: '#b91c1c' }}>{plain(b.totalOutflows, b.currency)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{b.adjustments ? plain(b.adjustments, b.currency) : '—'}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right', fontWeight: 700 }}>{plain(b.closingBalance, b.currency)}</td>
                                        <td style={{ fontSize: 11 }}>
                                            {b.statedBalance === null ? <span style={{ color: 'var(--text-tertiary)' }}>not stated</span>
                                                : b.discrepancy === 0 ? <span style={{ color: '#047857' }}>agrees</span>
                                                    : <span style={{ color: '#b91c1c' }}>off by {plain(b.discrepancy!, b.currency)}</span>}
                                            {b.statedAsOf && <div style={{ color: 'var(--text-tertiary)' }}>{fmtDate(b.statedAsOf)}</div>}
                                        </td>
                                    </tr>
                                ))}
                                {balances.length === 0 && (
                                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: 18, fontSize: 13, color: 'var(--text-tertiary)' }}>
                                        No accounts yet — upload a master file above and they are created from it.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ─── C. Inflow / outflow composition ───────────────── */}
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Inflow &amp; outflow composition</h3>
                    <div className="table-container" style={{ marginBottom: 20 }}>
                        <table className="data-table">
                            <thead>
                                <tr><th>Section</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>% of side</th><th /></tr>
                            </thead>
                            <tbody>
                                {comp.map(row => (
                                    <tr
                                        key={row.category}
                                        onClick={() => setDrill({
                                            title: row.label,
                                            rows: filtered.filter(t => t.category === row.category),
                                        })}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td style={{ fontSize: 12 }}>{row.section}</td>
                                        <td style={{ fontSize: 12, fontWeight: 600 }}>{row.label}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(row.amount)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{row.percent.toFixed(1)}%</td>
                                        <td style={{ width: 24 }}><ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} /></td>
                                    </tr>
                                ))}
                                {(totals.internalTransfer !== 0 || totals.unclassified > 0) && (
                                    <tr style={{ color: 'var(--text-tertiary)' }}>
                                        <td style={{ fontSize: 12 }}>Excluded</td>
                                        <td style={{ fontSize: 12 }} onClick={() => setDrill({
                                            title: 'Internal transfers',
                                            rows: filtered.filter(t => t.category === 'internal_transfer'),
                                        })}>
                                            Internal transfers, kept out of every total
                                        </td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(totals.internalTransfer)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ─── D. Year on year ───────────────────────────────── */}
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Year on year</h3>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>FY</th>
                                    <th style={{ textAlign: 'right' }}>Funds Received</th>
                                    <th style={{ textAlign: 'right' }}>Exit Proceeds</th>
                                    <th style={{ textAlign: 'right' }}>Other Income</th>
                                    <th style={{ textAlign: 'right' }}>Investments</th>
                                    <th style={{ textAlign: 'right' }}>Inv. Expenses</th>
                                    <th style={{ textAlign: 'right' }}>Office Expenses</th>
                                    <th style={{ textAlign: 'right' }}>Net Movement</th>
                                    <th style={{ textAlign: 'right' }}>Cumulative</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byYear.map(y => (
                                    <tr key={y.year}>
                                        <td style={{ fontSize: 12, fontWeight: 600 }}>{y.year}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.fundsReceived)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.exitProceeds)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.otherIncome)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.investment)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.investmentExpense)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.totals.officeExpense)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right', fontWeight: 700, color: y.totals.netFundPosition >= 0 ? '#047857' : '#b91c1c' }}>
                                            {cr(y.totals.netFundPosition)}
                                        </td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{cr(y.cumulative)}</td>
                                    </tr>
                                ))}
                                {byYear.length === 0 && (
                                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 18, fontSize: 13, color: 'var(--text-tertiary)' }}>
                                        No dated transactions yet.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {drill && (
                <DrillDown title={drill.title} rows={drill.rows} onClose={() => setDrill(null)} />
            )}
        </div>
        </>
    );
}

/** The views 04_Developer Summary suggests, over one ledger. */
function SectionTabs({ section, setSection }: {
    section: 'overview' | 'upload' | 'mapping';
    setSection: (s: 'overview' | 'upload' | 'mapping') => void;
}) {
    const tabs = [
        { key: 'overview' as const, label: 'Overview & balances' },
        { key: 'upload' as const, label: 'Data upload' },
        { key: 'mapping' as const, label: 'Settings & mapping' },
    ];
    return (
        <div style={{ display: 'flex', gap: 14, padding: '10px 24px 0' }}>
            {tabs.map(t => (
                <button
                    key={t.key}
                    onClick={() => setSection(t.key)}
                    style={{
                        padding: '4px 0', fontSize: 12, border: 'none', background: 'none',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        fontWeight: section === t.key ? 700 : 500,
                        color: section === t.key ? 'var(--primary)' : 'var(--text-tertiary)',
                        borderBottom: `2px solid ${section === t.key ? 'var(--primary)' : 'transparent'}`,
                    }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

/** The validation report 04_Developer Summary asks the upload page for. */
function ImportHistory({ imports, flagged }: { imports: ImportRow[]; flagged: TxnRow[] }) {
    return (
        <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Recent uploads</h3>
            <div className="table-container" style={{ marginBottom: 20 }}>
                <table className="data-table">
                    <thead><tr><th>File</th><th>When</th><th style={{ textAlign: 'right' }}>Imported</th><th style={{ textAlign: 'right' }}>Already there</th><th style={{ textAlign: 'right' }}>Flagged</th></tr></thead>
                    <tbody>
                        {imports.map(i => (
                            <tr key={i.id}>
                                <td style={{ fontSize: 12, fontWeight: 600 }}>{i.file_name}</td>
                                <td style={{ fontSize: 11 }}>{new Date(i.created_at).toLocaleString('en-IN')}</td>
                                <td style={{ fontSize: 12, textAlign: 'right' }}>{i.rows_imported}</td>
                                <td style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-tertiary)' }}>{i.rows_skipped}</td>
                                <td style={{ fontSize: 12, textAlign: 'right', color: i.rows_flagged ? '#b45309' : 'inherit' }}>{i.rows_flagged}</td>
                            </tr>
                        ))}
                        {imports.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                Nothing uploaded yet.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
                Rows needing attention
                <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {' '}· imported and counted, but something was missing
                </span>
            </h3>
            <div className="table-container">
                <table className="data-table">
                    <thead><tr><th>Date</th><th>Entity</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>What is missing</th><th>Source</th></tr></thead>
                    <tbody>
                        {flagged.slice(0, 200).map(t => (
                            <tr key={t.id}>
                                <td style={{ fontSize: 11 }}>{fmtDate(t.txn_date)}</td>
                                <td style={{ fontSize: 11 }}>{t.entity || '—'}</td>
                                <td style={{ fontSize: 11 }}>{t.description || '—'}</td>
                                <td style={{ fontSize: 11, textAlign: 'right' }}>{plain(t.amount, t.currency)}</td>
                                <td style={{ fontSize: 11, color: '#b45309' }}>{t.data_issues.join(', ')}</td>
                                <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                    {t.source_sheet} row {t.source_row}
                                </td>
                            </tr>
                        ))}
                        {flagged.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, fontSize: 12, color: '#047857' }}>
                                Every imported transaction has an entity, a bank, a date, a currency, an amount and a category.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Audit trail: every number reaches its transactions ───────────────────

function DrillDown({ title, rows, onClose }: {
    title: string;
    rows: TxnRow[];
    onClose: () => void;
}) {
    const download = () => {
        const csv = toCsv(rows, [
            { header: 'Date', value: r => r.txn_date },
            { header: 'Entity', value: r => r.entity },
            { header: 'Bank', value: r => r.bank },
            { header: 'Description', value: r => r.description },
            { header: 'Amount', value: r => r.amount },
            { header: 'Currency', value: r => r.currency },
            { header: 'Amount (INR)', value: r => r.amount_inr },
            { header: 'Category', value: r => CATEGORY_LABELS[r.category] },
            { header: 'Why', value: r => r.category_source },
            { header: 'Flags', value: r => r.data_issues.join('; ') },
            { header: 'Source file', value: r => r.source_file },
            { header: 'Source sheet', value: r => r.source_sheet },
            { header: 'Source row', value: r => r.source_row },
        ]);
        downloadCsv(csv, exportFilename(title));
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 320,
            display: 'flex', justifyContent: 'flex-end',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: 'min(900px, 95vw)', background: 'var(--bg-primary)', height: '100%', overflowY: 'auto',
            }}>
                <div style={{
                    position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1,
                    padding: '14px 18px', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {rows.length} transaction{rows.length === 1 ? '' : 's'} — every one of them, with where it came from
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={download} disabled={rows.length === 0}>
                        <Download size={13} /> CSV
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="table-container" style={{ padding: 12 }}>
                    <table className="data-table">
                        <thead>
                            <tr><th>Date</th><th>Entity</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>Why</th><th>Source</th></tr>
                        </thead>
                        <tbody>
                            {rows.map(t => (
                                <tr key={t.id}>
                                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.txn_date)}</td>
                                    <td style={{ fontSize: 11 }}>{t.entity || '—'}</td>
                                    <td style={{ fontSize: 11 }}>
                                        {t.description || '—'}
                                        {t.data_issues.length > 0 && (
                                            <div style={{ color: '#b45309', fontSize: 10 }}>{t.data_issues.join(', ')}</div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {plain(t.amount, t.currency)}
                                        {t.currency !== 'INR' && t.amount_inr !== null && (
                                            <div style={{ color: 'var(--text-tertiary)' }}>{plain(t.amount_inr)}</div>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.category_source}</td>
                                    <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {t.source_file ? `${t.source_file}` : '—'}
                                        {t.source_sheet && <div>{t.source_sheet} row {t.source_row}</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── F. The single master upload ──────────────────────────────────────────

interface Prepared {
    fileName: string;
    rows: (ParsedLedgerRow & { sheetName: string })[];
    adjustments: ParsedAdjustment[];
    summary: { sheet: string; description: string }[];
    rejected: { sheet: string; sourceRow: number; why: string }[];
}

function MasterUpload({ companies, entities, rules, fxRate, onImported }: {
    companies: { companyName: string }[];
    entities: string[];
    rules: RuleRow[];
    fxRate: number | null;
    onImported: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [reading, setReading] = useState(false);
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    const read = async (file: File) => {
        setReading(true); setProblem(null); setResult(null); setPrepared(null);
        try {
            const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
            const knownCompanies = companies.map(c => c.companyName);
            const rows: (ParsedLedgerRow & { sheetName: string })[] = [];
            const adjustments: ParsedAdjustment[] = [];
            const summary: Prepared['summary'] = [];
            const rejected: Prepared['rejected'] = [];

            for (const sheetName of book.SheetNames) {
                const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
                    header: 1, defval: null, blankrows: false, raw: true,
                }) as CellMatrix;
                const match = detectSheetKind(matrix);

                if (match.kind === 'bank_statement') {
                    const parsed = parseBankRows(matrix, match.headerRow, match.headers, {
                        defaultEntity: entities[0] || '',
                        defaultBank: sheetName,
                        defaultAccount: sheetName,
                        fxRate: fxRate ?? undefined,
                        knownEntities: entities,
                        knownCompanies,
                        rules: rules.filter(r => r.active).map(r => ({
                            field: r.field, matchText: r.match_text,
                            category: r.category, priority: r.priority, note: r.note,
                        })),
                    });
                    rows.push(...parsed.map(p => ({ ...p, sheetName })));
                    summary.push({
                        sheet: sheetName,
                        description: describeSheet(match, parsed.length, parsed.filter(p => p.issues.length > 0).length),
                    });
                } else if (match.kind === 'adjustments') {
                    const { rows: adjRows, rejected: adjRejected } = parseAdjustmentRows(matrix, match.headerRow, match.headers);
                    adjustments.push(...adjRows);
                    rejected.push(...adjRejected.map(r => ({ sheet: sheetName, ...r })));
                    summary.push({ sheet: sheetName, description: describeSheet(match, adjRows.length, adjRejected.length) });
                } else {
                    // Investment, exit, document and rights sheets are read and
                    // reported, but not written from here: those records belong
                    // to the companies and the legal tracker, and importing them
                    // twice from two places is how they come to disagree.
                    summary.push({
                        sheet: sheetName,
                        description: match.kind
                            ? `${describeSheet(match, 0, 0).split(':')[0]} — recognised, handled on its own page.`
                            : describeSheet(match, 0, 0),
                    });
                }
            }

            if (rows.length === 0 && adjustments.length === 0) {
                setProblem('No bank statement or adjustment sheet was recognised in that file. '
                    + 'A bank sheet needs a heading row with a date, a description and either a debit/credit pair or an amount.');
            } else {
                setPrepared({ fileName: file.name, rows, adjustments, summary, rejected });
            }
        } catch (e) {
            setProblem(`Could not read that file: ${(e as Error).message}`);
        }
        setReading(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const confirm = async () => {
        if (!prepared) return;
        setImporting(true); setProblem(null);
        try {
            const res = await fetch('/api/fund/import', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: prepared.fileName,
                    rows: prepared.rows,
                    adjustments: prepared.adjustments,
                    sheetSummary: Object.fromEntries(prepared.summary.map(s => [s.sheet, s.description])),
                }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'The import failed');
            setResult(
                `${j.imported} transaction${j.imported === 1 ? '' : 's'} imported`
                + (j.adjustments ? `, ${j.adjustments} adjustment${j.adjustments === 1 ? '' : 's'}` : '')
                + (j.flagged ? `, ${j.flagged} flagged for attention` : '')
                + '.' + (j.note ? ` ${j.note}` : ''),
            );
            setPrepared(null);
            onImported();
        } catch (e) {
            setProblem((e as Error).message);
        }
        setImporting(false);
    };

    const flagged = prepared?.rows.filter(r => r.issues.length > 0).length ?? 0;

    return (
        <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 14,
            border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) read(f); }} />
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={reading || importing}>
                    {reading
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Reading…</>
                        : <><Upload size={13} /> Upload the master file</>}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>
                    One file, every sheet. Bank statements, adjustments, investments and exits are identified by
                    their own headings — nothing has to be named or ordered.
                </span>
            </div>

            {problem && (
                <div style={{ display: 'flex', gap: 7, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <AlertTriangle size={14} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} /> {problem}
                </div>
            )}
            {result && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12, color: '#047857', fontWeight: 600 }}>
                    <Check size={14} /> {result}
                </div>
            )}

            {prepared && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        <FileSpreadsheet size={13} /> {prepared.fileName}
                    </div>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        {prepared.summary.map(s => <li key={s.sheet}><strong>{s.sheet}</strong> — {s.description}</li>)}
                    </ul>
                    {prepared.rejected.length > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginBottom: 8, lineHeight: 1.7 }}>
                            Left out, because an adjustment must carry both a reason and an approver:{' '}
                            {prepared.rejected.map(r => `${r.sheet} row ${r.sourceRow} (${r.why})`).join('; ')}.
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={confirm} disabled={importing}>
                            {importing
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</>
                                : <><Check size={13} /> Import {prepared.rows.length} transaction{prepared.rows.length === 1 ? '' : 's'}</>}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setPrepared(null)} disabled={importing}>
                            <X size={13} /> Cancel
                        </button>
                        {flagged > 0 && (
                            <span style={{ fontSize: 11, color: '#b45309' }}>
                                {flagged} row{flagged === 1 ? '' : 's'} will be imported with a flag rather than dropped.
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
