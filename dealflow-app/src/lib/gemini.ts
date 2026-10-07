// Shared Gemini client: one model list, one retry policy, for every AI feature.
//
// Google retires models without warning. On 7 Oct 2026 four of the five models
// this file used to list answered 404 "no longer available", which left exactly
// one working model and a fallback chain that was pure decoration — a single
// 503 from the survivor surfaced in the UI as "All Gemini models failed".
//
// So: the list below holds only models that answer today, overloaded models are
// retried instead of reported, and a model that 404s is dropped for the rest of
// the call. The two halves that decide anything — reading the answer out of the
// response, and classifying a failure — are pure and pinned by
// scripts/verify-gemini.mjs.

/**
 * Tried in order. Ordering is quality first among the models that actually
 * serve traffic: 2.5-flash reasons before it answers and reads PDFs well, the
 * lite models are faster and far less likely to be overloaded, and the full
 * 3.5-flash sits last because it returns 503 most of the time today.
 *
 * Checked against ListModels on 7 Oct 2026. When a model starts 404ing, the
 * thrown error says so by name — that is the signal to revisit this list.
 */
export const GEMINI_MULTIMODAL_MODELS = [
    'gemini-2.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
];

/**
 * Models that reason before answering. Their reasoning tokens are charged
 * against maxOutputTokens, so a caller asking for a two-line summary in 200
 * tokens got MAX_TOKENS and a sentence cut in half — the budget was spent
 * thinking. These models get room for that on top of what the caller asked
 * for; length is controlled by the prompt, not by the cap.
 *
 * Switching the reasoning off instead is not an option: `thinkingBudget: 0`
 * is rejected with a 400 by the lite models in the same list.
 */
const THINKING_MODELS = /^gemini-2\.5-(flash|pro)$/;
const THINKING_HEADROOM = 3000;

export interface GeminiPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

export interface GeminiCallOptions {
    temperature?: number;
    maxOutputTokens?: number;
    models?: string[];
    label?: string;
    /** Per-model ceiling. A hung model must not eat the whole function budget. */
    timeoutMs?: number;
}

export function getGeminiApiKeys(): string[] {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_BACKUP]
        .filter((k): k is string => !!k && k.length > 0);
    return keys;
}

// ─── Reading the answer ───────────────────────────────────────────────────

/**
 * The text of a response, from ALL of its parts.
 *
 * Only parts[0] used to be read, which silently dropped the tail of any answer
 * the model split across parts, and returned nothing at all when the first part
 * was a reasoning trace — the thinking models put `thought: true` on those, and
 * they are not part of the reply.
 */
export function extractGeminiText(data: unknown): string {
    const parts = (data as { candidates?: { content?: { parts?: unknown[] } }[] })
        ?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts
        .filter((p): p is { text: string } => {
            const part = p as { text?: unknown; thought?: unknown };
            return typeof part?.text === 'string' && part.thought !== true;
        })
        .map(p => p.text)
        .join('')
        .trim();
}

// ─── Classifying a failure ────────────────────────────────────────────────

export type GeminiFailureKind =
    /** Busy or rate-limited. Worth trying again, here or on the next model. */
    | 'transient'
    /** This model is gone. Skip it for the rest of the call. */
    | 'retired'
    /** The request itself is wrong — a bad key, a blocked prompt, bad input. */
    | 'fatal'
    /** Answered, but spent its whole output budget before writing any reply. */
    | 'exhausted';

export interface GeminiFailure {
    kind: GeminiFailureKind;
    message: string;
}

export interface FailureInput {
    model: string;
    /** HTTP status, or 0 when the request never completed. */
    status: number;
    /** `error.message` from the body, when there was one. */
    apiMessage?: string;
    /** `candidates[0].finishReason`, when the call succeeded but gave no text. */
    finishReason?: string;
    /** A thrown network/abort error. */
    thrown?: string;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * What to do about one failed attempt.
 *
 * The distinction that matters: 'transient' is worth another pass, 'retired'
 * must never be retried, and both must be told apart from 'fatal' so the error
 * the user finally sees names the real cause instead of whichever model the
 * loop happened to try last.
 */
export function classifyGeminiFailure(input: FailureInput): GeminiFailure {
    const { model, status, apiMessage = '', finishReason, thrown } = input;

    if (thrown) {
        // An abort is the per-model timeout firing; anything else is the network.
        const timedOut = /abort|timeout|timed out/i.test(thrown);
        return {
            kind: 'transient',
            message: `${model}: ${timedOut ? 'took too long to answer' : thrown}`,
        };
    }

    if (status === 404) {
        return { kind: 'retired', message: `${model} is no longer available${apiMessage ? ` — ${apiMessage}` : ''}` };
    }
    if (RETRYABLE_STATUS.has(status)) {
        const busy = status === 429 ? 'rate-limited' : 'overloaded';
        return { kind: 'transient', message: `${model} is ${busy} (${status})` };
    }
    if (status >= 400) {
        return { kind: 'fatal', message: `${model} rejected the request (${status})${apiMessage ? `: ${apiMessage}` : ''}` };
    }

    // Status 200, but nothing usable came back.
    if (finishReason === 'MAX_TOKENS') {
        return {
            kind: 'exhausted',
            message: `${model} used its entire output budget before writing an answer — raise maxOutputTokens`,
        };
    }
    if (finishReason && finishReason !== 'STOP') {
        return { kind: 'fatal', message: `${model} stopped early (${finishReason})` };
    }
    return { kind: 'transient', message: `${model} returned an empty answer` };
}

/**
 * The message for a call where every model failed — the one the user reads.
 * Transient beats everything, because "try again" is the useful instruction;
 * a list that is entirely retired is a code problem and says so.
 */
export function summarizeGeminiFailures(failures: GeminiFailure[]): string {
    if (failures.length === 0) return 'No Gemini model was tried.';

    const last = (kind: GeminiFailureKind) =>
        [...failures].reverse().find(f => f.kind === kind)?.message;

    const transient = last('transient');
    if (transient) {
        return `Gemini is busy right now — every model was overloaded or rate-limited (last: ${transient}). `
            + 'Wait a minute and try again.';
    }
    const exhausted = last('exhausted');
    if (exhausted) return `Gemini ran out of room to answer. ${exhausted}.`;

    const fatal = last('fatal');
    if (fatal) return `Gemini could not answer: ${fatal}`;

    return `No Gemini model is available any more — ${last('retired')}. `
        + 'The model list in src/lib/gemini.ts needs updating.';
}

// ─── The call ─────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 90_000;
/** One extra sweep of the list, for the case where everything was merely busy. */
const PASSES = 2;
const PASS_DELAY_MS = 1_500;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function callGeminiMultimodal(
    parts: GeminiPart[],
    options: GeminiCallOptions = {}
): Promise<string> {
    const {
        temperature = 0.3,
        maxOutputTokens = 8000,
        models = GEMINI_MULTIMODAL_MODELS,
        label = 'gemini',
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    const keys = getGeminiApiKeys();
    if (keys.length === 0) {
        throw new Error('GEMINI_API_KEY is not set, so no AI feature can run.');
    }

    const bodyFor = (model: string) => JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
            temperature,
            maxOutputTokens: THINKING_MODELS.test(model)
                ? maxOutputTokens + THINKING_HEADROOM
                : maxOutputTokens,
        },
    });

    // Retired within this call: never tried again, not on the second pass and
    // not with the backup key, because a dead model is dead for every key.
    const retired = new Set<string>();
    const failures: GeminiFailure[] = [];

    for (let pass = 0; pass < PASSES; pass++) {
        if (pass > 0) {
            // Nothing but busy models left to try again, so give them a moment.
            if (!failures.some(f => f.kind === 'transient')) break;
            await sleep(PASS_DELAY_MS);
        }

        for (const apiKey of keys) {
            for (const model of models) {
                if (retired.has(model)) continue;

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                let failure: GeminiFailure;

                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: bodyFor(model),
                        signal: AbortSignal.timeout(timeoutMs),
                    });
                    const data = await res.json().catch(() => ({}));

                    if (res.ok) {
                        const text = extractGeminiText(data);
                        if (text) return text;
                        failure = classifyGeminiFailure({
                            model, status: 200,
                            finishReason: data?.candidates?.[0]?.finishReason,
                        });
                    } else {
                        failure = classifyGeminiFailure({
                            model, status: res.status,
                            apiMessage: String(data?.error?.message || '').slice(0, 160),
                        });
                    }
                } catch (e) {
                    failure = classifyGeminiFailure({ model, status: 0, thrown: (e as Error).message });
                }

                failures.push(failure);
                if (failure.kind === 'retired') retired.add(model);
                console.warn(`[${label}] ${failure.kind}: ${failure.message}`);
            }
        }
    }

    throw new Error(summarizeGeminiFailures(failures));
}
