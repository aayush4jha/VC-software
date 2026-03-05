import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
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
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        let kpiData;
        try {
            const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            kpiData = JSON.parse(jsonStr);
        } catch {
            kpiData = { businessModel: 'Unknown', kpis: [] };
        }

        return NextResponse.json({ kpiData });
    } catch (err) {
        console.error('AI kpi-extraction error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
