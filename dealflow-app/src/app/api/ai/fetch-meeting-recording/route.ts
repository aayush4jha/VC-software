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
                if (data?.error?.code === 429) { await new Promise(r => setTimeout(r, 20000)); continue; }
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
    if (!authResult) return NextResponse.json({ error: 'Google not connected. Please reconnect with Drive permissions.' }, { status: 401 });

    const { companyName, founderName, meetEventTitle, meetEventDate } = await request.json();
    if (!companyName) return NextResponse.json({ error: 'companyName required' }, { status: 400 });

    try {
        const drive = google.drive({ version: 'v3', auth: authResult.oauth2Client });

        // Build search queries in order of precision
        // Google Meet recordings are named like "Intro Call: CompanyName (2026-03-29 14:00 GMT+5:30)"
        const queries: string[] = [];

        // 1. Most precise: exact event title match
        if (meetEventTitle) {
            const escaped = meetEventTitle.replace(/'/g, "\\'");
            queries.push(`name contains '${escaped}' and (mimeType contains 'video/' or mimeType contains 'audio/')`);
        }

        // 2. Company name in file name + video/audio type
        const companyEscaped = companyName.replace(/'/g, "\\'");
        queries.push(`name contains '${companyEscaped}' and (mimeType contains 'video/' or mimeType contains 'audio/')`);

        // 3. First word of company name (handles "Intro Call: CompanyName" format)
        const firstWord = companyName.split(/[\s|:,\-]+/)[0];
        if (firstWord.length >= 3) {
            queries.push(`name contains '${firstWord.replace(/'/g, "\\'")}' and (mimeType contains 'video/' or mimeType contains 'audio/')`);
        }

        // 4. Search in "Meet Recordings" folder
        queries.push(`mimeType contains 'video/' and parents in 'root' and name contains 'Meet'`);

        let recordingFile: { id: string; name: string; mimeType: string; createdTime: string } | null = null;

        for (const q of queries) {
            try {
                const res = await drive.files.list({
                    q,
                    fields: 'files(id, name, mimeType, createdTime)',
                    orderBy: 'createdTime desc',
                    pageSize: 10,
                });

                const files = res.data.files || [];

                // If we have a meetEventDate, prefer files created around that time
                if (meetEventDate && files.length > 1) {
                    const eventTime = new Date(meetEventDate).getTime();
                    // Find the file closest to the event date (within 24h after)
                    const matched = files.find(f => {
                        if (!f.createdTime) return false;
                        const fileTime = new Date(f.createdTime).getTime();
                        const diffHours = (fileTime - eventTime) / (1000 * 60 * 60);
                        return diffHours >= -1 && diffHours <= 24;
                    });
                    if (matched?.id && matched?.mimeType) {
                        recordingFile = { id: matched.id, name: matched.name || 'recording', mimeType: matched.mimeType, createdTime: matched.createdTime || '' };
                        break;
                    }
                }

                // Otherwise take the most recent match
                if (files.length > 0 && files[0].id && files[0].mimeType) {
                    recordingFile = { id: files[0].id, name: files[0].name || 'recording', mimeType: files[0].mimeType, createdTime: files[0].createdTime || '' };
                    break;
                }
            } catch (e) {
                console.error('[fetch-meeting-recording] Drive search error:', (e as Error).message);
            }
        }

        if (!recordingFile) {
            return NextResponse.json({
                found: false,
                error: 'No meeting recording found in Google Drive. Make sure:\n1. The Google Meet recording has finished processing\n2. You have Google Drive access enabled\n3. The recording is in your Drive',
            });
        }

        console.log(`[fetch-meeting-recording] Found: "${recordingFile.name}" (${recordingFile.mimeType}, created: ${recordingFile.createdTime})`);

        // Download the recording
        const fileRes = await drive.files.get(
            { fileId: recordingFile.id, alt: 'media' },
            { responseType: 'arraybuffer' },
        );

        const buffer = Buffer.from(fileRes.data as ArrayBuffer);
        const base64 = buffer.toString('base64');
        console.log(`[fetch-meeting-recording] Downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

        const isVideo = recordingFile.mimeType.startsWith('video/');

        // Analyze with Gemini
        const prompt = `You are a senior VC analyst reviewing a ${isVideo ? 'video' : 'audio'} recording of a meeting with ${founderName || 'a founder'} from ${companyName}.

Analyze this recording thoroughly and provide:

1. **FULL TRANSCRIPT**: Transcribe the entire conversation word-by-word. Label speakers as "Host" and "${founderName || 'Founder'}" (or Speaker 1, Speaker 2 if unclear). Include timestamps where possible.

${isVideo ? `2. **FACIAL EXPRESSION & BODY LANGUAGE ANALYSIS**: Analyze visual cues throughout:
   - Confidence levels at different points in the conversation
   - Signs of nervousness, hesitation, or evasiveness when discussing specific topics
   - Enthusiasm and passion indicators
   - Eye contact patterns and body posture
   - Micro-expressions during key claims (especially around metrics, traction, financials)
   - Any discrepancies between what was said and non-verbal cues` : `2. **VOCAL TONE ANALYSIS**: Analyze audio cues throughout:
   - Confidence levels in voice at different points
   - Signs of nervousness or hesitation
   - Enthusiasm and passion indicators`}

3. **KEY DISCUSSION POINTS**: Most important topics with specific details and numbers mentioned.
4. **ACTION ITEMS**: Clear next steps agreed upon during the meeting.
5. **CONCERNS & RED FLAGS**: Any claims that seemed exaggerated, questions that were deflected, or potential issues.
6. **SENTIMENT SUMMARY**: Overall sentiment and quality of the interaction in 2-3 sentences.
7. **PARTICIPANT BEHAVIOR**: Brief assessment of each participant's communication style, credibility, and preparedness.

Respond in EXACTLY this JSON format (no markdown, no code blocks):
{
    "transcript": "Full word-by-word transcript with speaker labels and timestamps",
    "facialAnalysis": "Detailed expression and behavior analysis",
    "keyPoints": ["Key point 1 with specifics", "Key point 2"],
    "actionItems": ["Action item 1", "Action item 2"],
    "concerns": ["Concern 1", "Concern 2"],
    "redFlags": ["Red flag 1 if any"],
    "sentimentSummary": "Overall sentiment and interaction quality summary",
    "participantBehavior": ["Host: assessment", "${founderName || 'Founder'}: assessment"],
    "duration": "Estimated duration like '32 minutes'"
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
                transcript: rawText.substring(0, 5000), facialAnalysis: '',
                keyPoints: [], actionItems: [], concerns: [], redFlags: [],
                sentimentSummary: '', participantBehavior: [], duration: 'Unknown',
            };
        }

        return NextResponse.json({ found: true, fileName: recordingFile.name, analysis });
    } catch (error: unknown) {
        console.error('[fetch-meeting-recording] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
