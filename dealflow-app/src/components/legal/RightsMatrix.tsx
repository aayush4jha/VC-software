'use client';

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Plus, Trash2 } from 'lucide-react';
import {
    type LegalRecord,
    type RightStatus,
    type RightPresence,
    type InvestorTier,
    type SHAVersion,
    RIGHT_DEFINITIONS,
    INVESTOR_TIERS,
    RIGHT_STATUS_COLORS,
} from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const STATUS_CYCLE: RightStatus[] = ['must_have', 'situational', 'optional'];

const PRESENCE_OPTIONS: { value: RightPresence | ''; label: string; color: string }[] = [
    { value: '', label: '—', color: '#94a3b8' },
    { value: 'present', label: 'Present', color: '#10b981' },
    { value: 'absent', label: 'Absent', color: '#ef4444' },
    { value: 'modified', label: 'Modified', color: '#f59e0b' },
];

export default function RightsMatrix({ record, onUpdate }: Props) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [showAddVersion, setShowAddVersion] = useState(false);
    const [newVersionLabel, setNewVersionLabel] = useState('');
    const [newVersionDate, setNewVersionDate] = useState('');

    const toggleExpand = (rightId: string) => {
        setExpanded(prev => ({ ...prev, [rightId]: !prev[rightId] }));
    };

    const cycleStatus = (rightId: string, tier: InvestorTier) => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => {
                if (row.rightId !== rightId) return row;
                const current = row.requiredBy[tier];
                const idx = STATUS_CYCLE.indexOf(current);
                const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
                return { ...row, requiredBy: { ...row.requiredBy, [tier]: next } };
            }),
        }));
    };

    const setPresence = (rightId: string, versionId: string, value: RightPresence | '') => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => {
                if (row.rightId !== rightId) return row;
                return { ...row, shaStatus: { ...row.shaStatus, [versionId]: value === '' ? null : value } };
            }),
        }));
    };

    const setRemarks = (rightId: string, value: string) => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => row.rightId === rightId ? { ...row, remarks: value } : row),
        }));
    };

    const setShaRemark = (rightId: string, versionId: string, value: string) => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => {
                if (row.rightId !== rightId) return row;
                return { ...row, shaRemarks: { ...row.shaRemarks, [versionId]: value } };
            }),
        }));
    };

    const setExtra = (rightId: string, key: string, value: string) => {
        onUpdate(r => ({
            ...r,
            rights: r.rights.map(row => {
                if (row.rightId !== rightId) return row;
                return { ...row, extra: { ...(row.extra || {}), [key]: value } };
            }),
        }));
    };

    const addSHAVersion = () => {
        if (!newVersionLabel.trim()) return;
        const id = `custom_${Date.now()}`;
        const label = newVersionLabel.trim();
        const date = newVersionDate || new Date().toISOString().slice(0, 10);
        onUpdate(r => ({
            ...r,
            shaVersions: [...r.shaVersions, { id, label, date }],
            rights: r.rights.map(row => ({
                ...row,
                shaStatus: { ...row.shaStatus, [id]: null },
                shaRemarks: { ...row.shaRemarks, [id]: '' },
            })),
        }));
        setNewVersionLabel('');
        setNewVersionDate('');
        setShowAddVersion(false);
    };

    const removeSHAVersion = (versionId: string) => {
        if (record.shaVersions.length <= 1) return;
        onUpdate(r => {
            const versions = r.shaVersions.filter(v => v.id !== versionId);
            const currentSHA = r.currentSHAVersion === versionId
                ? versions[versions.length - 1].id
                : r.currentSHAVersion;
            return {
                ...r,
                shaVersions: versions,
                currentSHAVersion: currentSHA,
                rights: r.rights.map(row => {
                    const shaStatus = { ...row.shaStatus };
                    const shaRemarks = { ...row.shaRemarks };
                    delete shaStatus[versionId];
                    delete shaRemarks[versionId];
                    return { ...row, shaStatus, shaRemarks };
                }),
            };
        });
    };

    const isRightCritical = (rightId: string): boolean => {
        const row = record.rights.find(r => r.rightId === rightId);
        if (!row) return false;
        const hasMustHave = Object.values(row.requiredBy).some(s => s === 'must_have');
        if (!hasMustHave) return false;
        return row.shaStatus[record.currentSHAVersion] !== 'present';
    };

    return (
        <div className="rights-matrix">
            <div className="legal-section-header">
                <div>
                    <h3>SHA Rights Matrix</h3>
                    <p className="legal-section-subtitle">
                        Click status chips to cycle: <span style={{ color: '#10b981' }}>● Must Have</span> ·{' '}
                        <span style={{ color: '#f59e0b' }}>● Situational</span> ·{' '}
                        <span style={{ color: '#ef4444' }}>● Optional</span>
                    </p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setShowAddVersion(v => !v)}>
                    <Plus size={14} /> Add SHA Version
                </button>
            </div>

            {showAddVersion && (
                <div className="legal-inline-form">
                    <input
                        className="inline-input"
                        placeholder="Version label (e.g. SHA 2026)"
                        value={newVersionLabel}
                        onChange={e => setNewVersionLabel(e.target.value)}
                    />
                    <input
                        className="inline-input"
                        type="date"
                        value={newVersionDate}
                        onChange={e => setNewVersionDate(e.target.value)}
                    />
                    <button className="btn btn-primary btn-sm" onClick={addSHAVersion}>Add</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowAddVersion(false)}>Cancel</button>
                </div>
            )}

            <div className="rights-table-wrapper">
                <table className="rights-table">
                    <thead>
                        <tr>
                            <th style={{ width: 32 }}></th>
                            <th style={{ width: 36 }}>#</th>
                            <th style={{ minWidth: 180 }}>Right</th>
                            <th>Remarks</th>
                            <th colSpan={INVESTOR_TIERS.length} className="rights-th-group">Required By</th>
                            {record.shaVersions.map(v => (
                                <th key={v.id} className="rights-th-sha">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
                                        <span>
                                            {v.label}
                                            {v.id === record.currentSHAVersion && <span className="rights-current-badge">current</span>}
                                        </span>
                                        {record.shaVersions.length > 1 && (
                                            <button
                                                className="rights-remove-version"
                                                onClick={() => removeSHAVersion(v.id)}
                                                title="Remove version"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th></th>
                            <th></th>
                            <th></th>
                            <th></th>
                            {INVESTOR_TIERS.map(t => (
                                <th key={t.id} className="rights-th-subheader">{t.label}</th>
                            ))}
                            {record.shaVersions.map(v => (
                                <th key={v.id}></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {RIGHT_DEFINITIONS.map((def, idx) => {
                            const row = record.rights.find(r => r.rightId === def.id);
                            if (!row) return null;
                            const critical = isRightCritical(def.id);
                            const isOpen = expanded[def.id] || false;

                            return (
                                <React.Fragment key={def.id}>
                                    <tr className={critical ? 'rights-row-critical' : ''}>
                                        <td>
                                            <button className="rights-expand-btn" onClick={() => toggleExpand(def.id)}>
                                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                        </td>
                                        <td className="rights-row-num">{idx + 1}</td>
                                        <td>
                                            <div className="rights-name-cell">
                                                <span className="rights-name-text">{def.name}</span>
                                                {critical && (
                                                    <span className="rights-critical-badge" title="Must-have right not present in current SHA">
                                                        <AlertTriangle size={11} />
                                                        Critical
                                                    </span>
                                                )}
                                                <span className="rights-category-tag">{def.category}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <input
                                                className="rights-inline-input"
                                                placeholder="Remarks..."
                                                value={row.remarks}
                                                onChange={e => setRemarks(def.id, e.target.value)}
                                            />
                                        </td>
                                        {INVESTOR_TIERS.map(tier => {
                                            const status = row.requiredBy[tier.id];
                                            const colors = RIGHT_STATUS_COLORS[status];
                                            return (
                                                <td key={tier.id} className="rights-tier-cell">
                                                    <button
                                                        className="rights-status-chip"
                                                        style={{ backgroundColor: colors.bg, color: colors.text }}
                                                        onClick={() => cycleStatus(def.id, tier.id)}
                                                        title={`${tier.label}: ${colors.label} — click to cycle`}
                                                    >
                                                        <span className="status-dot" style={{ backgroundColor: colors.dot }} />
                                                        {colors.label}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        {record.shaVersions.map(v => {
                                            const value = row.shaStatus[v.id] || '';
                                            const opt = PRESENCE_OPTIONS.find(o => o.value === value) || PRESENCE_OPTIONS[0];
                                            return (
                                                <td key={v.id} className="rights-sha-cell">
                                                    <select
                                                        className="rights-presence-select"
                                                        style={{ color: opt.color, borderColor: opt.color }}
                                                        value={value}
                                                        onChange={e => setPresence(def.id, v.id, e.target.value as RightPresence | '')}
                                                    >
                                                        {PRESENCE_OPTIONS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    {isOpen && (
                                        <tr className="rights-expanded-row">
                                            <td colSpan={4 + INVESTOR_TIERS.length + record.shaVersions.length}>
                                                <ExpandedDetails
                                                    def={def}
                                                    row={row}
                                                    versions={record.shaVersions}
                                                    onShaRemarkChange={(vId, val) => setShaRemark(def.id, vId, val)}
                                                    onExtraChange={(key, val) => setExtra(def.id, key, val)}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

interface ExpandedProps {
    def: typeof RIGHT_DEFINITIONS[number];
    row: LegalRecord['rights'][number];
    versions: SHAVersion[];
    onShaRemarkChange: (versionId: string, value: string) => void;
    onExtraChange: (key: string, value: string) => void;
}

function ExpandedDetails({ def, row, versions, onShaRemarkChange, onExtraChange }: ExpandedProps) {
    const isLiqPref = def.id === 'liquidation_preference';
    const isFounderExit = def.id === 'founder_exit_rofr';

    return (
        <div className="rights-expanded">
            <div className="rights-expanded-grid">
                <div>
                    <div className="rights-expanded-label"><Info size={11} /> What is this right?</div>
                    <div className="rights-expanded-value">{def.description}</div>
                </div>
                <div>
                    <div className="rights-expanded-label">When does it trigger?</div>
                    <div className="rights-expanded-value">{def.triggersWhen}</div>
                </div>
                <div>
                    <div className="rights-expanded-label">Who benefits?</div>
                    <div className="rights-expanded-value">{def.whoBenefits}</div>
                </div>
                <div>
                    <div className="rights-expanded-label">Key negotiation note</div>
                    <div className="rights-expanded-value">{def.negotiationNote}</div>
                </div>
            </div>

            {isLiqPref && (
                <div className="rights-extra-block">
                    <strong>Liquidation Preference Details</strong>
                    <div className="rights-extra-grid">
                        <label>
                            <span>Multiple</span>
                            <select
                                className="inline-input"
                                value={row.extra?.multiple || '1x'}
                                onChange={e => onExtraChange('multiple', e.target.value)}
                            >
                                <option>1x</option><option>1.5x</option><option>2x</option><option>3x</option>
                            </select>
                        </label>
                        <label>
                            <span>Participation</span>
                            <select
                                className="inline-input"
                                value={row.extra?.participating || 'Non-participating'}
                                onChange={e => onExtraChange('participating', e.target.value)}
                            >
                                <option>Non-participating</option>
                                <option>Participating</option>
                                <option>Participating (capped)</option>
                            </select>
                        </label>
                        <label>
                            <span>Cap</span>
                            <input
                                className="inline-input"
                                value={row.extra?.cap || ''}
                                onChange={e => onExtraChange('cap', e.target.value)}
                                placeholder="No cap / 2x / 3x"
                            />
                        </label>
                    </div>
                </div>
            )}

            {isFounderExit && (
                <div className="rights-extra-block">
                    <strong>Exit Right Details</strong>
                    <div className="rights-extra-grid">
                        <label>
                            <span>Exit Type</span>
                            <select
                                className="inline-input"
                                value={row.extra?.exitType || 'Strategic / Secondary / IPO'}
                                onChange={e => onExtraChange('exitType', e.target.value)}
                            >
                                <option>Strategic</option>
                                <option>Secondary</option>
                                <option>IPO</option>
                                <option>Strategic / Secondary / IPO</option>
                            </select>
                        </label>
                        <label>
                            <span>ROFR Applies?</span>
                            <select
                                className="inline-input"
                                value={row.extra?.rofrApplies || 'Yes'}
                                onChange={e => onExtraChange('rofrApplies', e.target.value)}
                            >
                                <option>Yes</option>
                                <option>No</option>
                                <option>Partial</option>
                            </select>
                        </label>
                        <label>
                            <span>Waterfall Logic</span>
                            <input
                                className="inline-input"
                                value={row.extra?.waterfallLogic || ''}
                                onChange={e => onExtraChange('waterfallLogic', e.target.value)}
                                placeholder="e.g. Pref → Pro-rata"
                            />
                        </label>
                    </div>
                </div>
            )}

            <div className="rights-sha-remarks">
                <strong>Per-SHA Remarks</strong>
                <div className="rights-sha-remarks-grid">
                    {versions.map(v => (
                        <label key={v.id}>
                            <span>{v.label}</span>
                            <input
                                className="inline-input"
                                placeholder="Remark..."
                                value={row.shaRemarks[v.id] || ''}
                                onChange={e => onShaRemarkChange(v.id, e.target.value)}
                            />
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
