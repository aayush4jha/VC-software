import { NextRequest, NextResponse } from 'next/server';

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
        // Try both v1beta and v1 API versions with multiple models
        const attempts = [
            { version: 'v1beta', model: 'gemini-2.0-flash' },
            { version: 'v1beta', model: 'gemini-1.5-flash' },
            { version: 'v1', model: 'gemini-1.5-flash' },
            { version: 'v1beta', model: 'gemini-1.5-pro' },
            { version: 'v1', model: 'gemini-1.5-pro' },
            { version: 'v1', model: 'gemini-pro' },
            { version: 'v1beta', model: 'gemini-pro' },
        ];

        let res: Response | null = null;
        let lastError = '';

        const requestBody = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
        });

        for (const { version, model } of attempts) {
            const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: requestBody,
                });
                if (res.ok) {
                    console.log(`Gemini success with ${version}/${model}`);
                    break;
                }
                lastError = await res.text();
                console.error(`Gemini ${version}/${model} failed:`, lastError.slice(0, 100));
                res = null;
            } catch (e) {
                lastError = (e as Error).message;
                res = null;
            }
        }

        if (!res || !res.ok) {
            return NextResponse.json({ error: `All AI models failed. Last error: ${lastError.slice(0, 300)}` }, { status: 502 });
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

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
        return NextResponse.json({ error: (err as Error).message || 'AI generation failed' }, { status: 500 });
    }
}
