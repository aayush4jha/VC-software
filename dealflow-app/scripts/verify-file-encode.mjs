// Pins src/lib/file-encode.ts — see package.json's test:encode.
//
// The point of the module is that it survives a real pitch deck, so the sizes
// below are the ones that used to throw: anything past the engine's argument
// limit. Correctness is checked against Node's own Buffer.

import { bytesToBase64, inlineUploadError, formatBytes, MAX_INLINE_UPLOAD_BYTES } from '../.encode-test/file-encode.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${String(got).slice(0, 90)}\n     want: ${String(want).slice(0, 90)}`); }
}

console.log('— base64 matches Node, including the awkward lengths —');
// 0,1,2 bytes cover both padding cases; 3 and 4 cover the loop boundary.
for (const n of [0, 1, 2, 3, 4, 5, 6, 100, 1023, 1024]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) & 0xff;
    check(`${n} bytes`, bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
}

console.log('— every byte value, so no character in the alphabet is wrong —');
const all = new Uint8Array(256);
for (let i = 0; i < 256; i++) all[i] = i;
check('0x00 through 0xff', bytesToBase64(all), Buffer.from(all).toString('base64'));

console.log('— the sizes the old spread-into-fromCharCode call died on —');
for (const n of [65_536, 130_000, 1_000_000, 3_000_000]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 17) & 0xff;
    let got;
    try { got = bytesToBase64(bytes); } catch (e) { got = `threw: ${e.message}`; }
    check(`${n} bytes encodes`, got, Buffer.from(bytes).toString('base64'));
}

console.log('— what the user is told about a file that cannot be sent —');
check('a normal deck is allowed', inlineUploadError('deck.pdf', 2_000_000), null);
check('exactly at the limit is allowed', inlineUploadError('deck.pdf', MAX_INLINE_UPLOAD_BYTES), null);
check('an empty file is refused', inlineUploadError('deck.pdf', 0), 'deck.pdf is empty.');
const big = inlineUploadError('deck.pdf', 9_000_000);
check('an oversized file names its size', big?.includes('8.6 MB'), true);
check('an oversized file names the limit', big?.includes('3.1 MB'), true);
check('an oversized file says what to do instead', big?.includes('Use a smaller file'), true);
check(
    'the caller can say what to do instead',
    inlineUploadError('deck.pdf', 9_000_000, 'Attach it to the company as a document.'),
    'deck.pdf is 8.6 MB, over the 3.1 MB upload limit. Attach it to the company as a document.',
);
check('a missing filename still reads', inlineUploadError('', 9_000_000)?.startsWith('That file is'), true);

console.log('— sizes read the way a person writes them —');
check('bytes', formatBytes(512), '512 bytes');
check('kilobytes', formatBytes(2048), '2 KB');
check('megabytes', formatBytes(5_400_000), '5.1 MB');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
