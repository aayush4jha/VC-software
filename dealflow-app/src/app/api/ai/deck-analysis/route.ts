import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

async function callGeminiMultimodal(apiKey: string, parts: GeminiPart[]): Promise<string> {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
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
                    if (text) return text;
                }

                const errBody = await res.json().catch(() => ({ error: { code: res.status } }));
                const code = errBody?.error?.code;

                if (code === 429) {
                    const retryDelay = errBody?.error?.details?.find(
                        (d: { retryDelay?: string }) => d.retryDelay
                    )?.retryDelay;
                    const waitMs = retryDelay ? parseInt(retryDelay) * 1000 : 20000;
                    console.log(`Rate limited on ${model}, waiting ${waitMs}ms...`);
                    await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
                    continue;
                }

                if (code === 404) break;

                console.error(`Gemini ${model} error (${code}):`, JSON.stringify(errBody.error?.message || '').slice(0, 100));
                break;
            } catch (e) {
                console.error(`Gemini ${model} fetch error:`, (e as Error).message);
                break;
            }
        }
    }

    throw new Error('All Gemini models failed or quota exhausted. Please try again in a few minutes.');
}

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
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyId, companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, quickSummary, googleDriveLink } = await request.json();

    // ─── Try to fetch the actual pitch deck attachment from Gmail ───
    let attachmentParts: GeminiPart[] = [];
    let attachmentInfo = '';

    if (companyId) {
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

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "summary": "Detailed executive summary (4-6 sentences covering what the company does, market positioning, competitive advantage, and investment thesis)",
    "problem": "Deep analysis of the problem being solved — market pain points, current alternatives, why existing solutions fail, size of the problem with data points",
    "solution": "Detailed description of the solution, technology stack, product differentiation, unique value proposition, IP/moat analysis",
    "market": "TAM/SAM/SOM analysis with specific numbers, market growth rate, key trends driving the market, competitive landscape overview, regulatory environment",
    "businessModel": "Revenue model breakdown, unit economics (CAC, LTV, margins), pricing strategy, scalability analysis, path to profitability",
    "traction": "Current metrics assessment — revenue run rate, growth rate, user/customer count, retention rates, key milestones achieved, runway analysis based on raise amount",
    "team": "Founder background assessment, team completeness, domain expertise evaluation, advisory board, key hires needed",
    "competitiveLandscape": "Direct and indirect competitors, market share distribution, competitive advantages and disadvantages, barriers to entry",
    "financialProjection": "Expected trajectory over 3-5 years based on round stage, burn rate estimation, break-even timeline, exit potential and comparable exits in the space",
    "investmentThesis": "Why this is or isn't a good investment for Dholakia Ventures — risk-reward analysis, expected MOIC, alignment with portfolio strategy",
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

        const rawText = await callGeminiMultimodal(GEMINI_API_KEY, geminiParts);

        let analysis;
        try {
            const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysis = JSON.parse(jsonStr);
        } catch {
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
