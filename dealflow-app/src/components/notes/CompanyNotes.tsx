'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileText, Paperclip, Send, Trash2, Loader2, X, MessageSquare, Pencil, Plus } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { uploadCompanyFile, noteFileUrl, formatBytes, type UploadedFile } from '@/lib/upload-company-file';
import { useNotesInUrl, useOpenNotes } from '@/lib/use-notes-nav';
import NoteEditor, { type NotePageData } from './NoteEditor';

/** What an empty page suggests writing. Brief and Detailed have their own. */
const PLACEHOLDERS: Record<string, string> = {
    brief: 'A short brief: what they do, the round, and why it is interesting or not…',
    detailed: 'The full note: executive summary, traction, fundraise, team, risks… Add tables, images and files from the toolbar.',
};
const DEFAULT_PLACEHOLDER = 'Write here — tables, images and files from the toolbar, or paste and drop them in…';

/** A page beneath the Notes window: Brief, Detailed Note, or one the team added. */
interface Subpage {
    key: string;
    title: string;
}

interface Comment {
    id: string;
    authorId: string | null;
    authorName: string;
    body: string;
    attachments: UploadedFile[];
    createdAt: string;
}

interface NotesData {
    /** Keyed by 'notes' or a subpage's key. */
    pages: Record<string, NotePageData>;
    subpages: Subpage[];
    comments: Comment[];
}

/**
 * Loads a company's pages and comments. Again on every page change: an editor
 * opened on what was loaded before its last save would take its own save for
 * someone else's and report a conflict.
 */
function useNotes(companyId: string, page: string) {
    const [data, setData] = useState<NotesData | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/company-notes?companyId=${encodeURIComponent(companyId)}`)
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                if (j.pages) setData({ pages: j.pages, subpages: j.subpages || [], comments: j.comments || [] });
                else setError(j.error || 'Could not load the notes');
            })
            .catch(err => { if (!cancelled) setError((err as Error).message); });
        return () => { cancelled = true; };
    }, [companyId, page]);
    return { data, error, setData };
}

function when(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The dialog: large, over the page you were on, which stays where you left it.
 * Closing it — the cross, the backdrop or Back — saves what is pending first
 * (the editor flushes on unmount).
 */
function NotesFrame({ crumbs, onClose, children }: {
    crumbs: { label: string; onClick?: () => void }[];
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="notes-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Company notes">
                <header className="notes-topbar">
                    <nav className="notes-crumbs" aria-label="Breadcrumb">
                        {crumbs.map((c, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <ChevronRight size={13} />}
                                {c.onClick ? <button type="button" onClick={c.onClick}>{c.label}</button> : <span>{c.label}</span>}
                            </React.Fragment>
                        ))}
                    </nav>
                    <span style={{ flex: 1 }} />
                    <span className="notes-topbar-hint">Saves automatically</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close notes" title="Close">
                        <X size={18} />
                    </button>
                </header>
                <div className="notes-page">{children}</div>
            </div>
        </div>
    );
}

/** The dialog for the company and page in the address bar, or nothing. */
export function NotesDialog() {
    const nav = useNotesInUrl();
    if (!nav.companyId) return null;
    // Keyed so moving between pages starts each one fresh.
    return nav.page === 'notes'
        ? <NotesHome key={`${nav.companyId}-notes`} companyId={nav.companyId} />
        : <NoteSubPage key={`${nav.companyId}-${nav.page}`} companyId={nav.companyId} pageKey={nav.page} />;
}

function useCompany(companyId: string) {
    const { companies, fundHouseCompanies, user, isLoading } = useAppContext();
    // The dialog sits above every page, so it looks among the funds too.
    const company = companies.find(c => c.id === companyId) || fundHouseCompanies.find(c => c.id === companyId) || null;
    // Companies load after sign-in; until some have, "not found" would be a lie.
    const loading = isLoading || (!company && companies.length === 0);
    return { company, user, loading };
}

function Status({ loading, error, data, needsCompany }: { loading: boolean; error: string | null; data: unknown; needsCompany: boolean }) {
    if (error) return <div className="notes-message notes-message-error">{error}</div>;
    if (loading || !data) return <div className="notes-message"><Loader2 size={16} className="spin" /> Loading notes…</div>;
    if (needsCompany) return <div className="notes-message">This company is not on the platform any more.</div>;
    return null;
}

/** The Notes window: the company at a glance, its comments, its pages, and free notes. */
function NotesHome({ companyId }: { companyId: string }) {
    const { company, user, loading } = useCompany(companyId);
    const { data, error, setData } = useNotes(companyId, 'notes');
    const { getStageById, getIndustryById, getUserById } = useAppContext();
    const nav = useOpenNotes();

    const status = <Status loading={loading} error={error} data={data} needsCompany={!loading && !company} />;
    if (!company || !data) return <NotesFrame crumbs={[{ label: 'Notes' }]} onClose={nav.close}>{status}</NotesFrame>;

    const stage = getStageById(company.pipelineStageId);
    const analyst = company.analystId ? getUserById(company.analystId) : null;
    // A fund shows its Fund House columns; a company, where it stands in the pipeline.
    const properties: [string, string][] = company.board === 'fund_house' ? [
        ['House', company.fundHouseName || '—'],
        ['Fund Manager', company.founderName || '—'],
        ['Stage', company.fundStage || '—'],
        ['Size', company.fundSize || '—'],
        ['Commitment', company.fundCommitment || '—'],
    ] : [
        ['Status', company.terminalStatus || stage?.name || '—'],
        ['Round', company.companyRound],
        ['Industry', getIndustryById(company.industryId)?.name || company.subIndustry || '—'],
        ['Analyst', analyst?.name || 'Unassigned'],
        ['Founder', [company.founderName, company.founderEmail].filter(Boolean).join(' · ') || '—'],
    ];

    return (
        <NotesFrame crumbs={[{ label: company.companyName }, { label: 'Notes' }]} onClose={nav.close}>
            <h1 className="notes-title">{company.companyName}</h1>
            <dl className="notes-properties">
                {properties.map(([k, v]) => (
                    <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
                ))}
            </dl>

            <Comments
                companyId={companyId}
                comments={data.comments}
                me={user?.id}
                isAdmin={user?.role === 'admin'}
                onChange={comments => setData(d => d && { ...d, comments })}
            />

            <Subpages
                companyId={companyId}
                subpages={data.subpages}
                pages={data.pages}
                onChange={subpages => setData(d => d && { ...d, subpages })}
            />

            <NoteEditor companyId={companyId} kind="notes" initial={data.pages.notes}
                placeholder="Notes on this company — tables, images and files from the toolbar, or paste and drop them in…" />
        </NotesFrame>
    );
}

/** A page beneath Notes — Brief, Detailed Note or one of the team's: one document, the whole window. */
function NoteSubPage({ companyId, pageKey }: { companyId: string; pageKey: string }) {
    const { company, loading } = useCompany(companyId);
    const { data, error } = useNotes(companyId, pageKey);
    const page = data?.subpages.find(p => p.key === pageKey);
    const nav = useOpenNotes();

    const crumbs = [
        { label: company?.companyName || 'Company', onClick: () => nav.open(companyId) },
        { label: 'Notes', onClick: () => nav.open(companyId) },
        { label: page?.title || 'Page' },
    ];
    const status = <Status loading={loading} error={error} data={data} needsCompany={!loading && !company} />;
    if (!company || !data) return <NotesFrame crumbs={crumbs} onClose={nav.close}>{status}</NotesFrame>;
    if (!page) {
        return (
            <NotesFrame crumbs={crumbs} onClose={nav.close}>
                <div className="notes-message">This page has been deleted.</div>
            </NotesFrame>
        );
    }

    return (
        <NotesFrame crumbs={crumbs} onClose={nav.close}>
            <h1 className="notes-title">{page.title}</h1>
            <div className="notes-subtitle">{company.companyName}</div>
            <NoteEditor companyId={companyId} kind={pageKey} initial={data.pages[pageKey]}
                placeholder={PLACEHOLDERS[pageKey] || DEFAULT_PLACEHOLDER} />
        </NotesFrame>
    );
}

/**
 * The pages beneath Notes, each opening on its own, with a way to add one and
 * to rename or delete any of them — Brief and Detailed included.
 */
function Subpages({ companyId, subpages, pages, onChange }: {
    companyId: string;
    subpages: Subpage[];
    pages: Record<string, NotePageData>;
    onChange: (subpages: Subpage[]) => void;
}) {
    const nav = useOpenNotes();
    const [renaming, setRenaming] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const call = async (method: string, body?: object, query?: string) => {
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/company-notes/subpages${query ? `?${query}` : ''}`, {
            method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) { setError(j.error || `Could not save (HTTP ${res.status})`); return null; }
        return j;
    };

    const create = async (title: string) => {
        setCreating(false);
        const j = await call('POST', { companyId, title });
        if (!j?.subpage) return;
        onChange([...subpages, j.subpage]);
        nav.open(companyId, j.subpage.key);
    };

    const rename = async (p: Subpage, title: string) => {
        setRenaming(null);
        if (title === p.title) return;
        const j = await call('PATCH', { companyId, key: p.key, title });
        if (j?.subpage) onChange(subpages.map(x => x.key === p.key ? j.subpage : x));
    };

    const remove = async (p: Subpage) => {
        if (!window.confirm(`Delete "${p.title}" and everything written in it? This cannot be undone.`)) return;
        const j = await call('DELETE', undefined, new URLSearchParams({ companyId, key: p.key }).toString());
        if (j) onChange(subpages.filter(x => x.key !== p.key));
    };

    return (
        <div className="notes-subpages">
            {subpages.map(p => {
                if (renaming === p.key) {
                    return <TitleInput key={p.key} initial={p.title} onDone={t => rename(p, t)} onCancel={() => setRenaming(null)} />;
                }
                const page = pages[p.key];
                return (
                    <div key={p.key} className="notes-subpage-row">
                        <button type="button" onClick={() => nav.open(companyId, p.key)} className="notes-subpage-link">
                            <FileText size={17} />
                            <span className="notes-subpage-title">{p.title}</span>
                            <span className="notes-subpage-meta">
                                {page?.updatedAt ? `Edited ${when(page.updatedAt)}${page.updatedByName ? ` by ${page.updatedByName}` : ''}` : 'Empty'}
                            </span>
                        </button>
                        <button type="button" className="notes-subpage-action" title="Rename" aria-label={`Rename ${p.title}`}
                            disabled={busy} onClick={() => setRenaming(p.key)}>
                            <Pencil size={14} />
                        </button>
                        <button type="button" className="notes-subpage-action notes-subpage-delete" title="Delete" aria-label={`Delete ${p.title}`}
                            disabled={busy} onClick={() => remove(p)}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                );
            })}
            {creating
                ? <TitleInput initial="" placeholder="Name the new page, then press Enter" onDone={create} onCancel={() => setCreating(false)} />
                : (
                    <button type="button" className="notes-subpage-new" disabled={busy} onClick={() => setCreating(true)}>
                        {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} New page
                    </button>
                )}
            {error && <div className="notes-subpage-error">{error}</div>}
        </div>
    );
}

/** A page name being typed: Enter or clicking away keeps it, Escape (or leaving it blank) drops it. */
function TitleInput({ initial, placeholder, onDone, onCancel }: {
    initial: string;
    placeholder?: string;
    onDone: (title: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initial);
    // Enter unmounts the input, which blurs it: without this it would finish twice.
    const finished = useRef(false);
    const finish = (keep: boolean) => {
        if (finished.current) return;
        finished.current = true;
        const title = value.trim();
        if (keep && title) onDone(title); else onCancel();
    };
    return (
        <div className="notes-subpage-row notes-subpage-editing">
            <FileText size={17} />
            <input
                autoFocus value={value} placeholder={placeholder} maxLength={120}
                onChange={e => setValue(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
                }}
                onBlur={() => finish(true)}
            />
        </div>
    );
}

/** The comment thread on the Notes window — a line, a file, or both, by whoever is on the deal. */
function Comments({ companyId, comments, me, isAdmin, onChange }: {
    companyId: string;
    comments: Comment[];
    me?: string;
    isAdmin: boolean;
    onChange: (comments: Comment[]) => void;
}) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const attach = async (picked: File[]) => {
        setError(null);
        for (const f of picked) {
            setBusy(`Uploading ${f.name}…`);
            try { const up = await uploadCompanyFile(companyId, f, 'notes'); setFiles(prev => [...prev, up]); }
            catch (err) { setError(`${f.name}: ${(err as Error).message}`); }
        }
        setBusy(null);
    };

    const post = async () => {
        if (busy || (!text.trim() && files.length === 0)) return;
        setBusy('Posting…');
        setError(null);
        const res = await fetch('/api/company-notes/comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, body: text, attachments: files }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(null);
        if (!res.ok || !j.comment) { setError(j.error || 'Could not post the comment'); return; }
        onChange([...comments, j.comment]);
        setText('');
        setFiles([]);
    };

    const remove = async (c: Comment) => {
        if (!window.confirm('Delete this comment and its files?')) return;
        const res = await fetch(`/api/company-notes/comments?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'Could not delete the comment'); return; }
        onChange(comments.filter(x => x.id !== c.id));
    };

    return (
        <section className="notes-comments" aria-label="Comments">
            <h2><MessageSquare size={15} /> Comments</h2>
            {comments.map(c => (
                <div key={c.id} className="notes-comment">
                    <div className="notes-comment-avatar">{(c.authorName || '?').charAt(0).toUpperCase()}</div>
                    <div className="notes-comment-main">
                        <div className="notes-comment-head">
                            <strong>{c.authorName || 'Someone'}</strong>
                            <span>{when(c.createdAt)}</span>
                            {(c.authorId === me || isAdmin) && (
                                <button type="button" className="notes-comment-delete" title="Delete comment" aria-label="Delete comment" onClick={() => remove(c)}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                        {c.body && <div className="notes-comment-body">{c.body}</div>}
                        {c.attachments.length > 0 && (
                            <div className="notes-comment-files">
                                {c.attachments.map(a => <FileChip key={a.path} file={a} />)}
                            </div>
                        )}
                    </div>
                </div>
            ))}

            <div className="notes-comment-composer">
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }}
                    placeholder="Add a comment… (Ctrl/⌘ + Enter to post)"
                    rows={2}
                />
                {files.length > 0 && (
                    <div className="notes-comment-files">
                        {files.map(f => (
                            <span key={f.path} className="note-file">
                                <span className="note-file-icon">📎</span>
                                <span className="note-file-name">{f.name}</span>
                                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter(x => x.path !== f.path))}><X size={12} /></button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="notes-comment-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                        <Paperclip size={14} /> Attach
                    </button>
                    <span className="notes-comment-status">{busy || error}</span>
                    <button type="button" className="btn btn-primary btn-sm" onClick={post} disabled={!!busy || (!text.trim() && files.length === 0)}>
                        <Send size={13} /> Comment
                    </button>
                </div>
                <input ref={fileRef} type="file" multiple hidden
                    accept=".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.zip,image/*"
                    onChange={e => { attach(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>
        </section>
    );
}

function FileChip({ file }: { file: UploadedFile }) {
    const url = noteFileUrl(file.path);
    if (/^image\//.test(file.mimeType)) {
        return (
            <a href={url} target="_blank" rel="noreferrer" className="notes-comment-image" title={file.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind our own redirect, not an optimisable asset */}
                <img src={url} alt={file.name} />
            </a>
        );
    }
    return (
        <a href={url} target="_blank" rel="noreferrer" className="note-file">
            <span className="note-file-icon">📎</span>
            <span className="note-file-name">{file.name}</span>
            <span className="note-file-size">{formatBytes(file.size)}</span>
        </a>
    );
}
