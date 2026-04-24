'use client';

import React, { useRef, useState } from 'react';
import { Upload, Check, AlertCircle, FileX, Eye } from 'lucide-react';
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

export default function DocumentManager({ record, onUpdate }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingFor, setUploadingFor] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<string | null>(null);

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

    const triggerUpload = (docId: string) => {
        setUploadingFor(docId);
        fileInputRef.current?.click();
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingFor) return;
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => d.id === uploadingFor ? {
                ...d,
                status: 'uploaded',
                notes: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
                uploadedAt: new Date().toISOString(),
            } : d),
        }));
        setUploadingFor(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const renderRow = (doc: typeof record.documents[number]) => {
        const meta = STATUS_META[doc.status];
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
                        <button className="btn btn-outline btn-sm" onClick={() => triggerUpload(doc.id)}>
                            <Upload size={12} /> Upload
                        </button>
                        {doc.status !== 'missing' && doc.notes && (
                            <button className="btn btn-outline btn-sm" onClick={() => setPreviewDoc(previewDoc === doc.id ? null : doc.id)}>
                                <Eye size={12} /> {previewDoc === doc.id ? 'Hide' : 'Preview'}
                            </button>
                        )}
                    </div>
                </div>
                <input
                    className="rights-inline-input"
                    placeholder="Notes / reference"
                    value={doc.notes}
                    onChange={e => setNotes(doc.id, e.target.value)}
                />
                {previewDoc === doc.id && (
                    <div className="doc-preview">
                        <strong>{doc.notes || doc.name}</strong>
                        {doc.uploadedAt && (
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                Uploaded {new Date(doc.uploadedAt).toLocaleString()}
                            </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                            File preview requires storage backend; metadata shown here.
                        </div>
                    </div>
                )}
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
                        Pre-investment diligence and post-investment artifacts.
                    </p>
                </div>
                {missingRequired > 0 && (
                    <span className="doc-warn">
                        <AlertCircle size={12} /> {missingRequired} required document{missingRequired === 1 ? '' : 's'} missing
                    </span>
                )}
            </div>

            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFile} />

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
