'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, FileText, Paperclip, Send, Trash2, Loader2, X, MessageSquare } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { uploadCompanyFile, noteFileUrl, formatBytes, type UploadedFile } from '@/lib/upload-company-file';
import NoteEditor, { type NotePageData } from './NoteEditor';

export type NoteKind = 'notes' | 'brief' | 'detailed';

export const SUB_PAGES: { kind: Exclude<NoteKind, 'notes'>; title: string; placeholder: string }[] = [
    { kind: 'brief', title: 'Brief', placeholder: 'A short brief: what they do, the round, and why it is interesting or not…' },
    { kind: 'detailed', title: 'Detailed Note', placeholder: 'The full note: executive summary, traction, fundraise, team, risks… Add tables, images and files from the toolbar.' },
];

interface Comment {
    id: string;
    authorId: string | null;
    authorName: string;
    body: string;
    attachments: UploadedFile[];
    createdAt: string;
}

interface NotesData {
    pages: Record<NoteKind, NotePageData>;
    comments: Comment[];
}

/** Loads a company's pages and comments once; the editors and thread own them after that. */
function useNotes(companyId: string) {
    const [data, setData] = useState<NotesData | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/company-notes?companyId=${encodeURIComponent(companyId)}`)
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                if (j.pages) setData({ pages: j.pages, comments: j.comments || [] });
                else setError(j.error || 'Could not load the notes');
            })
            .catch(err => { if (!cancelled) setError((err as Error).message); });
        return () => { cancelled = true; };
    }, [companyId]);
    return { data, error, setData };
}

function when(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The full-screen frame: no sidebar, a way back, and where you are. Notes are
 * read and written at length, so they get the whole window.
 */
function NotesShell({ crumbs, children }: {
    crumbs: { label: string; href?: string }[];
    children: React.ReactNode;
}) {
    return (
        <div className="notes-shell">
            <header className="notes-topbar">
                <Link href="/dealflow" className="notes-back"><ArrowLeft size={15} /> Deal Flow</Link>
                <nav className="notes-crumbs" aria-label="Breadcrumb">
                    {crumbs.map((c, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={13} />}
                            {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                        </React.Fragment>
                    ))}
                </nav>
                <span style={{ flex: 1 }} />
                <span className="notes-topbar-hint">Saves automatically</span>
            </header>
            <main className="notes-page">{children}</main>
        </div>
    );
}

function useCompany(companyId: string) {
    const { companies, user, isLoading } = useAppContext();
    const company = companies.find(c => c.id === companyId) || null;
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

/** The Notes window: the company at a glance, its comments, its two pages, and free notes. */
export function NotesHome({ companyId }: { companyId: string }) {
    const { company, user, loading } = useCompany(companyId);
    const { data, error, setData } = useNotes(companyId);
    const { getStageById, getIndustryById, getUserById } = useAppContext();
    const base = `/dealflow/notes/${companyId}`;

    const status = <Status loading={loading} error={error} data={data} needsCompany={!loading && !company} />;
    if (!company || !data) return <NotesShell crumbs={[{ label: 'Notes' }]}>{status}</NotesShell>;

    const stage = getStageById(company.pipelineStageId);
    const analyst = company.analystId ? getUserById(company.analystId) : null;
    const properties: [string, string][] = [
        ['Status', company.terminalStatus || stage?.name || '—'],
        ['Round', company.companyRound],
        ['Industry', getIndustryById(company.industryId)?.name || company.subIndustry || '—'],
        ['Analyst', analyst?.name || 'Unassigned'],
        ['Founder', [company.founderName, company.founderEmail].filter(Boolean).join(' · ') || '—'],
    ];

    return (
        <NotesShell crumbs={[{ label: company.companyName }, { label: 'Notes' }]}>
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

            <div className="notes-subpages">
                {SUB_PAGES.map(p => {
                    const page = data.pages[p.kind];
                    return (
                        <Link key={p.kind} href={`${base}/${p.kind}`} className="notes-subpage-link">
                            <FileText size={17} />
                            <span className="notes-subpage-title">{p.title}</span>
                            <span className="notes-subpage-meta">
                                {page.updatedAt ? `Edited ${when(page.updatedAt)}${page.updatedByName ? ` by ${page.updatedByName}` : ''}` : 'Empty'}
                            </span>
                        </Link>
                    );
                })}
            </div>

            <NoteEditor companyId={companyId} kind="notes" initial={data.pages.notes}
                placeholder="Notes on this company — tables, images and files from the toolbar, or paste and drop them in…" />
        </NotesShell>
    );
}

/** Brief or Detailed Note: one document, the whole window. */
export function NoteSubPage({ companyId, kind }: { companyId: string; kind: Exclude<NoteKind, 'notes'> }) {
    const { company, loading } = useCompany(companyId);
    const { data, error } = useNotes(companyId);
    const page = SUB_PAGES.find(p => p.kind === kind)!;
    const base = `/dealflow/notes/${companyId}`;

    const crumbs = [{ label: company?.companyName || 'Company', href: base }, { label: page.title }];
    const status = <Status loading={loading} error={error} data={data} needsCompany={!loading && !company} />;
    if (!company || !data) return <NotesShell crumbs={crumbs}>{status}</NotesShell>;

    return (
        <NotesShell crumbs={crumbs}>
            <h1 className="notes-title">{page.title}</h1>
            <div className="notes-subtitle">{company.companyName}</div>
            <NoteEditor companyId={companyId} kind={kind} initial={data.pages[kind]} placeholder={page.placeholder} />
        </NotesShell>
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
