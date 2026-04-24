'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { type LegalRecord, type AgreementType } from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const AGREEMENT_TYPES: AgreementType[] = ['SAFE', 'SHA', 'CCPS', 'Convertible Note', 'Debt'];

function ToggleCell({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="sop-toggle">
            <button
                className={`sop-toggle-btn ${value ? 'active-yes' : ''}`}
                onClick={() => onChange(true)}
                aria-label="Yes"
            >
                <Check size={12} /> Yes
            </button>
            <button
                className={`sop-toggle-btn ${!value ? 'active-no' : ''}`}
                onClick={() => onChange(false)}
                aria-label="No"
            >
                <X size={12} /> No
            </button>
        </div>
    );
}

export default function SOPTracker({ record, onUpdate }: Props) {
    const sop = record.sopData;

    const setField = <K extends keyof typeof sop>(key: K, value: (typeof sop)[K]) => {
        onUpdate(r => ({ ...r, sopData: { ...r.sopData, [key]: value } }));
    };

    // Completion % for the progress bar.
    const steps = [
        sop.termsheetReviewed,
        !!sop.agreementType,
        !!sop.lawyerAssigned,
        sop.icApproval,
        sop.agreementSigned,
    ];
    const complete = steps.filter(Boolean).length;
    const total = steps.length;
    const pct = Math.round((complete / total) * 100);

    return (
        <div className="sop-tracker">
            <div className="legal-section-header">
                <div>
                    <h3>Legal SOP Tracker</h3>
                    <p className="legal-section-subtitle">
                        Standard operating procedure checklist for investment legal flow.
                    </p>
                </div>
                <div className="sop-progress">
                    <div className="sop-progress-text">{complete}/{total} steps</div>
                    <div className="sop-progress-bar"><div className="sop-progress-fill" style={{ width: `${pct}%` }} /></div>
                </div>
            </div>

            <div className="sop-grid">
                <div className="sop-field">
                    <label>Investment Entity</label>
                    <input
                        className="inline-input"
                        placeholder="Name of Dholakia entity investing"
                        value={sop.investmentEntity}
                        onChange={e => setField('investmentEntity', e.target.value)}
                    />
                </div>

                <div className="sop-field">
                    <label>Date</label>
                    <input
                        className="inline-input"
                        type="date"
                        value={sop.date}
                        onChange={e => setField('date', e.target.value)}
                    />
                </div>

                <div className="sop-field">
                    <label>Termsheet Reviewed</label>
                    <ToggleCell value={sop.termsheetReviewed} onChange={v => setField('termsheetReviewed', v)} />
                </div>

                <div className="sop-field">
                    <label>Agreement Type</label>
                    <select
                        className="inline-input"
                        value={sop.agreementType}
                        onChange={e => setField('agreementType', e.target.value as AgreementType | '')}
                    >
                        <option value="">Select…</option>
                        {AGREEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <div className="sop-field">
                    <label>Lawyer Assigned</label>
                    <input
                        className="inline-input"
                        placeholder="Lawyer / firm name"
                        value={sop.lawyerAssigned}
                        onChange={e => setField('lawyerAssigned', e.target.value)}
                    />
                </div>

                <div className="sop-field">
                    <label>IC Approval</label>
                    <ToggleCell value={sop.icApproval} onChange={v => setField('icApproval', v)} />
                </div>

                <div className="sop-field full">
                    <label>Follow-on Rights Changed</label>
                    <ToggleCell value={sop.followOnRightsChanged} onChange={v => setField('followOnRightsChanged', v)} />
                </div>

                {sop.followOnRightsChanged && (
                    <div className="sop-field full">
                        <label>What Changed</label>
                        <textarea
                            className="inline-input"
                            rows={3}
                            placeholder="Describe what changed in the follow-on round (auto-links to Changes tab)"
                            value={sop.whatChanged}
                            onChange={e => setField('whatChanged', e.target.value)}
                        />
                    </div>
                )}

                <div className="sop-field">
                    <label>Agreement Signed</label>
                    <ToggleCell value={sop.agreementSigned} onChange={v => setField('agreementSigned', v)} />
                </div>
            </div>

            <div className="sop-footer-note">
                Final rights are tracked in the <strong>Rights</strong> tab. Changes are captured in the <strong>Changes</strong> tab across SHA versions.
            </div>
        </div>
    );
}
