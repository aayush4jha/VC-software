'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Loader2, Upload, Check, AlertTriangle, FileSpreadsheet, History } from 'lucide-react';
import { parseShaGrid, normalizeFill, type ShaGrid, type FillMatrix } from '@/lib/sha-grid';
import type { CellMatrix } from '@/lib/legal-import';

interface StoredGrid {
    id: string; grid: ShaGrid; file_name: string; sheet_name: string;
    rights_count: number; column_count: number; warnings: string[]; created_at: string;
}

/**
 * Reads a workbook into values AND fills.
 *
 * `sheet_to_json` gives values only, and in this grid the colour is half the
 * meaning — it is what says whether a right is needed, situational or
 * optional. So the cells are walked directly, which is also the only way to
 * reach `cell.s`.
 */
function readSheet(ws: XLSX.WorkSheet): { matrix: CellMatrix; fills: FillMatrix } {
    const ref = ws['!ref'];
    if (!ref) return { matrix: [], fills: [] };
    const range = XLSX.utils.decode_range(ref);
    const matrix: CellMatrix = [];
    const fills: FillMatrix = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
        const valueRow: unknown[] = [];
        const fillRow: (string | null)[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })] as
                { v?: unknown; w?: string; s?: { fgColor?: { rgb?: string } } } | undefined;
            valueRow.push(cell?.v ?? null);
            fillRow.push(normalizeFill(cell?.s?.fgColor?.rgb ?? null));
        }
        matrix.push(valueRow);
        fills.push(fillRow);
    }
    return { matrix, fills };
}

const textColourFor = (fill: string | null) => {
    if (!fill) return 'var(--text-primary)';
    // A dark fill needs light text. Rough luminance is enough here.
    const r = parseInt(fill.slice(0, 2), 16);
    const g = parseInt(fill.slice(2, 4), 16);
    const b = parseInt(fill.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#0f172a' : '#ffffff';
};

/**
 * The company's SHA rights grid, as the spreadsheet has it.
 *
 * The firm maintains the sheet and will go on maintaining it, so this mirrors
 * it rather than replacing it: every column, every cell, every colour and
 * every block below the grid is shown as it was uploaded. Nothing has to be
 * retyped, and nothing is dropped for not fitting a field chosen in advance.
 */
export default function ShaGridView({ companyId, companyName, onImported }: {
    companyId: string;
    companyName: string;
    onImported?: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [stored, setStored] = useState<StoredGrid | null>(null);
    const [history, setHistory] = useState<StoredGrid[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/legal/sha-grid?companyId=${encodeURIComponent(companyId)}`);
            const j = await res.json();
            if (j.needsMigration) { setNeedsMigration(true); return; }
            setNeedsMigration(false);
            setStored(j.current || null);
            setHistory(j.history || []);
        } catch (e) {
            setProblem((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const upload = async (file: File) => {
        setBusy(true); setProblem(null); setResult(null);
        try {
            // cellStyles is what carries the fills through; without it the
            // legend becomes meaningless and half the grid is lost.
            const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellStyles: true });

            let best: { grid: ShaGrid; sheet: string } | null = null;
            for (const name of book.SheetNames) {
                const { matrix, fills } = readSheet(book.Sheets[name]);
                const grid = parseShaGrid(matrix, fills);
                if (grid && (!best || grid.rights.length > best.grid.rights.length)) {
                    best = { grid, sheet: name };
                }
            }

            if (!best) {
                setProblem(
                    'No rights grid was found in that file. The sheet needs a heading row with "Rights" '
                    + 'on it — the columns beside it can be anything, and everything below is read as it is laid out.',
                );
                return;
            }

            const res = await fetch('/api/legal/sha-grid', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId, grid: best.grid, fileName: file.name, sheetName: best.sheet,
                }),
            });
            const j = await res.json();
            if (j.needsMigration) { setNeedsMigration(true); return; }
            if (!res.ok) throw new Error(j.error || 'Could not store the grid');

            setResult(
                `${best.grid.rights.length} rights and ${best.grid.columns.length} columns read from "${best.sheet}". `
                + `${j.tracked} matched to the rights tracker`
                + (j.unmatched?.length ? `; ${j.unmatched.length} kept in the grid only (${j.unmatched.join(', ')})` : '')
                + '.',
            );
            await load();
            onImported?.();
        } catch (e) {
            setProblem(`Could not read that file: ${(e as Error).message}`);
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    if (needsMigration) {
        return (
            <div style={{
                display: 'flex', gap: 9, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)',
            }}>
                <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                <span>
                    Storing SHA grids needs <code>supabase/sha-grids.sql</code> applied in the Supabase SQL
                    editor. It is one small table and is safe to run more than once.
                </span>
            </div>
        );
    }

    const grid = stored?.grid;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Reading…</>
                        : <><Upload size={13} /> Upload the SHA grid for {companyName}</>}
                </button>
                {stored && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <FileSpreadsheet size={11} style={{ verticalAlign: -1 }} /> {stored.file_name} · {stored.sheet_name} ·{' '}
                        uploaded {new Date(stored.created_at).toLocaleString('en-IN')}
                    </span>
                )}
            </div>

            {problem && (
                <div style={{ display: 'flex', gap: 7, marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <AlertTriangle size={14} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} /> {problem}
                </div>
            )}
            {result && (
                <div style={{ display: 'flex', gap: 7, marginBottom: 10, fontSize: 12, color: '#047857', fontWeight: 600, lineHeight: 1.6 }}>
                    <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {result}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
            ) : !grid ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 620 }}>
                    No grid uploaded for this company yet. Upload the SHA grid spreadsheet you already keep —
                    the rights, every column, the cell colours and everything below the grid come across as
                    they are, and the rights tracker above fills itself in from them.
                </div>
            ) : (
                <>
                    {grid.title && (
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{grid.title}</div>
                    )}
                    {grid.warnings.length > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginBottom: 8 }}>
                            {grid.warnings.join(' ')}
                        </div>
                    )}

                    {/* The legend, in the sheet's own colours and words. */}
                    {grid.legend.length > 0 && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                            {grid.legend.map(l => (
                                <span key={l.fill} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                                    <span style={{
                                        width: 13, height: 13, borderRadius: 3,
                                        background: `#${l.fill}`, border: '1px solid var(--border)',
                                    }} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* The grid itself. */}
                    <div className="table-container" style={{ marginBottom: 20, overflowX: 'auto' }}>
                        <table className="data-table" style={{ minWidth: 760 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 34 }}>#</th>
                                    <th>Right</th>
                                    <th>Remarks</th>
                                    {grid.columns.map(c => (
                                        <th key={c.key} style={{ whiteSpace: 'nowrap' }}>
                                            {c.label}
                                            {c.subLabel && (
                                                <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                    {c.subLabel}
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grid.rights.map(right => (
                                    <tr key={`${right.sNo}-${right.name}`}>
                                        <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{right.sNo}</td>
                                        <td style={{ fontSize: 12, fontWeight: 600 }}>{right.name}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 240 }}>
                                            {right.remarks}
                                        </td>
                                        {grid.columns.map(c => {
                                            const cell = right.cells[c.key];
                                            const fill = cell?.fill ?? null;
                                            return (
                                                <td
                                                    key={c.key}
                                                    title={grid.legend.find(l => l.fill === fill)?.label || ''}
                                                    style={{
                                                        fontSize: 11,
                                                        background: fill ? `#${fill}` : undefined,
                                                        color: fill ? textColourFor(fill) : undefined,
                                                        maxWidth: 260,
                                                        verticalAlign: 'top',
                                                    }}
                                                >
                                                    {cell?.value || ''}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Everything the sheet has below the grid. */}
                    {grid.blocks.map((block, i) => (
                        <div key={`${block.title}-${i}`} style={{ marginBottom: 18 }}>
                            {block.title && (
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{block.title}</div>
                            )}
                            <div className="table-container">
                                <table className="data-table">
                                    <tbody>
                                        {block.rows.map((row, r) => (
                                            <tr key={r}>
                                                {row.prefix && (
                                                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 70 }}>
                                                        {row.prefix}
                                                    </td>
                                                )}
                                                <td style={{ fontSize: 12, fontWeight: 600, width: 260 }}>{row.label}</td>
                                                {row.cells.map((cell, c) => (
                                                    <td key={c} style={{
                                                        fontSize: 11,
                                                        background: cell.fill ? `#${cell.fill}` : undefined,
                                                        color: cell.fill ? textColourFor(cell.fill) : undefined,
                                                    }}>
                                                        {/^https?:\/\//.test(cell.value)
                                                            ? <a href={cell.value} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Open</a>
                                                            : cell.value}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}

                    {history.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <History size={11} />
                            {history.length} earlier upload{history.length === 1 ? '' : 's'} kept — the newest is shown.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
