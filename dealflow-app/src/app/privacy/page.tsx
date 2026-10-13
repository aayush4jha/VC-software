// Public, because Meta and Google both require a privacy policy at a URL they
// can fetch without a session before they will let the app go live. Exempted
// from the auth redirect in src/lib/supabase/middleware.ts.
//
// A server component: the app shell locks body scroll in globals.css, so the
// content sits in its own fixed, scrollable layer rather than undoing that
// from an effect the way /book does.

import React from 'react';

export const metadata = {
    title: 'Privacy Policy — Dholakia Ventures',
    description: 'How the Dholakia Ventures deal-flow platform handles data.',
};

const UPDATED = '13 October 2026';
const CONTACT = 'nishantbatra03@gmail.com';

export default function PrivacyPolicy() {
    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#fff' }}>
            <main style={{
                maxWidth: 720, margin: '0 auto', padding: '48px 20px 96px',
                font: '15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                color: '#1a1a1a',
            }}>
                <h1 style={{ fontSize: 28, marginBottom: 4 }}>Privacy Policy</h1>
                <p style={{ color: '#666', marginTop: 0 }}>Dholakia Ventures · Last updated {UPDATED}</p>

                <h2 style={h2}>Who this covers</h2>
                <p>
                    This policy covers the internal deal-flow platform operated by Dholakia Ventures
                    at <code>vc-software.vercel.app</code>. The platform is used by our own investment
                    team to track companies, review pitch material and manage correspondence. It is
                    not a consumer product and is not open to public sign-up.
                </p>

                <h2 style={h2}>What we collect</h2>
                <ul>
                    <li>
                        <strong>Material founders send us.</strong> Pitch decks, financial models and
                        other documents sent to our team by email or WhatsApp, together with the
                        sender&apos;s name, phone number or email address.
                    </li>
                    <li>
                        <strong>Correspondence.</strong> Where a team member connects their Google
                        account, we read and send mail on their behalf so that threads with founders
                        can be tracked against the right company.
                    </li>
                    <li>
                        <strong>WhatsApp messages</strong> sent to our business number, including any
                        attachments, so that a deck can be filed without leaving the chat.
                    </li>
                    <li>
                        <strong>Team account data.</strong> Name, email address and role for each
                        person we grant access to.
                    </li>
                </ul>

                <h2 style={h2}>How we use it</h2>
                <p>
                    Solely to evaluate and manage potential and existing investments. We use Google
                    Gemini to summarise documents and draft replies; content sent for that purpose is
                    processed under Google&apos;s API terms and is not used to train their models. We
                    do not sell data, share it with advertisers, or use it for any purpose unrelated
                    to our investment activity.
                </p>

                <h2 style={h2}>Where it is stored</h2>
                <p>
                    In Supabase (Postgres and object storage) and on Vercel&apos;s infrastructure.
                    Access requires an authenticated account that we have explicitly granted, and is
                    restricted further by role within the platform.
                </p>

                <h2 style={h2}>How long we keep it</h2>
                <p>
                    Material relating to a company we have invested in is kept for as long as we hold
                    the investment and for the period afterwards required by our statutory and
                    regulatory obligations. Material relating to a company we did not proceed with is
                    deleted on request, and otherwise reviewed periodically.
                </p>

                <h2 style={h2}>Your rights</h2>
                <p>
                    If you have sent us material and want a copy of what we hold, a correction, or its
                    deletion, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond
                    within 30 days. Deletion requests are honoured except where we are required to
                    retain a record.
                </p>

                <h2 style={h2}>Third parties</h2>
                <p>
                    The platform relies on Supabase, Vercel, Google (Gmail and Gemini APIs) and the
                    WhatsApp Business Platform operated by Meta. Each processes data on our
                    instructions under its own terms.
                </p>

                <h2 style={h2}>Changes</h2>
                <p>
                    We will update this page if our handling of data changes, and will revise the date
                    at the top.
                </p>

                <h2 style={h2}>Contact</h2>
                <p>
                    Questions about this policy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                </p>
            </main>
        </div>
    );
}

const h2: React.CSSProperties = { fontSize: 17, marginTop: 32, marginBottom: 8 };
