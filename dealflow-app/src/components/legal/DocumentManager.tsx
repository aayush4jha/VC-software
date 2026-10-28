'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { type LegalRecord } from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

/**
 * The documents a deal needs, ticked off as they arrive.
 *
 * A tick is "received" — status uploaded, or verified if it was already
 * verified — and clearing it is "missing", so the alerts and counts elsewhere
 * that read the status keep working. Links and notes saved before this was a
 * checklist are kept on the record, just not shown.
 */
export default function DocumentManager({ record, onUpdate }: Props) {
    const pre = record.documents.filter(d => d.category === 'pre');
    const post = record.documents.filter(d => d.category === 'post');

    const setReceived = (id: string, received: boolean) => {
        onUpdate(r => ({
            ...r,
            documents: r.documents.map(d => d.id !== id ? d : received
                ? { ...d, status: d.status === 'verified' ? 'verified' : 'uploaded', uploadedAt: d.uploadedAt || new Date().toISOString() }
                : { ...d, status: 'missing', uploadedAt: undefined }),
        }));
    };

    const renderList = (docs: LegalRecord['documents']) => (
        <div className="doc-checklist">
            {docs.map(doc => (
                <label key={doc.id} className="doc-check-row">
                    <input
                        type="checkbox"
                        checked={doc.status !== 'missing'}
                        onChange={e => setReceived(doc.id, e.target.checked)}
                    />
                    <span className={doc.status !== 'missing' ? 'doc-check-name received' : 'doc-check-name'}>{doc.name}</span>
                    {doc.required && <span className="doc-required-tag">required</span>}
                </label>
            ))}
        </div>
    );

    const received = record.documents.filter(d => d.status !== 'missing').length;
    const missingRequired = record.documents.filter(d => d.required && d.status === 'missing').length;

    return (
        <div className="doc-manager">
            <div className="legal-section-header">
                <div>
                    <h3>Documents</h3>
                    <p className="legal-section-subtitle">
                        Tick each document when it is received. {received} of {record.documents.length} received.
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
                {renderList(pre)}
            </div>

            <div className="doc-section">
                <h4>Post-Investment</h4>
                {renderList(post)}
            </div>
        </div>
    );
}
