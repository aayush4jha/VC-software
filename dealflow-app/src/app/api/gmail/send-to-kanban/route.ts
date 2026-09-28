import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { deriveCompanyName, matchCompany } from '@/lib/email-company';
import { normalizeCompanyRound, normalizePriority, normalizeDealSourceType, normalizeShareType } from '@/lib/company-enums';
import { collectAttachments, type AttachmentPart, type FoundAttachment } from '@/lib/server/gmail-parse';
import { saveEmailDocuments } from '@/lib/server/company-documents';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// Reading the deck and copying it into storage takes longer than a metadata write.
export const maxDuration = 120;
const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function isPitchDeckAttachment(filename: string): boolean {
    return PITCH_DECK_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

function getMimeType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (lower.endsWith('.key')) return 'application/x-iwork-keynote-sfile';
    if (lower.endsWith('.odp')) return 'application/vnd.oasis.opendocument.presentation';
    return 'application/octet-stream';
}

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

interface ExtractedData {
    companyName: string | null;
    founderName: string | null;
    founderEmail: string | null;
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

async function analyzeWithGemini(
    apiKey: string,
    subject: string,
    senderName: string,
    senderEmail: string,
    bodyText: string,
    attachmentParts: GeminiPart[],
): Promise<ExtractedData> {
    const hasAttachment = attachmentParts.length > 0;
    const truncatedBody = bodyText.slice(0, 4000);

    const prompt = `You are analyzing an email received by Dholakia Ventures, a Venture Capital firm. Extract structured data from this email AND any attached pitch deck for their deal pipeline.

${hasAttachment ? `IMPORTANT: A pitch deck document is attached. Extract ALL data from it — company name, founder details, fundraise amount, valuation, round, industry, traction metrics, and any other relevant information. The pitch deck is the PRIMARY source of truth. If the deck contains data that differs from the email body, prefer the deck.` : ''}

EMAIL DETAILS:
- Subject: ${subject}
- From: ${senderName} <${senderEmail}>
- Full Body:
${truncatedBody}

Extract the following fields. Return ONLY valid JSON with these exact keys. Use null for any field you cannot determine. Be extremely accurate — extract REAL data, do not guess or fabricate numbers:

{
  "companyName": "The startup/company name (NOT the sender's personal name, extract the actual company name from deck or email)",
  "founderName": "The founder's full name",
  "founderEmail": "The founder's email address (use sender email if it appears to be the founder's)",
  "companyRound": "One of: Pre-Seed, Seed, Pre-Series A, Series A, Pre-Series B, Series B, Growth Stage, Pre-IPO, IPO",
  "totalFundRaise": "Amount being raised in INR crores as a number (e.g. 1.2 for ₹1.2Cr). Convert from USD if needed (1 USD ≈ 83 INR). null if not mentioned anywhere",
  "valuation": "Company valuation in INR crores as a number. Convert if needed. null if not mentioned anywhere",
  "industry": "The primary industry/sector (e.g. FinTech, HealthTech, SaaS, Defense, EdTech, E-commerce, AI, CleanTech, etc.)",
  "subIndustry": "More specific sub-industry if mentioned",
  "dealSourceType": "One of: Founder Network, Investment Banker, Friends & Family, VC & PE",
  "priorityLevel": "One of: Low, Medium, High - based on the quality/completeness of the pitch and data available",
  "shareType": "One of: Primary, Secondary, Debt",
  "summary": "A 2-3 sentence summary of the company, what it does, its traction, and why it's relevant for a VC firm"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no explanation.`;

    const parts: GeminiPart[] = [{ text: prompt }, ...attachmentParts];

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    });

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });

                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (text) {
                        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                        const parsed = JSON.parse(cleaned);
                        return {
                            companyName: parsed.companyName || null,
                            founderName: parsed.founderName || null,
                            founderEmail: parsed.founderEmail || null,
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
                    }
                }

                const errBody = await res.json().catch(() => ({ error: { code: res.status } }));
                const code = errBody?.error?.code;

                if (code === 429) {
                    const retryDelay = errBody?.error?.details?.find(
                        (d: { retryDelay?: string }) => d.retryDelay
                    )?.retryDelay;
                    const waitMs = retryDelay ? parseInt(retryDelay) * 1000 : 20000;
                    await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
                    continue;
                }

                if (code === 404) break;
                console.error(`[send-to-kanban] Gemini ${model} error (${code})`);
                break;
            } catch (e) {
                console.error(`[send-to-kanban] Gemini ${model} fetch error:`, (e as Error).message);
                break;
            }
        }
    }

    // All models failed — return nulls
    return {
        companyName: null, founderName: null, founderEmail: null, companyRound: null,
        totalFundRaise: null, valuation: null, industry: null,
        subIndustry: null, dealSourceType: null, priorityLevel: null,
        shareType: null, summary: null,
    };
}

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const body = await request.json();
    const {
        gmailMessageId, gmailThreadId, senderName, senderEmail,
        subject, receivedAt, hasAttachments, attachmentNames,
        hasPitchDeck, relevanceLabel, derivedCompanyName,
        // AI-extracted fields from workspace (text-only analysis)
        extracted,
        emailBody,
    } = body;

    if (!senderEmail || !subject) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const db = createServiceClient(supabaseUrl, serviceRoleKey);

        // Get first pipeline stage
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

        // ─── Download attachments and re-analyze with Gemini multimodal ───
        let ai: ExtractedData = extracted || {
            companyName: null, founderName: null, founderEmail: null, companyRound: null,
            totalFundRaise: null, valuation: null, industry: null,
            subIndustry: null, dealSourceType: null, priorityLevel: null,
            shareType: null, summary: null,
        };

        if (gmailMessageId && GEMINI_API_KEY) {
            try {
                const authResult = await getAuthenticatedClientForUser(userId);
                if (authResult) {
                    const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

                    // Fetch full message to get attachment metadata
                    const fullMsg = await gmail.users.messages.get({
                        userId: 'me',
                        id: gmailMessageId,
                        format: 'full',
                    });

                    const msgParts = fullMsg.data.payload?.parts || [];
                    const attachmentGeminiParts: GeminiPart[] = [];

                    // Download all pitch deck attachments
                    const allParts = [...msgParts];
                    // Also check nested multipart structures
                    for (const part of msgParts) {
                        if (part.parts) {
                            allParts.push(...(part.parts as typeof msgParts));
                        }
                    }

                    for (const part of allParts) {
                        const filename = part.filename || '';
                        if (!filename || !isPitchDeckAttachment(filename)) continue;
                        if (!part.body?.attachmentId) continue;

                        try {
                            const attachmentRes = await gmail.users.messages.attachments.get({
                                userId: 'me',
                                messageId: gmailMessageId,
                                id: part.body.attachmentId,
                            });

                            const base64Data = attachmentRes.data.data;
                            if (base64Data) {
                                const standardBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                                const mimeType = getMimeType(filename);
                                attachmentGeminiParts.push({
                                    inlineData: { mimeType, data: standardBase64 },
                                });
                                console.log(`[send-to-kanban] Downloaded attachment: ${filename} (${(standardBase64.length * 0.75 / 1024 / 1024).toFixed(1)}MB)`);
                            }
                        } catch (attachErr) {
                            console.error(`[send-to-kanban] Failed to download attachment ${filename}:`, (attachErr as Error).message);
                        }
                    }

                    // Re-analyze with attachment content (multimodal)
                    const freshAI = await analyzeWithGemini(
                        GEMINI_API_KEY,
                        subject,
                        senderName,
                        senderEmail,
                        emailBody || '',
                        attachmentGeminiParts,
                    );

                    // Merge: prefer fresh AI data over old text-only extraction
                    ai = {
                        companyName: freshAI.companyName || ai.companyName,
                        founderName: freshAI.founderName || ai.founderName,
                        founderEmail: freshAI.founderEmail || ai.founderEmail,
                        companyRound: freshAI.companyRound || ai.companyRound,
                        totalFundRaise: freshAI.totalFundRaise ?? ai.totalFundRaise,
                        valuation: freshAI.valuation ?? ai.valuation,
                        industry: freshAI.industry || ai.industry,
                        subIndustry: freshAI.subIndustry || ai.subIndustry,
                        dealSourceType: freshAI.dealSourceType || ai.dealSourceType,
                        priorityLevel: freshAI.priorityLevel || ai.priorityLevel,
                        shareType: freshAI.shareType || ai.shareType,
                        summary: freshAI.summary || ai.summary,
                    };
                }
            } catch (err) {
                console.error('[send-to-kanban] Attachment analysis error:', (err as Error).message);
                // Continue with text-only extraction
            }
        }

        // Same rule as gmail/ingest: the subject is a topic, not a name.
        const companyName = deriveCompanyName({
            aiName: ai.companyName || derivedCompanyName,
            senderName: senderName || '',
            senderEmail,
            subject,
        });
        const founderName = ai.founderName || senderName || senderEmail.split('@')[0];
        const founderEmail = ai.founderEmail || senderEmail;

        // Through the normalisers: these columns are CHECK-constrained, and an
        // AI answering "Seed Round" instead of "Seed" failed the whole insert.
        const companyRound = normalizeCompanyRound(ai.companyRound);
        const priorityLevel = normalizePriority(ai.priorityLevel);
        const dealSourceType = normalizeDealSourceType(ai.dealSourceType);
        const shareType = normalizeShareType(ai.shareType);
        // AI returns amounts in crores — convert to full INR for storage
        const CRORE = 10000000;
        const totalFundRaise = ai.totalFundRaise != null ? Math.round(ai.totalFundRaise * CRORE) : null;
        const valuation = ai.valuation != null ? Math.round(ai.valuation * CRORE) : null;
        const subIndustry = ai.subIndustry || '';

        const customTags = ['email-ingested', 'email-workspace'];
        if (hasPitchDeck) customTags.push('has-pitch-deck');

        // Try to match industry by name
        let industryId = '';
        if (ai.industry) {
            const { data: matchedIndustry } = await db
                .from('industries')
                .select('id')
                .eq('organization_id', ORGANIZATION_ID)
                .ilike('name', ai.industry)
                .limit(1);
            if (matchedIndustry && matchedIndustry.length > 0) {
                industryId = matchedIndustry[0].id;
            }
        }

        // The email's attachments, so the deck ends up on the company's
        // Documents card. This path recorded only the file NAMES on the email
        // log, so a deck sent to the kanban from here was findable in Gmail and
        // nowhere on the company — unlike the automatic inbox scan, which filed
        // it properly.
        let attachments: FoundAttachment[] = [];
        let documentGmail: ReturnType<typeof google.gmail> | undefined;
        if (gmailMessageId) {
            try {
                const authResult = await getAuthenticatedClientForUser(userId);
                if (authResult) {
                    documentGmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });
                    const msg = await documentGmail.users.messages.get({ userId: 'me', id: gmailMessageId, format: 'full' });
                    attachments = collectAttachments(msg.data.payload as AttachmentPart);
                }
            } catch (err) {
                // Filing the company matters more than filing its deck.
                console.error('[send-to-kanban] could not read attachments:', (err as Error).message);
            }
        }
        const documentMeta = {
            messageId: gmailMessageId || '',
            senderEmail: founderEmail,
            subject,
            receivedAt: receivedAt || null,
            label: 'send-to-kanban',
        };

        // An email about a company we already track joins that record. Without
        // this, sending a second mail to the kanban created a near-duplicate
        // card beside the first.
        const { data: companyRows } = await db
            .from('companies')
            .select('id, company_name, founder_email')
            .eq('organization_id', ORGANIZATION_ID);
        // forceNew is the escape hatch for when the match is wrong: the person
        // looking at the email overrules it, rather than having no way through.
        const match = body.forceNew === true
            ? null
            : matchCompany(companyRows || [], { companyName, senderEmail: founderEmail, senderName });

        if (match) {
            if (gmailMessageId) {
                await db.from('ingested_emails').insert({
                    organization_id: ORGANIZATION_ID,
                    gmail_message_id: gmailMessageId,
                    gmail_thread_id: gmailThreadId || null,
                    sender_name: founderName,
                    sender_email: founderEmail,
                    subject,
                    received_at: receivedAt || null,
                    has_attachments: hasAttachments || false,
                    attachment_names: attachmentNames || [],
                    company_id: match.id,
                    status: 'processed',
                    error_message: `Filed under existing company "${match.company_name}" (matched on ${match.matchedBy})`,
                    relevance_label: relevanceLabel || null,
                });
            }

            if (gmailMessageId) await saveEmailDocuments(db, match.id, attachments, documentMeta, documentGmail);

            await db.from('activity_logs').insert({
                company_id: match.id,
                user_id: userId,
                action: 'email_received',
                details: `Email from ${founderEmail}: "${subject}" filed from the Email Workspace`,
            });

            return NextResponse.json({
                success: true,
                matchedExisting: true,
                matchedBy: match.matchedBy,
                company: { id: match.id, companyName: match.company_name },
            });
        }

        // Build company insert
        const companyInsert: Record<string, unknown> = {
            organization_id: ORGANIZATION_ID,
            company_name: companyName,
            founder_name: founderName,
            founder_email: founderEmail,
            pipeline_stage_id: firstStageId,
            priority_level: priorityLevel,
            company_round: companyRound,
            deal_source_type: dealSourceType,
            share_type: shareType,
            needs_review: true,
            ingestion_source: 'email-workspace',
            custom_tags: customTags,
            sub_industry: subIndustry,
        };

        if (totalFundRaise !== null) companyInsert.total_fund_raise = totalFundRaise;
        if (valuation !== null) companyInsert.valuation = valuation;
        if (industryId) companyInsert.industry_id = industryId;
        // Store email body as quick_summary so Analyze Deck can use it
        if (emailBody) {
            companyInsert.quick_summary = `[Email Pitch]\n${emailBody.slice(0, 4000)}`;
        } else if (ai.summary) {
            companyInsert.quick_summary = ai.summary;
        }

        const { data: newCompany, error: companyError } = await db
            .from('companies')
            .insert(companyInsert)
            .select()
            .single();

        if (companyError) {
            // A raw "violates check constraint companies_company_round_check"
            // told the person nothing they could act on. Name the field.
            const constraint = /check constraint "companies_(\w+)_check"/.exec(companyError.message)?.[1];
            const field = constraint ? constraint.replace(/_/g, ' ') : null;
            return NextResponse.json({
                error: field
                    ? `The ${field} read from this email ("${
                        { company_round: companyRound, priority_level: priorityLevel, deal_source_type: dealSourceType, share_type: shareType }[constraint!] ?? '?'
                    }") is not one the platform accepts, so the company was not created. Add it with + Add Company, or tell Claude.`
                    : companyError.message,
            }, { status: 500 });
        }

        if (gmailMessageId) await saveEmailDocuments(db, newCompany.id, attachments, documentMeta, documentGmail);

        // Record in ingested_emails
        if (gmailMessageId) {
            await db.from('ingested_emails').insert({
                organization_id: ORGANIZATION_ID,
                gmail_message_id: gmailMessageId,
                gmail_thread_id: gmailThreadId || null,
                sender_name: founderName,
                sender_email: founderEmail,
                subject,
                received_at: receivedAt || null,
                has_attachments: hasAttachments || false,
                attachment_names: attachmentNames || [],
                company_id: newCompany.id,
                status: 'processed',
                relevance_label: relevanceLabel || null,
            });
        }

        // Activity log
        await db.from('activity_logs').insert({
            company_id: newCompany.id,
            user_id: userId,
            action: 'created',
            details: `Sent to Kanban from Email Workspace: "${subject}" from ${founderEmail}. AI-extracted: ${ai.summary || 'N/A'}`,
        });

        // Notify other users
        const { data: profiles } = await db
            .from('profiles')
            .select('id')
            .eq('organization_id', ORGANIZATION_ID)
            .neq('id', userId);

        if (profiles && profiles.length > 0) {
            const notifs = profiles.map((p: { id: string }) => ({
                user_id: p.id,
                type: 'new_company',
                title: 'Email Workspace',
                message: `${companyName} added from email (needs review)${companyRound ? ' — ' + companyRound : ''}`,
                company_id: newCompany.id,
            }));
            await db.from('notifications').insert(notifs);
        }

        return NextResponse.json({
            success: true,
            company: { id: newCompany.id, companyName },
        });
    } catch (error: unknown) {
        console.error('[gmail/send-to-kanban] error:', error);
        return NextResponse.json({ error: (error as Error).message || 'Failed to create company' }, { status: 500 });
    }
}
