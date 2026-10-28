'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Eye, FileSpreadsheet, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react';

interface Upload {
    id: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
    rowsImported: number;
    rowsSkipped: number;
    rowsFlagged: number;
    hasDashboard: boolean;
    sheets: { sheet: string; description: string }[];
    hasFile: boolean;
    fileSize: number | null;
}

const fileUrl = (id: string, download = false) =>
    `/api/fund/files?id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`;

function when(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function size(bytes: number | null): string {
    if (!bytes) return '';
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Every file uploaded on the Fund page, newest first: who uploaded it, when,
 * what it brought in, and the file itself to open or download. Uploads from
 * before files were kept are listed too, without one.
 */
export default function FundUploads() {
    const [uploads, setUploads] = useState<Upload[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [viewing, setViewing] = useState<Upload | null>(null);

    useEffect(() => {
        fetch('/api/fund/files')
            .then(r => r.json())
            .then(j => { if (j.uploads) setUploads(j.uploads); else setError(j.error || 'Could not load the uploads'); })
            .catch(e => setError((e as Error).message));
    }, []);

    if (error) return <div className="fund-uploads"><div className="fund-uploads-empty" style={{ color: 'var(--danger)' }}>{error}</div></div>;
    if (!uploads) return <div className="fund-uploads"><div className="fund-uploads-empty"><Loader2 size={15} className="spin" /> Loading uploads…</div></div>;

    return (
        <div className="fund-uploads">
            <div className="fund-uploads-head">
                <div>
                    <h3>Upload history</h3>
                    <p>Every file uploaded on the Fund page, newest first. Click a file to open it.</p>
                </div>
                <span className="fund-uploads-count">{uploads.length} upload{uploads.length === 1 ? '' : 's'}</span>
            </div>

            {uploads.length === 0 ? (
                <div className="fund-uploads-empty">Nothing has been uploaded yet. Files uploaded on the Fund Ledger tab appear here.</div>
            ) : (
                <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}></th>
                                <th>File</th>
                                <th>Uploaded</th>
                                <th>By</th>
                                <th>What it brought in</th>
                                <th style={{ width: 170 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {uploads.map(u => (
                                <React.Fragment key={u.id}>
                                    <tr>
                                        <td>
                                            {u.sheets.length > 0 && (
                                                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                                                    aria-label="Show sheets" onClick={() => setOpen(o => ({ ...o, [u.id]: !o[u.id] }))}>
                                                    {open[u.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                            )}
                                        </td>
                                        <td>
                                            <div className="fund-uploads-file">
                                                <FileSpreadsheet size={15} />
                                                {u.hasFile
                                                    ? <button type="button" className="fund-uploads-name" onClick={() => setViewing(u)}>{u.fileName}</button>
                                                    : <span className="fund-uploads-name missing" title="Uploaded before files were kept">{u.fileName}</span>}
                                                {u.fileSize ? <span className="fund-uploads-meta">{size(u.fileSize)}</span> : null}
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{when(u.uploadedAt)}</td>
                                        <td>{u.uploadedBy || '—'}</td>
                                        <td className="fund-uploads-meta">
                                            {u.rowsImported} transaction{u.rowsImported === 1 ? '' : 's'}
                                            {u.rowsSkipped ? `, ${u.rowsSkipped} already on record` : ''}
                                            {u.rowsFlagged ? `, ${u.rowsFlagged} flagged` : ''}
                                        </td>
                                        <td>
                                            {u.hasFile ? (
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(u)}><Eye size={13} /> View</button>
                                                    <a className="btn btn-ghost btn-sm" href={fileUrl(u.id, true)} title="Download"><Download size={13} /></a>
                                                </div>
                                            ) : <span className="fund-uploads-meta">File not kept</span>}
                                        </td>
                                    </tr>
                                    {open[u.id] && (
                                        <tr>
                                            <td></td>
                                            <td colSpan={5}>
                                                <ul className="fund-uploads-sheets">
                                                    {u.sheets.map(s => <li key={s.sheet}><strong>{s.sheet}</strong> — {s.description}</li>)}
                                                </ul>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewing && <FileViewer upload={viewing} onClose={() => setViewing(null)} />}
        </div>
    );
}

const MAX_ROWS_SHOWN = 1000;

/** The workbook, sheet by sheet, as a table — read in the browser from the stored file. */
function FileViewer({ upload, onClose }: { upload: Upload; onClose: () => void }) {
    const [book, setBook] = useState<XLSX.WorkBook | null>(null);
    const [sheet, setSheet] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(fileUrl(upload.id))
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
            .then(buf => {
                if (cancelled) return;
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });
                setBook(wb);
                setSheet(wb.SheetNames[0] || '');
            })
            .catch(e => { if (!cancelled) setError(`Could not open the file: ${(e as Error).message}`); });
        return () => { cancelled = true; };
    }, [upload.id]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const rows = useMemo(() => {
        if (!book || !sheet) return [];
        // Formatted as Excel shows it, so the figures read as they do in the file.
        return XLSX.utils.sheet_to_json<string[]>(book.Sheets[sheet], { header: 1, defval: '', raw: false, blankrows: false });
    }, [book, sheet]);
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal fund-file-viewer" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <div className="modal-title">{upload.fileName}</div>
                        <div className="fund-uploads-meta">Uploaded {when(upload.uploadedAt)}{upload.uploadedBy ? ` by ${upload.uploadedBy}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <a className="btn btn-secondary btn-sm" href={fileUrl(upload.id, true)}><Download size={13} /> Download</a>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
                    </div>
                </div>
                {book && book.SheetNames.length > 1 && (
                    <div className="fund-file-tabs">
                        {book.SheetNames.map(n => (
                            <button key={n} type="button" className={n === sheet ? 'active' : ''} onClick={() => setSheet(n)}>{n}</button>
                        ))}
                    </div>
                )}
                <div className="modal-body" style={{ padding: 0 }}>
                    {error ? <div className="fund-uploads-empty" style={{ color: 'var(--danger)' }}>{error}</div>
                        : !book ? <div className="fund-uploads-empty"><Loader2 size={15} className="spin" /> Opening…</div>
                        : rows.length === 0 ? <div className="fund-uploads-empty">This sheet is empty.</div>
                        : (
                            <table className="fund-file-table">
                                <tbody>
                                    {rows.slice(0, MAX_ROWS_SHOWN).map((r, i) => (
                                        <tr key={i}>
                                            <th>{i + 1}</th>
                                            {Array.from({ length: width }, (_, c) => <td key={c}>{r[c] ?? ''}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    {rows.length > MAX_ROWS_SHOWN && (
                        <div className="fund-uploads-empty">Showing the first {MAX_ROWS_SHOWN} of {rows.length} rows. Download the file for the rest.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
