'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, Send, Sparkles } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { rejectionReasonCategories, getStageById } from '@/lib/mock-data';
import { CommunicationMethod } from '@/types/database';

const communicationMethods: CommunicationMethod[] = [
    'Email', 'Verbal', 'WhatsApp', 'Call', 'Not Yet Communicated'
];

export default function RejectionFlow() {
    const { showRejectionFlow, setShowRejectionFlow, selectedCompany } = useAppContext();
    const [step, setStep] = useState(1);
    const [selectedReasons, setSelectedReasons] = useState<Record<string, string[]>>({});
    const [commMethod, setCommMethod] = useState<CommunicationMethod>('Not Yet Communicated');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [emailDraft, setEmailDraft] = useState('');
    const [emailSent, setEmailSent] = useState(false);

    if (!showRejectionFlow || !selectedCompany) return null;

    const stage = getStageById(selectedCompany.pipelineStageId);

    const toggleSubReason = (categoryId: string, subReasonId: string) => {
        const current = selectedReasons[categoryId] || [];
        const next = current.includes(subReasonId)
            ? current.filter(id => id !== subReasonId)
            : [...current, subReasonId];
        setSelectedReasons({ ...selectedReasons, [categoryId]: next });
    };

    const totalSelected = Object.values(selectedReasons).reduce((sum, arr) => sum + arr.length, 0);

    const generateEmailDraft = () => {
        const reasons = Object.entries(selectedReasons)
            .filter(([, subs]) => subs.length > 0)
            .map(([catId]) => {
                const cat = rejectionReasonCategories.find(c => c.id === catId);
                return cat?.name;
            })
            .join(', ');

        setEmailDraft(
            `Dear ${selectedCompany.founderName},

Thank you for sharing ${selectedCompany.companyName}'s journey with us at Dholakia Ventures. We truly appreciate you taking the time to walk us through your vision and progress.

After careful consideration by our investment team, we've decided not to proceed with an investment at this time. Our assessment highlighted areas related to ${reasons.toLowerCase()} that don't align with our current investment thesis and criteria.

This decision does not diminish the value of what you're building. We recognize the hard work and dedication behind ${selectedCompany.companyName}, and we encourage you to continue pursuing your vision.

We'd love to stay connected and revisit this conversation as your company reaches new milestones. Please don't hesitate to reach out if there are significant developments or if you're raising a future round.

Wishing you and the ${selectedCompany.companyName} team all the best.

Warm regards,
Dholakia Ventures`
        );
        setRecipientEmail(selectedCompany.founderEmail);
        setStep(3);
    };

    return (
        <div className="modal-overlay" onClick={() => setShowRejectionFlow(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                <div className="modal-header">
                    <div>
                        <div className="modal-title" style={{ color: 'var(--danger)' }}>
                            Reject {selectedCompany.companyName}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            Rejection at: {stage?.name} • Step {step} of 3
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowRejectionFlow(false)}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    {step === 1 && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                Select the reasons for rejection. You can select multiple reasons across categories.
                            </p>
                            {rejectionReasonCategories.map(cat => (
                                <div key={cat.id} className="reason-category">
                                    <div className="reason-category-header">{cat.name}</div>
                                    {cat.subReasons.map(sub => {
                                        const isSelected = (selectedReasons[cat.id] || []).includes(sub.id);
                                        return (
                                            <div
                                                key={sub.id}
                                                className="reason-item"
                                                onClick={() => toggleSubReason(cat.id, sub.id)}
                                            >
                                                <span className={`reason-checkbox ${isSelected ? 'checked' : ''}`}>
                                                    {isSelected && '✓'}
                                                </span>
                                                <span className="reason-text">{sub.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                How will the rejection be communicated?
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {communicationMethods.map(method => (
                                    <div
                                        key={method}
                                        className={`reason-item ${commMethod === method ? 'selected' : ''}`}
                                        onClick={() => setCommMethod(method)}
                                        style={{
                                            background: commMethod === method ? 'var(--primary-bg)' : undefined,
                                            border: commMethod === method ? '1px solid var(--primary)' : '1px solid transparent',
                                            borderRadius: 'var(--radius-sm)',
                                        }}
                                    >
                                        <span className={`reason-checkbox ${commMethod === method ? 'checked' : ''}`}>
                                            {commMethod === method && '✓'}
                                        </span>
                                        <span className="reason-text">{method}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>AI-Generated Draft</span>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Recipient Email</label>
                                <input
                                    className="form-input"
                                    value={recipientEmail}
                                    onChange={e => setRecipientEmail(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email Draft (editable)</label>
                                <textarea
                                    className="form-textarea"
                                    value={emailDraft}
                                    onChange={e => setEmailDraft(e.target.value)}
                                    style={{ minHeight: 280 }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {step > 1 && (
                        <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>Back</button>
                    )}
                    <div style={{ flex: 1 }} />
                    {step === 1 && (
                        <button
                            className="btn btn-primary"
                            disabled={totalSelected === 0}
                            onClick={() => setStep(2)}
                            style={{ opacity: totalSelected === 0 ? 0.5 : 1 }}
                        >
                            Continue ({totalSelected} selected)
                        </button>
                    )}
                    {step === 2 && (
                        <button className="btn btn-primary" onClick={() => {
                            if (commMethod === 'Email') {
                                generateEmailDraft();
                            } else {
                                setShowRejectionFlow(false);
                            }
                        }}>
                            {commMethod === 'Email' ? 'Generate Email Draft' : 'Confirm Rejection'}
                        </button>
                    )}
                    {step === 3 && (
                        <button className="btn btn-danger" onClick={() => {
                            setEmailSent(true);
                            setShowRejectionFlow(false);
                        }}>
                            <Send size={14} /> Send Rejection Email
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
