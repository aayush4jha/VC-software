'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useCallback } from 'react';
import {
    Mail, Send, CheckCircle, XCircle, Loader2, Clock, Inbox, Download,
    Search, ArrowRight, Tag, Paperclip, FileText, RefreshCw,
    ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import EmailCompose from '@/components/integrations/EmailCompose';
import { useAppContext } from '@/lib/context';
import { useGoogleAuth } from '@/lib/useGoogleAuth';

interface ExtractedData {
    companyName: string | null;
    founderName: string | null;
    companyRound: string | null;
    totalFundRaise: number | null;
    valuation: number | null;
    industry: string | null;
    subIndustry: string | null;
    dealSourceType: string | null;
    priorityLevel: string | null;
    shareType: string | null;
    summary: string | null;
}

interface WorkspaceEmail {
    id: string;
    threadId: string | null;
    senderName: string;
    senderEmail: string;
    subject: string;
    snippet: string;
    receivedAt: string | null;
    hasAttachments: boolean;
    attachmentNames: string[];
    hasPitchDeck: boolean;
    isRelevant: boolean;
    relevanceLabel: string;
    derivedCompanyName: string;
    direction: 'received' | 'sent';
    recipientEmail: string | null;
    extracted: ExtractedData;
}

function EmailsContent() {
    const { setShowEmailCompose, setSelectedCompany, syncEmails, refreshData } = useAppContext();
    const { isConnected, isChecking, connect, disconnect } = useGoogleAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ processed: number; skipped: number } | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Workspace state
    const [workspaceEmails, setWorkspaceEmails] = useState<WorkspaceEmail[]>([]);
    const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);
    const [workspaceSearch, setWorkspaceSearch] = useState('');
    const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'received' | 'sent' | 'relevant'>('all');
    const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());

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

    const loadWorkspace = useCallback(async () => {
        setIsLoadingWorkspace(true);
        setWorkspaceError(null);
        try {
            const res = await fetch('/api/gmail/workspace');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch emails');
            setWorkspaceEmails(data.emails || []);
        } catch (err) {
            setWorkspaceError((err as Error).message);
        }
        setIsLoadingWorkspace(false);
    }, []);

    const handleSendToKanban = useCallback(async (email: WorkspaceEmail) => {
        setSendingIds(prev => new Set(prev).add(email.id));
        try {
            const res = await fetch('/api/gmail/send-to-kanban', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gmailMessageId: email.id,
                    gmailThreadId: email.threadId,
                    senderName: email.senderName,
                    senderEmail: email.senderEmail,
                    subject: email.subject,
                    receivedAt: email.receivedAt,
                    hasAttachments: email.hasAttachments,
                    attachmentNames: email.attachmentNames,
                    hasPitchDeck: email.hasPitchDeck,
                    relevanceLabel: email.relevanceLabel,
                    derivedCompanyName: email.derivedCompanyName,
                    extracted: email.extracted,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send to Kanban');
            setSentIds(prev => new Set(prev).add(email.id));
            await refreshData();
        } catch (err) {
            alert((err as Error).message);
        }
        setSendingIds(prev => {
            const next = new Set(prev);
            next.delete(email.id);
            return next;
        });
    }, [refreshData]);

    const filteredWorkspaceEmails = workspaceEmails.filter(email => {
        if (workspaceFilter === 'received' && email.direction !== 'received') return false;
        if (workspaceFilter === 'sent' && email.direction !== 'sent') return false;
        if (workspaceFilter === 'relevant' && (!email.isRelevant || email.direction === 'sent')) return false;
        if (workspaceSearch) {
            const q = workspaceSearch.toLowerCase();
            return (
                email.subject.toLowerCase().includes(q) ||
                email.senderName.toLowerCase().includes(q) ||
                email.senderEmail.toLowerCase().includes(q) ||
                email.snippet.toLowerCase().includes(q) ||
                (email.recipientEmail || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const receivedCount = workspaceEmails.filter(e => e.direction === 'received').length;
    const sentCount = workspaceEmails.filter(e => e.direction === 'sent').length;
    const relevantCount = workspaceEmails.filter(e => e.isRelevant && e.direction === 'received').length;

    return (
        <>
            <TopHeader title="Email Workspace" subtitle="Analyze, filter, and ingest emails into the deal pipeline" />
            <div className="page-content page-enter">
                {/* Google Connection Status Card */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 24,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 auto', minWidth: 0 }}>
                            <div style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
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
                        <div style={{ display: 'flex', gap: 8 }}>
                            {isChecking ? null : isConnected ? (
                                <>
                                    <button className="btn btn-ghost" onClick={disconnect}>
                                        Disconnect
                                    </button>
                                    <button className="btn btn-primary" onClick={handleCompose}>
                                        <Send size={14} /> Compose
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={connect}>
                                    <Mail size={14} /> Connect Google Account
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Auto Sync Inbound Emails */}
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
                                        Auto-Sync Inbound Emails
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        Pull emails to pipeline@dholakiaventures.com, filter by funding keywords, and auto-create draft companies.
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
                                    ? `${syncResult.processed} new ${syncResult.processed === 1 ? 'company' : 'companies'} created (funding-relevant only), ${syncResult.skipped} skipped.`
                                    : `No new funding-relevant emails. ${syncResult.skipped} skipped.`}
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

                {/* Email Workspace */}
                {isConnected && (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: 24,
                        marginBottom: 24,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                                    Email Workspace
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    Analyze your inbox and manually send relevant emails to the Kanban board.
                                </div>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={loadWorkspace}
                                disabled={isLoadingWorkspace}
                            >
                                {isLoadingWorkspace ? (
                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading...</>
                                ) : workspaceEmails.length > 0 ? (
                                    <><RefreshCw size={14} /> Refresh</>
                                ) : (
                                    <><Search size={14} /> Analyze Inbox</>
                                )}
                            </button>
                        </div>

                        {workspaceError && (
                            <div style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(239,68,68,0.1)',
                                fontSize: 13,
                                color: '#dc2626',
                                marginBottom: 12,
                            }}>
                                {workspaceError}
                            </div>
                        )}

                        {workspaceEmails.length > 0 && (
                            <>
                                {/* Stats bar */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginBottom: 12,
                                    padding: '8px 12px',
                                    background: 'var(--bg-primary)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)',
                                    flexWrap: 'wrap',
                                }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {workspaceEmails.length} total emails
                                    </span>
                                    <span style={{ color: 'var(--border-color)' }}>|</span>
                                    <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
                                        {receivedCount} received
                                    </span>
                                    <span style={{ color: 'var(--border-color)' }}>|</span>
                                    <span style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 600 }}>
                                        {sentCount} sent
                                    </span>
                                    <span style={{ color: 'var(--border-color)' }}>|</span>
                                    <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                                        {relevantCount} funding-relevant
                                    </span>
                                </div>

                                {/* Filter & search */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                    <div className="header-search" style={{ flex: '1 1 200px', minWidth: 140 }}>
                                        <Search size={16} />
                                        <input
                                            type="text"
                                            placeholder="Search emails..."
                                            value={workspaceSearch}
                                            onChange={e => setWorkspaceSearch(e.target.value)}
                                        />
                                    </div>
                                    {([
                                        { key: 'all', label: 'All' },
                                        { key: 'received', label: 'Received' },
                                        { key: 'sent', label: 'Sent' },
                                        { key: 'relevant', label: 'Relevant' },
                                    ] as const).map(f => (
                                        <button
                                            key={f.key}
                                            className={`btn btn-sm ${workspaceFilter === f.key ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setWorkspaceFilter(f.key)}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Email list */}
                                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                    {filteredWorkspaceEmails.map(email => (
                                        <div
                                            key={email.id}
                                            style={{
                                                padding: '14px 16px',
                                                borderBottom: '1px solid var(--border-color)',
                                                background: sentIds.has(email.id) ? 'rgba(34,197,94,0.04)' : undefined,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        {/* Direction indicator */}
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: 22,
                                                            height: 22,
                                                            borderRadius: 6,
                                                            background: email.direction === 'sent' ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)',
                                                            flexShrink: 0,
                                                        }}>
                                                            {email.direction === 'sent' ? (
                                                                <ArrowUpRight size={12} style={{ color: '#8b5cf6' }} />
                                                            ) : (
                                                                <ArrowDownLeft size={12} style={{ color: '#3b82f6' }} />
                                                            )}
                                                        </span>
                                                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                                                            {email.direction === 'sent' ? 'To: ' : ''}{email.direction === 'sent' ? (email.recipientEmail || email.senderName) : email.senderName}
                                                        </span>
                                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                            {email.direction === 'sent'
                                                                ? (email.recipientEmail ? '' : `<${email.senderEmail}>`)
                                                                : `<${email.senderEmail}>`}
                                                        </span>
                                                        {email.receivedAt && (
                                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', flexShrink: 0 }}>
                                                                {new Date(email.receivedAt).toLocaleDateString()} {new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                                                        {email.subject}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {email.snippet}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                                        {email.direction === 'sent' ? (
                                                            <span
                                                                className="badge"
                                                                style={{
                                                                    background: 'rgba(139,92,246,0.1)',
                                                                    color: '#8b5cf6',
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                <ArrowUpRight size={10} style={{ marginRight: 3 }} />
                                                                Sent
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className="badge"
                                                                style={{
                                                                    background: email.isRelevant ? 'rgba(34,197,94,0.1)' : 'rgba(156,163,175,0.1)',
                                                                    color: email.isRelevant ? '#16a34a' : '#9ca3af',
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                <Tag size={10} style={{ marginRight: 3 }} />
                                                                {email.relevanceLabel}
                                                            </span>
                                                        )}
                                                        {email.hasAttachments && (
                                                            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                                                                <Paperclip size={10} style={{ marginRight: 3 }} />
                                                                {email.attachmentNames.length} attachment{email.attachmentNames.length !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                        {email.hasPitchDeck && (
                                                            <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 11 }}>
                                                                <FileText size={10} style={{ marginRight: 3 }} />
                                                                Pitch Deck
                                                            </span>
                                                        )}
                                                        {email.derivedCompanyName && email.isRelevant && (
                                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                                Company: <strong>{email.derivedCompanyName}</strong>
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* AI-Extracted Details */}
                                                    {email.isRelevant && email.extracted && (email.extracted.companyName || email.extracted.summary) && (
                                                        <div style={{
                                                            marginTop: 10,
                                                            padding: '10px 12px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: 8,
                                                            fontSize: 12,
                                                        }}>
                                                            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                AI-Extracted Details
                                                            </div>
                                                            {email.extracted.summary && (
                                                                <div style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                                                                    {email.extracted.summary}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                                                                {email.extracted.companyName && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Company: <strong style={{ color: 'var(--text-primary)' }}>{email.extracted.companyName}</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.founderName && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Founder: <strong style={{ color: 'var(--text-primary)' }}>{email.extracted.founderName}</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.companyRound && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Round: <strong style={{ color: 'var(--text-primary)' }}>{email.extracted.companyRound}</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.industry && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Industry: <strong style={{ color: 'var(--text-primary)' }}>{email.extracted.industry}</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.totalFundRaise !== null && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Raising: <strong style={{ color: 'var(--text-primary)' }}>{'\u20B9'}{email.extracted.totalFundRaise}Cr</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.valuation !== null && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Valuation: <strong style={{ color: 'var(--text-primary)' }}>{'\u20B9'}{email.extracted.valuation}Cr</strong>
                                                                    </span>
                                                                )}
                                                                {email.extracted.priorityLevel && (
                                                                    <span style={{ color: 'var(--text-tertiary)' }}>
                                                                        Priority: <strong style={{
                                                                            color: email.extracted.priorityLevel === 'High' ? '#ef4444' :
                                                                                   email.extracted.priorityLevel === 'Medium' ? '#f59e0b' : 'var(--text-primary)'
                                                                        }}>{email.extracted.priorityLevel}</strong>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ flexShrink: 0 }}>
                                                    {email.direction === 'sent' ? (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8b5cf6', fontWeight: 500 }}>
                                                            <Send size={12} /> Outbound
                                                        </span>
                                                    ) : sentIds.has(email.id) ? (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                                                            <CheckCircle size={14} /> Added
                                                        </span>
                                                    ) : (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handleSendToKanban(email)}
                                                            disabled={sendingIds.has(email.id)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                                                        >
                                                            {sendingIds.has(email.id) ? (
                                                                <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                                            ) : (
                                                                <><ArrowRight size={12} /> Send to Kanban</>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredWorkspaceEmails.length === 0 && (
                                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                                            No emails match your filter.
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {workspaceEmails.length === 0 && !isLoadingWorkspace && !workspaceError && (
                            <div className="empty-state" style={{ height: '20vh' }}>
                                <div className="empty-state-icon"><Inbox size={24} /></div>
                                <div className="empty-state-title">No Emails Loaded</div>
                                <div className="empty-state-text">
                                    Click &quot;Analyze Inbox&quot; to scan your emails for funding-related opportunities.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Email Features Info */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 24,
                }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
                        Email Features
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                        {[
                            {
                                icon: <Search size={18} style={{ color: 'var(--primary)' }} />,
                                title: 'Smart Analysis',
                                desc: 'AI keyword detection identifies funding-relevant emails automatically.',
                            },
                            {
                                icon: <Tag size={18} style={{ color: '#16a34a' }} />,
                                title: 'Auto Labeling',
                                desc: 'Emails are classified as Startup Pitch, Funding Relevant, or Investor Opportunity.',
                            },
                            {
                                icon: <ArrowRight size={18} style={{ color: '#8b5cf6' }} />,
                                title: 'Manual Ingestion',
                                desc: 'Send any email to the Kanban board with one click for deal tracking.',
                            },
                            {
                                icon: <Clock size={18} style={{ color: 'var(--primary)' }} />,
                                title: 'Activity Tracking',
                                desc: 'All ingested emails are logged in the company timeline for visibility.',
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
