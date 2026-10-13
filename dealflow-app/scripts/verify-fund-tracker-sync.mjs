// Pins src/lib/fund-tracker-sync.ts — see package.json's test:trackersync.
//
// The tracker holds commitments nobody's bank statement knows about. The whole
// point of these cases is that an import updates what it can prove and leaves
// everything else exactly as it was.

import { syncTrackerFromLedger, entityIdFor, describeSync }
    from '../.trackersync-test/fund-tracker-sync.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

const base = () => ({
    asOfDate: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
    entities: [
        { id: 'dvpl', name: 'DVPL', currency: 'INR', bankBalance: 100, paymentDue: 5000000, pendingFund: 2000000, notes: 'keep me' },
        { id: 'dvfz-llc', name: 'DVFZ LLC', currency: 'AED', bankBalance: 7, paymentDue: 300, pendingFund: 0 },
    ],
    expenses: [
        { id: 'manual-1', date: '2025-12-01', project: 'SPARROW', amount: 50000, entityId: 'dvpl', description: 'typed by hand' },
    ],
    statements: [],
});

const summary = {
    fileName: 'dd bank for ayush.xlsx',
    importedAt: '2026-10-13T10:00:00.000Z',
    entities: [
        { name: 'DVPL', currency: 'INR', closingBalance: 6054200, transactionCount: 400, asOfDate: '2026-09-30' },
        { name: 'Dravya Dholakia', currency: 'INR', closingBalance: 1200000, transactionCount: 273, asOfDate: '2026-10-01' },
    ],
    expenses: [
        { date: '2026-04-09', entity: 'DVPL', head: 'OFFICE', amount: -450000, description: 'SALARY APRIL' },
        { date: '2026-04-11', entity: 'Dravya Dholakia', head: 'INVESTMENT EXPENSE', amount: -150000, description: 'DD fee' },
    ],
};

const after = syncTrackerFromLedger(base(), summary);

console.log('— what the statement can prove is written —');
check('the balance is taken from the ledger', after.entities.find(e => e.id === 'dvpl').bankBalance, 6054200);
check('an entity the file found is added', after.entities.length, 3);
check('and named as the file names it', after.entities[2].name, 'Dravya Dholakia');
check('with an id of its own', after.entities[2].id, 'ledger-dravya-dholakia');
check('the as-of date is the latest transaction', after.asOfDate, '2026-10-01');
check('a statement record per entity', after.statements.length, 2);
check('carrying the closing balance', after.statements[0].closingBalance, 6054200);
check('and the transaction count', after.statements[0].transactionCount, 400);

console.log('— what it cannot prove is left alone —');
check('payment dues survive', after.entities.find(e => e.id === 'dvpl').paymentDue, 5000000);
check('pending capital survives', after.entities.find(e => e.id === 'dvpl').pendingFund, 2000000);
check('notes survive', after.entities.find(e => e.id === 'dvpl').notes, 'keep me');
check('an entity the file said nothing about is untouched',
      after.entities.find(e => e.id === 'dvfz-llc'), base().entities[1]);
check('a hand-typed expense survives', after.expenses.some(e => e.id === 'manual-1'), true);
check('a new entity gets no invented commitments', after.entities[2].paymentDue, 0);

console.log('— expenses come across —');
check('both of them', after.expenses.filter(e => e.source === 'import').length, 2);
check('as positive amounts', after.expenses.find(e => e.description === 'SALARY APRIL').amount, 450000);
check('filed under the head', after.expenses.find(e => e.description === 'SALARY APRIL').project, 'OFFICE');
check('against the right entity', after.expenses.find(e => e.description === 'DD fee').entityId, 'ledger-dravya-dholakia');

console.log('— uploading the same file twice changes nothing —');
const twice = syncTrackerFromLedger(after, { ...summary, importedAt: '2026-10-13T11:00:00.000Z' });
check('expenses are not doubled', twice.expenses.filter(e => e.source === 'import').length, 2);
check('the hand-typed one is still there once', twice.expenses.filter(e => e.id === 'manual-1').length, 1);
check('statements are not doubled', twice.statements.length, 2);
check('entities are not doubled', twice.entities.length, 3);
check('the balance is the same', twice.entities.find(e => e.id === 'dvpl').bankBalance, 6054200);

console.log('— a second, different file adds to the first —');
const other = syncTrackerFromLedger(after, {
    fileName: 'uae statement.xlsx', importedAt: '2026-10-13T12:00:00.000Z',
    entities: [{ name: 'DVFZ LLC', currency: 'AED', closingBalance: 189121, transactionCount: 42, asOfDate: '2026-08-01' }],
    expenses: [],
});
check('its statement is kept beside the first', other.statements.length, 3);
check('and it updates its own entity', other.entities.find(e => e.id === 'dvfz-llc').bankBalance, 189121);
check("without disturbing the other file's", other.entities.find(e => e.id === 'dvpl').bankBalance, 6054200);
check('that entity keeps its payment due', other.entities.find(e => e.id === 'dvfz-llc').paymentDue, 300);

console.log('— the edges —');
check('an empty import changes nothing but the timestamp',
      syncTrackerFromLedger(base(), { fileName: 'x', importedAt: '2026-10-13T00:00:00.000Z', entities: [], expenses: [] }).entities,
      base().entities);
check('a nameless entity is ignored', syncTrackerFromLedger(base(), {
    fileName: 'x', importedAt: '2026-10-13T00:00:00.000Z',
    entities: [{ name: '  ', currency: 'INR', closingBalance: 9, transactionCount: 1, asOfDate: null }], expenses: [],
}).entities.length, 2);
check('a zero expense is not recorded', syncTrackerFromLedger(base(), {
    fileName: 'x', importedAt: '2026-10-13T00:00:00.000Z', entities: [],
    expenses: [{ date: '2026-01-01', entity: 'DVPL', head: 'OFFICE', amount: 0, description: '' }],
}).expenses.filter(e => e.source === 'import').length, 0);
check('matching ignores case and punctuation', syncTrackerFromLedger(base(), {
    fileName: 'x', importedAt: '2026-10-13T00:00:00.000Z',
    entities: [{ name: 'dvfz llc.', currency: 'AED', closingBalance: 42, transactionCount: 1, asOfDate: null }], expenses: [],
}).entities.length, 2);

console.log('— the id and the summary line —');
check('an id from a name', entityIdFor('Dholakia Ventures LLP'), 'ledger-dholakia-ventures-llp');
check('punctuation collapses', entityIdFor('DV FZ-LLC!'), 'ledger-dv-fz-llc');
check('the summary counts entities', describeSync(base(), after).startsWith('3 entities updated'), true);
check('and mentions the new one', describeSync(base(), after).includes('1 new'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
