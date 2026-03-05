'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { Mail, Send, CheckCircle, XCircle, Loader2, Clock, Inbox, Download } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import EmailCompose from '@/components/integrations/EmailCompose';
import { useAppContext } from '@/lib/context';
import { useGoogleAuth } from '@/lib/useGoogleAuth';

function EmailsContent() {
    const { setShowEmailCompose, setSelectedCompany, syncEmails } = useAppContext();
    const { isConnected, isChecking, connect, disconnect } = useGoogleAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ processed: number; skipped: number } | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    const handleCompose = () => {
        setSelectedCompany(null);
        setShowEmailCompose(true);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        setSyncError(null);
        const result = await syncEmails();
        if (result) {
            setSyncResult({ processed: result.processed, skipped: result.skipped });
        } else {
            setSyncError('Failed to sync emails. Please check your Google connection.');
        }
        setIsSyncing(false);
    };

    return (
        <>
            <TopHeader title="Emails" subtitle="Email communications" />
            <div className="page-content page-enter">
                {/* Google Connection Status Card */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                {isChecking ? (
                                    <Loader2 size={20} style={{ color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
                                ) : isConnected ? (
                                    <CheckCircle size={20} style={{ color: '#22c55e' }} />
                                ) : (
                                    <XCircle size={20} style={{ color: '#ef4444' }} />
                                )}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                                    Google Workspace
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {isChecking
                                        ? 'Checking connection status...'
                                        : isConnected
                                            ? 'Connected -- You can send emails and create calendar events.'
                                            : 'Not connected -- Connect your Google account to send emails directly.'}
                                </div>
                            </div>
                        </div>
                        <div>
                            {isChecking ? null : isConnected ? (
                                <button className="btn btn-ghost" onClick={disconnect}>
                                    Disconnect
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={connect}>
                                    <Mail size={14} /> Connect Google Account
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Compose Email Action */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: 'rgba(59,130,246,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Send size={20} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                                    Compose Email
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    Send an email to a founder. You can also compose emails from any company card in the pipeline.
                                </div>
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleCompose}>
                            <Send size={14} /> New Email
                        </button>
                    </div>
                </div>

                {/* Sync Inbound Emails */}
                {isConnected && (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: 24,
                        marginBottom: 24,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    background: 'rgba(139,92,246,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Download size={20} style={{ color: '#8b5cf6' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                                        Sync Inbound Emails
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        Pull emails sent to pipeline@dholakiaventures.com and auto-create draft companies for review.
                                    </div>
                                </div>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleSync}
                                disabled={isSyncing}
                                style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                            >
                                {isSyncing ? (
                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Syncing...</>
                                ) : (
                                    <><Download size={14} /> Sync Now</>
                                )}
                            </button>
                        </div>
                        {syncResult && (
                            <div style={{
                                marginTop: 12,
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(34,197,94,0.1)',
                                fontSize: 13,
                                color: '#16a34a',
                            }}>
                                {syncResult.processed > 0
                                    ? `${syncResult.processed} new ${syncResult.processed === 1 ? 'company' : 'companies'} created, ${syncResult.skipped} skipped.`
                                    : `No new emails to process. ${syncResult.skipped} already synced.`}
                            </div>
                        )}
                        {syncError && (
                            <div style={{
                                marginTop: 12,
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(239,68,68,0.1)',
                                fontSize: 13,
                                color: '#dc2626',
                            }}>
                                {syncError}
                            </div>
                        )}
                    </div>
                )}

                {/* Email Capabilities Info */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
                        Email Features
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                        {[
                            {
                                icon: <Mail size={18} style={{ color: 'var(--primary)' }} />,
                                title: 'Direct Sending',
                                desc: 'Send emails via your Google Workspace account directly from the app.',
                            },
                            {
                                icon: <Clock size={18} style={{ color: 'var(--primary)' }} />,
                                title: 'Activity Tracking',
                                desc: 'All sent emails are logged on the company timeline for full visibility.',
                            },
                            {
                                icon: <Inbox size={18} style={{ color: 'var(--primary)' }} />,
                                title: 'Template Support',
                                desc: 'Auto-generated email drafts when composing from a company card.',
                            },
                        ].map((feature, i) => (
                            <div key={i} style={{
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                padding: 16,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    {feature.icon}
                                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{feature.title}</span>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    {feature.desc}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Email History Placeholder */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Email History
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                        Recent emails sent through the platform.
                    </div>
                    <div className="empty-state" style={{ height: '30vh' }}>
                        <div className="empty-state-icon"><Inbox size={28} /></div>
                        <div className="empty-state-title">No Emails Sent Yet</div>
                        <div className="empty-state-text">
                            Emails sent through the platform will be recorded here.
                            <br />Compose an email from a company card or use the button above to get started.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function EmailsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <EmailsContent />
            </main>
            <EmailCompose />
        </div>
    );
}
