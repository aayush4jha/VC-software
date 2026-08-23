import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: NextRequest) {
    // These routes spend real money on model calls and read company data back
    // out in the response, so they are members-only like the rest of the app.
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyName, founderName, industry, companyRound, totalFundRaise, valuation, quickSummary, deckAnalysis, kpiData, callTranscript } = await request.json();

    const prompt = `You are a senior VC analyst at Dholakia Ventures. Generate a concise Filter Discussion Brief for the partners to review asynchronously. Compile all available analysis into a clear, scannable brief.

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'Not specified'}
Valuation: ${valuation ? `₹${valuation}` : 'Not specified'}

${quickSummary ? `Quick Summary: ${quickSummary}` : ''}
${deckAnalysis ? `Deck Analysis: ${JSON.stringify(deckAnalysis)}` : ''}
${kpiData ? `KPI Data: ${JSON.stringify(kpiData)}` : ''}
${callTranscript ? `Call Notes: ${JSON.stringify(callTranscript)}` : ''}

Write a professional partner review brief in plain text format. Structure it as:
1. EXECUTIVE SUMMARY (2-3 lines)
2. KEY METRICS (bullet points)
3. STRENGTHS (bullet points)
4. CONCERNS & RED FLAGS (bullet points)
5. CALL HIGHLIGHTS (if call data available)
6. RECOMMENDATION (Advance / Reject / Need More Info with reasoning)

Keep it concise and scannable — partners need to review this quickly.`;

    try {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const brief = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return NextResponse.json({ brief });
    } catch (err) {
        console.error('AI filter-brief error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
