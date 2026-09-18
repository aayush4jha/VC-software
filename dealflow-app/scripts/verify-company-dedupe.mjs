// Guards duplicate detection. Both directions matter and are pinned:
//   * spelling variants of one company MUST be caught (the duplicate problem)
//   * different companies must NOT be merged — the automated paths merge on
//     isSameCompanyName with nobody watching, and a wrong merge has no undo.
//
// Run with: npm run test:dedupe

import { companyNameKey, isSameCompanyName, findSimilarCompanies, nameSimilarity }
    from '../.dedupe-test/company-dedupe.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

console.log('— the same company, typed differently (must match) —');
for (const [a, b] of [
    ['Dholakia', 'Dholakiya'],
    ['Dholakia', "Dholakia's"],
    ['Dholakia', 'DHOLAKIA'],
    ['Dholakia', 'Dholakia Pvt Ltd'],
    ['Dholakiya', "Dholakia's Private Limited"],
    ['Swiggy', 'Swiggi'],
    ['Shree Ganesh', 'Sree Ganesh'],
    ['Shree Ganesh', 'Shri Ganesh'],
    ['StrainX', 'Strain X'],
    ['StrainX', 'strain-x'],
    ['Nova Robotics', 'Nova Robotics LLP'],
    ['Phonepe', 'Fonepe'],
    ['Acme & Co', 'Acme and Co'],
    ['The Souled Store', 'Souled Store'],
    ['Bhargava Foods', 'Bargava Foods'],
]) eq(`${a}  ≡  ${b}`, isSameCompanyName(a, b), true);

console.log('— a one-letter slip in a long name (must match) —');
eq('Zeptonomics ≡ Zeptonomix', isSameCompanyName('Zeptonomics', 'Zeptonomcs'), true);

console.log('— different companies (must NOT match) —');
for (const [a, b] of [
    ['Acme Labs', 'Acme Technologies'],       // pinned by the email matcher too
    ['Acme', 'Acne'],                         // short: one letter is a new word
    ['Acme', 'Acorn'],
    ['Kiran', 'Karan'],
    ['Zepto', 'Zepta'],
    ['Nova Robotics', 'Nova Analytics'],
    ['Dholakia', 'Dholakia Ventures'],        // plausible, but only a human decides
    ['AB', 'AB'],                             // too short to trust at all
    ['PayU', 'Paytm'],
    ['Ola', 'Ola Electric'],
]) eq(`${a}  ≠  ${b}`, isSameCompanyName(a, b), false);

console.log('— keys —');
eq('possessive and suffix fold away', companyNameKey("Dholakia's Pvt. Ltd."), companyNameKey('Dholakia'));
eq('descriptive word kept', companyNameKey('Acme Labs') === companyNameKey('Acme'), false);
eq('empty is empty', companyNameKey(''), '');

console.log('— suggestions for the forms (looser, shown to a person) —');
const book = [
    { id: '1', companyName: 'Dholakia Ventures' },
    { id: '2', companyName: 'Dholakiya' },
    { id: '3', companyName: 'Acme Labs' },
    { id: '4', companyName: 'Zephyr AI' },
];
const hits = findSimilarCompanies(book, "Dholakia's");
eq('exact variant ranked first', hits[0]?.company.id, '2');
eq('exact variant flagged same-name', hits[0]?.reason, 'same-name');
eq('containing name also surfaced', hits.some(h => h.company.id === '1' && h.reason === 'contains'), true);
eq('unrelated not surfaced', hits.some(h => h.company.id === '3' || h.company.id === '4'), false);
eq('editing a company does not flag itself',
    findSimilarCompanies(book, 'Dholakiya', { excludeId: '2' }).some(h => h.company.id === '2'), false);
eq('short query surfaces nothing', findSimilarCompanies(book, 'AB'), []);
eq('near miss in a long name is suggested',
    findSimilarCompanies([{ id: '9', companyName: 'Nova Robotics' }], 'Nova Robotix')[0]?.company.id, '9');
eq('similarity is symmetric', nameSimilarity('Dholakia', 'Dolakya'), nameSimilarity('Dolakya', 'Dholakia'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
