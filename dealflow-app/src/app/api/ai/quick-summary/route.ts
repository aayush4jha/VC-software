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
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.3, maxOutputTokens: 200, label: 'quick-summary',
        });

        return NextResponse.json({ summary: rawText });
    } catch (err) {
        console.error('[quick-summary]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
