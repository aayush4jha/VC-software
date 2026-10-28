'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, ExternalLink, Upload, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// What the server keeps (src/lib/server/file-store.ts); checked there too.
const ACCEPT = '.pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.zip';
const SOURCE_LABEL: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', upload: 'Uploaded' };

interface CompanyDocument {
    id: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    isPitchDeck: boolean;
    source: string;
    gmailMessageId: string | null;
    hasStoredFile?: boolean;
    receivedAt: string | null;
    senderEmail: string | null;
    subject: string | null;
}

function formatSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * A company's decks and documents, openable from the company page by anyone on
 * the team: the ones that arrived by email or WhatsApp, and the ones someone
 * uploaded here — several at a time, or dropped onto the list.
 *
 * Uploads go from the browser straight into storage on a one-time link (see
 * /api/company-documents/upload), because Vercel refuses a request over 4.5 MB
 * and a deck usually is one.
 */
export default function CompanyDocuments({ companyId }: { companyId: string }) {
    // The loaded company is held alongside the rows rather than in a separate
    // loading flag, so switching company shows "loading" immediately — derived
    // from state, without a setState inside the effect to trigger a second pass.
    const [loaded, setLoaded] = useState<{ forId: string | null; docs: CompanyDocument[] }>({
        forId: null,
        docs: [],
    });
    const loading = loaded.forId !== companyId;
    const docs = loaded.docs;
    // Bumped after an upload or delete to read the list again.
    const [version, setVersion] = useState(0);
    const [progress, setProgress] = useState<string | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/company-documents?companyId=${encodeURIComponent(companyId)}`)
            .then(r => r.ok ? r.json() : { documents: [] })
            .then(j => { if (!cancelled) setLoaded({ forId: companyId, docs: j.documents || [] }); })
            .catch(() => { if (!cancelled) setLoaded({ forId: companyId, docs: [] }); });
        return () => { cancelled = true; };
    }, [companyId, version]);

    const uploadFiles = async (files: File[]) => {
        if (files.length === 0 || progress) return;
        const failed: string[] = [];
        const storage = createClient().storage.from('company-documents');
        for (const [i, file] of files.entries()) {
            setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}` : `Uploading ${file.name}`);
            try {
                const ticket = await fetch('/api/company-documents/upload', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyId, fileName: file.name, size: file.size }),
                }).then(r => r.json());
                if (!ticket.path) throw new Error(ticket.error || 'could not start the upload');

                const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, file, {
                    contentType: file.type || 'application/octet-stream',
                });
                if (error) throw new Error(error.message);

                const saved = await fetch('/api/company-documents', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyId, path: ticket.path, fileName: file.name, mimeType: file.type, size: file.size }),
                }).then(r => r.json());
                if (!saved.id) throw new Error(saved.error || 'could not save it to the company');
            } catch (err) {
                failed.push(`${file.name}: ${(err as Error).message}`);
            }
        }
        setErrors(failed);
        setProgress(null);
        setVersion(v => v + 1);
    };

    const deleteDoc = async (d: CompanyDocument) => {
        if (!window.confirm(`Delete ${d.fileName}? It is removed for everyone and cannot be recovered.`)) return;
        setDeleting(d.id);
        const res = await fetch(`/api/company-documents?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        setErrors(res.ok ? [] : [`${d.fileName}: ${j.error || 'could not delete'}`]);
        setDeleting(null);
        setVersion(v => v + 1);
    };

    const toolbar = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!!progress}
                onClick={() => fileRef.current?.click()}
                style={{ fontSize: 12 }}
            >
                {progress ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload files
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {progress || 'or drop them here · PDF, PPT, Keynote, Word, Excel · up to 25 MB each'}
            </span>
            <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT}
                style={{ display: 'none' }}
                onChange={e => {
                    uploadFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                }}
            />
        </div>
    );

    const errorList = errors.length > 0 && (
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>
            {errors.map(e => <div key={e}>{e}</div>)}
        </div>
    );

    return (
        <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
            style={{
                borderRadius: 10,
                outline: dragging ? '2px dashed var(--primary)' : 'none',
                outlineOffset: 4,
            }}
        >
            {toolbar}
            {errorList}
            {loading ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading documents…</div>
            ) : docs.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    No documents yet. Upload a deck here, or it appears when one arrives by email or WhatsApp.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {docs.map(d => {
                        // A file kept in storage (uploaded, WhatsApp, or copied from an email)
                        // opens from there; otherwise an email
                        // attachment streams from the Gmail message it arrived in.
                        const href = d.hasStoredFile
                            ? `/api/company-documents/file?id=${encodeURIComponent(d.id)}`
                            : d.gmailMessageId
                                ? `/api/gmail/attachment?messageId=${encodeURIComponent(d.gmailMessageId)}&filename=${encodeURIComponent(d.fileName)}`
                                : null;
                        const meta = [SOURCE_LABEL[d.source] || d.source, formatSize(d.sizeBytes), formatDate(d.receivedAt), d.senderEmail]
                            .filter(Boolean).join(' · ');
                        return (
                            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <a
                                    href={href || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 10px', borderRadius: 8,
                                        border: '1px solid var(--border-light)',
                                        textDecoration: 'none', color: 'inherit',
                                        cursor: href ? 'pointer' : 'default',
                                        flex: 1, minWidth: 0,
                                        opacity: href ? 1 : 0.6,
                                    }}
                                    title={d.subject || d.fileName}
                                >
                                    {d.isPitchDeck
                                        ? <FileText size={15} style={{ color: '#6366f1', flexShrink: 0 }} />
                                        : <Paperclip size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: 'block', fontSize: 13, color: 'var(--text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {d.fileName}
                                        </span>
                                        {meta && (
                                            <span style={{
                                                display: 'block', fontSize: 11, color: 'var(--text-tertiary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {meta}
                                            </span>
                                        )}
                                    </span>
                                    {d.isPitchDeck && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 600, color: '#6366f1',
                                            background: 'rgba(99,102,241,0.12)', borderRadius: 999,
                                            padding: '2px 7px', flexShrink: 0,
                                        }}>
                                            DECK
                                        </span>
                                    )}
                                    {href && <ExternalLink size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                                </a>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    title={`Delete ${d.fileName}`}
                                    aria-label={`Delete ${d.fileName}`}
                                    disabled={deleting === d.id}
                                    onClick={() => deleteDoc(d)}
                                    style={{ padding: 6, color: '#ef4444', flexShrink: 0 }}
                                >
                                    {deleting === d.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
