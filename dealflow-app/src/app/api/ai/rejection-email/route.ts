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
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.5, maxOutputTokens: 1000, label: 'rejection-email',
        });

        return NextResponse.json({ emailDraft: rawText });
    } catch (err) {
        console.error('[rejection-email]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
