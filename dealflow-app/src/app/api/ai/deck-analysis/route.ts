import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';
import { callGeminiMultimodal, getGeminiApiKeys, type GeminiPart } from '@/lib/gemini';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];

function isPitchDeckAttachment(filename: string): boolean {
    const lower = filename.toLowerCase();
    return PITCH_DECK_EXTENSIONS.some(ext => lower.endsWith(ext));
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

export async function POST(request: NextRequest) {
    if (getGeminiApiKeys().length === 0) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyId, companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, quickSummary, googleDriveLink, uploadedFile } = await request.json();

    // ─── Try to fetch the actual pitch deck attachment from Gmail ───
    let attachmentParts: GeminiPart[] = [];
    let attachmentInfo = '';

    // If a file was manually uploaded, use it directly
    if (uploadedFile && uploadedFile.data && uploadedFile.mimeType) {
        attachmentParts.push({ inlineData: { mimeType: uploadedFile.mimeType, data: uploadedFile.data } });
        attachmentInfo = `\nManually uploaded file: ${uploadedFile.filename || 'pitch-deck'} (${uploadedFile.mimeType})`;
    }

    if (companyId && attachmentParts.length === 0) {
        try {
            const user = await getRouteUser(request);
            if (user) {
                const authResult = await getAuthenticatedClientForUser(user.id);
                if (authResult) {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

                    if (supabaseUrl && serviceRoleKey) {
                        const db = createServiceClient(supabaseUrl, serviceRoleKey);

                        // Look up the ingested email record for this company
                        const { data: ingestedEmail } = await db
                            .from('ingested_emails')
                            .select('gmail_message_id, has_attachments, attachment_names')
                            .eq('company_id', companyId)
                            .eq('organization_id', ORGANIZATION_ID)
                            .eq('status', 'processed')
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .single();

                        if (ingestedEmail?.has_attachments && ingestedEmail.gmail_message_id) {
                            const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

                            // Fetch the full message to get attachment metadata
                            const fullMsg = await gmail.users.messages.get({
                                userId: 'me',
                                id: ingestedEmail.gmail_message_id,
                                format: 'full',
                            });

                            const parts = fullMsg.data.payload?.parts || [];

                            // Find and download pitch deck attachments
                            for (const part of parts) {
                                const filename = part.filename || '';
                                if (!filename || !isPitchDeckAttachment(filename)) continue;
                                if (!part.body?.attachmentId) continue;

                                try {
                                    const attachmentRes = await gmail.users.messages.attachments.get({
                                        userId: 'me',
                                        messageId: ingestedEmail.gmail_message_id,
                                        id: part.body.attachmentId,
                                    });

                                    const base64Data = attachmentRes.data.data;
                                    if (base64Data) {
                                        // Convert from URL-safe base64 to standard base64
                                        const standardBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                                        const mimeType = getMimeType(filename);

                                        attachmentParts.push({
                                            inlineData: {
                                                mimeType,
                                                data: standardBase64,
                                            },
                                        });
                                        attachmentInfo += `\nAttached file: ${filename} (${mimeType})`;
                                        console.log(`[deck-analysis] Downloaded attachment: ${filename} (${(standardBase64.length * 0.75 / 1024 / 1024).toFixed(1)}MB)`);
                                    }
                                } catch (attachErr) {
                                    console.error(`[deck-analysis] Failed to download attachment ${filename}:`, (attachErr as Error).message);
                                }
                            }

                            // Also check nested multipart structures
                            for (const part of parts) {
                                if (part.parts) {
                                    for (const subPart of part.parts as typeof parts) {
                                        const filename = subPart.filename || '';
                                        if (!filename || !isPitchDeckAttachment(filename)) continue;
                                        if (!subPart.body?.attachmentId) continue;

                                        try {
                                            const attachmentRes = await gmail.users.messages.attachments.get({
                                                userId: 'me',
                                                messageId: ingestedEmail.gmail_message_id,
                                                id: subPart.body.attachmentId,
                                            });

                                            const base64Data = attachmentRes.data.data;
                                            if (base64Data) {
                                                const standardBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                                                const mimeType = getMimeType(filename);

                                                attachmentParts.push({
                                                    inlineData: {
                                                        mimeType,
                                                        data: standardBase64,
                                                    },
                                                });
                                                attachmentInfo += `\nAttached file: ${filename} (${mimeType})`;
                                                console.log(`[deck-analysis] Downloaded nested attachment: ${filename}`);
                                            }
                                        } catch (attachErr) {
                                            console.error(`[deck-analysis] Failed to download nested attachment ${filename}:`, (attachErr as Error).message);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[deck-analysis] Error fetching attachment:', (err as Error).message);
            // Continue without attachment — fall back to text-only analysis
        }
    }

    const hasAttachment = attachmentParts.length > 0;
    const hasEmailPitch = quickSummary && quickSummary.startsWith('[Email Pitch]');
    const emailContent = hasEmailPitch ? quickSummary.replace('[Email Pitch]\n', '') : '';

    const prompt = `You are a senior VC analyst at Dholakia Ventures. Perform an extremely detailed, data-oriented investment analysis report for the following company.

${hasAttachment ? `
IMPORTANT: A pitch deck document has been attached. Analyze it thoroughly — extract ALL data, metrics, financials, charts, team info, traction numbers, market sizing, and any other relevant information directly from the document. Base your analysis primarily on the actual content of the pitch deck.
${attachmentInfo}
` : ''}
${emailContent ? `
=== ORIGINAL PITCH EMAIL ===
${emailContent}
=== END OF PITCH ===
` : ''}

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Sub-Industry: ${subIndustry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? '₹' + totalFundRaise : 'Not specified'}
Valuation: ${valuation ? '₹' + valuation : 'Not specified'}
${!hasEmailPitch && quickSummary ? `Previous Summary: ${quickSummary}` : ''}
${googleDriveLink ? `Data Room: ${googleDriveLink}` : ''}

Generate a comprehensive, detailed, descriptive, and data-oriented investment analysis report.${hasAttachment ? ' Use ACTUAL data, numbers, and metrics extracted from the pitch deck — do NOT make up numbers when real data is available in the document.' : ' Be thorough and specific. Use actual numbers, percentages, and market data where possible. If specific data is not available, provide reasonable industry benchmarks and estimates.'}

IMPORTANT: Every field below (except verdict and confidenceScore) MUST be an ARRAY of concise bullet-point strings. Each bullet should be one clear, specific point — not a paragraph. Aim for 4-8 bullets per section.

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "summary": ["Bullet 1: what the company does and its core value prop", "Bullet 2: market positioning", "Bullet 3: competitive advantage / moat", "Bullet 4: investment thesis in one line"],
    "problem": ["Pain point 1 with data", "Pain point 2", "Why existing solutions fail", "Size of the problem with numbers"],
    "solution": ["Core product description", "Key technology / tech stack", "Unique differentiator", "IP / defensibility moat"],
    "market": ["TAM with specific number", "SAM with specific number", "SOM with specific number", "Market growth rate (CAGR)", "Key trends driving growth", "Regulatory considerations"],
    "businessModel": ["Revenue model (SaaS/transactional/etc.)", "Pricing strategy", "Unit economics — CAC", "Unit economics — LTV", "Gross margins", "Path to profitability"],
    "traction": ["Revenue run rate or GMV", "Growth rate (MoM/YoY)", "User/customer count", "Retention / churn metrics", "Key milestones achieved", "Runway analysis"],
    "team": ["Founder 1 background", "Founder 2 background (if applicable)", "Team size and key hires", "Domain expertise assessment", "Advisory board / notable backers", "Key gaps to fill"],
    "competitiveLandscape": ["Competitor 1 and positioning", "Competitor 2 and positioning", "Key competitive advantage", "Barriers to entry", "Market share context"],
    "financialProjection": ["Year 1 revenue projection", "Year 3 revenue projection", "Burn rate estimate", "Break-even timeline", "Exit potential and comparable exits"],
    "investmentThesis": ["Core reason to invest / pass", "Risk-reward assessment", "Expected MOIC range", "Portfolio strategy alignment"],
    "strengths": ["Strength 1 with specific reasoning", "Strength 2", "Strength 3", "Strength 4", "Strength 5"],
    "risks": ["Risk 1 with mitigation suggestion", "Risk 2", "Risk 3", "Risk 4"],
    "redFlags": ["Red flag 1 that needs attention", "Red flag 2"],
    "dueDiligenceQuestions": ["Specific question 1 to ask in intro call", "Question 2", "Question 3", "Question 4", "Question 5"],
    "verdict": "INVEST / PASS / NEED MORE INFO — with 2-3 sentence justification",
    "confidenceScore": 75
}`;

    try {
        // Build multimodal parts: text prompt + any attachment data
        const geminiParts: GeminiPart[] = [
            { text: prompt },
            ...attachmentParts,
        ];

        const rawText = await callGeminiMultimodal(geminiParts, {
            temperature: 0.3,
            maxOutputTokens: 8000,
            label: 'deck-analysis',
        });

        let analysis;
        try {
            // Try multiple strategies to extract JSON from the response
            let jsonStr = rawText.trim();

            // Strategy 1: Strip markdown code blocks
            jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

            // Strategy 2: If it still doesn't start with {, find the first { and last }
            if (!jsonStr.startsWith('{')) {
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                }
            }

            analysis = JSON.parse(jsonStr);
        } catch (parseErr) {
            console.error('[deck-analysis] JSON parse failed:', (parseErr as Error).message, 'Raw text (first 500 chars):', rawText.substring(0, 500));
            analysis = {
                summary: rawText.substring(0, 2000),
                problem: '', solution: '', market: '', businessModel: '', traction: '', team: '',
                competitiveLandscape: '', financialProjection: '', investmentThesis: '',
                strengths: [], risks: [], redFlags: [],
                dueDiligenceQuestions: [], verdict: 'NEED MORE INFO', confidenceScore: 0,
            };
        }

        return NextResponse.json({ analysis });
    } catch (err) {
        console.error('AI deck-analysis error:', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
