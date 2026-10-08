// Pins src/lib/signature.ts — see package.json's test:signature.
//
// The case that matters is the second one: a reply the model already signed
// off, plus a Gmail signature, must not go out signed twice.

import { signatureToText, alreadySigned, appendSignature, SIGNATURE_SEPARATOR }
    from '../.signature-test/signature.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

console.log('— Gmail keeps the signature as HTML —');
check(
    'a signature block flattens to lines',
    signatureToText('<div>Aayush Jha<br>Dholakia Ventures<br><a href="tel:+919000000000">+91 90000 00000</a></div>'),
    'Aayush Jha\nDholakia Ventures\n+91 90000 00000',
);
check('styles are not text', signatureToText('<style>.sig{color:red}</style><div>Aayush Jha</div>'), 'Aayush Jha');
check('entities are decoded', signatureToText('<div>Dholakia &amp; Co</div>'), 'Dholakia & Co');
check('blank is blank', signatureToText(''), '');
check('an image-only signature has no text', signatureToText('<img src="https://x/y.png">'), '');
check(
    'runs of blank lines collapse',
    signatureToText('<div>A</div><br><br><br><div>B</div>'),
    'A\n\nB',
);

console.log('— is it already there? —');
const sig = 'Aayush Jha\nDholakia Ventures\n+91 90000 00000';
check('a plain body is not signed', alreadySigned('Hi Ravi,\n\nThanks.', sig), false);
check('a body ending in it is signed', alreadySigned(`Hi Ravi,\n\nThanks.\n\n${sig}`, sig), true);
check(
    'spacing and line breaks do not matter',
    alreadySigned('Hi Ravi,\n\nThanks.\n\nAayush Jha  |  Dholakia Ventures | +91 90000 00000', sig),
    true,
);
check('an empty signature counts as present', alreadySigned('Hi Ravi,', ''), true);
check('a signature of only punctuation counts as present', alreadySigned('Hi Ravi,', '---'), true);

console.log('— appending —');
check(
    'the separator is added',
    appendSignature('Hi Ravi,\n\nThanks.', sig),
    `Hi Ravi,\n\nThanks.\n\n${SIGNATURE_SEPARATOR}\n${sig}`,
);
check(
    'trailing whitespace in the body is tidied first',
    appendSignature('Hi Ravi,\n\nThanks.\n\n\n   ', sig),
    `Hi Ravi,\n\nThanks.\n\n${SIGNATURE_SEPARATOR}\n${sig}`,
);
check(
    'a signature that already opens with the separator is not given another',
    appendSignature('Hi Ravi,', '--\nAayush'),
    'Hi Ravi,\n\n--\nAayush',
);
check('nothing to add leaves the body alone', appendSignature('Hi Ravi,', ''), 'Hi Ravi,');
check(
    'a body that already carries it is left alone',
    appendSignature(`Hi Ravi,\n\n${sig}`, sig),
    `Hi Ravi,\n\n${sig}`,
);
check(
    'a drafted reply signed off by name still gets the block once',
    appendSignature('Hi Ravi,\n\nThanks for sending this.\n\nBest,\nAayush', sig),
    `Hi Ravi,\n\nThanks for sending this.\n\nBest,\nAayush\n\n${SIGNATURE_SEPARATOR}\n${sig}`,
);
check(
    'and is not added twice if it is run again',
    appendSignature(appendSignature('Hi Ravi,', sig), sig),
    `Hi Ravi,\n\n${SIGNATURE_SEPARATOR}\n${sig}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
