'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type LegalRecord, type SectionStatus } from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const STATUS_OPTIONS: { value: SectionStatus; label: string; color: string }[] = [
    { value: 'pending', label: 'Pending', color: '#94a3b8' },
    { value: 'reviewed', label: 'Reviewed', color: '#f59e0b' },
    { value: 'approved', label: 'Approved', color: '#10b981' },
];

export default function SHAGrid({ record, onUpdate }: Props) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const setStatus = (id: string, status: SectionStatus) => {
        onUpdate(r => ({
            ...r,
            shaSections: r.shaSections.map(s => s.id === id ? { ...s, status } : s),
        }));
    };

    const setComments = (id: string, value: string) => {
        onUpdate(r => ({
            ...r,
            shaSections: r.shaSections.map(s => s.id === id ? { ...s, comments: value } : s),
        }));
    };

    const setClauses = (id: string, value: string) => {
        onUpdate(r => ({
            ...r,
            shaSections: r.shaSections.map(s => s.id === id ? { ...s, linkedClauses: value } : s),
        }));
    };

    const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

    const counts = record.shaSections.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="sha-grid">
            <div className="legal-section-header">
                <div>
                    <h3>SHA Section-by-Section Review</h3>
                    <p className="legal-section-subtitle">
                        Track review progress across every standard SHA section.
                    </p>
                </div>
                <div className="sha-grid-counts">
                    {STATUS_OPTIONS.map(opt => (
                        <span key={opt.value} className="sha-count-chip" style={{ color: opt.color, borderColor: opt.color }}>
                            {opt.label}: {counts[opt.value] || 0}
                        </span>
                    ))}
                </div>
            </div>

            <div className="sha-sections">
                {record.shaSections.map(section => {
                    const isOpen = expanded[section.id] || false;
                    const opt = STATUS_OPTIONS.find(o => o.value === section.status)!;
                    return (
                        <div key={section.id} className="sha-section-row">
                            <div className="sha-section-row-main">
                                <button className="rights-expand-btn" onClick={() => toggle(section.id)}>
                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                <div className="sha-section-name">{section.name}</div>
                                <select
                                    className="sha-status-select"
                                    style={{ color: opt.color, borderColor: opt.color }}
                                    value={section.status}
                                    onChange={e => setStatus(section.id, e.target.value as SectionStatus)}
                                >
                                    {STATUS_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            {isOpen && (
                                <div className="sha-section-expanded">
                                    <div>
                                        <label>Comments</label>
                                        <textarea
                                            className="inline-input"
                                            rows={3}
                                            placeholder="Review comments…"
                                            value={section.comments}
                                            onChange={e => setComments(section.id, e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label>Linked Clauses</label>
                                        <input
                                            className="inline-input"
                                            placeholder="e.g. Clause 4.2, Clause 11.1"
                                            value={section.linkedClauses}
                                            onChange={e => setClauses(section.id, e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
