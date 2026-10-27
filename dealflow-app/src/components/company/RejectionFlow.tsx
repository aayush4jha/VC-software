'use client';

import React, { useState } from 'react';
import { X, Send, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { CommunicationMethod } from '@/types/database';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { fillTemplate, REJECTION_TEMPLATE } from '@/lib/reply-templates';

const communicationMethods: CommunicationMethod[] = [
    'Email', 'Verbal', 'WhatsApp', 'Call', 'Not Yet Communicated'
];

export default function RejectionFlow() {
    const { showRejectionFlow, setShowRejectionFlow, selectedCompany, rejectionReasonCategories, getStageById, rejectCompany, user } = useAppContext();
    const [step, setStep] = useState(1);
    const [selectedReasons, setSelectedReasons] = useState<Record<string, string[]>>({});
    const [commMethod, setCommMethod] = useState<CommunicationMethod>('Not Yet Communicated');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [emailDraft, setEmailDraft] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    useEscapeKey(showRejectionFlow, () => setShowRejectionFlow(false));

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

    // The firm sends one rejection, word for word; only the names change.
    const prepareEmailDraft = () => {
        setRecipientEmail(selectedCompany.founderEmail);
        setEmailDraft(fillTemplate(REJECTION_TEMPLATE, {
            senderName: selectedCompany.founderName,
            companyName: selectedCompany.companyName,
            signOffName: user?.name,
        }));
        setStep(3);
    };

    const handleSendAndReject = async () => {
        setSendingEmail(true);
        setSendStatus('idle');
        setStatusMessage('');

        const reasons = Object.entries(selectedReasons)
            .filter(([, subs]) => subs.length > 0)
            .map(([catId, subIds]) => ({ categoryId: catId, subReasonIds: subIds }));

        // Send the rejection email via Gmail API
        try {
            const emailRes = await fetch('/api/gmail/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject: `Re: ${selectedCompany.companyName} — Dholakia Ventures`,
                    body: emailDraft,
                    from: user?.email || '',
                }),
            });

            if (emailRes.ok) {
                // Email sent successfully — record rejection with email sent flag
                await rejectCompany(selectedCompany.id, reasons, commMethod, emailDraft, recipientEmail);
                setSendStatus('success');
                setStatusMessage('Rejection email sent successfully.');
                setTimeout(() => setShowRejectionFlow(false), 1500);
            } else {
                // Email failed but still record rejection
                await rejectCompany(selectedCompany.id, reasons, commMethod, emailDraft, recipientEmail);
                setSendStatus('error');
                setStatusMessage('Company rejected but email could not be sent. You may need to connect your Google account or send manually.');
            }
        } catch {
            // Network error — still record rejection
            await rejectCompany(selectedCompany.id, reasons, commMethod, emailDraft, recipientEmail);
            setSendStatus('error');
            setStatusMessage('Company rejected but email sending failed. Send manually.');
        }

        setSendingEmail(false);
    };

    const handleClose = () => {
        setShowRejectionFlow(false);
        setStep(1);
        setSelectedReasons({});
        setCommMethod('Not Yet Communicated');
        setRecipientEmail('');
        setEmailDraft('');
        setSendStatus('idle');
        setStatusMessage('');
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
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
                    <button className="btn btn-ghost btn-sm" onClick={handleClose}>
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
                                <Mail size={16} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>Rejection Email</span>
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

                            {/* Status message */}
                            {statusMessage && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                    marginTop: 12,
                                    background: sendStatus === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                    border: `1px solid ${sendStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                }}>
                                    {sendStatus === 'success' ? <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} /> : <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{statusMessage}</span>
                                </div>
                            )}
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
                        <button className="btn btn-primary" onClick={async () => {
                            if (commMethod === 'Email') {
                                prepareEmailDraft();
                            } else {
                                const reasons = Object.entries(selectedReasons).filter(([, subs]) => subs.length > 0).map(([catId, subIds]) => ({ categoryId: catId, subReasonIds: subIds }));
                                await rejectCompany(selectedCompany.id, reasons, commMethod);
                                handleClose();
                            }
                        }}>
                            {commMethod === 'Email' ? (
                                <><Mail size={14} /> Prepare Email</>
                            ) : 'Confirm Rejection'}
                        </button>
                    )}
                    {step === 3 && (
                        <button
                            className="btn btn-danger"
                            disabled={sendingEmail || sendStatus === 'success'}
                            onClick={handleSendAndReject}
                        >
                            {sendingEmail ? (
                                <><Loader2 size={14} className="spin" /> Sending...</>
                            ) : sendStatus === 'success' ? (
                                <><CheckCircle size={14} /> Sent!</>
                            ) : (
                                <><Send size={14} /> Send Rejection Email</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
