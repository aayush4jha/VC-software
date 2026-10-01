// Guards how an email is turned into readable text.
// The failure this pins: a marketing email's stylesheet rendered as the body.
//
// Run with: npm run test:gmailtext

import { htmlToText, decodeEntities } from '../.gmailtext-test/gmail-parse.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};
const has = (label, got, needle, want = true) => {
    const ok = got.includes(needle) === want;
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++; else { fail++; console.log(`       got  ${JSON.stringify(got.slice(0, 160))}`); }
};

console.log('— stylesheets must not become the body —');
const marketing = `<html><head><style type="text/css">
@media only screen and (min-width: 650px) { .p13_mm_offer_tag{font-size:14px!important;} }
.gr_3_merchant{width:31%!important;}
</style></head><body><p>Now arriving: Train tickets on Uber</p><p>Offers when you buy tickets in-app</p></body></html>`;
const text = htmlToText(marketing);
has('no CSS rules', text, 'font-size', false);
has('no media queries', text, '@media', false);
has('no class names', text, 'gr_3_merchant', false);
has('the actual words survive', text, 'Now arriving: Train tickets on Uber');
has('and the second line too', text, 'Offers when you buy tickets in-app');

console.log('— scripts and comments —');
has('script contents dropped', htmlToText('<script>var a=1;alert("x")</script><p>Hello</p>'), 'alert', false);
has('comments dropped', htmlToText('<!-- hidden note --><p>Hello</p>'), 'hidden note', false);
eq('what is left is the text', htmlToText('<script>x()</script><p>Hello</p>'), 'Hello');

console.log('— entities —');
eq('numeric apostrophe', decodeEntities('we&#39;re raising'), "we're raising");
eq('named entities', decodeEntities('A &amp; B &quot;C&quot;'), 'A & B "C"');
eq('hex entities', decodeEntities('&#x27;quoted&#x27;'), "'quoted'");
eq('rupee', decodeEntities('&#8377;5 Cr'), '₹5 Cr');
eq('unknown entity left alone', decodeEntities('&weird; thing'), '&weird; thing');
has('entities decoded inside html', htmlToText('<p>Here&#39;s our deck</p>'), "Here's our deck");

console.log('— line structure —');
eq('breaks become newlines', htmlToText('<p>One</p><p>Two</p>'), 'One\nTwo');
eq('br becomes a newline', htmlToText('A<br>B'), 'A\nB');
eq('whitespace collapses', htmlToText('<p>A      B</p>'), 'A B');
eq('empty html is empty', htmlToText(''), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
