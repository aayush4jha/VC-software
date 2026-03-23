import { NextRequest, NextResponse } from 'next/server';

async function callGemini(apiKey: string, prompt: string): Promise<string> {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
    });

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Try up to 2 times per model (in case of rate limit with retry)
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

                // Rate limited — wait and retry
                if (code === 429) {
                    const retryDelay = errBody?.error?.details?.find(
                        (d: { retryDelay?: string }) => d.retryDelay
                    )?.retryDelay;
                    const waitMs = retryDelay ? parseInt(retryDelay) * 1000 : 20000;
                    console.log(`Rate limited on ${model}, waiting ${waitMs}ms...`);
                    await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
                    continue;
                }

                // Model not found — try next model
                if (code === 404) break;

                // Other error — try next model
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

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, quickSummary, googleDriveLink } = await request.json();

    const hasEmailPitch = quickSummary && quickSummary.startsWith('[Email Pitch]');
    const emailContent = hasEmailPitch ? quickSummary.replace('[Email Pitch]\n', '') : '';

    const prompt = `You are a senior VC analyst at Dholakia Ventures. Perform an extremely detailed, data-oriented investment analysis report for the following company.

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

Generate a comprehensive, detailed, descriptive, and data-oriented investment analysis report. Be thorough and specific. Use actual numbers, percentages, and market data where possible. If specific data is not available, provide reasonable industry benchmarks and estimates.

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
        const rawText = await callGemini(GEMINI_API_KEY, prompt);

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
