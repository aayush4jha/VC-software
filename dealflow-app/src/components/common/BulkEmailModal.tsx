'use client';

import React, { useMemo, useState } from 'react';
import { X, Send, Loader2, Check, AlertCircle, Paperclip, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface BulkRecipient {
    email: string;
    founderName?: string;
    companyName?: string;
    companyId?: string | null;
}

interface SendResult {
    sent: number;
    failed: number;
    skipped: number;
    results: { email: string; ok: boolean; error?: string }[];
}

/**
 * Composes one email and sends it to many founders — each as its own message,
 * so no founder sees another's address and a reply lands as a normal thread.
 *
 * {{founder_name}}, {{first_name}} and {{company_name}} are filled per
 * recipient, which is the difference between a mail-merge and a visible blast.
 */
export default function BulkEmailModal({ recipients, onClose }: {
    recipients: BulkRecipient[];
    onClose: () => void;
}) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [stage, setStage] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Every recipient gets a copy, and Gmail rejects a message over 25 MB;
    // base64 adds a third on top, so the ceiling here is lower than it looks.
    const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const tooBig = totalBytes > MAX_TOTAL_BYTES;
    const fmtSize = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
    const [result, setResult] = useState<SendResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Mirrors the server's dedup so the count on the button is the count that
    // will actually be sent.
    const unique = useMemo(() => {
        const seen = new Set<string>();
        return recipients.filter(r => {
            const e = (r.email || '').trim().toLowerCase();
            if (!e || !e.includes('@') || seen.has(e)) return false;
            seen.add(e);
            return true;
        });
    }, [recipients]);

    const withoutEmail = recipients.length - unique.length;
    const preview = unique[0];

    const send = async () => {
        setSending(true);
        setError(null);
        try {
            // Files go straight to storage on a signed URL: a serverless
            // request body would cap attachments at about 3 MB.
            let attachmentPaths: { path: string; name: string }[] = [];
            if (files.length > 0) {
                setStage(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
                const prep = await fetch('/api/bulk-attachments', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: files.map(f => ({ name: f.name, size: f.size })) }),
                });
                const prepJson = await prep.json();
                if (!prep.ok) throw new Error(prepJson.error || 'Could not prepare the attachments');

                const supabase = createClient();
                for (const [i, up] of (prepJson.uploads as { path: string; token: string; name: string }[]).entries()) {
                    const { error: upErr } = await supabase.storage.from('company-documents')
                        .uploadToSignedUrl(up.path, up.token, files[i]);
                    if (upErr) throw new Error(`Could not upload "${up.name}": ${upErr.message}`);
                }
                attachmentPaths = (prepJson.uploads as { path: string; name: string }[])
                    .map(u => ({ path: u.path, name: u.name }));
            }

            setStage(`Sending to ${unique.length}…`);
            const res = await fetch('/api/gmail/send-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipients: unique, subject, body, attachmentPaths }),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Failed to send');
            } else {
                setResult(json);
            }
        } catch (err) {
            setError((err as Error).message);
        }
        setStage(null);
        setSending(false);
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20,
        }}>
            <div style={{
                background: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 640,
                maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
                }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                        Email {unique.length} founder{unique.length === 1 ? '' : 's'}
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
                </div>

                <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                    {result ? (
                        <div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
                                fontWeight: 600, marginBottom: 12,
                                color: result.failed > 0 ? '#f59e0b' : '#10b981',
                            }}>
                                {result.failed > 0 ? <AlertCircle size={16} /> : <Check size={16} />}
                                Sent {result.sent} of {result.sent + result.failed}
                            </div>
                            {result.failed > 0 && (
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <div style={{ marginBottom: 6 }}>These did not go out:</div>
                                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                                        {result.results.filter(r => !r.ok).map(r => (
                                            <li key={r.email} style={{ marginBottom: 4 }}>
                                                {r.email} — {r.error || 'unknown error'}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                                Each founder gets their own email — nobody is CC&apos;d.
                                Use <code>{'{{founder_name}}'}</code>, <code>{'{{first_name}}'}</code> or{' '}
                                <code>{'{{company_name}}'}</code> and they are filled in per recipient.
                                {withoutEmail > 0 && (
                                    <> {withoutEmail} selected contact{withoutEmail === 1 ? ' has' : 's have'} no
                                    usable address and will be skipped.</>
                                )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <label className="form-label">Subject</label>
                                <input
                                    className="form-input"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="Quick note about {{company_name}}"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Message</label>
                                <textarea
                                    className="form-input"
                                    rows={10}
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder={'Hi {{first_name}},\n\n...'}
                                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>

                            <div style={{ marginTop: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn btn-sm" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                                        <Paperclip size={13} /> Attach files
                                    </button>
                                    {files.length > 0 && (
                                        <span style={{ fontSize: 11, color: tooBig ? 'var(--danger, #b91c1c)' : 'var(--text-tertiary)' }}>
                                            {files.length} file{files.length === 1 ? '' : 's'} · {fmtSize(totalBytes)}
                                            {tooBig ? ` — over the ${MAX_TOTAL_BYTES / 1024 / 1024} MB limit` : ''}
                                        </span>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                            setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                                {files.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                                        {files.map((f, i) => (
                                            <div key={`${f.name}-${i}`} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                                                padding: '4px 8px', borderRadius: 6, background: 'var(--bg-secondary)',
                                            }}>
                                                <Paperclip size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {f.name}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtSize(f.size)}</span>
                                                <button type="button" className="btn btn-ghost btn-sm" disabled={sending}
                                                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            Every founder receives the same files.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {preview && (subject || body) && (
                                <div style={{
                                    marginTop: 14, padding: 12, borderRadius: 8,
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                                }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                                        Preview — as {preview.founderName || preview.email} will see it
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                                        {fill(subject, preview) || '(no subject)'}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                        {fill(body, preview)}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--danger, #b91c1c)' }}>{error}</div>
                            )}
                        </>
                    )}
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8,
                    padding: '14px 20px', borderTop: '1px solid var(--border-light)',
                }}>
                    {result ? (
                        <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
                    ) : (
                        <>
                            <button className="btn btn-outline btn-sm" onClick={onClose} disabled={sending}>Cancel</button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={send}
                                disabled={sending || tooBig || !subject.trim() || !body.trim() || unique.length === 0}
                            >
                                {sending
                                    ? <><Loader2 size={14} className="spin" /> {stage || 'Sending…'}</>
                                    : <><Send size={14} /> Send to {unique.length}{files.length > 0 ? ` with ${files.length} file${files.length === 1 ? '' : 's'}` : ''}</>}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Same substitutions the server makes, so the preview is honest.
function fill(text: string, r: BulkRecipient): string {
    const founder = (r.founderName || '').trim();
    return text
        .replace(/\{\{\s*founder_name\s*\}\}/gi, founder || 'there')
        .replace(/\{\{\s*first_name\s*\}\}/gi, founder.split(/\s+/)[0] || 'there')
        .replace(/\{\{\s*company_name\s*\}\}/gi, (r.companyName || '').trim());
}
