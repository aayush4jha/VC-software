'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Paperclip, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

interface CompanyEmail {
    id: string;
    messageId: string | null;
    senderName: string;
    senderEmail: string;
    subject: string;
    receivedAt: string | null;
    attachments: string[];
    hasAttachments: boolean;
    body: string | null;
    preview: string;
    filedNote: string | null;
}

function fmtWhen(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Every email filed against this company, newest first — including the ones
 * that joined it later from another address. Before this, a follow-up's text
 * lived only in Gmail and the company's own page could not show it.
 *
 * Emails ingested before bodies were stored are fetched from Gmail when
 * opened, and kept, so the history fills itself in as it is read.
 */
export default function CompanyEmails({ companyId }: { companyId: string }) {
    const [loaded, setLoaded] = useState<{ forId: string | null; emails: CompanyEmail[]; unavailable: string | null }>({
        forId: null, emails: [], unavailable: null,
    });
    const [openId, setOpenId] = useState<string | null>(null);
    const [bodies, setBodies] = useState<Record<string, string>>({});
    const [loadingBody, setLoadingBody] = useState<string | null>(null);

    const loading = loaded.forId !== companyId;

    const fetchList = useCallback(async () => {
        try {
            const r = await fetch(`/api/company-emails?companyId=${encodeURIComponent(companyId)}`);
            const j = await r.json().catch(() => ({}));
            return { emails: (j.emails || []) as CompanyEmail[], unavailable: j.unavailable || null };
        } catch {
            return { emails: [] as CompanyEmail[], unavailable: null };
        }
    }, [companyId]);

    useEffect(() => {
        let cancelled = false;
        fetchList().then(res => { if (!cancelled) setLoaded({ forId: companyId, ...res }); });
        return () => { cancelled = true; };
    }, [companyId, fetchList]);

    const toggle = async (email: CompanyEmail) => {
        if (openId === email.id) { setOpenId(null); return; }
        setOpenId(email.id);
        if (email.body || bodies[email.id] || !email.messageId) return;
        setLoadingBody(email.id);
        try {
            const r = await fetch(`/api/company-emails?messageId=${encodeURIComponent(email.messageId)}`);
            const j = await r.json().catch(() => ({}));
            setBodies(prev => ({ ...prev, [email.id]: j.body || j.note || 'No text available for this email.' }));
        } catch {
            setBodies(prev => ({ ...prev, [email.id]: 'Could not load this email.' }));
        }
        setLoadingBody(null);
    };

    if (loading) return <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading emails…</div>;

    if (loaded.unavailable) {
        return (
            <div style={{ fontSize: 12, color: '#b45309' }}>
                The email history needs <code>supabase/email-body.sql</code> applied in the Supabase SQL editor.
            </div>
        );
    }

    if (loaded.emails.length === 0) {
        return (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                No emails filed against this company yet.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loaded.emails.map(e => {
                const open = openId === e.id;
                const body = e.body || bodies[e.id];
                return (
                    <div key={e.id} style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden' }}>
                        <button
                            type="button"
                            onClick={() => toggle(e)}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px',
                            }}
                        >
                            {open ? <ChevronDown size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-tertiary)' }} />
                                : <ChevronRight size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-tertiary)' }} />}
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{
                                    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {e.subject || '(No subject)'}
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                    {e.senderName || e.senderEmail}
                                    {e.senderName ? ` · ${e.senderEmail}` : ''}
                                    {e.receivedAt ? ` · ${fmtWhen(e.receivedAt)}` : ''}
                                </span>
                                {!open && e.preview && (
                                    <span style={{
                                        display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {e.preview}
                                    </span>
                                )}
                            </span>
                            {e.hasAttachments && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                    <Paperclip size={11} /> {e.attachments.length}
                                </span>
                            )}
                        </button>

                        {open && (
                            <div style={{ padding: '0 10px 10px 32px' }}>
                                {e.filedNote && (
                                    <div style={{ fontSize: 11, color: '#b45309', marginBottom: 6 }}>{e.filedNote}</div>
                                )}
                                {loadingBody === e.id ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Reading it from Gmail…
                                    </div>
                                ) : (
                                    <div style={{
                                        fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                                        maxHeight: 320, overflowY: 'auto', lineHeight: 1.55,
                                    }}>
                                        {body || 'No text stored for this email.'}
                                    </div>
                                )}

                                {e.attachments.length > 0 && e.messageId && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                        {e.attachments.map(name => (
                                            <a
                                                key={name}
                                                href={`/api/gmail/attachment?messageId=${encodeURIComponent(e.messageId!)}&filename=${encodeURIComponent(name)}`}
                                                target="_blank" rel="noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--primary)', textDecoration: 'none' }}
                                            >
                                                <Paperclip size={10} /> {name}
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {e.messageId && (
                                    <a
                                        href={`/emails?messageId=${encodeURIComponent(e.messageId)}`}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--primary)', textDecoration: 'none', marginTop: 8 }}
                                    >
                                        <Mail size={11} /> Open in the Email Workspace <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
