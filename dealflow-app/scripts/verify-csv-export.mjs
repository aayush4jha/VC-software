// Pins src/lib/csv-export.ts — see package.json's test:csv.
// The case that matters is the one nobody thinks about: a bank narration
// beginning with "=" is a formula to a spreadsheet, not text.

import { csvCell, toCsv, exportFilename } from '../.csv-test/csv-export.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = got === want;
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

console.log('— one cell —');
check('plain text', csvCell('HDFC'), 'HDFC');
check('a number', csvCell(1250000), '1250000');
check('a comma forces quotes', csvCell('Mumbai, India'), '"Mumbai, India"');
check('a quote is doubled', csvCell('He said "yes"'), '"He said ""yes"""');
check('a newline forces quotes', csvCell('line one\nline two'), '"line one\nline two"');
check('empty', csvCell(''), '');
check('null', csvCell(null), '');
check('undefined', csvCell(undefined), '');

console.log('— a narration must not run as a formula —');
check('equals is defused', csvCell('=1+1'), "'=1+1");
check('plus is defused', csvCell('+SUM(A1)'), "'+SUM(A1)");
check('minus is defused', csvCell('-500 NEFT'), "'-500 NEFT");
check('at is defused', csvCell('@import'), "'@import");
check('a negative number is still a number', csvCell(-500), '-500');
check('a negative decimal too', csvCell(-2500000.75), '-2500000.75');
check('but a string that looks like one is defused', csvCell('-500'), "'-500");
check('and a defused cell with a comma is still quoted', csvCell('=A1,B1'), `"'=A1,B1"`);

console.log('— a document —');
const rows = [
    { date: '2026-04-01', desc: 'NEFT CR, promoter', amount: 10000000 },
    { date: '2026-04-05', desc: 'Subscription', amount: -2500000 },
];
const csv = toCsv(rows, [
    { header: 'Date', value: r => r.date },
    { header: 'Description', value: r => r.desc },
    { header: 'Amount', value: r => r.amount },
]);
check('headers first', csv.split('\r\n')[0], 'Date,Description,Amount');
check('a row', csv.split('\r\n')[1], '2026-04-01,"NEFT CR, promoter",10000000');
check('three lines', csv.split('\r\n').length, 3);
check('CRLF, for Excel', csv.includes('\r\n'), true);
check('no rows is still a header', toCsv([], [{ header: 'A', value: () => 1 }]), 'A');

console.log('— the filename —');
check('says what and when', exportFilename('Fund ledger', new Date('2026-10-09T10:00:00Z')), 'fund-ledger-2026-10-09.csv');
check('punctuation is stripped', exportFilename('Legal: documents!', new Date('2026-01-02T00:00:00Z')), 'legal-documents-2026-01-02.csv');
check('an empty name still works', exportFilename('', new Date('2026-01-02T00:00:00Z')), 'export-2026-01-02.csv');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
