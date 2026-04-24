'use client';

import React from 'react';
import { type LegalRecord } from '@/lib/legal-data';

interface Props {
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const PAYMENT_STATUSES = [
    { value: '', label: 'Select…' },
    { value: 'pending', label: 'Pending' },
    { value: 'partial', label: 'Partial' },
    { value: 'complete', label: 'Complete' },
];

const REFUND_REASONS = [
    { value: '', label: 'Select…' },
    { value: 'fx_difference', label: 'FX Difference' },
    { value: 'over_remittance', label: 'Over-remittance' },
    { value: 'other', label: 'Other' },
];

export default function PostInvestmentTracker({ record, onUpdate }: Props) {
    const p = record.postInvestment;
    const setField = <K extends keyof typeof p>(key: K, value: (typeof p)[K]) => {
        onUpdate(r => ({ ...r, postInvestment: { ...r.postInvestment, [key]: value } }));
    };

    // Auto-calc % holding if shares & total known; here we just let user input.
    const preMoney = parseFloat(p.preMoneyValuation) || 0;
    const postMoney = parseFloat(p.postMoneyValuation) || 0;
    const stepUp = preMoney > 0 && postMoney > 0 ? (postMoney / preMoney).toFixed(2) : null;

    return (
        <div className="post-investment">
            <div className="legal-section-header">
                <div>
                    <h3>Post-Investment Tracker</h3>
                    <p className="legal-section-subtitle">
                        Capture payment, share issuance, and valuation details after wire transfer.
                    </p>
                </div>
            </div>

            <div className="post-inv-group">
                <h4>Payment & Investment</h4>
                <div className="post-inv-grid">
                    <div>
                        <label>Payment Status</label>
                        <select className="inline-input" value={p.paymentStatus} onChange={e => setField('paymentStatus', e.target.value as typeof p.paymentStatus)}>
                            {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label>Investment Date</label>
                        <input className="inline-input" type="date" value={p.investmentDate} onChange={e => setField('investmentDate', e.target.value)} />
                    </div>
                    <div>
                        <label>Shares Bought</label>
                        <input className="inline-input" type="number" placeholder="# of shares" value={p.sharesBought} onChange={e => setField('sharesBought', e.target.value)} />
                    </div>
                    <div>
                        <label>Price per Share</label>
                        <input className="inline-input" type="number" placeholder="₹ per share" value={p.pricePerShare} onChange={e => setField('pricePerShare', e.target.value)} />
                    </div>
                    <div>
                        <label>% Holding</label>
                        <input className="inline-input" type="number" step="0.01" placeholder="0.00" value={p.percentHolding} onChange={e => setField('percentHolding', e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="post-inv-group">
                <h4>Valuation</h4>
                <div className="post-inv-grid">
                    <div>
                        <label>Pre-money Valuation</label>
                        <input className="inline-input" type="number" placeholder="₹" value={p.preMoneyValuation} onChange={e => setField('preMoneyValuation', e.target.value)} />
                    </div>
                    <div>
                        <label>Post-money Valuation</label>
                        <input className="inline-input" type="number" placeholder="₹" value={p.postMoneyValuation} onChange={e => setField('postMoneyValuation', e.target.value)} />
                    </div>
                    {stepUp && (
                        <div>
                            <label>Step-up (Post / Pre)</label>
                            <div className="post-inv-readonly">{stepUp}x</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="post-inv-group">
                <h4>Refund Tracker</h4>
                <div className="post-inv-grid">
                    <div>
                        <label>Refund Applicable?</label>
                        <div className="sop-toggle">
                            <button className={`sop-toggle-btn ${p.refundApplicable ? 'active-yes' : ''}`} onClick={() => setField('refundApplicable', true)}>Yes</button>
                            <button className={`sop-toggle-btn ${!p.refundApplicable ? 'active-no' : ''}`} onClick={() => setField('refundApplicable', false)}>No</button>
                        </div>
                    </div>
                    {p.refundApplicable && (
                        <>
                            <div>
                                <label>Refund Received?</label>
                                <div className="sop-toggle">
                                    <button className={`sop-toggle-btn ${p.refundReceived ? 'active-yes' : ''}`} onClick={() => setField('refundReceived', true)}>Yes</button>
                                    <button className={`sop-toggle-btn ${!p.refundReceived ? 'active-no' : ''}`} onClick={() => setField('refundReceived', false)}>No</button>
                                </div>
                            </div>
                            <div>
                                <label>Reason</label>
                                <select className="inline-input" value={p.refundReason} onChange={e => setField('refundReason', e.target.value as typeof p.refundReason)}>
                                    {REFUND_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div className="full-row">
                                <label>Notes</label>
                                <input className="inline-input" placeholder="Refund notes / reference" value={p.refundNotes} onChange={e => setField('refundNotes', e.target.value)} />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {p.paymentStatus === 'complete' && !record.sopData.agreementSigned && (
                <div className="legal-notice legal-notice-danger">
                    <strong>⚠ Payment is marked complete but SHA is not signed.</strong> Review the SOP tab and sign off the agreement.
                </div>
            )}
        </div>
    );
}
