// Pins src/lib/master-import.ts — see package.json's test:masterimport.
//
// "Upload one master Excel file; the system should identify and map bank
// statements, investment data, exit/write-off data and adjustment entries."
// So the cases are real sheet shapes: a bank export with a logo above the
// headings, debit and credit in separate columns, an exit master that shares
// most of its columns with the investment master.

import {
    findHeaderRow, detectSheetKind, columnFor,
    parseBankRows, parseAdjustmentRows, parseInvestmentRows, parseExitRows,
    importKey, describeSheet,
} from '../.masterimport-test/master-import.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

// A real bank export: title, blank line, account summary, then the headings.
const BANK = [
    ['HDFC BANK LTD — STATEMENT OF ACCOUNT'],
    [],
    ['Account Number', '50200012345678', null, null],
    ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['01/04/2026', 'NEFT CR CAPITAL FROM PROMOTER', null, 10000000, 10000000],
    ['05/04/2026', 'Subscription Acme Robotics', 2500000, null, 7500000],
    ['07/04/2026', 'RTGS TO Dholakia Ventures FZ LLC', 1000000, null, 6500000],
    ['09/04/2026', 'SALARY APRIL', 450000, null, 6050000],
    ['10/04/2026', 'INT.CR SAVINGS', null, 4200, 6054200],
    [],
    ['Closing Balance', null, null, null, 6054200],
];

console.log('— finding the headings when the sheet does not start at A1 —');
const header = findHeaderRow(BANK);
check('the heading row is found', header.index, 3);
check('and normalised', header.headers, ['date', 'narration', 'debit', 'credit', 'balance']);
check('a sheet with no headings gives nothing', findHeaderRow([[1, 2, 3], [4, 5, 6]]), null);
check('a row of figures is data, not headings', findHeaderRow([['1', '2', '3'], ['4', '5', '6']]), null);
check('two words and a number are not headings', findHeaderRow([['Total', 'Balance', 500]]), null);
check('an empty sheet gives nothing', findHeaderRow([]), null);

console.log('— identifying each sheet by its headings —');
const bankMatch = detectSheetKind(BANK);
check('a bank statement', bankMatch.kind, 'bank_statement');
check('and reports where the headings were', bankMatch.headerRow, 3);

const INVESTMENTS = [
    ['Company', 'Entity', 'Investment Date', 'Instrument', 'Amount', 'Round', 'Status', 'Ownership %'],
    ['Acme Robotics', 'DV LLP', '12/04/2025', 'CCPS', '2.5 Cr', 'Series A', 'Active', '1.35%'],
    ['Beta Labs', 'DV FZ LLC', '01/06/2025', 'SAFE', '50,00,000', 'Seed', 'Active', 0.0212],
];
check('an investment master', detectSheetKind(INVESTMENTS).kind, 'investment_master');

const EXITS = [
    ['Company', 'Entity', 'Exit Date', 'Exit Amount', 'Exit Type', 'Status'],
    ['Flipspaces', 'DV LLP', '15/08/2026', '6.6 Cr', 'Secondary', 'Completed'],
    ['Nooble', 'DV LLP', '', '', 'Write-off', 'Written Off'],
];
check('an exit master, not an investment master', detectSheetKind(EXITS).kind, 'exit_master');

const ADJUSTMENTS = [
    ['Date', 'Entity', 'Category', 'Amount', 'Reason', 'Approved By', 'Remarks'],
    ['01/09/2026', 'DV LLP', 'office_expense', '-50,000', 'Duplicate entry reversed', 'Nishant', ''],
    ['02/09/2026', 'DV LLP', 'office_expense', '-25,000', '', 'Nishant', 'no reason'],
    ['03/09/2026', 'DV LLP', 'office_expense', '-25,000', 'Reclassified', '', 'nobody approved'],
];
check('adjustments', detectSheetKind(ADJUSTMENTS).kind, 'adjustments');
check('legal documents', detectSheetKind([['Company', 'Document Type', 'Status', 'Version']]).kind, 'legal_documents');
check('investor rights', detectSheetKind([['Company', 'Right', 'Status', 'Threshold']]).kind, 'investor_rights');
check('an unrecognisable sheet', detectSheetKind([['Lorem', 'Ipsum', 'Dolor'], [1, 2, 3]]).kind, null);

console.log('— finding a column —');
check('exact', columnFor(['date', 'narration', 'debit'], ['debit']), 2);
check('the longer synonym wins', columnFor(['date', 'exit date', 'amount'], ['exit date', 'date']), 1);
check('loose match', columnFor(['transaction date value'], ['date']), 0);
check('absent', columnFor(['a', 'b'], ['zzz']), -1);

console.log('— bank rows become one signed amount —');
const ledger = parseBankRows(BANK, 3, header.headers, {
    defaultEntity: 'Dholakia Ventures LLP', defaultBank: 'HDFC', defaultCurrency: 'INR',
    knownEntities: ['Dholakia Ventures LLP', 'Dholakia Ventures FZ LLC'],
    knownCompanies: ['Acme Robotics', 'Flipspaces'],
});
check('five transactions, no subtotal', ledger.length, 5);
check('a credit is positive', ledger[0].amount, 10000000);
check('a debit is negative', ledger[1].amount, -2500000);
check('dates are day-first', ledger[0].date, '2026-04-01');
check('the entity falls back to the account', ledger[0].entity, 'Dholakia Ventures LLP');
check('funds received', ledger[0].category, 'funds_received');
check('an investment is matched by company', ledger[1].category, 'investment');
check('and named', ledger[1].companyName, 'Acme Robotics');
check('a transfer to our own entity', ledger[2].category, 'internal_transfer');
check('salary is an office cost', ledger[3].category, 'office_expense');
check('interest is other income', ledger[4].category, 'other_income');
check('a clean row carries no flags', ledger[3].issues, []);
check('the balance is kept', ledger[0].balanceAfter, 10000000);
check('the source row is kept for the audit trail', ledger[0].sourceRow, 5);
check('INR needs no conversion', ledger[0].amountInr, 10000000);

console.log('— a UAE sheet keeps both currencies —');
const UAE = [
    ['Date', 'Description', 'Amount', 'Currency', 'INR Equivalent'],
    ['01/04/2026', 'Office rent Dubai', '-10,000', 'AED', '2,30,000'],
    ['02/04/2026', 'Consultancy', '-5,000', 'AED', ''],
];
const uaeRows = parseBankRows(UAE, 0, ['date', 'description', 'amount', 'currency', 'inr equivalent'], { defaultEntity: 'DV FZ LLC', defaultBank: 'Emirates NBD' });
check('the original currency is kept', uaeRows[0].currency, 'AED');
check('the sheet conversion is used', uaeRows[0].amountInr, -230000);
check('its sign follows the amount', uaeRows[0].amountInr < 0, true);
check('no conversion is flagged, not guessed', uaeRows[1].issues, ['no INR conversion']);
const withFx = parseBankRows(UAE, 0, ['date', 'description', 'amount', 'currency', 'inr equivalent'],
    { defaultEntity: 'x', defaultBank: 'y', fxRate: 23 });
check('a supplied rate fills the gap', withFx[1].amountInr, -115000);

console.log('— a row with gaps is flagged, not dropped —');
const GAPPY = [
    ['Date', 'Narration', 'Amount'],
    ['', 'Something', '-1000'],
];
const gappy = parseBankRows(GAPPY, 0, ['date', 'narration', 'amount'], {});
check('it is still imported', gappy.length, 1);
check('and says what is wrong', gappy[0].issues.sort(), ['no bank', 'no date', 'no entity']);

console.log('— adjustments need a reason and an approver —');
const adj = parseAdjustmentRows(ADJUSTMENTS, 0,
    ['date', 'entity', 'category', 'amount', 'reason', 'approved by', 'remarks']);
check('only the complete one is taken', adj.rows.length, 1);
check('its amount keeps its sign', adj.rows[0].amount, -50000);
check('its approver is kept', adj.rows[0].approvedBy, 'Nishant');
check('two are rejected', adj.rejected.length, 2);
check('and each says why', adj.rejected.map(r => r.why), ['no reason given', 'nobody approved it']);

console.log('— the investment master —');
const inv = parseInvestmentRows(INVESTMENTS, 0,
    ['company', 'entity', 'investment date', 'instrument', 'amount', 'round', 'status', 'ownership']);
check('two rows', inv.length, 2);
check('crore shorthand', inv[0].amount, 25000000);
check('indian grouping', inv[1].amount, 5000000);
check('a typed percentage', inv[0].ownershipPct, 1.35);
check('a spreadsheet fraction', inv[1].ownershipPct, 2.12);
check('the date', inv[0].date, '2025-04-12');
check('the instrument', inv[0].instrument, 'CCPS');

console.log('— the exit master, including the dateless ones —');
const exits = parseExitRows(EXITS, 0, ['company', 'entity', 'exit date', 'exit amount', 'exit type', 'status']);
check('both rows', exits.length, 2);
check('the proceeds', exits[0].amount, 66000000);
check('the exit date', exits[0].date, '2026-08-15');
check('a write-off with nothing recovered is zero, not dropped', exits[1].amount, 0);
check('and its missing date is carried, not invented', exits[1].date, null);

console.log('— the same file twice must not double the fund —');
const k1 = importKey('master.xlsx', 'HDFC', 5, ['01/04/2026', 'x', 1000]);
const k2 = importKey('master.xlsx', 'HDFC', 5, ['01/04/2026', 'x', 1000]);
const k3 = importKey('master.xlsx', 'HDFC', 6, ['01/04/2026', 'x', 1000]);
check('the same row gives the same key', k1, k2);
check('a different row does not', k1 === k3, false);
check('nor does a different sheet', importKey('m.xlsx', 'A', 5, ['x']) === importKey('m.xlsx', 'B', 5, ['x']), false);
check('two identical charges on one day are both kept',
      importKey('m.xlsx', 'A', 5, ['01/04', 'FEE', 500]) === importKey('m.xlsx', 'A', 6, ['01/04', 'FEE', 500]), false);

console.log('— what the review screen says —');
check('a recognised sheet', describeSheet(bankMatch, 5, 0), 'Bank statement: 5 rows, 0 needing attention.'.replace(', 0 needing attention', ''));
check('with flags', describeSheet(bankMatch, 5, 2), 'Bank statement: 5 rows, 2 needing attention.');
check('one row reads singular', describeSheet(bankMatch, 1, 0), 'Bank statement: 1 row.');
check('an unknown sheet explains itself',
      describeSheet({ kind: null, label: 'Not recognised', confidence: 0, headerRow: -1, headers: [] }, 0, 0)
        .startsWith('Not recognised'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
