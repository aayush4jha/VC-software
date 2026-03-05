import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
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
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const memo = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return NextResponse.json({ memo });
    } catch (err) {
        console.error('AI ic-memo error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
