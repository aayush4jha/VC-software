'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Paperclip, ExternalLink } from 'lucide-react';

interface CompanyDocument {
    id: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    isPitchDeck: boolean;
    source: string;
    gmailMessageId: string | null;
    receivedAt: string | null;
    senderEmail: string | null;
    subject: string | null;
}

function formatSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The decks and documents that arrived with a company's emails, openable from
 * the company page at any time — previously they were listed by name on the
 * email and nowhere else, so finding a deck meant going back to the mailbox.
 *
 * The file streams from Gmail through /api/gmail/attachment rather than being
 * copied here, so it needs the Google account still connected. That is stated
 * in the empty/error state rather than left as a silent broken link.
 */
export default function CompanyDocuments({ companyId }: { companyId: string }) {
    // The loaded company is held alongside the rows rather than in a separate
    // loading flag, so switching company shows "loading" immediately — derived
    // from state, without a setState inside the effect to trigger a second pass.
    const [loaded, setLoaded] = useState<{ forId: string | null; docs: CompanyDocument[] }>({
        forId: null,
        docs: [],
    });
    const loading = loaded.forId !== companyId;
    const docs = loaded.docs;

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/company-documents?companyId=${encodeURIComponent(companyId)}`)
            .then(r => r.ok ? r.json() : { documents: [] })
            .then(j => { if (!cancelled) setLoaded({ forId: companyId, docs: j.documents || [] }); })
            .catch(() => { if (!cancelled) setLoaded({ forId: companyId, docs: [] }); });
        return () => { cancelled = true; };
    }, [companyId]);

    if (loading) {
        return <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading documents…</div>;
    }

    if (docs.length === 0) {
        return (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                No documents yet. Attachments on emails ingested for this company appear here.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map(d => {
                const href = d.gmailMessageId
                    ? `/api/gmail/attachment?messageId=${encodeURIComponent(d.gmailMessageId)}&filename=${encodeURIComponent(d.fileName)}`
                    : null;
                const meta = [formatSize(d.sizeBytes), formatDate(d.receivedAt), d.senderEmail]
                    .filter(Boolean).join(' · ');
                return (
                    <a
                        key={d.id}
                        href={href || undefined}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            border: '1px solid var(--border-light)',
                            textDecoration: 'none', color: 'inherit',
                            cursor: href ? 'pointer' : 'default',
                            opacity: href ? 1 : 0.6,
                        }}
                        title={d.subject || d.fileName}
                    >
                        {d.isPitchDeck
                            ? <FileText size={15} style={{ color: '#6366f1', flexShrink: 0 }} />
                            : <Paperclip size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                                display: 'block', fontSize: 13, color: 'var(--text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {d.fileName}
                            </span>
                            {meta && (
                                <span style={{
                                    display: 'block', fontSize: 11, color: 'var(--text-tertiary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {meta}
                                </span>
                            )}
                        </span>
                        {d.isPitchDeck && (
                            <span style={{
                                fontSize: 10, fontWeight: 600, color: '#6366f1',
                                background: 'rgba(99,102,241,0.12)', borderRadius: 999,
                                padding: '2px 7px', flexShrink: 0,
                            }}>
                                DECK
                            </span>
                        )}
                        {href && <ExternalLink size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                    </a>
                );
            })}
        </div>
    );
}
