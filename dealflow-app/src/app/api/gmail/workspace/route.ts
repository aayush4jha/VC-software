import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';

const FUNDING_KEYWORDS = [
    'pitch deck', 'fundraising', 'funding', 'startup', 'investor',
    'venture capital', 'seed round', 'series a', 'series b', 'pre-seed',
    'investment opportunity', 'founder', 'vc', 'angel investor',
    'capital raise', 'investment', 'raise', 'round', 'valuation',
    'term sheet', 'due diligence', 'portfolio', 'equity',
];

const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];

function detectRelevance(subject: string, snippet: string): { isRelevant: boolean; label: string } {
    const text = `${subject} ${snippet}`.toLowerCase();
    const matched = FUNDING_KEYWORDS.filter(kw => text.includes(kw));
    if (matched.length === 0) return { isRelevant: false, label: 'Non-Relevant' };

    const pitchKeywords = ['pitch deck', 'deck'];
    const fundingKeywords = ['fundraising', 'funding', 'capital raise', 'raise', 'round', 'seed round', 'series a', 'series b', 'pre-seed'];
    const investorKeywords = ['investor', 'venture capital', 'vc', 'angel investor', 'investment opportunity', 'investment'];

    if (matched.some(kw => pitchKeywords.includes(kw))) return { isRelevant: true, label: 'Startup Pitch' };
    if (matched.some(kw => fundingKeywords.includes(kw))) return { isRelevant: true, label: 'Funding Relevant' };
    if (matched.some(kw => investorKeywords.includes(kw))) return { isRelevant: true, label: 'Investor Opportunity' };
    return { isRelevant: true, label: 'Startup Relevant' };
}

function extractSenderInfo(fromHeader: string): { name: string; email: string } {
    const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    if (match) {
        return {
            name: (match[1] || '').trim() || match[2].split('@')[0],
            email: match[2].trim(),
        };
    }
    return { name: fromHeader.split('@')[0], email: fromHeader };
}

export interface WorkspaceEmail {
    id: string;
    threadId: string | null;
    senderName: string;
    senderEmail: string;
    subject: string;
    snippet: string;
    receivedAt: string | null;
    hasAttachments: boolean;
    attachmentNames: string[];
    hasPitchDeck: boolean;
    isRelevant: boolean;
    relevanceLabel: string;
    derivedCompanyName: string;
}

export async function GET(request: NextRequest) {
    const accessToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Google. Please connect your account.' },
            { status: 401 },
        );
    }

    try {
        const oauth2Client = getAuthenticatedClient(accessToken, refreshToken);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Only fetch emails after connection time
        const connectedAt = request.cookies.get('google_connected_at')?.value;
        let query = 'in:inbox';
        if (connectedAt) {
            const epochSeconds = Math.floor(new Date(connectedAt).getTime() / 1000);
            query += ` after:${epochSeconds}`;
        }

        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50,
        });

        const messages = listResponse.data.messages || [];

        if (messages.length === 0) {
            return NextResponse.json({ emails: [] });
        }

        const emails: WorkspaceEmail[] = [];

        for (const msg of messages) {
            if (!msg.id) continue;

            try {
                const fullMsg = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject', 'Date'],
                });

                const headers = fullMsg.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const snippet = fullMsg.data.snippet || '';

                const { name: senderName, email: senderEmail } = extractSenderInfo(fromHeader);

                const parts = fullMsg.data.payload?.parts || [];
                const attachmentNames = parts
                    .filter(p => p.filename && p.filename.length > 0)
                    .map(p => p.filename!);
                const hasPitchDeck = attachmentNames.some(fn =>
                    PITCH_DECK_EXTENSIONS.some(ext => fn.toLowerCase().endsWith(ext))
                );

                const { isRelevant, label } = detectRelevance(subject, snippet);

                let derivedCompanyName = subject.replace(/^(re|fwd|fw):\s*/gi, '').trim();
                if (!derivedCompanyName || derivedCompanyName === '(No Subject)') {
                    const domain = senderEmail.split('@')[1]?.split('.')[0] || 'Unknown';
                    derivedCompanyName = domain.charAt(0).toUpperCase() + domain.slice(1);
                }

                emails.push({
                    id: msg.id,
                    threadId: msg.threadId || null,
                    senderName,
                    senderEmail,
                    subject,
                    snippet,
                    receivedAt: dateHeader ? new Date(dateHeader).toISOString() : null,
                    hasAttachments: attachmentNames.length > 0,
                    attachmentNames,
                    hasPitchDeck,
                    isRelevant,
                    relevanceLabel: label,
                    derivedCompanyName,
                });
            } catch {
                // Skip individual message errors
            }
        }

        // Sort: relevant emails first, then by date
        emails.sort((a, b) => {
            if (a.isRelevant !== b.isRelevant) return a.isRelevant ? -1 : 1;
            return new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime();
        });

        return NextResponse.json({ emails });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 401) {
            const response = NextResponse.json(
                { error: 'Google session expired. Please reconnect your account.' },
                { status: 401 },
            );
            response.cookies.delete('google_access_token');
            response.cookies.delete('google_connected');
            return response;
        }
        console.error('[gmail/workspace] error:', error);
        return NextResponse.json({ error: err.message || 'Failed to fetch emails' }, { status: 500 });
    }
}
