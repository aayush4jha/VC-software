import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyName, founderName, rejectionReasons, rejectionStage, industry } = await request.json();

    const prompt = `You are writing a rejection email on behalf of Dholakia Ventures. Write a personalized, warm, and professional rejection email.

Company: ${companyName}
Founder: ${founderName}
Industry: ${industry || 'Not specified'}
Rejection Stage: ${rejectionStage || 'Assessment'}
Rejection Reasons: ${rejectionReasons?.join(', ') || 'General assessment'}

Write a rejection email that:
1. Thanks the founder personally for their time
2. Acknowledges the specific company and what they're building
3. Provides a tactful reason related to the actual rejection reasons without being too specific or hurtful
4. Includes a warm offer to reconnect in the future (milestone-based if possible)
5. Optionally offers to make introductions to other funds if appropriate
6. Signs off as "Dholakia Ventures"

Keep it professional but warm. 200-300 words. Do NOT include subject line — just the email body starting with "Dear ${founderName},".`;

    try {
        const res = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 1000 },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Gemini API error:', err);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await res.json();
        const emailDraft = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return NextResponse.json({ emailDraft });
    } catch (err) {
        console.error('AI rejection-email error:', err);
        return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }
}
