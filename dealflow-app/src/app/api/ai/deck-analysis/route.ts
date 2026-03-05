import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyName, founderName, industry, subIndustry, companyRound, totalFundRaise, valuation, quickSummary, googleDriveLink } = await request.json();

    const prompt = `You are a senior VC analyst at Dholakia Ventures performing a full deck analysis for the Initial Screening stage. Based on the available information, provide a structured analysis.

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Sub-Industry: ${subIndustry || 'Not specified'}
Round: ${companyRound}
Fund Raise: ${totalFundRaise ? `₹${totalFundRaise}` : 'Not specified'}
Valuation: ${valuation ? `₹${valuation}` : 'Not specified'}
${quickSummary ? `Previous Summary: ${quickSummary}` : ''}
${googleDriveLink ? `Data Room: ${googleDriveLink}` : ''}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "summary": "Executive summary of the company (2-3 sentences)",
    "problem": "Problem statement the company is solving",
    "solution": "The company's solution and approach",
    "market": "Market size, opportunity, and dynamics",
    "businessModel": "How the company makes money",
    "traction": "Current traction, metrics, and growth (infer from round/valuation if data unavailable)",
    "team": "Assessment of the founding team",
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "redFlags": ["Red flag 1", "Red flag 2"],
    "suggestedQuestions": ["Question 1 for intro call", "Question 2", "Question 3"]
}`;

    try {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        // Parse JSON from response (handle potential markdown wrapping)
        let analysis;
        try {
            const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysis = JSON.parse(jsonStr);
        } catch {
            // If JSON parse fails, create structured response from text
            analysis = {
                summary: rawText.substring(0, 300),
                problem: 'Unable to parse structured response',
                solution: '',
                market: '',
                businessModel: '',
                traction: '',
                team: '',
                strengths: [],
                redFlags: ['AI response parsing failed - review manually'],
                suggestedQuestions: [],
            };
        }

        return NextResponse.json({ analysis });
    } catch (err) {
        console.error('AI deck-analysis error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
