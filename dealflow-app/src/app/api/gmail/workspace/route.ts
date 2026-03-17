import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

function decodeBase64Url(data: string): string {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBodyText(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
    if (payload.body?.data && payload.mimeType === 'text/plain') {
        return decodeBase64Url(payload.body.data);
    }
    if (payload.parts) {
        for (const part of payload.parts as typeof payload[]) {
            // Prefer text/plain
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return decodeBase64Url(part.body.data);
            }
        }
        // Fallback to text/html stripped
        for (const part of payload.parts as typeof payload[]) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                const html = decodeBase64Url(part.body.data);
                return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }
        // Recurse into multipart
        for (const part of payload.parts as typeof payload[]) {
            if (part.parts) {
                const result = extractBodyText(part);
                if (result) return result;
            }
        }
    }
    return '';
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

async function analyzeEmailWithAI(subject: string, senderName: string, senderEmail: string, bodyText: string, snippet: string): Promise<ExtractedData> {
    if (!GEMINI_API_KEY) {
        return {
            companyName: null, founderName: null, companyRound: null,
            totalFundRaise: null, valuation: null, industry: null,
            subIndustry: null, dealSourceType: null, priorityLevel: null,
            shareType: null, summary: null,
        };
    }

    // Truncate body to avoid token limits
    const truncatedBody = bodyText.slice(0, 4000);

    const prompt = `You are analyzing an email received by a Venture Capital firm. Extract structured data from this email for their deal pipeline.

EMAIL DETAILS:
- Subject: ${subject}
- From: ${senderName} <${senderEmail}>
- Snippet: ${snippet}
- Full Body:
${truncatedBody}

Extract the following fields. Return ONLY valid JSON with these exact keys. Use null for any field you cannot determine:

{
  "companyName": "The startup/company name (NOT the sender's personal name, extract the actual company name)",
  "founderName": "The founder's full name",
  "companyRound": "One of: Pre-Seed, Seed, Pre-Series A, Series A, Pre-Series B, Series B, Growth Stage, Pre-IPO, IPO",
  "totalFundRaise": "Amount being raised in INR crores as a number (e.g. 1.2 for ₹1.2Cr). Convert from USD/other currencies if needed (1 USD ≈ 83 INR). null if not mentioned",
  "valuation": "Company valuation in INR crores as a number. Convert if needed. null if not mentioned",
  "industry": "The primary industry/sector (e.g. FinTech, HealthTech, SaaS, Defense, EdTech, E-commerce, AI/ML, CleanTech, etc.)",
  "subIndustry": "More specific sub-industry if mentioned",
  "dealSourceType": "One of: Founder Network, Investment Banker, Friends & Family, VC & PE",
  "priorityLevel": "One of: Low, Medium, High - based on the quality/urgency of the opportunity",
  "shareType": "One of: Primary, Secondary",
  "summary": "A 1-2 sentence summary of what this email is about and why it's relevant for the VC firm"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no explanation.`;

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
                }),
            },
        );

        if (!res.ok) {
            console.error('[workspace] Gemini API error:', res.status, await res.text());
            return {
                companyName: null, founderName: null, companyRound: null,
                totalFundRaise: null, valuation: null, industry: null,
                subIndustry: null, dealSourceType: null, priorityLevel: null,
                shareType: null, summary: null,
            };
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Strip markdown code blocks if present
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            companyName: parsed.companyName || null,
            founderName: parsed.founderName || null,
            companyRound: parsed.companyRound || null,
            totalFundRaise: typeof parsed.totalFundRaise === 'number' ? parsed.totalFundRaise : null,
            valuation: typeof parsed.valuation === 'number' ? parsed.valuation : null,
            industry: parsed.industry || null,
            subIndustry: parsed.subIndustry || null,
            dealSourceType: parsed.dealSourceType || null,
            priorityLevel: parsed.priorityLevel || null,
            shareType: parsed.shareType || null,
            summary: parsed.summary || null,
        };
    } catch (err) {
        console.error('[workspace] AI extraction error:', err);
        return {
            companyName: null, founderName: null, companyRound: null,
            totalFundRaise: null, valuation: null, industry: null,
            subIndustry: null, dealSourceType: null, priorityLevel: null,
            shareType: null, summary: null,
        };
    }
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
    // AI-extracted fields
    extracted: ExtractedData;
}

export async function GET(request: NextRequest) {
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

        // Only fetch emails after connection time
        let afterFilter = '';
        if (authResult.connectedAt) {
            const epochSeconds = Math.floor(new Date(authResult.connectedAt).getTime() / 1000);
            afterFilter = ` after:${epochSeconds}`;
        }

        // Fetch both inbox and sent emails in parallel
        const [inboxResponse, sentResponse] = await Promise.all([
            gmail.users.messages.list({
                userId: 'me',
                q: `in:inbox${afterFilter}`,
                maxResults: 50,
            }),
            gmail.users.messages.list({
                userId: 'me',
                q: `in:sent${afterFilter}`,
                maxResults: 30,
            }),
        ]);

        const inboxMessages = (inboxResponse.data.messages || []).map(m => ({ ...m, _direction: 'received' as const }));
        const sentMessages = (sentResponse.data.messages || []).map(m => ({ ...m, _direction: 'sent' as const }));

        // Dedup by ID (a message can appear in both inbox and sent if it's a reply)
        const seenIds = new Set<string>();
        const allMessages: Array<{ id?: string | null; threadId?: string | null; _direction: 'received' | 'sent' }> = [];
        for (const msg of [...inboxMessages, ...sentMessages]) {
            if (msg.id && !seenIds.has(msg.id)) {
                seenIds.add(msg.id);
                allMessages.push(msg);
            }
        }

        if (allMessages.length === 0) {
            return NextResponse.json({ emails: [] });
        }

        const emails: WorkspaceEmail[] = [];

        for (const msg of allMessages) {
            if (!msg.id) continue;

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
                const snippet = fullMsg.data.snippet || '';

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

                // Extract full body text for AI analysis (only for received relevant emails)
                let extracted: ExtractedData;
                if (direction === 'received' && isRelevant && GEMINI_API_KEY) {
                    const bodyText = extractBodyText(fullMsg.data.payload as Parameters<typeof extractBodyText>[0]);
                    extracted = await analyzeEmailWithAI(subject, senderName, senderEmail, bodyText, snippet);
                } else {
                    extracted = {
                        companyName: null, founderName: null, companyRound: null,
                        totalFundRaise: null, valuation: null, industry: null,
                        subIndustry: null, dealSourceType: null, priorityLevel: null,
                        shareType: null, summary: null,
                    };
                }

                // Use AI-extracted company name, or fall back to subject-based derivation
                let derivedCompanyName = extracted.companyName || subject.replace(/^(re|fwd|fw):\s*/gi, '').trim();
                if (!derivedCompanyName || derivedCompanyName === '(No Subject)') {
                    const targetEmail = direction === 'sent' ? (recipientEmail || '') : senderEmail;
                    const domain = targetEmail.split('@')[1]?.split('.')[0] || 'Unknown';
                    derivedCompanyName = domain.charAt(0).toUpperCase() + domain.slice(1);
                }

                emails.push({
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
                });
            } catch {
                // Skip individual message errors
            }
        }

        // Sort by date (newest first)
        emails.sort((a, b) => {
            return new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime();
        });

        return NextResponse.json({ emails });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        console.error('[gmail/workspace] error:', error);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch emails' },
            { status: err.code === 401 ? 401 : 500 },
        );
    }
}
