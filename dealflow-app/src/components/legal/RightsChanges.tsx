'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Minus, Plus, Pencil } from 'lucide-react';
import {
    type LegalRecord,
    type RightPresence,
    RIGHT_DEFINITIONS,
    detectRightsChanges,
} from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

function presenceLabel(p: RightPresence | null): string {
    if (p === 'present') return 'Yes';
    if (p === 'absent') return 'No';
    if (p === 'modified') return 'Modified';
    return '—';
}

function presenceColor(p: RightPresence | null): string {
    if (p === 'present') return '#10b981';
    if (p === 'absent') return '#ef4444';
    if (p === 'modified') return '#f59e0b';
    return '#94a3b8';
}

const CHANGE_BADGE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    ADDED: { color: '#047857', bg: 'rgba(16, 185, 129, 0.15)', icon: <Plus size={11} /> },
    REMOVED: { color: '#b91c1c', bg: 'rgba(239, 68, 68, 0.15)', icon: <Minus size={11} /> },
    MODIFIED: { color: '#b45309', bg: 'rgba(245, 158, 11, 0.15)', icon: <Pencil size={11} /> },
    UNCHANGED: { color: '#64748b', bg: 'rgba(148, 163, 184, 0.15)', icon: <Check size={11} /> },
};

export default function RightsChanges({ record, onUpdate }: Props) {
    const versions = record.shaVersions;
    const [fromId, setFromId] = useState<string>(versions.length >= 2 ? versions[versions.length - 2].id : versions[0].id);
    const [toId, setToId] = useState<string>(versions[versions.length - 1].id);
    const [filter, setFilter] = useState<'all' | 'changed'>('changed');

    const changes = useMemo(() => detectRightsChanges(record, fromId, toId), [record, fromId, toId]);

    const filtered = useMemo(() => {
        if (filter === 'all') return changes;
        return changes.filter(c => c.change !== 'UNCHANGED');
    }, [changes, filter]);

    const counts = useMemo(() => {
        return changes.reduce((acc, c) => {
            acc[c.change] = (acc[c.change] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [changes]);

    const updateRemark = (rightId: string, versionId: string, value: string) => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => {
                if (row.rightId !== rightId) return row;
                return { ...row, shaRemarks: { ...row.shaRemarks, [versionId]: value } };
            }),
        }));
    };

    return (
        <div className="rights-changes">
            <div className="legal-section-header">
                <div>
                    <h3>Rights Change Tracking</h3>
                    <p className="legal-section-subtitle">Track follow-on round changes across SHA versions.</p>
                </div>
            </div>

            <div className="rights-changes-controls">
                <div className="rights-changes-selector">
                    <label>Compare:</label>
                    <select className="inline-input" value={fromId} onChange={e => setFromId(e.target.value)}>
                        {versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <ArrowRight size={14} color="#94a3b8" />
                    <select className="inline-input" value={toId} onChange={e => setToId(e.target.value)}>
                        {versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                </div>

                <div className="rights-changes-summary">
                    {(['ADDED', 'REMOVED', 'MODIFIED', 'UNCHANGED'] as const).map(k => {
                        const badge = CHANGE_BADGE[k];
                        return (
                            <span key={k} className="rights-change-count" style={{ color: badge.color, backgroundColor: badge.bg }}>
                                {badge.icon} {k}: {counts[k] || 0}
                            </span>
                        );
                    })}
                </div>

                <div className="view-toggle">
                    <button
                        className={`view-toggle-btn ${filter === 'changed' ? 'active' : ''}`}
                        onClick={() => setFilter('changed')}
                    >
                        Changed only
                    </button>
                    <button
                        className={`view-toggle-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All rights
                    </button>
                </div>
            </div>

            {fromId === toId && (
                <div className="legal-notice">
                    Select two different SHA versions to see changes.
                </div>
            )}

            <div className="rights-changes-table-wrapper">
                <table className="rights-changes-table">
                    <thead>
                        <tr>
                            <th>Right</th>
                            <th>{versions.find(v => v.id === fromId)?.label || 'From'}</th>
                            <th>{versions.find(v => v.id === toId)?.label || 'To'}</th>
                            <th>Change</th>
                            <th>Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(c => {
                            const def = RIGHT_DEFINITIONS.find(d => d.id === c.rightId);
                            const badge = CHANGE_BADGE[c.change];
                            return (
                                <tr key={c.rightId}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{c.rightName}</div>
                                        <div className="rights-category-tag">{def?.category}</div>
                                    </td>
                                    <td>
                                        <span className="presence-pill" style={{ color: presenceColor(c.from), borderColor: presenceColor(c.from) }}>
                                            {presenceLabel(c.from)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="presence-pill" style={{ color: presenceColor(c.to), borderColor: presenceColor(c.to) }}>
                                            {presenceLabel(c.to)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="rights-change-badge" style={{ color: badge.color, backgroundColor: badge.bg }}>
                                            {badge.icon} {c.change}
                                        </span>
                                    </td>
                                    <td>
                                        <input
                                            className="rights-inline-input"
                                            placeholder={c.change === 'UNCHANGED' ? '—' : 'e.g. Negotiated out in Series A'}
                                            value={c.remark}
                                            onChange={e => updateRemark(c.rightId, toId, e.target.value)}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                                    {filter === 'changed' ? 'No changes between selected versions.' : 'No rights defined.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
