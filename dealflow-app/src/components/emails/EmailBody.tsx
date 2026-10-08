'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

interface Props {
    messageId: string | null;
    /** The flattened text already in hand — shown until the real mail arrives. */
    fallbackText: string;
    maxWidth: number;
}

/** What came back for one message: the document, or the fact that it failed. */
interface Loaded {
    forId: string;
    document: string | null;
    kind: 'html' | 'text';
    sanitized: boolean;
}

export default function EmailBody({ messageId, fallbackText, maxWidth }: Props) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(240);

    // Whatever we hold is only about the message that is open now.
    const showing = loaded && loaded.forId === messageId ? loaded : null;
    const loading = !!messageId && !showing;

    useEffect(() => {
        if (!messageId) return;
        let cancelled = false;
        // Every write happens in a callback: setting state in the body of an
        // effect is the cascading-render pattern React warns about.
        fetch(`/api/gmail/message-html?messageId=${encodeURIComponent(messageId)}`)
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                setHeight(240);
                setLoaded({
                    forId: messageId,
                    document: j.document || null,
                    kind: j.kind === 'text' ? 'text' : 'html',
                    sanitized: !!j.sanitized,
                });
            })
            .catch(() => {
                if (cancelled) return;
                setLoaded({ forId: messageId, document: null, kind: 'text', sanitized: false });
            });
        return () => { cancelled = true; };
    }, [messageId]);

    // The frame has no scripts of its own, so the parent measures it. Done on
    // load and once more after a beat, because images settle the height late.
    const fit = () => {
        const doc = frameRef.current?.contentDocument;
        if (!doc?.body) return;
        const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0);
        if (h > 0) setHeight(Math.min(h + 16, 20000));
    };

    useEffect(() => {
        if (!loaded?.document) return;
        const timers = [120, 600, 1800].map(ms => setTimeout(fit, ms));
        return () => timers.forEach(clearTimeout);
    }, [loaded]);

    if (showing?.document) {
        return (
            <div style={{ maxWidth }}>
                <iframe
                    ref={frameRef}
                    title="Email body"
                    srcDoc={showing.document}
                    onLoad={fit}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    style={{
                        width: '100%', height, border: '1px solid var(--border)',
                        borderRadius: 10, background: '#fff', display: 'block',
                    }}
                />
                {showing.sanitized && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
                        fontSize: 11, color: 'var(--text-tertiary)',
                    }}>
                        <ShieldCheck size={11} /> Scripts and tracking in this mail were removed before it was shown.
                    </div>
                )}
            </div>
        );
    }

    // Until the real mail arrives — and if it never does — the text already in
    // the list is better than an empty pane.
    const failed = !!showing && !showing.document;
    return (
        <div style={{
            padding: '16px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth,
        }}>
            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading the mail…
                </div>
            )}
            {failed && (
                <div style={{ fontSize: 11, color: '#b45309', marginBottom: 10 }}>
                    Could not load the original from Gmail — showing the text that was saved.
                </div>
            )}
            {fallbackText || '(no content)'}
        </div>
    );
}
