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

    // 1. Detect header row & column indices. Bank statements typically have
    //    10-30 rows of account metadata above the transaction table, so scan
    //    the whole sheet rather than capping at 20.
    let headerRowIdx = -1;
    let dateCol = -1;
    let amountCol = -1;
    let debitCol = -1;
    let creditCol = -1;
    let drCrIndicatorCol = -1;
    let balanceCol = -1;
    let descCol = -1;

    for (let r = 0; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const labels = row.map(c => String(c ?? '').trim().toLowerCase());

        // Date column: "date" anywhere in the header. Prefer the FIRST date-like
        // column so "Transaction Date" wins over "Value Date" when both exist.
        const dCol = labels.findIndex(l => /\bdate\b/.test(l) || l.endsWith('date') || l.startsWith('date '));
        const balCol = labels.findIndex(l => l.includes('balance') || l.includes('bal('));
        const amtCol = labels.findIndex(l => l.includes('amount') || l === 'amt' || l.includes('amt.') || l.includes('amt('));

        // Header must have a date and (balance OR amount). Without that it's
        // probably a metadata row that happens to contain the word "date".
        if (dCol < 0 || (balCol < 0 && amtCol < 0)) continue;

        // DR/CR indicator column (Axis-style) — text-indicator, not numeric.
        const indCol = labels.findIndex(l =>
            l === 'dr/cr' || l === 'cr/dr' ||
            l === 'dr / cr' || l === 'cr / dr' ||
            l === 'debit/credit' || l === 'credit/debit' ||
            l === 'debit/cred' || l === 'cred/debit' ||
            l === 'd/c' || l === 'c/d'
        );

        // Separate debit / credit numeric columns (HDFC/ICICI-style). Use
        // anchored matches so "transaction date" (contains 'dr') and
        // "debit/cred" (an indicator, not a numeric column) don't trigger this.
        const debCol = labels.findIndex((l, i) =>
            i !== indCol && (
                l === 'debit' || l === 'dr' ||
                l.startsWith('debit ') || l.startsWith('debit(') ||
                l.startsWith('withdrawal') || l.startsWith('withdrawl') ||
                l.includes('debit amt') || l.includes('withdrawal amt') || l.includes('withdrawal amount')
            )
        );
        const crdCol = labels.findIndex((l, i) =>
            i !== indCol && (
                l === 'credit' || l === 'cr' ||
                l.startsWith('credit ') || l.startsWith('credit(') ||
                l.startsWith('deposit') ||
                l.includes('credit amt') || l.includes('deposit amt') || l.includes('deposit amount')
            )
        );

        let descCandidate = labels.findIndex(l =>
            l.includes('particular') ||
            l.includes('description') ||
            l.includes('narration') ||
            l.includes('details') ||
            l.includes('remarks')
        );
        if (descCandidate < 0) {
            descCandidate = labels.findIndex((l, i) =>
                l.length > 0 &&
                i !== dCol && i !== balCol && i !== amtCol &&
                i !== debCol && i !== crdCol && i !== indCol &&
                !l.includes('balance') && !l.includes('date') &&
                !/^s\.?\s*no\.?$/.test(l) && !l.includes('chq') && !l.includes('cheque') &&
                !l.includes('branch')
            );
        }

        headerRowIdx = r;
        dateCol = dCol;
        balanceCol = balCol;
        amountCol = amtCol;
        drCrIndicatorCol = indCol;
        debitCol = debCol;
        creditCol = crdCol;
        descCol = descCandidate;
        break;
    }

    if (typeof console !== 'undefined') {
        console.log('[BankStatementUpload] header detected at row', headerRowIdx, {
            sheetName, dateCol, descCol, amountCol, drCrIndicatorCol,
            debitCol, creditCol, balanceCol,
        });
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

            const desc = descCol >= 0 ? String(row[descCol] ?? '').trim() : '';

            let amount: number | null = null;
            if (amountCol >= 0 && drCrIndicatorCol >= 0) {
                // Axis-style: single Amount column + DR/CR indicator.
                const amt = toNumber(row[amountCol]);
                const ind = String(row[drCrIndicatorCol] ?? '').trim().toUpperCase();
                if (amt != null && amt !== 0) {
                    amount = ind.startsWith('D') ? -Math.abs(amt) : Math.abs(amt);
                }
            } else if (debitCol >= 0 || creditCol >= 0) {
                const debit = debitCol >= 0 ? toNumber(row[debitCol]) : null;
                const credit = creditCol >= 0 ? toNumber(row[creditCol]) : null;
                if (debit && debit !== 0) amount = -Math.abs(debit);
                else if (credit && credit !== 0) amount = Math.abs(credit);
            } else if (amountCol >= 0) {
                // Single amount column; sign carried by the number itself.
                amount = toNumber(row[amountCol]);
            }

            const bal = balanceCol >= 0 ? toNumber(row[balanceCol]) : null;
            if (bal !== null) lastBalance = bal;
            if (!latestDate || date > latestDate) latestDate = date;

            if (amount !== null && desc) {
                transactions.push({ date: toIsoDate(date), description: desc, amount });
            }
        }

        // Closing balance: scan bottom-up for the last non-null value in the
        // balance column. Catches the labelled "CLOSING BALANCE" row that
        // appears after the last dated transaction and has no date itself.
        if (balanceCol >= 0) {
            for (let r = aoa.length - 1; r > headerRowIdx; r--) {
                const row = aoa[r];
                if (!row) continue;
                const bal = toNumber(row[balanceCol]);
                if (bal != null) {
                    lastBalance = bal;
                    break;
                }
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
