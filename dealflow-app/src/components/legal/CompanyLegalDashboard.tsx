'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    Loader2, Upload, Check, AlertTriangle, FileSpreadsheet, History,
    ExternalLink, ShieldCheck, Layers, CalendarClock, Download,
} from 'lucide-react';
import {
    parseShaGrid, normalizeFill, headlineFigures, rightsByLegend, versionColumns,
    statusFromCell, compactRupees,
    type ShaGrid, type FillMatrix, type CellMeta, type GridCell,
} from '@/lib/sha-grid';
import { toCsv, exportFilename } from '@/lib/csv-export';
import type { CellMatrix } from '@/lib/legal-import';

interface StoredGrid {
    id: string; grid: ShaGrid; file_name: string; sheet_name: string;
    rights_count: number; column_count: number; warnings: string[]; created_at: string;
}

/**
 * A workbook read in full: values, the text Excel displays, hyperlinks and
 * fills.
 *
 * `sheet_to_json` gives only values, which is why the first version of this
 * import lost the colours and showed 0.06028 where the sheet says 6.028%.
 * Walking the cells is the only way to reach `w`, `l` and `s`.
 */
function readSheet(ws: XLSX.WorkSheet): { matrix: CellMatrix; fills: FillMatrix; meta: CellMeta } {
    const ref = ws['!ref'];
    if (!ref) return { matrix: [], fills: [], meta: {} };
    const range = XLSX.utils.decode_range(ref);
    const matrix: CellMatrix = [];
    const fills: FillMatrix = [];
    const display: (string | null)[][] = [];
    const links: (string | null)[][] = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
        const values: unknown[] = [];
        const fillRow: (string | null)[] = [];
        const displayRow: (string | null)[] = [];
        const linkRow: (string | null)[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })] as {
                v?: unknown; w?: string;
                l?: { Target?: string };
                s?: { fgColor?: { rgb?: string } };
            } | undefined;
            values.push(cell?.v ?? null);
            fillRow.push(normalizeFill(cell?.s?.fgColor?.rgb ?? null));
            displayRow.push(cell?.w ?? null);
            linkRow.push(cell?.l?.Target ?? null);
        }
        matrix.push(values);
        fills.push(fillRow);
        display.push(displayRow);
        links.push(linkRow);
    }
    return { matrix, fills, meta: { display, links } };
}

/** Which headline figures are rupee amounts. Shares and percentages are not. */
const MONEY_KEYS = new Set(['investment', 'valuation', 'price', 'round']);

const readableOn = (fill: string | null) => {
    if (!fill) return undefined;
    const r = parseInt(fill.slice(0, 2), 16);
    const g = parseInt(fill.slice(2, 4), 16);
    const b = parseInt(fill.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#0f172a' : '#ffffff';
};

function CellText({ cell }: { cell: GridCell }) {
    if (cell.link) {
        return (
            <a href={cell.link} target="_blank" rel="noreferrer"
                style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {cell.value || 'Open'} <ExternalLink size={10} />
            </a>
        );
    }
    if (/^https?:\/\//.test(cell.value)) {
        return (
            <a href={cell.value} target="_blank" rel="noreferrer"
                style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Open <ExternalLink size={10} />
            </a>
        );
    }
    return <>{cell.value}</>;
}

/**
 * A company's legal page, built from the spreadsheet the firm already keeps.
 *
 * The sheet is the record. This shows what is in it — the rights grid with its
 * colours, every amendment column, the sections, the annexures and the cap
 * table arithmetic — so there is no second place where the same facts live and
 * drift apart. Nothing is retyped, and a column or a block this code has never
 * seen still appears, because nothing here lists what is allowed.
 */
export default function CompanyLegalDashboard({ companyId, companyName, onImported }: {
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
            const book = XLSX.read(await file.arrayBuffer(), {
                type: 'array', cellDates: true, cellStyles: true, cellNF: true,
            });

            let best: { grid: ShaGrid; sheet: string } | null = null;
            for (const name of book.SheetNames) {
                const { matrix, fills, meta } = readSheet(book.Sheets[name]);
                const grid = parseShaGrid(matrix, fills, meta);
                if (grid && (!best || grid.rights.length > best.grid.rights.length)) {
                    best = { grid, sheet: name };
                }
            }
            if (!best) {
                setProblem(
                    'No rights grid was found in that file. One sheet needs a heading row with "Rights" on '
                    + 'it — the columns beside it can be anything at all, and everything below is read as laid out.',
                );
                return;
            }

            const res = await fetch('/api/legal/sha-grid', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId, grid: best.grid, fileName: file.name, sheetName: best.sheet }),
            });
            const j = await res.json();
            if (j.needsMigration) { setNeedsMigration(true); return; }
            if (!res.ok) throw new Error(j.error || 'Could not store the grid');

            setResult(
                `Read "${best.sheet}": ${best.grid.rights.length} rights, ${best.grid.columns.length} columns, `
                + `${best.grid.blocks.length} section${best.grid.blocks.length === 1 ? '' : 's'}. `
                + `${j.tracked} rights matched the tracker`
                + (j.unmatched?.length ? `; ${j.unmatched.length} are shown here only.` : '.'),
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

    const grid = stored?.grid;
    const headlines = useMemo(() => grid ? headlineFigures(grid) : [], [grid]);
    const legendCounts = useMemo(() => grid ? rightsByLegend(grid) : [], [grid]);
    const versions = useMemo(() => grid ? versionColumns(grid) : [], [grid]);

    const exportGrid = () => {
        if (!grid) return;
        downloadCsv(toCsv(grid.rights, [
            { header: '#', value: r => r.sNo },
            { header: 'Right', value: r => r.name },
            { header: 'Remarks', value: r => r.remarks },
            ...grid.columns.map(c => ({
                header: c.subLabel ? `${c.label} (${c.subLabel})` : c.label,
                value: (r: typeof grid.rights[number]) => r.cells[c.key]?.value ?? '',
            })),
            { header: 'Colour meaning', value: r => {
                const fill = grid.columns.map(c => r.cells[c.key]?.fill).filter(Boolean).pop();
                return grid.legend.find(l => l.fill === fill)?.label ?? '';
            } },
        ]), exportFilename(`${companyName} SHA grid`));
    };

    if (needsMigration) {
        return (
            <Notice>
                Storing SHA grids needs <code>supabase/sha-grids.sql</code> applied in the Supabase SQL
                editor. It is one small table and is safe to run more than once.
            </Notice>
        );
    }

    return (
        <div>
            {/* ─── Upload ───────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '12px 14px', borderRadius: 12, marginBottom: 16,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
            }}>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Reading the sheet…</>
                        : <><Upload size={13} /> {stored ? 'Upload a newer sheet' : `Upload ${companyName}'s SHA grid`}</>}
                </button>
                {stored ? (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FileSpreadsheet size={12} /> {stored.file_name}
                        <span style={{ opacity: 0.6 }}>·</span> {stored.sheet_name}
                        <span style={{ opacity: 0.6 }}>·</span> {new Date(stored.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>
                        Everything in the sheet appears here — the rights, every column, the colours and what
                        they mean, and every block below the grid.
                    </span>
                )}
                {grid && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={exportGrid}>
                        <Download size={13} /> CSV
                    </button>
                )}
            </div>

            {problem && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    <AlertTriangle size={15} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} /> {problem}
                </div>
            )}
            {result && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12, color: '#047857', fontWeight: 600, lineHeight: 1.65 }}>
                    <Check size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {result}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, fontSize: 13, color: 'var(--text-tertiary)' }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
            ) : !grid ? (
                <div style={{
                    padding: '28px 24px', borderRadius: 12, textAlign: 'center',
                    border: '1px dashed var(--border)', background: 'var(--bg-secondary)',
                }}>
                    <FileSpreadsheet size={26} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>No sheet uploaded yet</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
                        Upload the SHA grid you already maintain for {companyName}. The page is built from it —
                        you keep the spreadsheet, and this stays in step with it rather than becoming a second
                        copy to maintain.
                    </div>
                </div>
            ) : (
                <>
                    {grid.title && (
                        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 2px' }}>{grid.title}</h2>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                        {grid.rights.length} rights · {grid.columns.length} columns ·{' '}
                        {versions.length} SHA version{versions.length === 1 ? '' : 's'} tracked
                        {versions.length > 0 && <> · latest {versions[versions.length - 1].subLabel || versions[versions.length - 1].label}</>}
                    </div>

                    {grid.warnings.length > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginBottom: 12 }}>{grid.warnings.join(' ')}</div>
                    )}

                    {/* ─── Headline figures ─────────────────────────────── */}
                    {headlines.length > 0 && (
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: 10, marginBottom: 16,
                        }}>
                            {headlines.map(h => {
                                // The sheet's own text is the figure; the short
                                // form is an aid beside it, never instead of it.
                                const compact = MONEY_KEYS.has(h.key) ? compactRupees(h.raw ?? h.value) : null;
                                return (
                                    <div key={h.key} style={{
                                        padding: '11px 13px', borderRadius: 10,
                                        border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                                    }}>
                                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                                            {h.label}
                                        </div>
                                        <div style={{ fontSize: compact ? 18 : 16, fontWeight: 700, marginTop: 3, wordBreak: 'break-word' }}>
                                            {compact ?? h.value}
                                        </div>
                                        {compact && (
                                            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
                                                {h.value}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ─── Rights at a glance ───────────────────────────── */}
                    {legendCounts.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                            {legendCounts.map(l => (
                                <div key={l.fill} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 999,
                                    background: `#${l.fill}`, color: readableOn(l.fill),
                                    border: '1px solid rgba(15,23,42,0.08)',
                                }}>
                                    <span style={{ fontSize: 16, fontWeight: 700 }}>{l.count}</span>
                                    <span style={{ fontSize: 11.5 }}>{l.label}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ─── The grid ─────────────────────────────────────── */}
                    <SectionHeading icon={ShieldCheck} title="Rights" sub="As the sheet has them, colours and all" />
                    <div className="table-container" style={{ marginBottom: 24, overflowX: 'auto' }}>
                        <table className="data-table" style={{ minWidth: 820 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }} />
                                    <th style={{ minWidth: 170 }}>Right</th>
                                    <th style={{ minWidth: 180 }}>Remarks</th>
                                    {grid.columns.map(c => (
                                        <th key={c.key} style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                                            {c.subLabel && (
                                                <div style={{ fontWeight: 400, fontSize: 9.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                                    {c.subLabel}
                                                </div>
                                            )}
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grid.rights.map(right => (
                                    <tr key={`${right.sNo}-${right.name}`}>
                                        <td style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{right.sNo}</td>
                                        <td style={{ fontSize: 12, fontWeight: 600 }}>{right.name}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{right.remarks}</td>
                                        {grid.columns.map(c => {
                                            const cell = right.cells[c.key];
                                            const fill = cell?.fill ?? null;
                                            const meaning = grid.legend.find(l => l.fill === fill)?.label;
                                            const short = (cell?.value ?? '').length <= 12;
                                            return (
                                                <td
                                                    key={c.key}
                                                    title={meaning ? `${meaning}${cell?.value ? ` — ${cell.value}` : ''}` : (cell?.value || '')}
                                                    style={{
                                                        fontSize: 11,
                                                        background: fill ? `#${fill}` : undefined,
                                                        color: fill ? readableOn(fill) : undefined,
                                                        textAlign: short ? 'center' : 'left',
                                                        fontWeight: short && cell?.value ? 600 : 400,
                                                        minWidth: short ? 72 : 150,
                                                        maxWidth: 260,
                                                        verticalAlign: 'middle',
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    {cell ? <CellText cell={cell} /> : ''}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {grid.legend.length > 0 && (
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24, marginTop: -14 }}>
                            {grid.legend.map(l => (
                                <span key={l.fill} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    <span style={{ width: 13, height: 13, borderRadius: 3, background: `#${l.fill}`, border: '1px solid var(--border)' }} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* ─── Everything else the sheet holds ──────────────── */}
                    {grid.blocks.map((block, i) => (
                        <Block key={`${block.title}-${i}`} block={block} />
                    ))}

                    {history.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 20 }}>
                            <History size={12} />
                            {history.length} earlier upload{history.length === 1 ? '' : 's'} kept; this is the newest.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Pieces ───────────────────────────────────────────────────────────────

function Notice({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', gap: 9, padding: '12px 14px', borderRadius: 10,
            background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
            fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)',
        }}>
            <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
            <span>{children}</span>
        </div>
    );
}

function SectionHeading({ icon: Icon, title, sub }: {
    icon: React.ComponentType<{ size?: number }>;
    title: string;
    sub?: string;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
            <Icon size={13} />
            <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>{title}</h3>
            {sub && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· {sub}</span>}
        </div>
    );
}

/**
 * One block from below the grid.
 *
 * Rows carrying a single value read as a list of label-and-figure pairs, which
 * is what the cap-table blocks are; anything wider stays a table, because the
 * columns mean something there. The sheet's own layout decides which.
 */
function Block({ block }: { block: { title: string; rows: { prefix: string; label: string; cells: GridCell[] }[] } }) {
    const widest = block.rows.reduce((m, r) => Math.max(m, r.cells.length), 0);
    const isList = widest <= 1;

    if (block.rows.length === 0) return null;

    // A first row of words above rows of figures is a header, not a record:
    // "NEXT ROUND | Current | After right issue" names the columns beneath it.
    const looksNumeric = (c: GridCell) => /^[₹$]?[\d,.\-()%]+$/.test(c.value.trim());
    const [first, ...rest] = block.rows;
    const headerRow = !isList
        && first && first.cells.length > 0
        && first.cells.every(c => !looksNumeric(c))
        && rest.length >= 2
        && rest.some(r => r.cells.some(looksNumeric))
        ? first : null;
    const bodyRows = headerRow ? rest : block.rows;

    return (
        <div style={{ marginBottom: 22 }}>
            <SectionHeading icon={block.title ? Layers : CalendarClock} title={block.title || 'Also in the sheet'} />
            {isList ? (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 8,
                }}>
                    {block.rows.map((row, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
                            padding: '8px 11px', borderRadius: 8,
                            border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                        }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                {row.prefix && <span style={{ color: 'var(--text-tertiary)' }}>{row.prefix} · </span>}
                                {row.label}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                                {row.cells[0] ? <CellText cell={row.cells[0]} /> : '—'}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        {headerRow && (
                            <thead>
                                <tr>
                                    {bodyRows.some(r => r.prefix) && <th style={{ width: 64 }} />}
                                    <th style={{ minWidth: 210 }}>{headerRow.label}</th>
                                    {Array.from({ length: widest }).map((_, c) => (
                                        <th key={c} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {headerRow.cells[c]?.value ?? ''}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {bodyRows.map((row, i) => (
                                <tr key={i}>
                                    {bodyRows.some(r => r.prefix) && (
                                        <td style={{ fontSize: 10.5, color: 'var(--text-tertiary)', width: 64 }}>{row.prefix}</td>
                                    )}
                                    <td style={{ fontSize: 12, fontWeight: 600, minWidth: 210 }}>{row.label}</td>
                                    {Array.from({ length: widest }).map((_, c) => {
                                        const cell = row.cells[c];
                                        return (
                                            <td key={c} style={{
                                                fontSize: 11.5,
                                                textAlign: cell && /^[₹$]?[\d,.\-()%]+$/.test(cell.value) ? 'right' : 'left',
                                                background: cell?.fill ? `#${cell.fill}` : undefined,
                                                color: cell?.fill ? readableOn(cell.fill) : undefined,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {cell ? <CellText cell={cell} /> : ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/** Hands the file to the browser; the CSV itself comes from a pure module. */
function downloadCsv(csv: string, filename: string) {
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

export { statusFromCell };
