'use client';

import React, { useState } from 'react';
import { Upload, Check, AlertCircle, FileX, ExternalLink, Plus, X, Link as LinkIcon } from 'lucide-react';
import { type LegalRecord, type DocumentStatus } from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const STATUS_META: Record<DocumentStatus, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    missing: { color: '#b91c1c', bg: 'rgba(239, 68, 68, 0.12)', label: 'Missing', icon: <FileX size={12} /> },
    uploaded: { color: '#b45309', bg: 'rgba(245, 158, 11, 0.12)', label: 'Uploaded', icon: <Upload size={12} /> },
    verified: { color: '#047857', bg: 'rgba(16, 185, 129, 0.12)', label: 'Verified', icon: <Check size={12} /> },
};

function isValidUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function shortLink(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
    } catch {
        return url;
    }
}

export default function DocumentManager({ record, onUpdate }: Props) {
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const pre = record.documents.filter(d => d.category === 'pre');
    const post = record.documents.filter(d => d.category === 'post');

    const setStatus = (id: string, status: DocumentStatus) => {
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => d.id === id ? {
                ...d,
                status,
                uploadedAt: status === 'uploaded' || status === 'verified'
                    ? d.uploadedAt || new Date().toISOString()
                    : undefined,
            } : d),
        }));
    };

    const setNotes = (id: string, notes: string) => {
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => d.id === id ? { ...d, notes } : d),
        }));
    };

    const addLink = (docId: string) => {
        const raw = (drafts[docId] || '').trim();
        if (!raw) return;
        if (!isValidUrl(raw)) {
            setErrors(e => ({ ...e, [docId]: 'Enter a valid http(s):// URL.' }));
            return;
        }
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => {
                if (d.id !== docId) return d;
                if (d.links.includes(raw)) return d;
                const nextLinks = [...d.links, raw];
                return {
                    ...d,
                    links: nextLinks,
                    // Promote out of "missing" the moment a link is attached;
                    // keep "verified" if already there.
                    status: d.status === 'missing' ? 'uploaded' : d.status,
                    uploadedAt: d.uploadedAt || new Date().toISOString(),
                };
            }),
        }));
        setDrafts(d => ({ ...d, [docId]: '' }));
        setErrors(e => ({ ...e, [docId]: '' }));
    };

    const removeLink = (docId: string, link: string) => {
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => {
                if (d.id !== docId) return d;
                const nextLinks = d.links.filter(l => l !== link);
                return {
                    ...d,
                    links: nextLinks,
                    // No links left → reset back to "missing" unless the user
                    // explicitly verified it (they may want to keep that state).
                    status: nextLinks.length === 0 && d.status === 'uploaded' ? 'missing' : d.status,
                };
            }),
        }));
    };

    const renderRow = (doc: typeof record.documents[number]) => {
        const meta = STATUS_META[doc.status];
        const draft = drafts[doc.id] || '';
        const err = errors[doc.id];
        return (
            <div key={doc.id} className="doc-row">
                <div className="doc-row-main">
                    <div className="doc-row-name">
                        <span>{doc.name}</span>
                        {doc.required && <span className="doc-required-tag">required</span>}
                    </div>
                    <div className="doc-row-controls">
                        <span className="doc-status-badge" style={{ color: meta.color, backgroundColor: meta.bg }}>
                            {meta.icon} {meta.label}
                        </span>
                        <div className="view-toggle">
                            {(['missing', 'uploaded', 'verified'] as DocumentStatus[]).map(s => (
                                <button
                                    key={s}
                                    className={`view-toggle-btn ${doc.status === s ? 'active' : ''}`}
                                    onClick={() => setStatus(doc.id, s)}
                                    style={{ fontSize: 11, padding: '4px 8px' }}
                                >
                                    {STATUS_META[s].label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Saved links */}
                {doc.links.length > 0 && (
                    <div className="doc-links">
                        {doc.links.map(link => (
                            <span key={link} className="doc-link-chip">
                                <LinkIcon size={11} />
                                <a href={link} target="_blank" rel="noopener noreferrer" title={link}>
                                    {shortLink(link)}
                                </a>
                                <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="doc-link-open"
                                    title="Open in new tab"
                                >
                                    <ExternalLink size={11} />
                                </a>
                                <button
                                    type="button"
                                    className="doc-link-remove"
                                    onClick={() => removeLink(doc.id, link)}
                                    title="Remove link"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Add-link input */}
                <div className="doc-link-add">
                    <input
                        className="rights-inline-input"
                        type="url"
                        placeholder="Paste Drive link (https://...)"
                        value={draft}
                        onChange={e => {
                            setDrafts(d => ({ ...d, [doc.id]: e.target.value }));
                            if (err) setErrors(er => ({ ...er, [doc.id]: '' }));
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addLink(doc.id);
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => addLink(doc.id)}
                        disabled={!draft.trim()}
                    >
                        <Plus size={12} /> Add link
                    </button>
                </div>
                {err && <div className="doc-link-error">{err}</div>}

                <input
                    className="rights-inline-input"
                    placeholder="Notes / reference"
                    value={doc.notes}
                    onChange={e => setNotes(doc.id, e.target.value)}
                />
            </div>
        );
    };

    const missingRequired = record.documents.filter(d => d.required && d.status === 'missing').length;

    return (
        <div className="doc-manager">
            <div className="legal-section-header">
                <div>
                    <h3>Document Management</h3>
                    <p className="legal-section-subtitle">
                        Pre-investment diligence and post-investment artifacts. Paste Drive links — multiple per document.
                    </p>
                </div>
                {missingRequired > 0 && (
                    <span className="doc-warn">
                        <AlertCircle size={12} /> {missingRequired} required document{missingRequired === 1 ? '' : 's'} missing
                    </span>
                )}
            </div>

            <div className="doc-section">
                <h4>Pre-Investment</h4>
                <div className="doc-list">
                    {pre.map(renderRow)}
                </div>
            </div>

            <div className="doc-section">
                <h4>Post-Investment</h4>
                <div className="doc-list">
                    {post.map(renderRow)}
                </div>
            </div>
        </div>
    );
}
