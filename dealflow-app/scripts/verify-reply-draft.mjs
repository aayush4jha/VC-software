// Guards reading back a drafted reply. The failure this pins: a reply with
// line breaks arrived as JSON and died on "Unterminated string in JSON".
//
// Run with: npm run test:draft

import { parseDraft } from '../.draft-test/reply-draft.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

console.log('— the format we ask for —');
const marked = `@@REPLY@@
Hi Ravi,

Thanks for sending the deck — the energy analytics angle is interesting.

Could you share a few times this week?

Best,
@@NOTE@@
Did not commit to any timeline.
@@SKIP@@
no`;
const d = parseDraft(marked);
eq('multi-line body survives intact', d.reply.split('\n').length, 7);
eq('first line', d.reply.split('\n')[0], 'Hi Ravi,');
eq('last line', d.reply.trim().endsWith('Best,'), true);
eq('note', d.note, 'Did not commit to any timeline.');
eq('not skipped', d.skip, false);

console.log('— skipping —');
const skipped = parseDraft('@@REPLY@@\n-\n@@NOTE@@\nA newsletter.\n@@SKIP@@\nyes');
eq('skip empties the reply', skipped.reply, '');
eq('skip is flagged', skipped.skip, true);
eq('the reason survives', skipped.note, 'A newsletter.');

console.log('— the model ignores the format —');
eq('plain prose becomes the draft', parseDraft('Hi Ravi,\n\nThanks for the deck.').reply, 'Hi Ravi,\n\nThanks for the deck.');
eq('code fences stripped', parseDraft('```\n@@REPLY@@\nHello\n```').reply, 'Hello');
eq('json still read when it parses', parseDraft('{"shouldReply":true,"reply":"Hello there","note":"n"}').reply, 'Hello there');
eq('json saying no', parseDraft('{"shouldReply":false,"reply":"","note":"spam"}').skip, true);
// The exact failure that started this: raw newlines inside a JSON string.
const broken = '{\n "shouldReply": true,\n "reply": "Hi Ravi,\nThanks for the deck.",\n "note": "x"\n}';
eq('unparseable json is not thrown away', parseDraft(broken).reply.includes('Thanks for the deck'), true);
eq('empty response', parseDraft(''), { reply: '', note: '', skip: false });
eq('whitespace only', parseDraft('   \n  '), { reply: '', note: '', skip: false });

console.log('— markers in any order —');
const reordered = parseDraft('@@NOTE@@\nquick note\n@@REPLY@@\nThe body\n@@SKIP@@\nno');
eq('note before reply still works', [reordered.reply, reordered.note], ['The body', 'quick note']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
