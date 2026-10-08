'use client';

import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    extractFromMatrix, describeChange, IMPORT_FIELDS,
    type Extracted, type ImportResult, type CellMatrix,
} from '@/lib/legal-import';
import { useAppContext } from '@/lib/context';
import type { Company } from '@/types/database';

interface Props {
    company: Company;
}

const KIND_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map(f => [f.key, f.kind]));

function formatValue(key: string, value: string | number): string {
    const kind = KIND_BY_KEY[key];
    if (kind === 'money') return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (kind === 'percent') return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 4 })}%`;
    if (kind === 'number') return Number(value).toLocaleString('en-IN');
    if (kind === 'date') {
        const d = new Date(`${value}T00:00:00`);
        return isNaN(d.getTime()) ? String(value)
            : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(value);
}

const CHANGE_STYLE = {
    new: { color: '#047857', label: 'new' },
    changed: { color: '#b45309', label: 'replaces' },
    same: { color: 'var(--text-tertiary)', label: 'unchanged' },
} as const;

/**
 * Reads a term sheet or closing summary and fills the company's deal terms
 * from it, so the numbers on the platform are the document's numbers rather
 * than someone's retyping of them.
 *
 * Nothing is written until the user has seen what was found. A spreadsheet
 * cell that overwrites an entry valuation moves MOIC, IRR and every portfolio
 * roll-up with it, so each row says what it will replace and can be left out.
 */
export default function ExcelImport({ company }: Props) {
    const { updateCompany } = useAppContext();
    const fileRef = useRef<HTMLInputElement>(null);
    const [parsing, setParsing] = useState(false);
    const [result, setResult] = useState<(ImportResult & { fileName: string; sheetName: string }) | null>(null);
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<string | null>(null);

    const current = company as unknown as Record<string, unknown>;

    const handleFile = async (file: File) => {
        setParsing(true); setError(null); setResult(null); setSaved(null);
        try {
            const buffer = await file.arrayBuffer();
            const book = XLSX.read(buffer, { type: 'array', cellDates: true });
            // Every sheet is read, because a summary tab is as likely to be
            // second as first; the first value found for a field wins.
            const matrix: CellMatrix = [];
            for (const name of book.SheetNames) {
                const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {
                    header: 1, defval: null, blankrows: false, raw: true,
                });
                matrix.push(...rows);
            }
            const extracted = extractFromMatrix(matrix);
            if (extracted.fields.length === 0) {
                setError(
                    `Nothing recognisable in ${file.name}. The sheet needs a label beside each value — `
                    + '"Pre-Money Valuation", "No. of Shares Allotted", "Date of Investment" — either down '
                    + 'a column or as a header row.',
                );
            } else {
                setResult({ ...extracted, fileName: file.name, sheetName: book.SheetNames.join(', ') });
                // Everything that changes something is ticked; an unchanged
                // value is left out, since writing it would be a no-op.
                setChosen(new Set(
                    extracted.fields
                        .filter(f => describeChange(current[f.key], f.value, KIND_BY_KEY[f.key]) !== 'same')
                        .map(f => f.key),
                ));
            }
        } catch (e) {
            setError(`Could not read that file: ${(e as Error).message}`);
        }
        setParsing(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const apply = async () => {
        if (!result) return;
        setSaving(true);
        const payload: Record<string, unknown> = {};
        for (const f of result.fields) if (chosen.has(f.key)) payload[f.key] = f.value;

        const { error: err } = await updateCompany(company.id, payload);
        setSaving(false);
        if (err) { setError(`Could not save: ${err}`); return; }
        setSaved(`${Object.keys(payload).length} field${Object.keys(payload).length === 1 ? '' : 's'} updated from ${result.fileName}.`);
        setResult(null);
    };

    const toggle = (key: string) => setChosen(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const rowFor = (f: Extracted) => {
        const change = describeChange(current[f.key], f.value, KIND_BY_KEY[f.key]);
        const style = CHANGE_STYLE[change];
        const existing = current[f.key];
        return (
            <tr key={f.key}>
                <td style={{ width: 32 }}>
                    <input
                        type="checkbox"
                        checked={chosen.has(f.key)}
                        onChange={() => toggle(f.key)}
                        aria-label={`Import ${f.label}`}
                    />
                </td>
                <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        from &ldquo;{f.sheetLabel}&rdquo;: {f.rawValue}
                    </div>
                </td>
                <td style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatValue(f.key, f.value)}
                </td>
                <td style={{ fontSize: 12, color: style.color, whiteSpace: 'nowrap' }}>
                    {style.label}
                    {change === 'changed' && (
                        <span style={{ color: 'var(--text-tertiary)' }}>
                            {' '}{formatValue(f.key, existing as string | number)}
                        </span>
                    )}
                </td>
            </tr>
        );
    };

    const willWrite = result ? result.fields.filter(f => chosen.has(f.key)).length : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Import deal terms from a spreadsheet</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 680 }}>
                    Upload the term sheet summary, closing statement or cap-table export for{' '}
                    <strong>{company.companyName}</strong>. The amounts, dates, share counts and holdings are read
                    out of it and shown here before anything is saved. These are the same fields the Portfolio
                    panel reads, so an import updates both screens at once.
                </div>
            </div>

            <div>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={parsing}>
                    {parsing
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Reading…</>
                        : <><Upload size={14} /> Choose an Excel or CSV file</>}
                </button>
            </div>

            {error && (
                <div style={{
                    display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                    color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                    <AlertCircle size={15} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                </div>
            )}

            {saved && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8,
                    fontSize: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    color: '#047857', fontWeight: 600,
                }}>
                    <Check size={15} /> {saved}
                </div>
            )}

            {result && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                        <FileSpreadsheet size={14} />
                        {result.fileName} · {result.sheetName} · {result.rowsScanned} rows read ·{' '}
                        {result.fields.length} field{result.fields.length === 1 ? '' : 's'} found
                    </div>

                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th />
                                    <th>Field</th>
                                    <th>Value read</th>
                                    <th>On the platform</th>
                                </tr>
                            </thead>
                            <tbody>{result.fields.map(rowFor)}</tbody>
                        </table>
                    </div>

                    {result.unmatched.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                            Not recognised, so left alone: {result.unmatched.join(', ')}.
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={apply} disabled={saving || willWrite === 0}>
                            {saving
                                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                : <><Check size={14} /> Save {willWrite} field{willWrite === 1 ? '' : 's'}</>}
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setResult(null); setChosen(new Set()); }} disabled={saving}>
                            <X size={14} /> Discard
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
