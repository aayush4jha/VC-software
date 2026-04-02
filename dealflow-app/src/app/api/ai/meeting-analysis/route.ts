import { NextRequest, NextResponse } from 'next/server';

interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

async function callGemini(apiKey: string, parts: GeminiPart[]): Promise<string> {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 16000 },
    });

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
                const data = await res.json().catch(() => ({ error: { code: res.status } }));
                if (res.ok) {
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (text) return text;
                    break;
                }
                const code = data?.error?.code;
                if (code === 429) {
                    const waitMs = 20000;
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                if (code === 404) break;
                break;
            } catch { break; }
        }
    }
    throw new Error('All Gemini models failed. Please try again.');
}

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { companyName, founderName, fileData, fileMimeType, fileName } = await request.json();

    if (!fileData || !fileMimeType) {
        return NextResponse.json({ error: 'No recording file provided' }, { status: 400 });
    }

    const isVideo = fileMimeType.startsWith('video/');
    const isAudio = fileMimeType.startsWith('audio/');

    const prompt = `You are a senior VC analyst reviewing a ${isVideo ? 'video' : 'audio'} recording of a meeting with ${founderName || 'a founder'} from ${companyName || 'a startup'}.

Analyze this recording thoroughly and provide:

1. **FULL TRANSCRIPT**: Transcribe the entire conversation word-by-word. Label speakers as "Host" and "${founderName || 'Founder'}" (or Speaker 1, Speaker 2, etc. if unclear). Include timestamps where possible.

${isVideo ? `2. **FACIAL EXPRESSION & BODY LANGUAGE ANALYSIS**: Analyze the visual cues throughout the meeting:
   - Confidence levels at different points
   - Signs of nervousness, hesitation, or evasiveness
   - Enthusiasm and passion indicators
   - Eye contact patterns
   - Body posture and hand gestures
   - Micro-expressions during key claims (especially around metrics, traction, financials)
   - Overall demeanor assessment
   - Any discrepancies between verbal claims and non-verbal cues` : `2. **VOCAL TONE ANALYSIS**: Analyze the audio cues:
   - Confidence levels in voice
   - Signs of nervousness or hesitation
   - Enthusiasm and passion indicators
   - Pace and clarity of speech`}

3. **KEY DISCUSSION POINTS**: The most important topics discussed, with specific details and numbers mentioned.

4. **ACTION ITEMS**: Clear next steps agreed upon.

5. **CONCERNS & RED FLAGS**: Any claims that seemed exaggerated, vague answers, or potential issues.

6. **SENTIMENT SUMMARY**: Overall sentiment and quality of the interaction (1 paragraph).

7. **PARTICIPANT BEHAVIOR**: Brief assessment of each participant's communication style and credibility.

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
    "transcript": "Full word-by-word transcript with speaker labels and timestamps",
    "facialAnalysis": "${isVideo ? 'Detailed facial expression and body language analysis paragraph' : 'Detailed vocal tone and speech pattern analysis paragraph'}",
    "keyPoints": ["Key point 1 with specifics", "Key point 2", "..."],
    "actionItems": ["Action item 1", "Action item 2", "..."],
    "concerns": ["Concern 1", "Concern 2", "..."],
    "redFlags": ["Red flag 1 if any", "..."],
    "sentimentSummary": "Overall sentiment and interaction quality summary",
    "participantBehavior": ["Host: assessment", "${founderName || 'Founder'}: assessment"],
    "duration": "Estimated duration in format like '32 minutes'"
}`;

    try {
        const geminiParts: GeminiPart[] = [
            { text: prompt },
            { inlineData: { mimeType: fileMimeType, data: fileData } },
        ];

        const rawText = await callGemini(GEMINI_API_KEY, geminiParts);

        let analysis;
        try {
            let jsonStr = rawText.trim()
                .replace(/^```(?:json)?\s*\n?/i, '')
                .replace(/\n?```\s*$/i, '')
                .trim();
            if (!jsonStr.startsWith('{')) {
                const first = jsonStr.indexOf('{');
                const last = jsonStr.lastIndexOf('}');
                if (first !== -1 && last > first) jsonStr = jsonStr.substring(first, last + 1);
            }
            analysis = JSON.parse(jsonStr);
        } catch {
            analysis = {
                transcript: rawText.substring(0, 5000),
                facialAnalysis: '',
                keyPoints: [],
                actionItems: [],
                concerns: [],
                redFlags: [],
                sentimentSummary: '',
                participantBehavior: [],
                duration: 'Unknown',
            };
        }

        return NextResponse.json({ analysis });
    } catch (err) {
        console.error('[meeting-analysis] error:', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
}
