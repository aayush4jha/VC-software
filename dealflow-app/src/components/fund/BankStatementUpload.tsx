'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Check, X, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    type FundEntity,
    type FundExpense,
    formatMoney,
    genId,
    yearMonthKey,
} from '@/lib/fund-data';

interface ParsedTxn {
    date: string;       // YYYY-MM-DD
    description: string;
    amount: number;     // signed: negative = debit/expense, positive = credit
}

interface ParseResult {
    closingBalance: number | null;
    asOfDate: string;
    transactions: ParsedTxn[];
    sheetName: string;
    rowsScanned: number;
}

interface Props {
    entities: FundEntity[];
    onApply: (entityId: string, balance: number, asOfDate: string, fileName: string, transactions: FundExpense[]) => void;
    onCancel: () => void;
}

// ─── Heuristic Excel parser ─────────────────────────────
//
// Bank statement formats vary, so we use a forgiving approach:
// 1. Read every cell as a 2D matrix (header-less).
// 2. Closing balance: prefer last row in a column whose header contains
//    "balance" (case-insensitive). Fallback: largest absolute number in
//    the last 5 rows.
// 3. Transactions: detect rows that have a date-shaped cell + a numeric
//    amount cell (debit or credit). Description = the first long string.
// 4. asOfDate: the latest date detected.

const MONEY_RE = /[\d,]+(\.\d+)?/;

function isLikelyDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (typeof value === 'number' && value > 25569 && value < 60000) {
        // Excel serial date (1900 epoch). Convert via XLSX util.
        const d = XLSX.SSF.parse_date_code(value);
        if (d) return new Date(d.y, d.m - 1, d.d);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        // Common date formats
        const patterns = [
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
        ];
        for (const re of patterns) {
            const m = trimmed.match(re);
            if (m) {
                const [a, b, c] = re === patterns[0] ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
                const d = new Date(parseInt(a), parseInt(b) - 1, parseInt(c));
                if (!isNaN(d.getTime())) return d;
            }
        }
    }
    return null;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[₹$dh,\s]/gi, '').replace(/[()]/g, '-');
        const m = cleaned.match(MONEY_RE);
        if (!m) return null;
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }
    return null;
}

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): ParseResult {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

    // 1. Detect header row & column indices
    let headerRowIdx = -1;
    let dateCol = -1;
    let amountCol = -1;
    let debitCol = -1;
    let creditCol = -1;
    let balanceCol = -1;
    let descCol = -1;

    for (let r = 0; r < Math.min(aoa.length, 20); r++) {
        const row = aoa[r];
        if (!row) continue;
        const labels = row.map(c => String(c ?? '').trim().toLowerCase());
        const has = (kw: string) => labels.findIndex(l => l.includes(kw));
        const dCol = has('date');
        const balCol = has('balance');
        if (dCol >= 0 && balCol >= 0) {
            headerRowIdx = r;
            dateCol = dCol;
            balanceCol = balCol;
            debitCol = labels.findIndex(l => l === 'debit' || l.includes('withdrawal') || l.includes('dr'));
            creditCol = labels.findIndex(l => l === 'credit' || l.includes('deposit') || l.includes('cr'));
            amountCol = labels.findIndex(l => l === 'amount' || l.includes('amt'));
            descCol = labels.findIndex(l => l.includes('description') || l.includes('narration') || l.includes('particular') || l.includes('details'));
            if (descCol < 0) {
                // Fallback: first text-heavy column that's not date/balance/amount
                descCol = labels.findIndex((l, i) =>
                    l.length > 0 &&
                    i !== dateCol && i !== balanceCol && i !== debitCol &&
                    i !== creditCol && i !== amountCol &&
                    !l.includes('balance') && !l.includes('date')
                );
            }
            break;
        }
    }

    const transactions: ParsedTxn[] = [];
    let lastBalance: number | null = null;
    let latestDate: Date | null = null;

    if (headerRowIdx >= 0) {
        for (let r = headerRowIdx + 1; r < aoa.length; r++) {
            const row = aoa[r];
            if (!row) continue;
            const dateCell = row[dateCol];
            const date = isLikelyDate(dateCell);
            if (!date) continue;

            const desc = String(row[descCol] ?? '').trim();
            let amount: number | null = null;
            if (debitCol >= 0 || creditCol >= 0) {
                const debit = debitCol >= 0 ? toNumber(row[debitCol]) : null;
                const credit = creditCol >= 0 ? toNumber(row[creditCol]) : null;
                if (debit && debit !== 0) amount = -Math.abs(debit);
                else if (credit && credit !== 0) amount = Math.abs(credit);
            } else if (amountCol >= 0) {
                amount = toNumber(row[amountCol]);
            }

            const bal = balanceCol >= 0 ? toNumber(row[balanceCol]) : null;
            if (bal !== null) lastBalance = bal;
            if (!latestDate || date > latestDate) latestDate = date;

            if (amount !== null && desc) {
                transactions.push({ date: toIsoDate(date), description: desc, amount });
            }
        }
    } else {
        // No structured header found — heuristic fallback: scan for the
        // largest absolute number in the last 10 rows as "closing balance".
        const tail = aoa.slice(Math.max(0, aoa.length - 10));
        let bestAbs = 0;
        for (const row of tail) {
            if (!row) continue;
            for (const cell of row) {
                const n = toNumber(cell);
                if (n !== null && Math.abs(n) > bestAbs) {
                    bestAbs = Math.abs(n);
                    lastBalance = n;
                }
            }
        }
    }

    return {
        closingBalance: lastBalance,
        asOfDate: latestDate ? toIsoDate(latestDate) : new Date().toISOString().slice(0, 10),
        transactions,
        sheetName,
        rowsScanned: aoa.length,
    };
}

// ─── Component ──────────────────────────────────────────

export default function BankStatementUpload({ entities, onApply, onCancel }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [parsing, setParsing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ParseResult | null>(null);
    const [entityId, setEntityId] = useState(entities[0]?.id || '');
    const [overrideBalance, setOverrideBalance] = useState('');
    const [importTxns, setImportTxns] = useState(true);
    const [defaultProject, setDefaultProject] = useState('Operating Expense');

    const selectedEntity = entities.find(e => e.id === entityId);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setError('');
        setResult(null);
        setParsing(true);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            // Pick the sheet with the most rows (usually the transactions sheet).
            const best = wb.SheetNames
                .map(name => ({ name, ws: wb.Sheets[name], rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }).length }))
                .sort((a, b) => b.rows - a.rows)[0];
            if (!best) throw new Error('Workbook is empty');
            const parsed = parseSheet(best.ws, best.name);
            setResult(parsed);
            if (parsed.closingBalance !== null) setOverrideBalance(String(parsed.closingBalance));
        } catch (err) {
            setError((err as Error).message || 'Failed to parse file');
        } finally {
            setParsing(false);
        }
    };

    const handleApply = () => {
        if (!selectedEntity || !result) return;
        const balance = parseFloat(overrideBalance);
        if (isNaN(balance)) {
            setError('Enter a valid closing balance');
            return;
        }
        const expenses: FundExpense[] = importTxns
            ? result.transactions
                .filter(t => t.amount < 0) // only debits as expenses
                .map(t => ({
                    id: genId('exp'),
                    date: t.date,
                    project: defaultProject,
                    amount: Math.abs(t.amount),
                    entityId: selectedEntity.id,
                    description: t.description,
                }))
            : [];
        onApply(selectedEntity.id, balance, result.asOfDate, fileName, expenses);
    };

    return (
        <div className="fund-upload-modal">
            <div className="fund-upload-card">
                <div className="fund-upload-header">
                    <FileSpreadsheet size={20} />
                    <h3>Upload bank statement</h3>
                    <button className="fund-upload-close" onClick={onCancel} aria-label="Close"><X size={18} /></button>
                </div>

                <div className="fund-upload-body">
                    <label className="fund-field">
                        <span>Entity</span>
                        <select className="inline-input" value={entityId} onChange={e => setEntityId(e.target.value)}>
                            {entities.map(e => (
                                <option key={e.id} value={e.id}>{e.name} ({e.currency})</option>
                            ))}
                        </select>
                    </label>

                    <div className="fund-field">
                        <span>Excel file (.xlsx, .xls, .csv)</span>
                        <div className="fund-upload-drop" onClick={() => fileInputRef.current?.click()}>
                            <Upload size={18} />
                            <span>{fileName || 'Click to choose file'}</span>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: 'none' }}
                            onChange={handleFile}
                        />
                    </div>

                    {parsing && <div className="fund-upload-status">Parsing…</div>}
                    {error && (
                        <div className="fund-upload-status fund-upload-error">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    {result && !parsing && (
                        <div className="fund-upload-result">
                            <div className="fund-upload-result-row">
                                <span>Sheet</span>
                                <strong>{result.sheetName}</strong>
                            </div>
                            <div className="fund-upload-result-row">
                                <span>Rows scanned</span>
                                <strong>{result.rowsScanned}</strong>
                            </div>
                            <div className="fund-upload-result-row">
                                <span>Transactions detected</span>
                                <strong>{result.transactions.length}</strong>
                            </div>
                            <div className="fund-upload-result-row">
                                <span>As of</span>
                                <strong>{result.asOfDate} <span className="fund-muted">({yearMonthKey(result.asOfDate)})</span></strong>
                            </div>
                            <div className="fund-upload-result-row">
                                <span>Detected balance</span>
                                <strong>
                                    {result.closingBalance !== null && selectedEntity
                                        ? formatMoney(result.closingBalance, selectedEntity.currency)
                                        : <span className="fund-muted">none — enter manually</span>}
                                </strong>
                            </div>

                            <label className="fund-field">
                                <span>Closing balance (override if needed)</span>
                                <input
                                    className="inline-input"
                                    type="number"
                                    step="0.01"
                                    value={overrideBalance}
                                    onChange={e => setOverrideBalance(e.target.value)}
                                    placeholder="0"
                                />
                            </label>

                            {result.transactions.length > 0 && (
                                <>
                                    <label className="fund-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={importTxns}
                                            onChange={e => setImportTxns(e.target.checked)}
                                        />
                                        <span>Import {result.transactions.filter(t => t.amount < 0).length} debit transactions as expenses</span>
                                    </label>
                                    {importTxns && (
                                        <label className="fund-field">
                                            <span>Default project / category</span>
                                            <input
                                                className="inline-input"
                                                value={defaultProject}
                                                onChange={e => setDefaultProject(e.target.value)}
                                                placeholder="Operating Expense"
                                            />
                                        </label>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="fund-upload-footer">
                    <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleApply}
                        disabled={!result || !selectedEntity || !overrideBalance}
                    >
                        <Check size={14} /> Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
