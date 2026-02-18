'use client';

import { useState, useEffect, useCallback } from 'react';

export function useGoogleAuth() {
    const [isConnected, setIsConnected] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    const checkStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/google/status');
            const data = await res.json();
            setIsConnected(data.connected);
        } catch {
            setIsConnected(false);
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    // Re-check when window regains focus (user returns from OAuth)
    useEffect(() => {
        const onFocus = () => checkStatus();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [checkStatus]);

    // Check URL params for auth callback result
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('google_auth') === 'success') {
            setIsConnected(true);
            // Clean url
            window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('google_auth') === 'error') {
            setIsConnected(false);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const connect = async () => {
        try {
            const res = await fetch('/api/auth/google');
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            console.error('Failed to start Google auth:', err);
        }
    };

    const disconnect = async () => {
        try {
            await fetch('/api/auth/google/status', { method: 'DELETE' });
            setIsConnected(false);
        } catch (err) {
            console.error('Failed to disconnect:', err);
        }
    };

    return { isConnected, isChecking, connect, disconnect, checkStatus };
}
