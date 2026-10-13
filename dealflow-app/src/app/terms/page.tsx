// Public for the same reason as /privacy: Meta's app settings ask for a Terms
// of Service URL alongside the policy URL, and both must load without a
// session. Exempted in src/lib/supabase/middleware.ts.

import React from 'react';

export const metadata = {
    title: 'Terms of Use — Dholakia Ventures',
    description: 'Terms governing use of the Dholakia Ventures deal-flow platform.',
};

const UPDATED = '13 October 2026';
const CONTACT = 'nishantbatra03@gmail.com';

export default function Terms() {
    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#fff' }}>
            <main style={{
                maxWidth: 720, margin: '0 auto', padding: '48px 20px 96px',
                font: '15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                color: '#1a1a1a',
            }}>
                <h1 style={{ fontSize: 28, marginBottom: 4 }}>Terms of Use</h1>
                <p style={{ color: '#666', marginTop: 0 }}>Dholakia Ventures · Last updated {UPDATED}</p>

                <h2 style={h2}>Access</h2>
                <p>
                    This platform is operated by Dholakia Ventures for its own investment team. Access
                    is granted individually and may be withdrawn at any time. There is no public
                    sign-up, and accounts may not be shared.
                </p>

                <h2 style={h2}>Material you send us</h2>
                <p>
                    Sending a pitch deck or other material to our team, by email or WhatsApp, does not
                    create any obligation on our part to invest, to respond, or to keep the material
                    confidential beyond what we have separately agreed in writing with you. You keep
                    ownership of what you send; you grant us permission to store and review it for the
                    purpose of evaluating an investment. How we handle it is described in our{' '}
                    <a href="/privacy">Privacy Policy</a>.
                </p>

                <h2 style={h2}>No advice or offer</h2>
                <p>
                    Nothing on this platform is an offer to buy or sell securities, or investment,
                    legal or tax advice to anyone.
                </p>

                <h2 style={h2}>Automated processing</h2>
                <p>
                    Parts of the platform summarise documents and draft correspondence using AI. Those
                    outputs are drafts for our team to review, and are not a decision, a commitment, or
                    a statement from us until a person sends them.
                </p>

                <h2 style={h2}>Contact</h2>
                <p>
                    Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                </p>
            </main>
        </div>
    );
}

const h2: React.CSSProperties = { fontSize: 17, marginTop: 32, marginBottom: 8 };
