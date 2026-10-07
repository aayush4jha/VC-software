import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { callGeminiMultimodal, getGeminiApiKeys } from '@/lib/gemini';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
    // These routes spend real money on model calls and read company data back
    // out in the response, so they are members-only like the rest of the app.
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    if (getGeminiApiKeys().length === 0) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
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
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.3, maxOutputTokens: 2000, label: 'filter-brief',
        });

        return NextResponse.json({ brief: rawText });
    } catch (err) {
        console.error('[filter-brief]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
