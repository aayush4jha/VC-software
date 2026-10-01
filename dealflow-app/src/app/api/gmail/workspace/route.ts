import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { deriveCompanyName } from '@/lib/email-company';
import { mapLimit } from '@/lib/server/concurrency';
import { extractBodyText, decodeEntities, type AttachmentPart } from '@/lib/server/gmail-parse';
import { classifyEmail, type EmailCategory } from '@/lib/email-triage';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { emailDomain, isFreeEmailDomain } from '@/lib/email-company';


// Reading a year of mail is a lot of Gmail calls.
export const maxDuration = 300;

// How far back each refresh button looks, and how many messages it is worth
// reading for that range.
const RANGES: Record<string, { days: number; inbox: number; sent: number }> = {
    '1': { days: 1, inbox: 60, sent: 30 },
    '7': { days: 7, inbox: 100, sent: 40 },
    '14': { days: 14, inbox: 150, sent: 50 },
    '30': { days: 30, inbox: 200, sent: 60 },
    '365': { days: 365, inbox: 300, sent: 80 },
};

// The list does NO AI. Every relevant inbound email used to cost a Gemini call,
// in sequence, which is what made opening the workspace slow. Send to Kanban
// re-analyses the one email being filed — body and deck — so nothing is lost by
// not doing it a hundred times over for a list.
const EMPTY_EXTRACTION: ExtractedData = {
    companyName: null, founderName: null, companyRound: null,
    totalFundRaise: null, valuation: null, industry: null,
    subIndustry: null, dealSourceType: null, priorityLevel: null,
    shareType: null, summary: null,
};

// Messages are fetched this many at a time; it is all network waiting.
const FETCH_CONCURRENCY = 10;

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

interface ExtractedData {
    companyName: string | null;
    founderName: string | null;
    companyRound: string | null;
    totalFundRaise: number | null;
    valuation: number | null;
    industry: string | null;
    subIndustry: string | null;
    dealSourceType: string | null;
    priorityLevel: string | null;
    shareType: string | null;
    summary: string | null;
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
    direction: 'received' | 'sent';
    recipientEmail: string | null;
    category: EmailCategory;
    categoryReason: string;
    /** RFC Message-ID, so a reply can be threaded onto it. */
    messageIdHeader: string | null;
    // AI-extracted fields
    extracted: ExtractedData;
    emailBody: string;
}

/**
 * Reads a span of mail. Called with the ids the browser already holds, so a
 * refresh fetches only what is new — the rest it keeps from its own cache.
 *
 * POST, because the known-id list is too long for a query string.
 */
export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) {
        return NextResponse.json(
            { error: 'Not authenticated with Google. Please connect your account.' },
            { status: 401 },
        );
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

        // The range the person asked for, not the connection date: "refresh a
        // year" has to mean a year even on an account connected last week.
        const body = await request.json().catch(() => ({} as Record<string, unknown>));
        const range = RANGES[String(body.days ?? '1')] ?? RANGES['1'];
        const knownIds: string[] = Array.isArray(body.knownIds) ? (body.knownIds as string[]) : [];
        const since = Math.floor((Date.now() - range.days * 24 * 60 * 60 * 1000) / 1000);
        const afterFilter = ` after:${since}`;

        // Fetch both inbox and sent emails in parallel
        const [inboxResponse, sentResponse] = await Promise.all([
            gmail.users.messages.list({
                userId: 'me',
                q: `in:inbox${afterFilter}`,
                maxResults: range.inbox,
            }),
            gmail.users.messages.list({
                userId: 'me',
                q: `in:sent${afterFilter}`,
                maxResults: range.sent,
            }),
        ]);

        // Addresses and work domains of companies already in the portfolio.
        const portfolioAddresses = new Set<string>();
        const portfolioDomains = new Set<string>();
        try {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (url && key) {
                const db = createServiceClient(url, key);
                const { data: portfolio } = await db.from('companies')
                    .select('founder_email, founders').eq('terminal_status', 'Portfolio');
                for (const c of portfolio || []) {
                    const addresses: string[] = [c.founder_email, ...(Array.isArray(c.founders)
                        ? (c.founders as { email?: string }[]).map(f => f?.email || '') : [])];
                    for (const a of addresses) {
                        const lower = (a || '').trim().toLowerCase();
                        if (!lower.includes('@')) continue;
                        portfolioAddresses.add(lower);
                        if (!isFreeEmailDomain(lower)) portfolioDomains.add(emailDomain(lower));
                    }
                }
            }
        } catch (err) {
            // Sorting still works without it; everything simply lands elsewhere.
            console.error('[gmail/workspace] portfolio lookup failed:', (err as Error).message);
        }

        const inboxMessages = (inboxResponse.data.messages || []).map(m => ({ ...m, _direction: 'received' as const }));
        const sentMessages = (sentResponse.data.messages || []).map(m => ({ ...m, _direction: 'sent' as const }));

        // Dedup by ID (a message can appear in both inbox and sent if it's a reply)
        const dedup = new Set<string>();
        const allMessages: Array<{ id?: string | null; threadId?: string | null; _direction: 'received' | 'sent' }> = [];
        for (const msg of [...inboxMessages, ...sentMessages]) {
            if (msg.id && !dedup.has(msg.id)) {
                dedup.add(msg.id);
                allMessages.push(msg);
            }
        }

        if (allMessages.length === 0) {
            return NextResponse.json({ emails: [], seenIds: [], rangeDays: range.days, fetched: 0, reused: 0 });
        }

        // What the caller already holds in its cache never needs reading again:
        // a refresh then costs only the messages that are actually new.
        const known = new Set(knownIds);
        const seenIds = allMessages.map(m => m.id).filter((id): id is string => !!id);
        const toFetch = allMessages.filter(m => m.id && !known.has(m.id));

        const fetched = await mapLimit(toFetch, FETCH_CONCURRENCY, async (msg) => {
            if (!msg.id) return null;
            try {
                // Fetch FULL format to get email body for AI analysis
                const fullMsg = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });

                const headers = fullMsg.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const toHeader = headers.find(h => h.name === 'To')?.value || '';
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const messageIdHeader = headers.find(h => (h.name || '').toLowerCase() === 'message-id')?.value || null;
                const snippet = decodeEntities(fullMsg.data.snippet || '');

                // Determine direction from Gmail labels
                const labels = fullMsg.data.labelIds || [];
                const direction = labels.includes('SENT') ? 'sent' : msg._direction;

                const { name: senderName, email: senderEmail } = extractSenderInfo(fromHeader);
                const recipientEmail = toHeader ? extractSenderInfo(toHeader).email : null;

                const parts = fullMsg.data.payload?.parts || [];
                const attachmentNames = parts
                    .filter(p => p.filename && p.filename.length > 0)
                    .map(p => p.filename as string);
                const hasPitchDeck = attachmentNames.some(fn =>
                    PITCH_DECK_EXTENSIONS.some(ext => fn.toLowerCase().endsWith(ext))
                );

                const { isRelevant, label } = detectRelevance(subject, snippet);
                const bodyText = extractBodyText(fullMsg.data.payload as AttachmentPart);
                const extracted: ExtractedData = EMPTY_EXTRACTION;

                const senderLower = senderEmail.toLowerCase();
                const fromPortfolioCompany = portfolioAddresses.has(senderLower)
                    || (!isFreeEmailDomain(senderLower) && portfolioDomains.has(emailDomain(senderLower)));
                const classification = classifyEmail({
                    subject,
                    text: `${snippet} ${bodyText.slice(0, 2000)}`,
                    attachmentNames,
                    senderEmail,
                    fromPortfolioCompany,
                    hasUnsubscribeHeader: headers.some(h => (h.name || '').toLowerCase() === 'list-unsubscribe'),
                    direction,
                });

                // The shared rule, which knows a subject is a topic rather than a
                // name — this used to turn "Pitch Deck - Seed Round" into a company.
                const derivedCompanyName = deriveCompanyName({
                    aiName: extracted.companyName,
                    senderName,
                    senderEmail: direction === 'sent' ? (recipientEmail || senderEmail) : senderEmail,
                    subject,
                });

                return {
                    id: msg.id,
                    threadId: msg.threadId || null,
                    senderName: extracted.founderName || senderName,
                    senderEmail,
                    subject,
                    snippet,
                    receivedAt: dateHeader ? new Date(dateHeader).toISOString() : null,
                    hasAttachments: attachmentNames.length > 0,
                    attachmentNames,
                    hasPitchDeck,
                    isRelevant,
                    relevanceLabel: direction === 'sent' ? 'Sent' : label,
                    derivedCompanyName,
                    direction,
                    recipientEmail,
                    extracted,
                    emailBody: bodyText.slice(0, 5000),
                    category: classification.category,
                    categoryReason: classification.reason,
                    messageIdHeader,
                } as WorkspaceEmail;
            } catch {
                return null;   // one unreadable message must not sink the refresh
            }
        });

        const emails = fetched.filter((e): e is WorkspaceEmail => e !== null);
        emails.sort((a, b) =>
            new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime());

        return NextResponse.json({
            emails,
            seenIds,
            rangeDays: range.days,
            fetched: emails.length,
            reused: seenIds.length - toFetch.length,
        });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        console.error('[gmail/workspace] error:', error);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch emails' },
            { status: err.code === 401 ? 401 : 500 },
        );
    }
}
