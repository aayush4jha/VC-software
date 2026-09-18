import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { deriveCompanyName, matchCompany } from '@/lib/email-company';
import { collectAttachments, type AttachmentPart } from '@/lib/server/gmail-parse';

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

/**
 * Files an email's attachments against a company so they can be opened from the
 * company page later. The bytes stay in Gmail — this records where they are and
 * what they are; /api/gmail/attachment streams them on demand.
 *
 * Best-effort by design: a failed insert must never cost us the company the
 * email created, so errors are logged and swallowed.
 */
async function saveDocuments(
    db: SupabaseClient,
    companyId: string,
    attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[],
    meta: { messageId: string; senderEmail: string; subject: string; receivedAt: string | null },
): Promise<void> {
    if (attachments.length === 0) return;
    const rows = attachments.map(a => ({
        organization_id: ORGANIZATION_ID,
        company_id: companyId,
        file_name: a.filename,
        mime_type: a.mimeType,
        size_bytes: a.size,
        is_pitch_deck: isPitchDeckAttachment(a.filename),
        source: 'email',
        gmail_message_id: meta.messageId,
        gmail_attachment_id: a.attachmentId,
        received_at: meta.receivedAt,
        sender_email: meta.senderEmail,
        subject: meta.subject,
    }));
    // onConflict matches the table's (company_id, gmail_message_id, file_name)
    // key, so re-ingesting a thread does not stack up duplicate rows.
    const { error } = await db
        .from('company_documents')
        .upsert(rows, { onConflict: 'company_id,gmail_message_id,file_name', ignoreDuplicates: true });
    if (error) console.error('[gmail/ingest] saveDocuments:', error.message);
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
  "companyName": "The STARTUP's name. Read the body and the signature for it — the subject line is usually the topic ('Pitch Deck', 'Investment Opportunity', 'Following up'), NOT a name, so never copy the subject here. Never the sender's personal name, and never a generic word like Pitch/Deck/Startup. If the sender writes from a company domain, that domain is a strong hint. Return null if the email genuinely does not name a company rather than guessing.",
  "founderName": "The founder's full name",
  "companyRound": "One of: Pre-Seed, Seed, Pre-Series A, Series A, Pre-Series B, Series B, Growth Stage, Pre-IPO, IPO",
  "totalFundRaise": "Amount being raised in INR crores as a number (e.g. 1.2 for ₹1.2Cr). Convert from USD/other currencies if needed (1 USD ≈ 83 INR). null if not mentioned",
  "valuation": "Company valuation in INR crores as a number. Convert if needed. null if not mentioned",
  "industry": "The primary industry/sector (e.g. FinTech, HealthTech, SaaS, Defense, EdTech, E-commerce, AI/ML, CleanTech, etc.)",
  "subIndustry": "More specific sub-industry if mentioned",
  "dealSourceType": "One of: Founder Network, Investment Banker, Friends & Family, VC & PE",
  "priorityLevel": "One of: Low, Medium, High - based on the quality/urgency of the opportunity",
  "shareType": "One of: Primary, Secondary, Debt",
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
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    const authResult = await getAuthenticatedClientForUser(userId);
    if (!authResult) {
        return NextResponse.json(
            { error: 'Not authenticated with Google. Please connect your account.' },
            { status: 401 },
        );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    try {
        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });
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
        const connectedAt = authResult.connectedAt;
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

        // Every company, for the dedup match below. Held in memory and appended
        // to as companies are created, so two emails about the same new startup
        // in one run club together rather than racing each other.
        const { data: companyRows } = await db
            .from('companies')
            .select('id, company_name, founder_email')
            .eq('organization_id', ORGANIZATION_ID);
        const existingCompanies: { id: string; company_name: string; founder_email: string | null }[] =
            companyRows || [];

        let processed = 0;
        let skipped = 0;
        let attached = 0;
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

                // Collect attachments, including ones nested inside multipart
                // parts — a deck sent from Outlook usually is.
                const attachments = collectAttachments(fullMsg.data.payload as AttachmentPart);
                const attachmentNames = attachments.map(a => a.filename);
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

                const companyName = deriveCompanyName({
                    aiName: ai.companyName,
                    senderName,
                    senderEmail,
                    subject,
                });

                const founderName = ai.founderName || senderName;

                // Does this email belong to a company we already have? Matched on
                // the exact address, then a shared work domain, then the
                // normalised name — so a second mail about the same startup, from
                // a co-founder or a personal address, joins that record instead
                // of creating a near-duplicate beside it.
                const match = matchCompany(existingCompanies, { companyName, senderEmail });

                if (match) {
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
                        company_id: match.id,
                        // 'processed', not 'skipped': the email was filed against a
                        // company, which is the outcome we wanted.
                        status: 'processed',
                        error_message: `Filed under existing company "${match.company_name}" (matched on ${match.matchedBy})`,
                        relevance_label: relevanceLabel,
                    });

                    // Its attachments belong on that company too — a follow-up
                    // carrying the updated deck is exactly the case this serves.
                    await saveDocuments(db, match.id, attachments, {
                        messageId: msg.id,
                        senderEmail,
                        subject,
                        receivedAt: dateHeader ? new Date(dateHeader).toISOString() : null,
                    });

                    await db.from('activity_logs').insert({
                        company_id: match.id,
                        user_id: userId,
                        action: 'email_received',
                        details: `Email from ${senderEmail}: "${subject}"${hasAttachments ? ` (${attachmentNames.length} attachment${attachmentNames.length === 1 ? '' : 's'})` : ''}`,
                    });

                    attached++;
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

                // AI returns amounts in crores — convert to full INR for storage
                const CRORE = 10000000;
                if (ai.totalFundRaise !== null) companyInsert.total_fund_raise = Math.round(ai.totalFundRaise * CRORE);
                if (ai.valuation !== null) companyInsert.valuation = Math.round(ai.valuation * CRORE);
                if (industryId) companyInsert.industry_id = industryId;
                // Store email body so Analyze Deck can use the pitch content
                if (bodyText) {
                    companyInsert.quick_summary = `[Email Pitch]\n${bodyText.slice(0, 4000)}`;
                } else if (ai.summary) {
                    companyInsert.quick_summary = ai.summary;
                }

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

                existingCompanies.push({
                    id: newCompany.id,
                    company_name: companyName,
                    founder_email: senderEmail,
                });

                await saveDocuments(db, newCompany.id, attachments, {
                    messageId: msg.id,
                    senderEmail,
                    subject,
                    receivedAt: dateHeader ? new Date(dateHeader).toISOString() : null,
                });

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

        return NextResponse.json({ success: true, processed, skipped, attached, created, errors: errors.length > 0 ? errors : undefined });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        console.error('[gmail/ingest] error:', error);
        return NextResponse.json(
            { error: err.message || 'Failed to ingest emails' },
            { status: err.code === 401 ? 401 : 500 },
        );
    }
}
