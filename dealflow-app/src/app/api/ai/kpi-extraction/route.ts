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

    const { companyName, industry, subIndustry, companyRound, totalFundRaise, valuation, deckAnalysis } = await request.json();

    const prompt = `You are a VC analyst at Dholakia Ventures. Based on the company information, identify the business model and extract relevant KPIs with industry benchmarks.

Company: ${companyName}
Industry: ${industry || 'Not specified'}
Sub-Industry: ${subIndustry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'Not specified'}
Valuation: ${valuation ? `₹${valuation}` : 'Not specified'}
${deckAnalysis ? `Analysis: ${JSON.stringify(deckAnalysis)}` : ''}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "businessModel": "Identified business model (e.g., SaaS, Marketplace, D2C, FinTech, etc.)",
    "kpis": [
        {"name": "KPI Name", "value": "Estimated/extracted value", "benchmark": "Industry benchmark for this round", "status": "above|below|on-par"},
        {"name": "Another KPI", "value": "Value", "benchmark": "Benchmark", "status": "above|below|on-par"}
    ]
}

Include 4-6 relevant KPIs for the identified business model. Common KPIs by model:
- SaaS: MRR/ARR, Churn Rate, LTV/CAC, Net Revenue Retention, Burn Multiple
- Marketplace: GMV, Take Rate, Buyer/Seller Ratio, Repeat Rate
- D2C: AOV, CAC, Repeat Purchase Rate, Gross Margin
- FinTech: TPV, Revenue per User, Default Rate, Growth Rate`;

    try {
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.3, maxOutputTokens: 1500, label: 'kpi-extraction',
        });

        let kpiData;
        try {
            const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            kpiData = JSON.parse(jsonStr);
        } catch {
            kpiData = { businessModel: 'Unknown', kpis: [] };
        }

        return NextResponse.json({ kpiData });
    } catch (err) {
        console.error('[kpi-extraction]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
