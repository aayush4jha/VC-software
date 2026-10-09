// Pins src/lib/fund-ledger.ts — see package.json's test:ledger.
//
// The cases are the ones 03_Data Mapping is explicit about: an internal
// transfer must never read as funds received or as an investment, an exit must
// be cash and not a valuation, and a row with something missing must be flagged
// rather than dropped.

import {
    classifyTransaction, rowIssues, totalsFor, composition,
    financialYearOf, financialYearsBetween, accountBalance,
    CATEGORY_DEFINITIONS, LEDGER_CATEGORIES, CATEGORY_LABELS,
} from '../.ledger-test/fund-ledger.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}
const cat = (i) => classifyTransaction(i).category;

const ENTITIES = ['Dholakia Ventures LLP', 'Dholakia Ventures FZ LLC'];
const COMPANIES = ['Flipspaces', 'Dhiwise', 'Acme Robotics'];

console.log('— the Major Head in the file wins —');
check('funds received', cat({ description: 'x', amount: 100, majorHead: 'Funds Received' }), 'funds_received');
check('exit proceeds', cat({ description: 'x', amount: 100, majorHead: 'Exit Proceeds' }), 'exit_proceeds');
check('investment', cat({ description: 'x', amount: -100, majorHead: 'Investment' }), 'investment');
check('investment expense beats investment', cat({ description: 'x', amount: -100, majorHead: 'Investment Expenses' }), 'investment_expense');
check('office expense', cat({ description: 'x', amount: -100, majorHead: 'Office Expenses' }), 'office_expense');
check('internal transfer', cat({ description: 'x', amount: -100, majorHead: 'Internal Transfer' }), 'internal_transfer');
check('a head overrides the description', cat({
    description: 'salary for october', amount: -100, majorHead: 'Investment Expenses',
}), 'investment_expense');
check('the head is quoted as the reason', classifyTransaction({
    description: 'x', amount: 100, majorHead: 'Funds Received',
}).reason, 'Major head: Funds Received');

console.log('— a rule the firm wrote beats every built-in pattern —');
const rule = (matchText, category, extra = {}) => ({ field: 'description', matchText, category, priority: 100, ...extra });
check('a rule wins over the description rules', cat({
    description: 'SALARY OCT 2026', amount: -450000, rules: [rule('salary', 'investment_expense')],
}), 'investment_expense');
check('a rule wins over the major head', cat({
    description: 'x', amount: -100, majorHead: 'Office Expenses', rules: [rule('x', 'investment')],
}), 'investment');
check('priority decides between two rules', cat({
    description: 'ACME legal fee', amount: -100,
    rules: [rule('legal fee', 'office_expense', { priority: 50 }), rule('acme', 'investment', { priority: 10 })],
}), 'investment');
check('a rule on the entity column', cat({
    description: 'anything', amount: -100, entity: 'DV FZ LLC',
    rules: [{ field: 'entity', matchText: 'fz llc', category: 'office_expense', priority: 1 }],
}), 'office_expense');
check('a rule on the bank column', cat({
    description: 'anything', amount: -100, bank: 'Emirates NBD',
    rules: [{ field: 'bank', matchText: 'emirates', category: 'other_income', priority: 1 }],
}), 'other_income');
check('a rule that does not match is ignored', cat({
    description: 'SALARY OCT', amount: -450000, rules: [rule('zzzz', 'investment')],
}), 'office_expense');
check('an empty match text never matches everything', cat({
    description: 'SALARY OCT', amount: -450000, rules: [rule('', 'investment')],
}), 'office_expense');
check('the rule explains itself', classifyTransaction({
    description: 'SALARY OCT', amount: -1, rules: [rule('salary', 'investment_expense')],
}).reason, 'Your rule: description contains "salary"');
check('a note replaces the explanation', classifyTransaction({
    description: 'SALARY OCT', amount: -1, rules: [rule('salary', 'investment_expense', { note: 'Deal team payroll' })],
}).reason, 'Deal team payroll');

console.log('— an internal transfer is not funding and not an investment —');
const out = classifyTransaction({
    description: 'RTGS to Dholakia Ventures FZ LLC', amount: -50000000,
    entity: 'Dholakia Ventures LLP', knownEntities: ENTITIES, knownCompanies: COMPANIES,
});
check('money to our own entity', out.category, 'internal_transfer');
check('and it says where it went', out.reason, 'Moved to Dholakia Ventures FZ LLC');
check('a debit to our own entity is not an investment', out.category === 'investment', false);
check('the credit side too', classifyTransaction({
    description: 'RTGS from Dholakia Ventures LLP', amount: 50000000,
    entity: 'Dholakia Ventures FZ LLC', knownEntities: ENTITIES,
}).category, 'internal_transfer');
check('our own entity does not match itself', classifyTransaction({
    description: 'charges Dholakia Ventures LLP', amount: -500,
    entity: 'Dholakia Ventures LLP', knownEntities: ENTITIES,
}).category !== 'internal_transfer', true);

console.log('— a portfolio company, by direction —');
const inv = classifyTransaction({ description: 'Subscription Acme Robotics', amount: -12000000, knownCompanies: COMPANIES });
check('money out is an investment', inv.category, 'investment');
check('and names the company', inv.companyName, 'Acme Robotics');
const exit = classifyTransaction({ description: 'Proceeds Flipspaces', amount: 66000000, knownCompanies: COMPANIES });
check('money in is exit proceeds', exit.category, 'exit_proceeds');
check('and names the company', exit.companyName, 'Flipspaces');

console.log('— the description, when there is no head —');
check('interest', cat({ description: 'INT.CR SAVINGS ACCOUNT', amount: 4200 }), 'other_income');
check('dividend', cat({ description: 'DIVIDEND CREDIT', amount: 10000 }), 'other_income');
check('refund', cat({ description: 'NEFT REFUND FAILED TXN', amount: 2500 }), 'other_income');
check('due diligence', cat({ description: 'Due diligence fee — Acme', amount: -150000 }), 'investment_expense');
check('legal fee', cat({ description: 'Legal fee for SHA', amount: -80000 }), 'investment_expense');
check('salary', cat({ description: 'SALARY OCT 2026', amount: -450000 }), 'office_expense');
check('bank charges', cat({ description: 'BANK CHARGES GST', amount: -118 }), 'office_expense');
check('ccps subscription', cat({ description: 'CCPS subscription', amount: -5000000 }), 'investment');
// The transfer rule once read as "contains NEFT", which is most bank lines.
check('a transfer to our own account', cat({ description: 'NEFT TO OWN ACCOUNT', amount: -100000 }), 'internal_transfer');
check('but NEFT alone is not a transfer', cat({ description: 'NEFT CR SALARY OCT', amount: -450000 }), 'office_expense');
check('nor is a NEFT refund', cat({ description: 'NEFT REFUND FAILED TXN', amount: 2500 }), 'other_income');

console.log('— nothing is dropped —');
check('an unexplained credit is funding, flagged', classifyTransaction({ description: 'ABCD1234', amount: 500000 }).category, 'funds_received');
check('and says it needs confirming', classifyTransaction({ description: 'ABCD1234', amount: 500000 }).reason, 'Unexplained credit — please confirm');
check('an unexplained debit is an office cost, flagged', cat({ description: 'XYZ', amount: -900 }), 'office_expense');
check('a zero line is unclassified', cat({ description: 'balance brought forward', amount: 0 }), 'unclassified');

console.log('— a bad row is flagged, not excluded —');
check('a clean row has nothing wrong', rowIssues({
    entity: 'DV LLP', bank: 'HDFC', date: '2026-04-01', currency: 'INR', amount: -100, category: 'investment',
}), []);
check('every gap is named', rowIssues({}).sort(), ['no amount', 'no bank', 'no currency', 'no date', 'no entity', 'not classified']);
check('zero is called out', rowIssues({
    entity: 'a', bank: 'b', date: '2026-01-01', currency: 'INR', amount: 0, category: 'investment',
}), ['zero amount']);
check('unclassified is called out', rowIssues({
    entity: 'a', bank: 'b', date: '2026-01-01', currency: 'INR', amount: -5, category: 'unclassified',
}), ['not classified']);
check('AED with no INR figure is called out', rowIssues({
    entity: 'a', bank: 'b', date: '2026-01-01', currency: 'AED', amount: -5, amountInr: null, category: 'investment',
}), ['no INR conversion']);
check('AED with one is fine', rowIssues({
    entity: 'a', bank: 'b', date: '2026-01-01', currency: 'AED', amount: -5, amountInr: -115, category: 'investment',
}), []);

console.log('— the totals, and the net fund position —');
const rows = [
    { category: 'funds_received', amount: 100000000, amountInr: 100000000 },
    { category: 'exit_proceeds', amount: 60000000, amountInr: 60000000 },
    { category: 'other_income', amount: 1000000, amountInr: 1000000 },
    { category: 'investment', amount: -80000000, amountInr: -80000000 },
    { category: 'investment_expense', amount: -2000000, amountInr: -2000000 },
    { category: 'office_expense', amount: -5000000, amountInr: -5000000 },
    { category: 'internal_transfer', amount: -50000000, amountInr: -50000000 },
    { category: 'internal_transfer', amount: 50000000, amountInr: 50000000 },
    { category: 'adjustment', amount: -500000, amountInr: -500000 },
];
const t = totalsFor(rows);
check('inflows', t.totalInflow, 161000000);
check('outflows', t.totalOutflow, 87000000);
check('an outflow written negative is counted positive', t.investment, 80000000);
check('the two halves of a transfer cancel', t.internalTransfer, 0);
check('net fund position', t.netFundPosition, 161000000 - 87000000 - 500000);
check('transfers are absent from the net position', totalsFor(rows).netFundPosition,
      totalsFor(rows.filter(r => r.category !== 'internal_transfer')).netFundPosition);
check('the Actual view leaves adjustments out', totalsFor(rows, { includeAdjustments: false }).netFundPosition, 74000000);
check('an empty ledger is all zero', totalsFor([]).netFundPosition, 0);

console.log('— composition —');
const comp = composition(t);
check('three inflow rows and three outflow rows', comp.length, 6);
check('funds received share', Math.round(comp[0].percent), 62);
check('investment share', Math.round(comp[3].percent), 92);
check('an empty ledger divides by nothing', composition(totalsFor([]))[0].percent, 0);

console.log('— financial years —');
check('April starts one', financialYearOf('2026-04-01'), '2026-27');
check('March ends it', financialYearOf('2026-03-31'), '2025-26');
check('November convention', financialYearOf('2026-11-01', 'november'), '2026-27');
check('October ends it', financialYearOf('2026-10-31', 'november'), '2025-26');
check('and the same date differs between the two', financialYearOf('2026-05-01', 'november'), '2025-26');
check('no date, no year', financialYearOf(null), null);
check('junk, no year', financialYearOf('not a date'), null);
check('a span has no gaps', financialYearsBetween('2020-05-01', '2026-06-01'),
      ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
check('one year', financialYearsBetween('2026-05-01', '2026-06-01'), ['2026-27']);
check('backwards gives nothing', financialYearsBetween('2026-05-01', '2020-06-01'), []);

console.log('— an account balance, against what the bank says —');
const bal = accountBalance(
    { entity: 'DV LLP', bank: 'HDFC', currency: 'INR', openingBalance: 10000000, statedBalance: 7000000, statedAsOf: '2026-10-01' },
    [
        { amount: 5000000, category: 'funds_received' },
        { amount: -8000000, category: 'investment' },
        { amount: -50000, category: 'office_expense' },
        { amount: 50000, category: 'adjustment' },
    ],
);
check('inflows', bal.totalInflows, 5000000);
check('outflows', bal.totalOutflows, 8050000);
check('adjustments are apart', bal.adjustments, 50000);
check('closing', bal.closingBalance, 7000000);
check('agreeing with the bank shows no discrepancy', bal.discrepancy, 0);
const off = accountBalance(
    { entity: 'a', bank: 'b', currency: 'INR', openingBalance: 100, statedBalance: 90 },
    [{ amount: -5, category: 'office_expense' }],
);
check('a missing line shows as a discrepancy', off.discrepancy, 5);
check('no stated balance, no discrepancy', accountBalance(
    { entity: 'a', bank: 'b', currency: 'INR', openingBalance: 100 }, []).discrepancy, null);
check('a transfer still moves the account', accountBalance(
    { entity: 'a', bank: 'b', currency: 'INR', openingBalance: 100 },
    [{ amount: -40, category: 'internal_transfer' }]).closingBalance, 60);

console.log('— the category set —');
check('every category is defined', CATEGORY_DEFINITIONS.length, LEDGER_CATEGORIES.length);
check('every category has a label', LEDGER_CATEGORIES.every(c => !!CATEGORY_LABELS[c]), true);
check('no category is defined twice', new Set(CATEGORY_DEFINITIONS.map(c => c.key)).size, CATEGORY_DEFINITIONS.length);
check('transfers and adjustments are neither in nor out',
      CATEGORY_DEFINITIONS.filter(c => c.direction === 'neither').map(c => c.key),
      ['internal_transfer', 'adjustment', 'unclassified']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
