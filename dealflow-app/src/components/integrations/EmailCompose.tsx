'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, Mail, ExternalLink } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { currentUser } from '@/lib/mock-data';

function buildMailtoUrl(to: string, subject: string, body: string) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const query = params.toString();
    return `mailto:${encodeURIComponent(to)}${query ? '?' + query : ''}`;
}

function buildGmailUrl(to: string, subject: string, body: string) {
    const params = new URLSearchParams({
        view: 'cm',
        fs: '1',
        to,
        su: subject,
        body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
}

export default function EmailCompose() {
    const { showEmailCompose, setShowEmailCompose, selectedCompany } = useAppContext();
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sendVia, setSendVia] = useState<'gmail' | 'mailto'>('gmail');

    // Sync fields when the modal opens or the selected company changes
    useEffect(() => {
        if (showEmailCompose && selectedCompany) {
            setTo(selectedCompany.founderEmail);
            setSubject(`Re: ${selectedCompany.companyName}`);
            setBody(
                `Hi ${selectedCompany.founderName},\n\nI hope this message finds you well.\n\n` +
                `I'd love to learn more about ${selectedCompany.companyName} and discuss a potential opportunity.\n\n` +
                `Would you be available for a quick call this week?\n\n` +
                `Best regards,\n${currentUser.name}`
            );
        }
    }, [showEmailCompose, selectedCompany]);

    if (!showEmailCompose) return null;

    const handleSend = () => {
        const url =
            sendVia === 'gmail'
                ? buildGmailUrl(to, subject, body)
                : buildMailtoUrl(to, subject, body);
        window.open(url, '_blank');
        setShowEmailCompose(false);
    };

    const handleQuickGmail = () => {
        const url = buildGmailUrl(
            selectedCompany?.founderEmail || to,
            subject,
            body
        );
        window.open(url, '_blank');
    };

    return (
        <div className="modal-overlay" onClick={() => setShowEmailCompose(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mail size={20} style={{ color: '#10b981' }} />
                        <div className="modal-title">Compose Email</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEmailCompose(false)}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    {/* Send via toggle */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)', fontSize: 13,
                    }}>
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Send via:</span>
                        <button
                            className="btn btn-sm"
                            onClick={() => setSendVia('gmail')}
                            style={{
                                background: sendVia === 'gmail' ? '#ea4335' : 'var(--bg-secondary)',
                                color: sendVia === 'gmail' ? '#fff' : 'var(--text-secondary)',
                                padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)',
                            }}
                        >
                            Gmail
                        </button>
                        <button
                            className="btn btn-sm"
                            onClick={() => setSendVia('mailto')}
                            style={{
                                background: sendVia === 'mailto' ? '#6366f1' : 'var(--bg-secondary)',
                                color: sendVia === 'mailto' ? '#fff' : 'var(--text-secondary)',
                                padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)',
                            }}
                        >
                            Default Mail App
                        </button>
                    </div>

                    <div className="email-compose">
                        <div className="email-field">
                            <span className="email-field-label">From</span>
                            <input
                                className="email-field-input"
                                value={currentUser.email}
                                disabled
                                style={{ opacity: 0.6 }}
                            />
                        </div>
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

                    {/* Quick Gmail link */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(234, 67, 53, 0.06)', border: '1px solid rgba(234, 67, 53, 0.15)',
                        marginTop: 12,
                    }}>
                        <Mail size={16} style={{ color: '#ea4335', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                            Opens in {sendVia === 'gmail' ? 'Gmail' : 'your default mail app'} with all fields pre-filled
                        </span>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowEmailCompose(false)}>Discard</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSend}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Send size={14} /> {sendVia === 'gmail' ? 'Open in Gmail' : 'Open in Mail'}
                    </button>
                </div>
            </div>
        </div>
    );
}
