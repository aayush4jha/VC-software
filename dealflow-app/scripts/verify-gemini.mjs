// Pins the two decisions in src/lib/gemini.ts that used to go wrong silently:
// reading the answer out of a response, and working out what a failure means.
// See package.json's test:gemini.
//
// The cases are drawn from what the live API actually returned on 7 Oct 2026,
// when four of the five configured models had been retired and the fifth was
// returning 503 — which the app reported as "All Gemini models failed".

import { extractGeminiText, classifyGeminiFailure, summarizeGeminiFailures } from '../.gemini-test/gemini.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)?.slice(0, 120)}\n     want: ${JSON.stringify(want)?.slice(0, 120)}`); }
}

const reply = (parts) => ({ candidates: [{ content: { parts } }] });

console.log('— reading the answer —');
check('a plain answer', extractGeminiText(reply([{ text: '  Hi Ravi,  ' }])), 'Hi Ravi,');
check('an answer split across parts', extractGeminiText(reply([{ text: 'Hi ' }, { text: 'Ravi' }])), 'Hi Ravi');
check(
    'a reasoning trace is not the answer',
    extractGeminiText(reply([{ text: 'Let me consider...', thought: true }, { text: 'Hi Ravi' }])),
    'Hi Ravi',
);
check('nothing but reasoning is nothing', extractGeminiText(reply([{ text: 'hmm', thought: true }])), '');
check('no candidates', extractGeminiText({}), '');
check('no parts', extractGeminiText({ candidates: [{ content: {} }] }), '');
check('a non-text part is skipped', extractGeminiText(reply([{ inlineData: {} }, { text: 'ok' }])), 'ok');
check('junk input', extractGeminiText(null), '');

console.log('— classifying a failure —');
const kind = (input) => classifyGeminiFailure(input).kind;
check('a retired model', kind({ model: 'gemini-2.0-flash', status: 404 }), 'retired');
check('rate limited', kind({ model: 'm', status: 429 }), 'transient');
check('overloaded', kind({ model: 'm', status: 503 }), 'transient');
check('a gateway blip', kind({ model: 'm', status: 502 }), 'transient');
check('a bad key', kind({ model: 'm', status: 403 }), 'fatal');
check('a malformed request', kind({ model: 'm', status: 400 }), 'fatal');
check('the network', kind({ model: 'm', status: 0, thrown: 'fetch failed' }), 'transient');
check('our own timeout', kind({ model: 'm', status: 0, thrown: 'The operation was aborted due to timeout' }), 'transient');
check('budget spent on reasoning', kind({ model: 'm', status: 200, finishReason: 'MAX_TOKENS' }), 'exhausted');
check('blocked for safety', kind({ model: 'm', status: 200, finishReason: 'SAFETY' }), 'fatal');
check('empty but finished cleanly', kind({ model: 'm', status: 200, finishReason: 'STOP' }), 'transient');

check(
    'a retired model is named, so the list can be fixed',
    classifyGeminiFailure({
        model: 'gemini-2.0-flash', status: 404,
        apiMessage: 'This model models/gemini-2.0-flash is no longer available.',
    }).message,
    'gemini-2.0-flash is no longer available — This model models/gemini-2.0-flash is no longer available.',
);
check(
    'a timeout says so plainly',
    classifyGeminiFailure({ model: 'gemini-3.8-flash', status: 0, thrown: 'signal timed out' }).message,
    'gemini-3.8-flash: took too long to answer',
);

console.log('— the message the user ends up reading —');
const f = (kind, message) => ({ kind, message });
check(
    'busy models tell them to retry',
    summarizeGeminiFailures([f('retired', 'a is no longer available'), f('transient', 'b is overloaded (503)')]),
    'Gemini is busy right now — every model was overloaded or rate-limited (last: b is overloaded (503)). '
    + 'Wait a minute and try again.',
);
check(
    'busy wins over retired regardless of order',
    summarizeGeminiFailures([f('transient', 'b is overloaded (503)'), f('retired', 'a is no longer available')])
        .startsWith('Gemini is busy'),
    true,
);
check(
    'an entirely retired list points at the code',
    summarizeGeminiFailures([f('retired', 'a is gone'), f('retired', 'b is gone')]),
    'No Gemini model is available any more — b is gone. The model list in src/lib/gemini.ts needs updating.',
);
check(
    'a spent budget says what to change',
    summarizeGeminiFailures([f('exhausted', 'm used its entire output budget')]),
    'Gemini ran out of room to answer. m used its entire output budget.',
);
check(
    'a rejected request is quoted',
    summarizeGeminiFailures([f('fatal', 'm rejected the request (400)')]),
    'Gemini could not answer: m rejected the request (400)',
);
check('nothing tried at all', summarizeGeminiFailures([]), 'No Gemini model was tried.');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
