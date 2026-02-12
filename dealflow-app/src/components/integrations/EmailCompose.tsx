'use client';

import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { useAppContext } from '@/lib/context';

export default function EmailCompose() {
    const { showEmailCompose, setShowEmailCompose, selectedCompany } = useAppContext();
    const [to, setTo] = useState(selectedCompany?.founderEmail || '');
    const [subject, setSubject] = useState(selectedCompany ? `Re: ${selectedCompany.companyName}` : '');
    const [body, setBody] = useState('');

    if (!showEmailCompose) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowEmailCompose(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <div className="modal-header">
                    <div className="modal-title">Compose Email</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEmailCompose(false)}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="email-compose">
                        <div className="email-field">
                            <span className="email-field-label">To</span>
                            <input className="email-field-input" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" />
                        </div>
                        <div className="email-field">
                            <span className="email-field-label">Subject</span>
                            <input className="email-field-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" />
                        </div>
                        <textarea
                            className="email-body"
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Write your email..."
                            rows={12}
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowEmailCompose(false)}>Discard</button>
                    <button className="btn btn-primary">
                        <Send size={14} /> Send Email
                    </button>
                </div>
            </div>
        </div>
    );
}
