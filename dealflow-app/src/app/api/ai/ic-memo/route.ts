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

    const { companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, shareType, quickSummary, deckAnalysis, kpiData, callTranscript, filterBrief } = await request.json();

    const prompt = `You are a senior investment analyst at Dholakia Ventures. Generate a comprehensive Investment Committee (IC) Memo for the partners to review before making a final investment decision.

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Sub-Industry: ${subIndustry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'Not specified'}
Valuation: ${valuation ? `₹${valuation}` : 'Not specified'}
Share Type: ${shareType || 'Primary'}

${quickSummary ? `Summary: ${quickSummary}` : ''}
${deckAnalysis ? `Deck Analysis: ${JSON.stringify(deckAnalysis)}` : ''}
${kpiData ? `KPI Data: ${JSON.stringify(kpiData)}` : ''}
${callTranscript ? `Call Notes: ${JSON.stringify(callTranscript)}` : ''}
${filterBrief ? `Filter Brief: ${filterBrief}` : ''}

Write a formal IC Memo in the following structure:

INVESTMENT COMMITTEE MEMO
=========================
Company: ${companyName}
Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

1. EXECUTIVE SUMMARY
2. COMPANY OVERVIEW
3. MARKET OPPORTUNITY
4. BUSINESS MODEL & TRACTION
5. TEAM ASSESSMENT
6. DEAL TERMS
   - Round: ${companyRound}
   - Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'TBD'}
   - Valuation: ${valuation ? `₹${valuation}` : 'TBD'}
   - Share Type: ${shareType || 'Primary'}
7. KEY METRICS & KPIs
8. COMPETITIVE LANDSCAPE
9. RISKS & MITIGANTS
10. INVESTMENT THESIS
11. RECOMMENDATION

Make it professional, thorough, and suitable for printing as a PDF.`;

    try {
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.3, maxOutputTokens: 4000, label: 'ic-memo',
        });

        return NextResponse.json({ memo: rawText });
    } catch (err) {
        console.error('[ic-memo]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
