import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_EMAIL = 'pipeline@dholakiaventures.com';
const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const FUNDING_KEYWORDS = [
    'pitch deck', 'fundraising', 'funding', 'startup', 'investor',
    'venture capital', 'seed round', 'series a', 'series b', 'pre-seed',
    'investment opportunity', 'founder', 'vc', 'angel investor',
    'capital raise', 'investment', 'raise', 'round', 'valuation',
    'term sheet', 'due diligence', 'portfolio', 'equity',
];

function detectFundingRelevance(subject: string, snippet: string): { isRelevant: boolean; label: string | null } {
    const text = `${subject} ${snippet}`.toLowerCase();
    const matched = FUNDING_KEYWORDS.filter(kw => text.includes(kw));
    if (matched.length === 0) return { isRelevant: false, label: null };

    const pitchKeywords = ['pitch deck', 'deck'];
    const fundingKeywords = ['fundraising', 'funding', 'capital raise', 'raise', 'round', 'seed round', 'series a', 'series b', 'pre-seed'];
    const investorKeywords = ['investor', 'venture capital', 'vc', 'angel investor', 'investment opportunity', 'investment'];

    if (matched.some(kw => pitchKeywords.includes(kw))) return { isRelevant: true, label: 'Startup Pitch' };
    if (matched.some(kw => fundingKeywords.includes(kw))) return { isRelevant: true, label: 'Funding Relevant' };
    if (matched.some(kw => investorKeywords.includes(kw))) return { isRelevant: true, label: 'Investor Opportunity' };
    return { isRelevant: true, label: 'Startup Relevant' };
}

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
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

function isPitchDeckAttachment(filename: string): boolean {
    const lower = filename.toLowerCase();
    return PITCH_DECK_EXTENSIONS.some(ext => lower.endsWith(ext));
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
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return decodeBase64Url(part.body.data);
            }
        }
        for (const part of payload.parts as typeof payload[]) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                const html = decodeBase64Url(part.body.data);
                return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }
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

        if (!res.ok) return {
            companyName: null, founderName: null, companyRound: null,
            totalFundRaise: null, valuation: null, industry: null,
            subIndustry: null, dealSourceType: null, priorityLevel: null,
            shareType: null, summary: null,
        };

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
    } catch {
        return {
            companyName: null, founderName: null, companyRound: null,
            totalFundRaise: null, valuation: null, industry: null,
            subIndustry: null, dealSourceType: null, priorityLevel: null,
            shareType: null, summary: null,
        };
    }
}

export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Google. Please connect your account.' },
            { status: 401 },
        );
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    try {
        const oauth2Client = getAuthenticatedClient(accessToken, refreshToken);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const db = createServiceClient(supabaseUrl, serviceRoleKey);

        // Get the first pipeline stage by order
        const { data: stages } = await db
            .from('pipeline_stages')
            .select('id')
            .eq('organization_id', ORGANIZATION_ID)
            .order('order', { ascending: true })
            .limit(1);

        const firstStageId = stages?.[0]?.id;
        if (!firstStageId) {
            return NextResponse.json({ error: 'No pipeline stages configured' }, { status: 400 });
        }

        // Fetch already-processed Gmail message IDs for dedup
        const { data: existingEmails } = await db
            .from('ingested_emails')
            .select('gmail_message_id')
            .eq('organization_id', ORGANIZATION_ID);

        const processedIds = new Set((existingEmails || []).map((e: { gmail_message_id: string }) => e.gmail_message_id));

        // Only ingest emails received after the account was connected
        const connectedAt = request.cookies.get('google_connected_at')?.value;
        let query = `to:${TARGET_EMAIL}`;
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
            return NextResponse.json({ success: true, processed: 0, skipped: 0, created: [], message: 'No emails found' });
        }

        // Pre-fetch all industries for matching
        const { data: allIndustries } = await db
            .from('industries')
            .select('id, name')
            .eq('organization_id', ORGANIZATION_ID);

        let processed = 0;
        let skipped = 0;
        const created: Array<{ companyName: string; companyId: string }> = [];
        const errors: string[] = [];

        for (const msg of messages) {
            if (!msg.id) continue;

            // Dedup: skip already-processed messages
            if (processedIds.has(msg.id)) {
                skipped++;
                continue;
            }

            try {
                // Fetch FULL format to get email body for AI analysis
                const fullMsg = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });

                const headers = fullMsg.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const snippet = fullMsg.data.snippet || '';

                const { name: senderName, email: senderEmail } = extractSenderInfo(fromHeader);

                // Check for attachments
                const parts = fullMsg.data.payload?.parts || [];
                const attachmentNames = parts
                    .filter(p => p.filename && p.filename.length > 0)
                    .map(p => p.filename as string);
                const hasPitchDeck = attachmentNames.some(isPitchDeckAttachment);
                const hasAttachments = attachmentNames.length > 0;

                // Keyword-based filtering: only process funding-relevant emails
                const { isRelevant, label: relevanceLabel } = detectFundingRelevance(subject, snippet);
                if (!isRelevant) {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        gmail_thread_id: msg.threadId || null,
                        sender_name: senderName,
                        sender_email: senderEmail,
                        subject,
                        received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                        has_attachments: hasAttachments,
                        attachment_names: attachmentNames,
                        status: 'skipped',
                        error_message: 'Not funding/startup relevant',
                        relevance_label: null,
                    });
                    skipped++;
                    continue;
                }

                // Extract body text and run AI analysis
                const bodyText = extractBodyText(fullMsg.data.payload as Parameters<typeof extractBodyText>[0]);
                const ai = await analyzeEmailWithAI(subject, senderName, senderEmail, bodyText, snippet);

                // Use AI-extracted company name, or fall back to subject
                let companyName = ai.companyName || subject.replace(/^(re|fwd|fw):\s*/gi, '').trim();
                if (!companyName || companyName === '(No Subject)') {
                    const domain = senderEmail.split('@')[1]?.split('.')[0] || 'Unknown';
                    companyName = domain.charAt(0).toUpperCase() + domain.slice(1);
                }

                const founderName = ai.founderName || senderName;

                // Check if a company with this founder email already exists
                const { data: existingCompany } = await db
                    .from('companies')
                    .select('id, company_name')
                    .eq('organization_id', ORGANIZATION_ID)
                    .eq('founder_email', senderEmail)
                    .limit(1);

                if (existingCompany && existingCompany.length > 0) {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        gmail_thread_id: msg.threadId || null,
                        sender_name: founderName,
                        sender_email: senderEmail,
                        subject,
                        received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                        has_attachments: hasAttachments,
                        attachment_names: attachmentNames,
                        company_id: existingCompany[0].id,
                        status: 'skipped',
                        error_message: `Company already exists: ${existingCompany[0].company_name}`,
                        relevance_label: relevanceLabel,
                    });
                    skipped++;
                    continue;
                }

                // Match industry
                let industryId: string | undefined;
                if (ai.industry && allIndustries) {
                    const match = allIndustries.find(
                        (ind: { id: string; name: string }) => ind.name.toLowerCase() === ai.industry!.toLowerCase()
                    );
                    if (match) industryId = match.id;
                }

                // Create the company with AI-extracted data
                const customTags = ['email-ingested'];
                if (hasPitchDeck) customTags.push('has-pitch-deck');

                const companyInsert: Record<string, unknown> = {
                    organization_id: ORGANIZATION_ID,
                    company_name: companyName,
                    founder_name: founderName,
                    founder_email: senderEmail,
                    pipeline_stage_id: firstStageId,
                    priority_level: ai.priorityLevel || 'Medium',
                    company_round: ai.companyRound || 'Seed',
                    deal_source_type: ai.dealSourceType || 'Founder Network',
                    share_type: ai.shareType || 'Primary',
                    needs_review: true,
                    ingestion_source: 'email',
                    custom_tags: customTags,
                    sub_industry: ai.subIndustry || '',
                };

                if (ai.totalFundRaise !== null) companyInsert.total_fund_raise = ai.totalFundRaise;
                if (ai.valuation !== null) companyInsert.valuation = ai.valuation;
                if (industryId) companyInsert.industry_id = industryId;
                if (ai.summary) companyInsert.quick_summary = ai.summary;

                const { data: newCompany, error: companyError } = await db
                    .from('companies')
                    .insert(companyInsert)
                    .select()
                    .single();

                if (companyError) {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        gmail_thread_id: msg.threadId || null,
                        sender_name: founderName,
                        sender_email: senderEmail,
                        subject,
                        received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                        has_attachments: hasAttachments,
                        attachment_names: attachmentNames,
                        status: 'error',
                        error_message: companyError.message,
                    });
                    errors.push(`Failed to create company for ${senderEmail}: ${companyError.message}`);
                    continue;
                }

                // Record in ingested_emails
                await db.from('ingested_emails').insert({
                    organization_id: ORGANIZATION_ID,
                    gmail_message_id: msg.id,
                    gmail_thread_id: msg.threadId || null,
                    sender_name: founderName,
                    sender_email: senderEmail,
                    subject,
                    received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                    has_attachments: hasAttachments,
                    attachment_names: attachmentNames,
                    company_id: newCompany.id,
                    status: 'processed',
                    relevance_label: relevanceLabel,
                });

                // Add activity log
                await db.from('activity_logs').insert({
                    company_id: newCompany.id,
                    user_id: userId,
                    action: 'created',
                    details: `Auto-created from email: "${subject}" from ${senderEmail}. AI: ${ai.summary || 'N/A'}`,
                });

                // Notify all other users
                const { data: profiles } = await db
                    .from('profiles')
                    .select('id')
                    .eq('organization_id', ORGANIZATION_ID)
                    .neq('id', userId);

                if (profiles && profiles.length > 0) {
                    const notifs = profiles.map((p: { id: string }) => ({
                        user_id: p.id,
                        type: 'new_company',
                        title: 'Email Ingested',
                        message: `${companyName} auto-created from email (needs review)${ai.companyRound ? ' — ' + ai.companyRound : ''}`,
                        company_id: newCompany.id,
                    }));
                    await db.from('notifications').insert(notifs);
                }

                created.push({ companyName, companyId: newCompany.id });
                processed++;
            } catch (err) {
                const errMsg = (err as Error).message;
                errors.push(`Error processing message ${msg.id}: ${errMsg}`);
                try {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        sender_name: '',
                        sender_email: '',
                        subject: '',
                        status: 'error',
                        error_message: errMsg,
                    });
                } catch { /* ignore */ }
            }
        }

        return NextResponse.json({ success: true, processed, skipped, created, errors: errors.length > 0 ? errors : undefined });
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
        console.error('[gmail/ingest] error:', error);
        return NextResponse.json({ error: err.message || 'Failed to ingest emails' }, { status: 500 });
    }
}
