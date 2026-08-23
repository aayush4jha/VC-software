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

    const { companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, dealSourceType } = await request.json();

    const prompt = `You are a venture capital analyst at Dholakia Ventures. Provide a concise 2-3 line quick summary of this company for the thesis check stage.

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Sub-Industry: ${subIndustry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'Not specified'}
Valuation: ${valuation ? `₹${valuation}` : 'Not specified'}
Deal Source: ${dealSourceType}

Write a brief, professional summary (2-3 lines max) covering what the company likely does, the stage they're at, and a quick assessment. Be direct and factual.`;

    try {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return NextResponse.json({ summary });
    } catch (err) {
        console.error('AI quick-summary error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
