// Turning a file the user picked into something an API route can accept.
//
// Every upload in the app used to do this:
//
//     btoa(String.fromCharCode(...new Uint8Array(buffer)))
//
// which spreads one argument per byte. Past roughly 100,000 arguments the
// engine throws "Maximum call stack size exceeded", so it worked on a tiny
// test file and threw on every real pitch deck — the failure surfaced in the
// UI as an analysis error with a stack-overflow message attached.
//
// Pure, and pinned by scripts/verify-file-encode.mjs, so it can be checked
// against byte patterns that actually break: chunk boundaries and padding.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Standard base64, built three bytes at a time.
 *
 * Written out rather than handed to `btoa`, so the same function runs in the
 * browser and in a test, and so nothing is ever spread across a call.
 */
export function bytesToBase64(bytes: Uint8Array): string {
    let out = '';
    const n = bytes.length;
    let i = 0;
    for (; i + 2 < n; i += 3) {
        const word = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64[(word >> 18) & 63] + B64[(word >> 12) & 63] + B64[(word >> 6) & 63] + B64[word & 63];
    }
    // One or two bytes may be left over, and are padded to a four-char group.
    if (i < n) {
        const rest = n - i;
        const word = (bytes[i] << 16) | (rest === 2 ? bytes[i + 1] << 8 : 0);
        out += B64[(word >> 18) & 63] + B64[(word >> 12) & 63];
        out += rest === 2 ? B64[(word >> 6) & 63] : '=';
        out += '=';
    }
    return out;
}

/**
 * The biggest file that can go out inside a JSON request body.
 *
 * The hosting platform rejects request bodies over 4.5 MB, and base64 makes a
 * file a third bigger on the way, so the real ceiling on the file itself is
 * about 3.3 MB. Anything larger has to be said out loud rather than sent and
 * failed with a platform error the user cannot act on.
 */
export const MAX_INLINE_UPLOAD_BYTES = 3_300_000;

export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} bytes`;
}

/**
 * Why this file cannot be sent, or null when it can.
 * Callers show the string and stop; it names the file, its size and the limit,
 * and `instead` says what to do about it in that particular place.
 */
export function inlineUploadError(
    filename: string,
    bytes: number,
    instead = 'Use a smaller file, or share it as a link instead.',
): string | null {
    if (bytes <= 0) return `${filename || 'That file'} is empty.`;
    if (bytes > MAX_INLINE_UPLOAD_BYTES) {
        return `${filename || 'That file'} is ${formatBytes(bytes)}, over the `
            + `${formatBytes(MAX_INLINE_UPLOAD_BYTES)} upload limit. ${instead}`;
    }
    return null;
}
