// Guards the values written to the constrained columns on `companies`.
// A value the CHECK rejects fails the whole insert — this is what turned
// "raising our Seed Round" into
//   violates check constraint "companies_company_round_check"
//
// Run with: npm run test:enums

import { normalizeCompanyRound, normalizePriority, normalizeDealSourceType, normalizeShareType, COMPANY_ROUNDS }
    from '../.enums-test/company-enums.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

console.log('— rounds —');
eq('the bug: "Seed Round"', normalizeCompanyRound('Seed Round'), 'Seed');
eq('exact value passes through', normalizeCompanyRound('Series A'), 'Series A');
eq('lowercase', normalizeCompanyRound('series a'), 'Series A');
eq('hyphen/space differences', normalizeCompanyRound('pre series a'), 'Pre-Series A');
eq('en dash', normalizeCompanyRound('Pre–Seed'), 'Pre-Seed');
eq('underscores', normalizeCompanyRound('Series_B'), 'Series B');
eq('extra words around it', normalizeCompanyRound('raising a Series A funding round'), 'Series A');
eq('pre-series A is not read as series A', normalizeCompanyRound('Pre-Series A round'), 'Pre-Series A');
eq('pre-seed is not read as seed', normalizeCompanyRound('pre-seed'), 'Pre-Seed');
eq('angel means pre-seed', normalizeCompanyRound('Angel round'), 'Pre-Seed');
eq('series C maps to growth', normalizeCompanyRound('Series C'), 'Growth Stage');
eq('growth wording', normalizeCompanyRound('growth financing'), 'Growth Stage');
eq('IPO', normalizeCompanyRound('Pre-IPO'), 'Pre-IPO');
eq('nonsense falls back', normalizeCompanyRound('banana'), 'Seed');
eq('null falls back', normalizeCompanyRound(null), 'Seed');
eq('number falls back', normalizeCompanyRound(42), 'Seed');
eq('empty falls back', normalizeCompanyRound(''), 'Seed');
eq('every canonical value survives a round trip',
    COMPANY_ROUNDS.every(r => normalizeCompanyRound(r) === r), true);

console.log('— priority —');
eq('lowercase', normalizePriority('high'), 'High');
eq('sentence', normalizePriority('This is high priority'), 'High');
eq('unknown falls back', normalizePriority('urgent'), 'Medium');
eq('null falls back', normalizePriority(null), 'Medium');

console.log('— deal source —');
eq('exact', normalizeDealSourceType('VC & PE'), 'VC & PE');
eq('ampersand written out', normalizeDealSourceType('VC and PE'), 'VC & PE');
eq('banker wording', normalizeDealSourceType('investment banker intro'), 'Investment Banker');
eq('friends wording', normalizeDealSourceType('a friend referred them'), 'Friends & Family');
eq('venture fund wording', normalizeDealSourceType('another venture fund'), 'VC & PE');
eq('unknown falls back', normalizeDealSourceType('cold email'), 'Founder Network');

console.log('— share type —');
eq('exact', normalizeShareType('Secondary'), 'Secondary');
eq('equity means primary', normalizeShareType('equity'), 'Primary');
eq('debt wording', normalizeShareType('convertible note'), 'Debt');
eq('unknown falls back', normalizeShareType('warrants'), 'Primary');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
