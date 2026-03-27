import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const DECK_KEYWORDS = [
    'pitch deck', 'investor deck', 'startup deck', 'fundraising',
    'proposal', 'presentation', 'funding', 'investment opportunity',
    'seed round', 'series a', 'pre-seed', 'capital raise',
];

function buildGmailLink(messageId: string): string {
    return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) {
        return NextResponse.json({ error: 'Google not connected' }, { status: 401 });
    }

    const body = await request.json();
    const { companyName, founderName, founderEmail } = body;

    if (!companyName && !founderName && !founderEmail) {
        return NextResponse.json({ error: 'Provide at least one of: companyName, founderName, founderEmail' }, { status: 400 });
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

        // Strategy 1: Search by founder email (most reliable)
        let bestMessage: { id: string; link: string; subject: string } | null = null;

        if (founderEmail) {
            const emailQuery = `from:${founderEmail} has:attachment`;
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: emailQuery,
                maxResults: 10,
            });

            const messages = res.data.messages || [];
            // Pick latest email with attachment (deck-like)
            for (const msg of messages) {
                if (!msg.id) continue;
                const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject', 'Date'] });
                const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
                const parts = full.data.payload?.parts || [];
                const hasAttachment = parts.some(p => p.filename && p.filename.length > 0);

                if (hasAttachment) {
                    bestMessage = { id: msg.id, link: buildGmailLink(msg.id), subject };
                    break; // Latest with attachment wins
                }
            }

            // If no attachment-bearing email, try without attachment filter
            if (!bestMessage && messages.length === 0) {
                const fallbackRes = await gmail.users.messages.list({
                    userId: 'me',
                    q: `from:${founderEmail}`,
                    maxResults: 5,
                });
                const fallbackMsgs = fallbackRes.data.messages || [];
                if (fallbackMsgs.length > 0 && fallbackMsgs[0].id) {
                    const full = await gmail.users.messages.get({ userId: 'me', id: fallbackMsgs[0].id, format: 'metadata', metadataHeaders: ['Subject'] });
                    const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
                    bestMessage = { id: fallbackMsgs[0].id, link: buildGmailLink(fallbackMsgs[0].id), subject };
                }
            }
        }

        // Strategy 2: Search by company name + deck keywords if no email match
        if (!bestMessage && companyName) {
            const keywordQuery = DECK_KEYWORDS.slice(0, 4).map(kw => `"${kw}"`).join(' OR ');
            const query = `${companyName} (${keywordQuery})`;
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 5,
            });

            const messages = res.data.messages || [];
            for (const msg of messages) {
                if (!msg.id) continue;
                const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject'] });
                const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
                bestMessage = { id: msg.id, link: buildGmailLink(msg.id), subject };
                break;
            }
        }

        // Strategy 3: Search by founder name if still no match
        if (!bestMessage && founderName) {
            const query = `from:${founderName} has:attachment`;
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 5,
            });

            const messages = res.data.messages || [];
            for (const msg of messages) {
                if (!msg.id) continue;
                const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject'] });
                const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
                bestMessage = { id: msg.id, link: buildGmailLink(msg.id), subject };
                break;
            }
        }

        if (bestMessage) {
            return NextResponse.json({ found: true, ...bestMessage });
        }

        return NextResponse.json({ found: false, link: null });
    } catch (error: unknown) {
        console.error('[gmail/find-deck-email] error:', error);
        return NextResponse.json({ error: (error as Error).message || 'Failed to search Gmail' }, { status: 500 });
    }
}
