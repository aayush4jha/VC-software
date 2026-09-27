'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Mail, Send, CheckCircle, XCircle, Loader2, Inbox,
    Search, ArrowRight, Tag, Paperclip, FileText, RefreshCw,
    ArrowDownLeft, ArrowUpRight, ChevronDown, X, MessageCircle,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';
import { useGoogleAuth } from '@/lib/useGoogleAuth';
import DeckReport from '@/components/emails/DeckReport';
import WhatsAppLink from '@/components/common/WhatsAppLink';

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
    emailBody: string;
}

function EmailsContent() {
    const { refreshData } = useAppContext();
    const { isConnected, isChecking, connect, disconnect } = useGoogleAuth();
    const searchParams = useSearchParams();
    const targetMessageId = searchParams.get('messageId');
    // The morning report email links here with ?view=decks.
    const initialView = searchParams.get('view');
    const [view, setView] = useState<'inbox' | 'decks' | 'whatsapp'>(
        initialView === 'decks' || initialView === 'whatsapp' ? initialView : 'inbox',
    );

    const [emails, setEmails] = useState<WorkspaceEmail[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'relevant'>('all');
    const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());
    const [sentNote, setSentNote] = useState<Record<string, string>>({});
    const [selectedEmail, setSelectedEmail] = useState<WorkspaceEmail | null>(null);
    const [showCompose, setShowCompose] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeFiles, setComposeFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const loaded = useRef(false);

    // Auto-fetch emails when connected
    const fetchEmails = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/gmail/workspace');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch emails');
            setEmails(data.emails || []);
        } catch (err) {
            setError((err as Error).message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (isConnected && !isChecking && !loaded.current) {
            loaded.current = true;
            fetchEmails();
        }
    }, [isConnected, isChecking, fetchEmails]);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        if (!isConnected) return;
        const interval = setInterval(fetchEmails, 60000);
        return () => clearInterval(interval);
    }, [isConnected, fetchEmails]);

    // Auto-select email when navigated with ?messageId=
    useEffect(() => {
        if (targetMessageId && emails.length > 0 && !selectedEmail) {
            const match = emails.find(e => e.id === targetMessageId);
            if (match) setSelectedEmail(match);
        }
    }, [targetMessageId, emails, selectedEmail]);

    const handleSendToKanban = useCallback(async (email: WorkspaceEmail) => {
        setSendingIds(prev => new Set(prev).add(email.id));
        try {
            const res = await fetch('/api/gmail/send-to-kanban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                    emailBody: email.emailBody || '',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setSentIds(prev => new Set(prev).add(email.id));
            // Filing under an existing company is a different outcome from
            // adding one, and looked identical here — a tick, and nothing new
            // in Deal Flow to find.
            if (data.matchedExisting) {
                setSentNote(prev => ({ ...prev, [email.id]: `Filed under existing company "${data.company?.companyName}"` }));
            }
            await refreshData();
        } catch (err) {
            alert((err as Error).message);
        }
        setSendingIds(prev => { const n = new Set(prev); n.delete(email.id); return n; });
    }, [refreshData]);

    const handleSendEmail = async () => {
        if (!composeTo || !composeSubject || !composeBody) return;
        setSending(true);
        try {
            // Convert files to base64
            const attachments = await Promise.all(
                composeFiles.map(async (file) => {
                    const buffer = await file.arrayBuffer();
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                    return { filename: file.name, mimeType: file.type || 'application/octet-stream', data: base64 };
                })
            );

            const res = await fetch('/api/gmail/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody, attachments }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send');
            setShowCompose(false);
            setComposeTo('');
            setComposeSubject('');
            setComposeBody('');
            setComposeFiles([]);
            setTimeout(fetchEmails, 2000);
        } catch (err) {
            alert((err as Error).message);
        }
        setSending(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setComposeFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        setComposeFiles(prev => prev.filter((_, i) => i !== index));
    };

    // Filters
    const filtered = emails.filter(e => {
        if (filter === 'received' && e.direction !== 'received') return false;
        if (filter === 'sent' && e.direction !== 'sent') return false;
        if (filter === 'relevant' && (!e.isRelevant || e.direction === 'sent')) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return e.subject.toLowerCase().includes(q) ||
                e.senderName.toLowerCase().includes(q) ||
                e.senderEmail.toLowerCase().includes(q) ||
                e.snippet.toLowerCase().includes(q);
        }
        return true;
    });

    const receivedCount = emails.filter(e => e.direction === 'received').length;
    const sentCount = emails.filter(e => e.direction === 'sent').length;
    const relevantCount = emails.filter(e => e.isRelevant && e.direction === 'received').length;

    // Not connected
    if (!isConnected && !isChecking) {
        return (
            <>
                <TopHeader title="Email Workspace" subtitle="Connect Google to view emails" />
                <div className="page-content page-enter">
                    <div className="empty-state" style={{ height: '60vh' }}>
                        <div className="empty-state-icon"><Mail size={28} /></div>
                        <div className="empty-state-title">Connect Your Google Account</div>
                        <div className="empty-state-text" style={{ marginBottom: 16 }}>
                            Connect your Google account to view, send, and manage emails directly.
                        </div>
                        <button className="btn btn-primary" onClick={connect}>
                            <Mail size={14} /> Connect Google Account
                        </button>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
                            Connecting also turns on your personal Pitch Deck Report.
                        </div>
                    </div>
                    {/* WhatsApp does not need Gmail, so it is reachable from here too. */}
                    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 32px' }}>
                        <WhatsAppLink />
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <TopHeader title="Email Workspace" subtitle={view === 'decks' ? 'Your pitch deck report' : view === 'whatsapp' ? 'Send deals from your phone' : `${emails.length} emails`} />
            <div className="page-content page-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', padding: 0 }}>
                {/* Inbox / report switch */}
                <div style={{ display: 'flex', gap: 4, padding: '10px 24px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    {([
                        { key: 'inbox' as const, label: 'Inbox', icon: <Inbox size={14} /> },
                        { key: 'decks' as const, label: 'Pitch Deck Report', icon: <FileText size={14} /> },
                        { key: 'whatsapp' as const, label: 'WhatsApp', icon: <MessageCircle size={14} /> },
                    ]).map(t => (
                        <button
                            key={t.key}
                            onClick={() => setView(t.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13,
                                fontWeight: view === t.key ? 600 : 500, border: 'none', background: 'none', cursor: 'pointer',
                                color: view === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                                borderBottom: view === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                                marginBottom: -1, fontFamily: 'var(--font-sans)',
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {view === 'decks' ? <DeckReport /> : view === 'whatsapp' ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}><WhatsAppLink /></div>
                ) : (<>
                {/* Top Bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 24px', borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-secondary)', gap: 12, flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto' }}>
                        {/* Search */}
                        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 400 }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                className="search-input"
                                placeholder="Search emails..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ paddingLeft: 32, width: '100%' }}
                            />
                        </div>
                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
                            {([
                                { key: 'all' as const, label: `All (${emails.length})` },
                                { key: 'received' as const, label: `Inbox (${receivedCount})` },
                                { key: 'sent' as const, label: `Sent (${sentCount})` },
                                { key: 'relevant' as const, label: `Deals (${relevantCount})` },
                            ]).map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setFilter(f.key)}
                                    style={{
                                        padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
                                        borderRadius: 4, fontFamily: 'var(--font-sans)',
                                        background: filter === f.key ? 'var(--bg-secondary)' : 'transparent',
                                        color: filter === f.key ? 'var(--primary)' : 'var(--text-secondary)',
                                        boxShadow: filter === f.key ? 'var(--shadow-sm)' : 'none',
                                    }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={fetchEmails} disabled={loading} title="Refresh">
                            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCompose(true)}>
                            <Send size={13} /> Compose
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={disconnect} style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            Disconnect
                        </button>
                    </div>
                </div>

                {/* Email list + detail split */}
                <div className="email-split-view" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Email list */}
                    <div className="email-list-pane" style={{
                        width: selectedEmail ? '40%' : '100%',
                        borderRight: selectedEmail ? '1px solid var(--border)' : 'none',
                        overflowY: 'auto',
                        transition: 'width 0.2s',
                    }}>
                        {loading && emails.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 8, color: 'var(--text-tertiary)' }}>
                                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading emails...
                            </div>
                        ) : error ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
                        ) : filtered.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text-tertiary)' }}>
                                <Inbox size={32} style={{ marginBottom: 8 }} />
                                <div style={{ fontWeight: 600 }}>No emails</div>
                            </div>
                        ) : (
                            filtered.map(email => (
                                <div
                                    key={email.id}
                                    onClick={() => setSelectedEmail(email)}
                                    style={{
                                        padding: '12px 20px',
                                        borderBottom: '1px solid var(--border-light)',
                                        cursor: 'pointer',
                                        background: selectedEmail?.id === email.id ? 'var(--primary-bg)' :
                                            sentIds.has(email.id) ? 'rgba(34,197,94,0.04)' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (selectedEmail?.id !== email.id) (e.currentTarget.style.background = 'var(--bg-tertiary)'); }}
                                    onMouseLeave={e => { if (selectedEmail?.id !== email.id) (e.currentTarget.style.background = sentIds.has(email.id) ? 'rgba(34,197,94,0.04)' : 'transparent'); }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                        <span style={{
                                            width: 18, height: 18, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            background: email.direction === 'sent' ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)',
                                        }}>
                                            {email.direction === 'sent' ? <ArrowUpRight size={10} style={{ color: '#8b5cf6' }} /> : <ArrowDownLeft size={10} style={{ color: '#3b82f6' }} />}
                                        </span>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {email.direction === 'sent' ? (email.recipientEmail || email.senderName) : email.senderName}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                            {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                                        {email.subject || '(no subject)'}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {email.snippet}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                        {email.isRelevant && email.direction === 'received' && (
                                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontWeight: 600 }}>
                                                {email.relevanceLabel}
                                            </span>
                                        )}
                                        {email.hasAttachments && (
                                            <Paperclip size={11} style={{ color: 'var(--text-tertiary)' }} />
                                        )}
                                        {sentIds.has(email.id) && (
                                            sentNote[email.id] ? (
                                                <span
                                                    title={sentNote[email.id]}
                                                    style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#b45309', fontWeight: 600 }}
                                                >
                                                    Filed under existing
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontWeight: 600 }}>Added</span>
                                            )
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Email detail pane */}
                    {selectedEmail && (
                        <div className="email-detail-pane" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                        {selectedEmail.subject || '(no subject)'}
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                        <span style={{ fontWeight: 600 }}>
                                            {selectedEmail.direction === 'sent' ? 'To: ' : 'From: '}
                                        </span>
                                        <span>{selectedEmail.direction === 'sent' ? (selectedEmail.recipientEmail || '') : selectedEmail.senderName}</span>
                                        <span style={{ color: 'var(--text-tertiary)' }}>
                                            &lt;{selectedEmail.direction === 'sent' ? (selectedEmail.recipientEmail || '') : selectedEmail.senderEmail}&gt;
                                        </span>
                                    </div>
                                    {selectedEmail.receivedAt && (
                                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                            {new Date(selectedEmail.receivedAt).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEmail(null)}><X size={16} /></button>
                            </div>

                            {/* Tags */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                                {selectedEmail.isRelevant && (
                                    <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', fontSize: 11 }}>
                                        <Tag size={10} style={{ marginRight: 3 }} /> {selectedEmail.relevanceLabel}
                                    </span>
                                )}
                                {selectedEmail.hasAttachments && (
                                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                                        <Paperclip size={10} style={{ marginRight: 3 }} /> {selectedEmail.attachmentNames.length} attachment{selectedEmail.attachmentNames.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                                {selectedEmail.hasPitchDeck && (
                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 11 }}>
                                        <FileText size={10} style={{ marginRight: 3 }} /> Pitch Deck
                                    </span>
                                )}
                            </div>
                            {/* Clickable attachment list */}
                            {selectedEmail.hasAttachments && selectedEmail.attachmentNames.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                                    {selectedEmail.attachmentNames.map((name, i) => (
                                        <a
                                            key={i}
                                            href={`/api/gmail/attachment?messageId=${encodeURIComponent(selectedEmail.id)}&filename=${encodeURIComponent(name)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                                padding: '8px 12px',
                                                background: 'var(--bg-tertiary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 8,
                                                fontSize: 12, fontWeight: 500,
                                                color: 'var(--primary)',
                                                textDecoration: 'none',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s, border-color 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                                        >
                                            <FileText size={14} />
                                            {name}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* AI Extracted */}
                            {selectedEmail.isRelevant && selectedEmail.extracted && (selectedEmail.extracted.companyName || selectedEmail.extracted.summary) && (
                                <div style={{
                                    padding: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                    borderRadius: 10, marginBottom: 16, fontSize: 12,
                                }}>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        AI-Extracted Details
                                    </div>
                                    {selectedEmail.extracted.summary && (
                                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>{selectedEmail.extracted.summary}</div>
                                    )}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                                        {selectedEmail.extracted.companyName && <span style={{ color: 'var(--text-tertiary)' }}>Company: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.extracted.companyName}</strong></span>}
                                        {selectedEmail.extracted.founderName && <span style={{ color: 'var(--text-tertiary)' }}>Founder: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.extracted.founderName}</strong></span>}
                                        {selectedEmail.extracted.companyRound && <span style={{ color: 'var(--text-tertiary)' }}>Round: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.extracted.companyRound}</strong></span>}
                                        {selectedEmail.extracted.industry && <span style={{ color: 'var(--text-tertiary)' }}>Industry: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.extracted.industry}</strong></span>}
                                    </div>
                                </div>
                            )}

                            {/* Email body */}
                            <div
                                style={{
                                    padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 10, fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: (() => {
                                        const raw = selectedEmail.emailBody || selectedEmail.snippet || '(no content)';
                                        // Escape HTML entities first to prevent XSS
                                        const escaped = raw
                                            .replace(/&/g, '&amp;')
                                            .replace(/</g, '&lt;')
                                            .replace(/>/g, '&gt;')
                                            .replace(/"/g, '&quot;');
                                        // Convert URLs to clickable links
                                        return escaped.replace(
                                            /(https?:\/\/[^\s<>"')\]]+)/g,
                                            '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #6366f1; text-decoration: underline; word-break: break-all;">$1</a>'
                                        );
                                    })(),
                                }}
                            />

                            {/* Action buttons */}
                            {selectedEmail.direction === 'received' && (
                                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                                    {sentIds.has(selectedEmail.id) ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                                            <CheckCircle size={16} /> Added to Kanban
                                        </span>
                                    ) : (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleSendToKanban(selectedEmail)}
                                            disabled={sendingIds.has(selectedEmail.id)}
                                        >
                                            {sendingIds.has(selectedEmail.id) ? (
                                                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                            ) : (
                                                <><ArrowRight size={14} /> Send to Kanban</>
                                            )}
                                        </button>
                                    )}
                                    <button className="btn btn-ghost" onClick={() => {
                                        setComposeTo(selectedEmail.senderEmail);
                                        setComposeSubject(`Re: ${selectedEmail.subject}`);
                                        setComposeBody('');
                                        setShowCompose(true);
                                    }}>
                                        Reply
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Compose Modal */}
                {showCompose && (
                    <div className="modal-overlay" onClick={() => setShowCompose(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh' }}>
                            <div className="modal-header">
                                <div className="modal-title">Compose Email</div>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowCompose(false)}><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">To</label>
                                    <input className="form-input" value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="recipient@email.com" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Subject</label>
                                    <input className="form-input" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Message</label>
                                    <textarea className="form-input" rows={10} value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder="Write your email..." style={{ resize: 'vertical' }} />
                                </div>
                                {/* Attachments */}
                                <div className="form-group">
                                    <label className="form-label">Attachments</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        onChange={handleFileSelect}
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <Paperclip size={13} /> Attach Files
                                    </button>
                                    {composeFiles.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                            {composeFiles.map((file, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '4px 10px', background: 'var(--bg-tertiary)',
                                                    borderRadius: 6, fontSize: 12, border: '1px solid var(--border)',
                                                }}>
                                                    <Paperclip size={11} style={{ color: 'var(--text-tertiary)' }} />
                                                    <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                    <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>({(file.size / 1024).toFixed(0)}KB)</span>
                                                    <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                                                        <X size={12} style={{ color: 'var(--danger)' }} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-ghost" onClick={() => { setShowCompose(false); setComposeFiles([]); }}>Discard</button>
                                <button className="btn btn-primary" onClick={handleSendEmail} disabled={sending || !composeTo || !composeSubject || !composeBody}>
                                    {sending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</> : <><Send size={14} /> Send</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                </>)}
            </div>
        </>
    );
}

export default function EmailsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <Suspense>
                    <EmailsContent />
                </Suspense>
            </main>
        </div>
    );
}
