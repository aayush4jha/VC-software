import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
                if (data?.error?.code === 429) {
                    await new Promise(r => setTimeout(r, 20000));
                    continue;
                }
                break;
            } catch { break; }
        }
    }
    throw new Error('All Gemini models failed. Please try again.');
}

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const authResult = await getAuthenticatedClientForUser(user.id);
    if (!authResult) return NextResponse.json({ error: 'Google not connected' }, { status: 401 });

    const { companyName, founderName } = await request.json();
    if (!companyName) return NextResponse.json({ error: 'companyName required' }, { status: 400 });

    try {
        const drive = google.drive({ version: 'v3', auth: authResult.oauth2Client });

        // Search Google Drive for meeting recordings
        // Google Meet saves recordings in "Meet Recordings" folder or with naming pattern
        const searchQueries = [
            `name contains '${companyName.replace(/'/g, "\\'")}' and (mimeType contains 'video/' or mimeType contains 'audio/')`,
            `name contains 'Meet' and name contains '${companyName.split(' ')[0].replace(/'/g, "\\'")}' and mimeType contains 'video/'`,
            `mimeType contains 'video/' and modifiedTime > '${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}'`,
        ];

        let recordingFile: { id: string; name: string; mimeType: string } | null = null;

        for (const q of searchQueries) {
            try {
                const res = await drive.files.list({
                    q,
                    fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
                    orderBy: 'modifiedTime desc',
                    pageSize: 5,
                });
                const files = res.data.files || [];
                if (files.length > 0 && files[0].id && files[0].mimeType) {
                    recordingFile = { id: files[0].id, name: files[0].name || 'recording', mimeType: files[0].mimeType };
                    break;
                }
            } catch (e) {
                console.error('[fetch-meeting-recording] Drive search error:', (e as Error).message);
            }
        }

        if (!recordingFile) {
            return NextResponse.json({
                found: false,
                error: 'No meeting recording found in Google Drive. Make sure the Google Meet recording has been saved.',
            });
        }

        // Download the recording
        console.log(`[fetch-meeting-recording] Found: ${recordingFile.name} (${recordingFile.mimeType})`);
        const fileRes = await drive.files.get(
            { fileId: recordingFile.id, alt: 'media' },
            { responseType: 'arraybuffer' },
        );

        const buffer = Buffer.from(fileRes.data as ArrayBuffer);
        const base64 = buffer.toString('base64');
        const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
        console.log(`[fetch-meeting-recording] Downloaded: ${fileSizeMB}MB`);

        const isVideo = recordingFile.mimeType.startsWith('video/');

        // Analyze with Gemini
        const prompt = `You are a senior VC analyst reviewing a ${isVideo ? 'video' : 'audio'} recording of a meeting with ${founderName || 'a founder'} from ${companyName || 'a startup'}.

Analyze this recording thoroughly and provide:

1. **FULL TRANSCRIPT**: Transcribe the entire conversation word-by-word. Label speakers as "Host" and "${founderName || 'Founder'}" (or Speaker 1, Speaker 2 if unclear). Include timestamps.

${isVideo ? `2. **FACIAL EXPRESSION & BODY LANGUAGE ANALYSIS**: Analyze visual cues:
   - Confidence levels at different points
   - Signs of nervousness, hesitation, or evasiveness
   - Enthusiasm and passion indicators
   - Eye contact patterns and body posture
   - Micro-expressions during key claims (metrics, traction, financials)
   - Discrepancies between verbal claims and non-verbal cues` : `2. **VOCAL TONE ANALYSIS**: Analyze audio cues:
   - Confidence levels in voice
   - Signs of nervousness or hesitation
   - Enthusiasm and passion indicators`}

3. **KEY DISCUSSION POINTS**: Most important topics with specific details and numbers.
4. **ACTION ITEMS**: Clear next steps agreed upon.
5. **CONCERNS & RED FLAGS**: Exaggerated claims, vague answers, potential issues.
6. **SENTIMENT SUMMARY**: Overall sentiment and quality of interaction.
7. **PARTICIPANT BEHAVIOR**: Assessment of each participant's communication style and credibility.

Respond in EXACTLY this JSON format (no markdown, no code blocks):
{
    "transcript": "Full word-by-word transcript with speaker labels and timestamps",
    "facialAnalysis": "Detailed expression and behavior analysis",
    "keyPoints": ["Key point 1", "Key point 2"],
    "actionItems": ["Action 1", "Action 2"],
    "concerns": ["Concern 1"],
    "redFlags": ["Red flag 1 if any"],
    "sentimentSummary": "Overall sentiment summary",
    "participantBehavior": ["Host: assessment", "${founderName || 'Founder'}: assessment"],
    "duration": "Estimated duration"
}`;

        const geminiParts: GeminiPart[] = [
            { text: prompt },
            { inlineData: { mimeType: recordingFile.mimeType, data: base64 } },
        ];

        const rawText = await callGemini(GEMINI_API_KEY, geminiParts);

        let analysis;
        try {
            let jsonStr = rawText.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            if (!jsonStr.startsWith('{')) {
                const first = jsonStr.indexOf('{');
                const last = jsonStr.lastIndexOf('}');
                if (first !== -1 && last > first) jsonStr = jsonStr.substring(first, last + 1);
            }
            analysis = JSON.parse(jsonStr);
        } catch {
            analysis = {
                transcript: rawText.substring(0, 5000),
                facialAnalysis: '', keyPoints: [], actionItems: [],
                concerns: [], redFlags: [], sentimentSummary: '',
                participantBehavior: [], duration: 'Unknown',
            };
        }

        return NextResponse.json({
            found: true,
            fileName: recordingFile.name,
            analysis,
        });
    } catch (error: unknown) {
        console.error('[fetch-meeting-recording] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
