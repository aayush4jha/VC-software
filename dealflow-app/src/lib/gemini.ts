// Shared Gemini multimodal client with model + API-key fallback.
// Order matters: 2.x family share one quota pool, 1.5 family share another,
// so listing both gives us a real second chance when one pool is exhausted.
export const GEMINI_MULTIMODAL_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
];

export interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

export interface GeminiCallOptions {
    temperature?: number;
    maxOutputTokens?: number;
    models?: string[];
    label?: string;
}

export function getGeminiApiKeys(): string[] {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_BACKUP]
        .filter((k): k is string => !!k && k.length > 0);
    return keys;
}

export async function callGeminiMultimodal(
    parts: GeminiPart[],
    options: GeminiCallOptions = {}
): Promise<string> {
    const {
        temperature = 0.3,
        maxOutputTokens = 8000,
        models = GEMINI_MULTIMODAL_MODELS,
        label = 'gemini',
    } = options;

    const keys = getGeminiApiKeys();
    if (keys.length === 0) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature, maxOutputTokens },
    });

    let allRateLimited = true;
    let lastErrorMessage = '';

    for (const apiKey of keys) {
        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
                const data = await res.json().catch(() => ({ error: { code: res.status } }));

                if (res.ok) {
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (text) return text;
                    lastErrorMessage = `${model}: empty response`;
                    allRateLimited = false;
                    continue;
                }

                const code = data?.error?.code;
                lastErrorMessage = `${model} (${code}): ${String(data?.error?.message || '').slice(0, 120)}`;

                if (code === 429) {
                    // Rate-limited on this model — move on, don't sleep.
                    // Subsequent models (especially 1.5 family) have separate quotas.
                    console.warn(`[${label}] rate-limited on ${model}, trying next model`);
                    continue;
                }

                if (code === 404) {
                    // Model not available — skip silently.
                    allRateLimited = false;
                    continue;
                }

                console.error(`[${label}] ${model} error (${code}):`, lastErrorMessage);
                allRateLimited = false;
                continue;
            } catch (e) {
                lastErrorMessage = `${model}: ${(e as Error).message}`;
                console.error(`[${label}] ${model} fetch error:`, lastErrorMessage);
                allRateLimited = false;
                continue;
            }
        }
    }

    if (allRateLimited) {
        throw new Error(
            'Gemini quota exhausted across all models. Free-tier quotas reset hourly/daily — please try again in a few minutes, or add GEMINI_API_KEY_BACKUP to environment variables.'
        );
    }
    throw new Error(`All Gemini models failed. Last error: ${lastErrorMessage}`);
}
