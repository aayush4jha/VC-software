'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, Mail, CheckCircle, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { currentUser } from '@/lib/mock-data';
import { useGoogleAuth } from '@/lib/useGoogleAuth';

type SendStatus = 'idle' | 'sending' | 'success' | 'error' | 'auth-required';

export default function EmailCompose() {
    const { showEmailCompose, setShowEmailCompose, selectedCompany } = useAppContext();
    const { isConnected, isChecking, connect } = useGoogleAuth();
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');

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
            setSendStatus('idle');
            setStatusMessage('');
        }
    }, [showEmailCompose, selectedCompany]);

    if (!showEmailCompose) return null;

    const handleSend = async () => {
        if (!to || !subject || !body) {
            setSendStatus('error');
            setStatusMessage('Please fill in all fields.');
            return;
        }

        if (!isConnected) {
            setSendStatus('auth-required');
            setStatusMessage('Connect your Google account to send emails directly.');
            return;
        }

        setSendStatus('sending');
        setStatusMessage('');

        try {
            const res = await fetch('/api/gmail/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    subject,
                    body,
                    from: currentUser.email,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401) {
                    setSendStatus('auth-required');
                    setStatusMessage(data.error || 'Please reconnect your Google account.');
                } else {
                    setSendStatus('error');
                    setStatusMessage(data.error || 'Failed to send email.');
                }
                return;
            }

            setSendStatus('success');
            setStatusMessage('Email sent successfully!');
            setTimeout(() => {
                setShowEmailCompose(false);
                setSendStatus('idle');
            }, 1500);
        } catch {
            setSendStatus('error');
            setStatusMessage('Network error. Please try again.');
        }
    };

    return (
        <div className="modal-overlay" onClick={() => setShowEmailCompose(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mail size={20} style={{ color: '#10b981' }} />
                        <div className="modal-title">Send Email</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEmailCompose(false)}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    {/* Google account status */}
                    {!isChecking && !isConnected && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)',
                            marginBottom: 16,
                        }}>
                            <AlertCircle size={16} style={{ color: '#eab308', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                                Connect your Google account to send emails directly from here.
                            </span>
                            <button
                                className="btn btn-sm"
                                onClick={connect}
                                style={{
                                    background: '#4285f4', color: '#fff',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 12, padding: '4px 12px',
                                }}
                            >
                                <LogIn size={12} /> Connect Google
                            </button>
                        </div>
                    )}

                    {!isChecking && isConnected && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)',
                            marginBottom: 16,
                        }}>
                            <CheckCircle size={14} style={{ color: '#10b981' }} />
                            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>
                                Google account connected — emails send directly via Gmail API
                            </span>
                        </div>
                    )}

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

                    {/* Status message */}
                    {statusMessage && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            marginTop: 12,
                            background: sendStatus === 'success' ? 'rgba(16, 185, 129, 0.08)' :
                                sendStatus === 'error' ? 'rgba(239, 68, 68, 0.08)' :
                                sendStatus === 'auth-required' ? 'rgba(234, 179, 8, 0.08)' : 'var(--bg-tertiary)',
                            border: `1px solid ${
                                sendStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' :
                                sendStatus === 'error' ? 'rgba(239, 68, 68, 0.2)' :
                                sendStatus === 'auth-required' ? 'rgba(234, 179, 8, 0.25)' : 'var(--border)'
                            }`,
                        }}>
                            {sendStatus === 'success' && <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} />}
                            {sendStatus === 'error' && <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
                            {sendStatus === 'auth-required' && <AlertCircle size={16} style={{ color: '#eab308', flexShrink: 0 }} />}
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                                {statusMessage}
                            </span>
                            {sendStatus === 'auth-required' && (
                                <button
                                    className="btn btn-sm"
                                    onClick={connect}
                                    style={{
                                        background: '#4285f4', color: '#fff',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 12, padding: '4px 12px',
                                    }}
                                >
                                    <LogIn size={12} /> Connect
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowEmailCompose(false)}>Discard</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSend}
                        disabled={sendStatus === 'sending' || sendStatus === 'success'}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: sendStatus === 'sending' ? 0.7 : 1 }}
                    >
                        {sendStatus === 'sending' ? (
                            <><Loader2 size={14} className="spin" /> Sending...</>
                        ) : sendStatus === 'success' ? (
                            <><CheckCircle size={14} /> Sent!</>
                        ) : (
                            <><Send size={14} /> Send Email</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
