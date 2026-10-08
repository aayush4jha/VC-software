'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tells you when the tab is running code the server has replaced.
 *
 * Twice now a fix was reported as "still broken" when it had shipped and
 * deployed — the tab had simply been open across the deploy and was still
 * running the old bundle. Nothing on screen could have revealed that.
 *
 * Checks on mount, whenever the tab is focused again, and every few minutes.
 */
export default function UpdateBanner() {
    const mine = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
    const [serverSha, setServerSha] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const check = useCallback(async () => {
        try {
            const res = await fetch('/api/version', { cache: 'no-store' });
            if (!res.ok) return;
            const j = await res.json();
            if (j.sha) setServerSha(j.sha);
        } catch { /* offline, or mid-deploy — try again later */ }
    }, []);

    useEffect(() => {
        // Scheduled rather than called outright: a state update reachable
        // synchronously from an effect body is the cascading-render pattern.
        const first = setTimeout(check, 0);
        const timer = setInterval(check, CHECK_INTERVAL_MS);
        const onFocus = () => { check(); };
        window.addEventListener('focus', onFocus);
        return () => {
            clearTimeout(first);
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, [check]);

    // 'dev' on both sides is a local build, where this would only ever nag.
    const stale = !!serverSha && serverSha !== mine && mine !== 'dev' && serverSha !== 'dev';
    if (!stale || dismissed) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 400, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 999,
            background: 'var(--text-primary)', color: 'var(--bg-primary)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.28)', fontSize: 13,
        }}>
            <RefreshCw size={14} />
            <span>This page is running an older version of the platform.</span>
            <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    border: 'none', borderRadius: 999, padding: '4px 12px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}
            >
                Reload
            </button>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                style={{
                    background: 'none', border: 'none', color: 'inherit',
                    opacity: 0.6, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                }}
            >
                ×
            </button>
        </div>
    );
}
