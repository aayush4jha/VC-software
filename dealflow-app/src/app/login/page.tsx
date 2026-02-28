'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
    const [loading, setLoading] = useState(false);

    // Read error type from URL (e.g. ?error=unauthorized set by auth callback)
    const urlError = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('error')
        : null;

    const [error, setError] = useState<string | null>(
        urlError === 'unauthorized'
            ? 'You are not authorised to use this platform. Contact your admin.'
            : null
    );

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        const supabase = createClient();

        // Preserve role from invite link so the callback can save it to the profile
        const params = new URLSearchParams(window.location.search);
        const inviteRole = params.get('role');
        const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
        if (inviteRole) callbackUrl.searchParams.set('role', inviteRole);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl.toString(),
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        });
        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}>
            <div style={{
                width: '100%',
                maxWidth: 420,
                padding: '48px 40px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            }}>
                {/* Logo / Brand */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14,
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: 22, fontWeight: 800, color: '#fff',
                        boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
                    }}>
                        DV
                    </div>
                    <h1 style={{
                        fontSize: 24, fontWeight: 800, color: '#fff',
                        margin: '0 0 6px',
                        letterSpacing: -0.5,
                    }}>
                        Dholakia Ventures
                    </h1>
                    <p style={{
                        fontSize: 14, color: 'rgba(255,255,255,0.5)',
                        margin: 0,
                    }}>
                        Deal Flow Management Platform
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        fontSize: 13,
                        marginBottom: 20,
                        textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                {/* Google Sign In Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '14px 20px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        transition: 'all 0.15s ease',
                        opacity: loading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => {
                        if (!loading) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                        }
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                    }}
                >
                    {/* Google Icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>
                    {loading ? 'Signing in...' : 'Sign in with Google'}
                </button>

                <p style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.3)',
                    marginTop: 24,
                    lineHeight: 1.6,
                }}>
                    Use your Google Workspace account to access<br />
                    your organization&apos;s deal flow pipeline.
                </p>
            </div>
        </div>
    );
}
