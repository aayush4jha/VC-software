// Pins src/lib/legal-import.ts — see package.json's test:legalimport.
//
// The cases are the shapes a real deal document arrives in: a term-sheet
// summary written down the page, an export written across the top, Indian
// digit grouping, "2.5 Cr", a date as an Excel serial number, and a label
// two words away from the one we expect.

import {
    normalizeLabel, fieldForLabel, parseMoney, parseCount, parsePercent,
    parseSheetDate, extractFromMatrix, describeChange, IMPORT_FIELDS,
} from '../.legalimport-test/legal-import.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

console.log('— labels reduce to the same thing however they are written —');
check('units in brackets are dropped', normalizeLabel('Pre-Money Valuation (INR)'), 'pre money valuation');
check('currency words are dropped', normalizeLabel('Amount Invested in Rs.'), 'amount invested');
check('crore notes are dropped', normalizeLabel('Round Size (Rs Cr)'), 'round size');
check('filler words are dropped', normalizeLabel('Date of the Investment'), 'date investment');
check('the percent sign becomes the word', normalizeLabel('% Holding'), 'percent holding');
check('nothing is nothing', normalizeLabel(null), '');

console.log('— a label finds its field —');
const key = (l) => fieldForLabel(l)?.key ?? null;
check('exact', key('Price Per Share'), 'sharePrice');
check('punctuated', key('Pre-Money Valuation'), 'entryPreMoneyValuation');
check('post-money is not plain valuation', key('Post Money Valuation'), 'entryPostMoneyValuation');
check('plain valuation is the post-money', key('Valuation'), 'entryPostMoneyValuation');
check('a trailing qualifier still matches', key('Pre money valuation as on date'), 'entryPreMoneyValuation');
check('shares allotted', key('No. of Shares Allotted'), 'numShares');
check('total outstanding', key('Total Outstanding Shares'), 'totalShares');
check('the entity', key('Investing Entity'), 'investmentVehicle');
check('the instrument', key('Type of Security'), 'investmentInstrument');
check('a one-word alias does not match inside a phrase', key('Amount due to the registrar'), null);
check('nonsense matches nothing', key('Invoice number'), null);
check('a blank matches nothing', key(''), null);

console.log('— money, in rupees —');
check('indian grouping', parseMoney('₹1,20,00,000'), 12000000);
check('crore shorthand', parseMoney('2.5 Cr'), 25000000);
check('crore spelled out', parseMoney('₹ 2.5 crore'), 25000000);
check('lakhs', parseMoney('50 lakhs'), 5000000);
check('millions', parseMoney('12 mn'), 12000000);
check('a bare number is rupees', parseMoney(30034306), 30034306);
check('a bracketed number is negative', parseMoney('(1,00,000)'), -100000);
check('a decimal survives', parseMoney('532.00'), 532);
check('text is nothing', parseMoney('to be agreed'), null);
check('blank is nothing', parseMoney(''), null);

console.log('— counts take no shorthand —');
check('shares with commas', parseCount('56,400'), 56400);
check('a count is not multiplied', parseCount('20'), 20);
check('a number passes through', parseCount(1018), 1018);

console.log('— percentages land on the platform scale —');
check('a typed percent', parsePercent('1.34%'), 1.34);
check('a spreadsheet fraction', parsePercent(0.0134), 1.34);
check('a plain number over one', parsePercent(1.34), 1.34);
check('a percent sign wins over the fraction rule', parsePercent('0.5%'), 0.5);
check('zero stays zero', parsePercent(0), 0);
check('33 percent', parsePercent('33'), 33);

console.log('— dates —');
check('an excel serial', parseSheetDate(45000), '2023-03-15');
check('iso', parseSheetDate('2025-04-12'), '2025-04-12');
check('day first', parseSheetDate('4/10/2025'), '2025-10-04');
check('day first with dots', parseSheetDate('12.04.2025'), '2025-04-12');
check('two-digit year', parseSheetDate('12-04-25'), '2025-04-12');
check('a named month, day first', parseSheetDate('12 April 2025'), '2025-04-12');
check('a named month, month first', parseSheetDate('April 12, 2025'), '2025-04-12');
check('short month', parseSheetDate('12-Apr-25'), '2025-04-12');
check('a real Date', parseSheetDate(new Date(Date.UTC(2025, 3, 12))), '2025-04-12');
check('a share count is not a date', parseSheetDate(56400), null);
check('a date far in the future is not a date', parseSheetDate(60000), null);
check('a 1995 serial still reads', parseSheetDate(34700), '1995-01-01');
check('an impossible day', parseSheetDate('32/01/2025'), null);
check('text is nothing', parseSheetDate('TBD'), null);

console.log('— a term sheet written down the page —');
const downThePage = extractFromMatrix([
    ['Dholakia Ventures — Investment Summary'],
    [],
    ['Company', 'Acme Robotics Pvt Ltd'],
    ['Date of Investment', 45000],
    ['Investment Amount', '₹3,00,34,306'],
    ['Pre-Money Valuation (INR)', '900 Cr'],
    ['Price Per Share', 532],
    ['No. of Shares Allotted', '56,400'],
    ['% Holding', 0.0033],
    ['Investing Entity', 'Dholakia Ventures Fund I'],
    ['Type of Security', 'CCPS'],
    ['Round', 'Series A Round'],
    ['Invoice Number', 'DV/2025/114'],
]);
// The order is the review order: IMPORT_FIELDS, not the order of the sheet.
check('it finds every field', downThePage.fields.map(f => f.key), [
    'entryDate', 'initialInvestment', 'entryPreMoneyValuation', 'numShares',
    'sharePrice', 'entryOwnership', 'investmentVehicle', 'investmentInstrument', 'companyRound',
]);
const byKey = Object.fromEntries(downThePage.fields.map(f => [f.key, f.value]));
check('the date', byKey.entryDate, '2023-03-15');
check('the cheque', byKey.initialInvestment, 30034306);
check('the pre-money', byKey.entryPreMoneyValuation, 9000000000);
check('the price', byKey.sharePrice, 532);
check('the shares', byKey.numShares, 56400);
check('the fraction became a percentage', byKey.entryOwnership, 0.33);
check('the entity', byKey.investmentVehicle, 'Dholakia Ventures Fund I');
check('the round is normalised to the platform enum', byKey.companyRound, 'Series A');
check('it keeps the sheet wording for review', downThePage.fields[1].sheetLabel, 'Investment Amount');
check('it keeps the cell for review', downThePage.fields[1].rawValue, '₹3,00,34,306');
check('a stray heading is reported, not guessed at', downThePage.unmatched.includes('Invoice Number'), true);

console.log('— an export written across the top —');
const across = extractFromMatrix([
    ['Company Name', 'Investment Date', 'Amount Invested', 'Post Money Valuation', 'Shares', '% Holding'],
    ['Acme Robotics', '12/04/2025', '2.5 Cr', '₹60,00,00,000', 1018, '1.3484%'],
    ['Other Co', '01/01/2020', '1 Cr', '10 Cr', 500, '2%'],
]);
const acrossByKey = Object.fromEntries(across.fields.map(f => [f.key, f.value]));
check('the date from the first record', acrossByKey.entryDate, '2025-04-12');
check('the amount', acrossByKey.initialInvestment, 25000000);
check('the post-money', acrossByKey.entryPostMoneyValuation, 600000000);
check('the shares', acrossByKey.numShares, 1018);
check('the holding', acrossByKey.entryOwnership, 1.3484);
check('the second record is ignored', across.fields.filter(f => f.key === 'entryDate').length, 1);

console.log('— the empty and the broken —');
check('an empty sheet', extractFromMatrix([]).fields, []);
check('blank rows', extractFromMatrix([[], [null, ''], [undefined]]).fields, []);
check('a label with no value is skipped', extractFromMatrix([['Price Per Share', '']]).fields, []);
check('rows are counted', extractFromMatrix([['a'], ['b'], ['c']]).rowsScanned, 3);
check('a repeated label keeps the first', extractFromMatrix([
    ['Price Per Share', 100],
    ['Price Per Share', 200],
]).fields[0].value, 100);
check('a label with the value two cells over', extractFromMatrix([
    ['Price Per Share', null, 532],
]).fields[0].value, 532);

console.log('— what will be overwritten —');
check('a blank field is new', describeChange(null, 532, 'money'), 'new');
check('an empty string is new', describeChange('', 532, 'money'), 'new');
check('the same number', describeChange(532, 532, 'money'), 'same');
check('a rounding difference is the same', describeChange(532.001, 532, 'money'), 'same');
check('a real difference', describeChange(500, 532, 'money'), 'changed');
check('the same date', describeChange('2025-04-12T00:00:00Z', '2025-04-12', 'date'), 'same');
check('a different date', describeChange('2024-04-12', '2025-04-12', 'date'), 'changed');
check('the same text, cased differently', describeChange('ccps', 'CCPS', 'text'), 'same');
check('different text', describeChange('CCD', 'CCPS', 'text'), 'changed');
check('zero is a value, not a blank', describeChange(0, 532, 'money'), 'changed');

console.log('— the registry itself —');
check('every field has a key the platform knows', IMPORT_FIELDS.every(f => /^[a-z][A-Za-z]+$/.test(f.key)), true);
check('no field key is listed twice', new Set(IMPORT_FIELDS.map(f => f.key)).size, IMPORT_FIELDS.length);
check('every field has aliases', IMPORT_FIELDS.every(f => f.aliases.length > 0), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
