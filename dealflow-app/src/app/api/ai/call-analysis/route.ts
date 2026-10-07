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

    const { companyName, founderName, callNotes, callDate, callDuration, platform } = await request.json();

    const prompt = `You are a VC analyst at Dholakia Ventures. Analyze the following call notes/transcript from a meeting with a startup founder and extract structured insights.

Company: ${companyName}
Founder: ${founderName}
Call Date: ${callDate || 'Not specified'}
Duration: ${callDuration || 'Not specified'}
Platform: ${platform || 'Not specified'}

Call Notes/Transcript:
${callNotes || 'No notes provided - generate template based on typical intro call'}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "keyPoints": ["Key insight 1", "Key insight 2", "Key insight 3"],
    "actionItems": ["Action item 1", "Action item 2"],
    "concerns": ["Concern 1", "Concern 2"],
    "redFlags": ["Red flag 1 (if any)"]
}

Extract 3-5 key points, 2-3 action items, 1-3 concerns, and any red flags. If no notes provided, generate realistic template items based on a typical VC intro call.`;

    try {
        const rawText = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.3, maxOutputTokens: 1500, label: 'call-analysis',
        });

        let callAnalysis;
        try {
            const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            callAnalysis = JSON.parse(jsonStr);
        } catch {
            callAnalysis = { keyPoints: [], actionItems: [], concerns: [], redFlags: [] };
        }

        return NextResponse.json({ callAnalysis });
    } catch (err) {
        console.error('[call-analysis]', (err as Error).message);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
