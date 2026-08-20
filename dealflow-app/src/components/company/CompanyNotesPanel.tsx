'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    X, Plus, Search, Pin, PinOff, Pencil, Trash2, Check,
    Loader2, NotebookPen, AlertTriangle,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { COMPANY_NOTE_CATEGORIES } from '@/types/database';
import type { Company, CompanyNote } from '@/types/database';

/** Accent colour per category — drives the card's left stripe and its pill. */
const CATEGORY_COLORS: Record<string, string> = {
    General: '#6366f1',
    Update: '#3b82f6',
    Meeting: '#8b5cf6',
    Call: '#14b8a6',
    Financial: '#10b981',
    Milestone: '#f59e0b',
    Risk: '#ef4444',
    'Action Item': '#ec4899',
};
const categoryColor = (c: string) => CATEGORY_COLORS[c] || '#6366f1';

const todayISO = () => new Date().toISOString().slice(0, 10);

/** "19 Aug 2026" — matches the date formatting used across the portfolio views. */
function formatNoteDate(iso: string): string {
    if (!iso) return '--';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Group heading, e.g. "August 2026". */
function monthLabel(iso: string): string {
    if (!iso) return 'Undated';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'Undated';
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function relativeTime(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.round((Date.now() - then) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Newest first: by the business date, then by insertion order within a day. */
function byNewest(a: CompanyNote, b: CompanyNote): number {
    if (a.noteDate !== b.noteDate) return a.noteDate < b.noteDate ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

interface DraftState {
    noteDate: string;
    category: string;
    title: string;
    content: string;
    pinned: boolean;
}

const emptyDraft = (): DraftState => ({
    noteDate: todayISO(), category: 'General', title: '', content: '', pinned: false,
});

export default function CompanyNotesPanel({
    company, onClose, onCountChange,
}: {
    company: Company;
    onClose: () => void;
    onCountChange?: (count: number) => void;
}) {
    const {
        fetchCompanyNotes, addCompanyNote, updateCompanyNote, deleteCompanyNote, updateCompany,
    } = useAppContext();

    const [notes, setNotes] = useState<CompanyNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [composerOpen, setComposerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<DraftState>(emptyDraft);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('All');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [nudgeUnsaved, setNudgeUnsaved] = useState(false);
    const [draftError, setDraftError] = useState<string | null>(null);

    const bodyRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLTextAreaElement>(null);
    // The legacy `companies.notes` blob is absorbed exactly once per mount;
    // a ref (not state) so a re-render mid-flight can't fire it twice.
    const absorbedRef = useRef(false);

    const dirty = composerOpen && (draft.title.trim() !== '' || draft.content.trim() !== '');

    // ─── Load ──────────────────────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        const { notes: rows, error: err } = await fetchCompanyNotes(company.id);
        setNotes(rows.sort(byNewest));
        setError(err);
        setLoading(false);
        return { rows, err };
    }, [company.id, fetchCompanyNotes]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { rows, err } = await load();
            if (cancelled || err) return;

            // One-time migration: the old single-field note (companies.notes,
            // still written by the portfolio company form) becomes the first
            // timeline entry, then the column is cleared so there is exactly
            // one place notes live.
            const legacy = (company.notes || '').trim();
            if (!legacy || rows.length > 0 || absorbedRef.current) return;
            absorbedRef.current = true;

            const { note, error: addErr } = await addCompanyNote({
                companyId: company.id,
                noteDate: (company.entryDate || company.createdAt || new Date().toISOString()).slice(0, 10),
                category: 'General',
                title: 'Imported note',
                content: legacy,
                authorName: 'Imported',
            });
            if (cancelled) return;
            if (addErr || !note) { absorbedRef.current = false; return; }
            await updateCompany(company.id, { notes: '' });
            if (!cancelled) setNotes(prev => [...prev, note].sort(byNewest));
        })();
        return () => { cancelled = true; };
    }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { onCountChange?.(notes.length); }, [notes.length, onCountChange]);

    // ─── Composer ──────────────────────────────────
    const closeComposer = useCallback(() => {
        setComposerOpen(false);
        setEditingId(null);
        setDraft(emptyDraft());
        setDraftError(null);
    }, []);

    // Escape closes the composer first, then the pane. The detail modal
    // behind us suspends its own Escape handler while this pane is open.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (composerOpen) closeComposer();
            else if (!dirty) onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [composerOpen, closeComposer, onClose, dirty]);

    const openComposer = () => {
        setEditingId(null);
        setDraft(emptyDraft());
        setComposerOpen(true);
        setConfirmDeleteId(null);
        bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => contentRef.current?.focus(), 60);
    };

    const openEditor = (note: CompanyNote) => {
        setEditingId(note.id);
        setDraft({
            noteDate: note.noteDate || todayISO(),
            category: note.category || 'General',
            title: note.title || '',
            content: note.content || '',
            pinned: note.pinned,
        });
        setComposerOpen(true);
        setConfirmDeleteId(null);
        bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => contentRef.current?.focus(), 60);
    };

    const handleSave = async () => {
        const content = draft.content.trim();
        const title = draft.title.trim();
        if (!content && !title) {
            setDraftError('Write something before saving this note.');
            contentRef.current?.focus();
            return;
        }
        setSaving(true);
        setDraftError(null);
        setError(null);

        const payload = {
            noteDate: draft.noteDate || todayISO(),
            category: draft.category,
            title,
            content,
            pinned: draft.pinned,
        };

        if (editingId) {
            const { note, error: err } = await updateCompanyNote(editingId, payload);
            if (err) { setError(err); setSaving(false); return; }
            setNotes(prev => prev
                .map(n => (n.id === editingId
                    ? note ?? { ...n, ...payload, updatedAt: new Date().toISOString() }
                    : n))
                .sort(byNewest));
        } else {
            const { note, error: err } = await addCompanyNote({ companyId: company.id, ...payload });
            if (err || !note) { setError(err || 'Could not save note.'); setSaving(false); return; }
            setNotes(prev => [...prev, note].sort(byNewest));
        }

        // A stale category filter would hide the note that was just written.
        if (categoryFilter !== 'All' && categoryFilter !== payload.category) setCategoryFilter('All');
        setSaving(false);
        closeComposer();
    };

    const togglePin = async (note: CompanyNote) => {
        const next = !note.pinned;
        setNotes(prev => prev.map(n => (n.id === note.id ? { ...n, pinned: next } : n)));
        const { error: err } = await updateCompanyNote(note.id, { pinned: next });
        if (err) {
            setError(err);
            setNotes(prev => prev.map(n => (n.id === note.id ? { ...n, pinned: !next } : n)));
        }
    };

    const handleDelete = async (id: string) => {
        const snapshot = notes;
        setNotes(prev => prev.filter(n => n.id !== id));
        setConfirmDeleteId(null);
        if (editingId === id) closeComposer();
        const { error: err } = await deleteCompanyNote(id);
        if (err) { setError(err); setNotes(snapshot); }
    };

    const toggleExpanded = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // ─── Derived: filter, then split pinned vs timeline ──
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return notes.filter(n => {
            if (categoryFilter !== 'All' && n.category !== categoryFilter) return false;
            if (!q) return true;
            return `${n.title} ${n.content} ${n.category} ${n.authorName}`.toLowerCase().includes(q);
        });
    }, [notes, search, categoryFilter]);

    const pinned = useMemo(() => visible.filter(n => n.pinned), [visible]);
    const timeline = useMemo(() => visible.filter(n => !n.pinned), [visible]);

    // Month buckets keep long histories scannable while staying newest-first.
    const months = useMemo(() => {
        const groups: { label: string; notes: CompanyNote[] }[] = [];
        for (const n of timeline) {
            const label = monthLabel(n.noteDate);
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.notes.push(n);
            else groups.push({ label, notes: [n] });
        }
        return groups;
    }, [timeline]);

    // Categories actually in use, so the chip row doesn't list empty filters.
    const usedCategories = useMemo(() => {
        const set = new Set(notes.map(n => n.category));
        return COMPANY_NOTE_CATEGORIES.filter(c => set.has(c));
    }, [notes]);

    const filtersActive = search.trim() !== '' || categoryFilter !== 'All';
    const missingTable = !!error && /company_notes|does not exist|schema cache|not allowed/i.test(error);

    const renderCard = (note: CompanyNote) => {
        const accent = categoryColor(note.category);
        const isLong = note.content.length > 420 || note.content.split('\n').length > 7;
        const isOpen = expanded.has(note.id);
        const edited = note.updatedAt && note.createdAt
            && new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000;

        return (
            <div
                key={note.id}
                className={`note-card${note.pinned ? ' is-pinned' : ''}`}
                style={{ ['--note-accent' as string]: accent }}
            >
                <div className="note-card-top">
                    <span className="note-card-date">{formatNoteDate(note.noteDate)}</span>
                    <span className="note-card-cat" style={{ background: `${accent}1a`, color: accent }}>
                        {note.category}
                    </span>
                    {note.pinned && (
                        <span className="note-card-pin" title="Pinned"><Pin size={11} fill="currentColor" /></span>
                    )}
                    <div className="note-card-actions">
                        <button
                            className={`note-action-btn${note.pinned ? ' on' : ''}`}
                            title={note.pinned ? 'Unpin' : 'Pin to top'}
                            onClick={() => togglePin(note)}
                        >
                            {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button className="note-action-btn" title="Edit note" onClick={() => openEditor(note)}>
                            <Pencil size={14} />
                        </button>
                        <button
                            className="note-action-btn danger"
                            title="Delete note"
                            onClick={() => setConfirmDeleteId(note.id)}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                {note.title && <div className="note-card-title">{note.title}</div>}
                {note.content && (
                    <>
                        <div className={`note-card-body${isLong && !isOpen ? ' clamped' : ''}`}>{note.content}</div>
                        {isLong && (
                            <button className="note-card-more" onClick={() => toggleExpanded(note.id)}>
                                {isOpen ? 'Show less' : 'Show more'}
                            </button>
                        )}
                    </>
                )}

                <div className="note-card-meta">
                    <span>{note.authorName || 'Unknown'}</span>
                    <span className="note-card-meta-dot" />
                    <span>{edited ? `edited ${relativeTime(note.updatedAt)}` : `added ${relativeTime(note.createdAt)}`}</span>
                </div>

                {confirmDeleteId === note.id && (
                    <div className="note-card-confirm">
                        <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>Delete this note?</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        <button
                            className="btn btn-sm"
                            style={{ background: 'var(--danger)', color: '#fff' }}
                            onClick={() => handleDelete(note.id)}
                        >
                            Delete
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // Closing with an unsaved draft would discard it silently — nudge instead.
    const requestClose = () => {
        if (!dirty) { onClose(); return; }
        setNudgeUnsaved(true);
        bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        contentRef.current?.focus();
        setTimeout(() => setNudgeUnsaved(false), 2200);
    };

    return (
            <aside className="notes-pane" aria-label={`Notes for ${company.companyName}`}>
                {/* Header */}
                <div className="notes-pane-header">
                    <div className="notes-pane-icon"><NotebookPen size={16} /></div>
                    <div className="notes-pane-title">Notes</div>
                    {!loading && notes.length > 0 && (
                        <span className="notes-pane-count">{notes.length}</span>
                    )}
                    <button className="note-action-btn" onClick={requestClose} title="Close notes">
                        <X size={16} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="notes-pane-toolbar">
                    <div className="notes-pane-toolbar-row">
                        <button className="btn btn-sm btn-primary" onClick={openComposer} disabled={missingTable}>
                            <Plus size={14} /> New note
                        </button>
                        <div className="notes-pane-search">
                            <Search size={14} />
                            <input
                                type="text"
                                placeholder="Search notes…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    {usedCategories.length > 0 && (
                        <div className="notes-chips">
                            <button
                                className={`notes-chip${categoryFilter === 'All' ? ' active' : ''}`}
                                onClick={() => setCategoryFilter('All')}
                            >
                                All {notes.length}
                            </button>
                            {usedCategories.map(cat => (
                                <button
                                    key={cat}
                                    className={`notes-chip${categoryFilter === cat ? ' active' : ''}`}
                                    onClick={() => setCategoryFilter(categoryFilter === cat ? 'All' : cat)}
                                >
                                    <span className="notes-chip-dot" style={{ background: categoryColor(cat) }} />
                                    {cat}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="notes-pane-body" ref={bodyRef}>
                    {error && (
                        <div className="notes-pane-error">
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                                {missingTable
                                    ? 'Notes storage isn’t set up on the database yet — run supabase/company-notes.sql in the Supabase SQL editor, then reopen this panel.'
                                    : error}
                            </span>
                        </div>
                    )}

                    {composerOpen && (
                        <div className={`notes-composer${nudgeUnsaved ? ' nudge' : ''}`}>
                            <div className="notes-composer-grid">
                                <div className="notes-composer-field">
                                    <label className="notes-composer-label">Date</label>
                                    <input
                                        type="date"
                                        value={draft.noteDate}
                                        onChange={e => setDraft(d => ({ ...d, noteDate: e.target.value }))}
                                    />
                                </div>
                                <div className="notes-composer-field">
                                    <label className="notes-composer-label">Category</label>
                                    <select
                                        value={draft.category}
                                        onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                                    >
                                        {COMPANY_NOTE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="notes-composer-field" style={{ marginBottom: 10 }}>
                                <label className="notes-composer-label">Title (optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Q3 board meeting"
                                    value={draft.title}
                                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                                />
                            </div>
                            <div className="notes-composer-field">
                                <label className="notes-composer-label">Note</label>
                                <textarea
                                    ref={contentRef}
                                    placeholder="What happened, what changed, what to follow up on…"
                                    value={draft.content}
                                    onChange={e => { setDraft(d => ({ ...d, content: e.target.value })); if (draftError) setDraftError(null); }}
                                    onKeyDown={e => {
                                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
                                    }}
                                />
                            </div>
                            {draftError && (
                                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--danger)' }}>
                                    {draftError}
                                </div>
                            )}
                            <div className="notes-composer-actions">
                                <button
                                    type="button"
                                    className={`notes-pin-toggle${draft.pinned ? ' on' : ''}`}
                                    onClick={() => setDraft(d => ({ ...d, pinned: !d.pinned }))}
                                    title="Keep this note at the top of the list"
                                >
                                    {draft.pinned ? <Pin size={12} fill="currentColor" /> : <Pin size={12} />}
                                    {draft.pinned ? 'Pinned' : 'Pin'}
                                </button>
                                <span className="notes-composer-hint" style={nudgeUnsaved ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                                    {nudgeUnsaved ? 'Save or cancel this note first' : '⌘↵ to save'}
                                </span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                    <button className="btn btn-sm btn-ghost" onClick={closeComposer} disabled={saving}>
                                        Cancel
                                    </button>
                                    <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                                        {saving
                                            ? <><Loader2 size={14} className="spin" /> Saving…</>
                                            : <><Check size={14} /> {editingId ? 'Update note' : 'Save note'}</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="notes-empty">
                            <Loader2 size={20} className="spin" style={{ color: 'var(--text-tertiary)' }} />
                            <div className="notes-empty-text" style={{ marginTop: 10 }}>Loading notes…</div>
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="notes-empty">
                            <div className="notes-empty-icon"><NotebookPen size={24} /></div>
                            <div className="notes-empty-title">
                                {filtersActive ? 'No matching notes' : 'No notes yet'}
                            </div>
                            <div className="notes-empty-text">
                                {filtersActive
                                    ? 'Try a different search term or clear the category filter.'
                                    : `Track updates, calls, board meetings and risks for ${company.companyName}. The newest note always sits on top.`}
                            </div>
                            {filtersActive ? (
                                <button
                                    className="btn btn-sm btn-secondary"
                                    style={{ marginTop: 14 }}
                                    onClick={() => { setSearch(''); setCategoryFilter('All'); }}
                                >
                                    Clear filters
                                </button>
                            ) : !composerOpen && !missingTable && (
                                <button className="btn btn-sm btn-primary" style={{ marginTop: 14 }} onClick={openComposer}>
                                    <Plus size={14} /> Add the first note
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {pinned.length > 0 && (
                                <div className="notes-group">
                                    <div className="notes-group-label">
                                        <Pin size={11} /> Pinned
                                    </div>
                                    {pinned.map(renderCard)}
                                </div>
                            )}
                            {months.map(group => (
                                <div className="notes-group" key={group.label}>
                                    <div className="notes-group-label">{group.label}</div>
                                    {group.notes.map(renderCard)}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </aside>
    );
}
