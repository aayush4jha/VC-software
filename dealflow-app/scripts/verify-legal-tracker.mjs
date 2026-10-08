// Pins src/lib/legal-tracker.ts — see package.json's test:legaltracker.
//
// The cases are the ones the sheet is explicit about: a right held above a
// threshold is lost when dilution takes us under it, a company with no records
// is missing everything rather than nothing, and overdue is counted apart from
// upcoming.

import {
    LEGAL_DOCUMENT_TYPES, INVESTOR_RIGHTS, KEY_DOCUMENT_KEYS, CRITICAL_RIGHT_KEYS,
    rightEligibility, rightsNeedingAttention, legalKpis, missingKeyDocuments,
    daysUntil, ageingDays, actionAlert, matchesSearch,
} from '../.legaltracker-test/legal-tracker.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

const NOW = new Date('2026-10-08T00:00:00Z');

console.log('— the definitions match the sheet —');
check('ten document types', LEGAL_DOCUMENT_TYPES.length, 10);
check('ten rights', INVESTOR_RIGHTS.length, 10);
check('document keys are unique', new Set(LEGAL_DOCUMENT_TYPES.map(d => d.key)).size, 10);
check('right keys are unique', new Set(INVESTOR_RIGHTS.map(r => r.key)).size, 10);
check('six key documents', KEY_DOCUMENT_KEYS, ['term_sheet', 'ssa', 'sha', 'safe_note', 'share_certificate', 'cap_table']);
check('seven critical rights', CRITICAL_RIGHT_KEYS.length, 7);
check('the SHA is a key document', KEY_DOCUMENT_KEYS.includes('sha'), true);
check('founder KYC is not', KEY_DOCUMENT_KEYS.includes('founder_kyc'), false);

console.log('— a threshold right is checked against the cap table —');
check('above it', rightEligibility(5, 7.5), 'eligible');
check('exactly on it', rightEligibility(5, 5), 'eligible');
check('diluted under it', rightEligibility(5, 3), 'below_threshold');
check('a hair under is under', rightEligibility(5, 4.999), 'below_threshold');
check('no threshold, nothing to check', rightEligibility(null, 3), 'no_threshold');
check('a zero threshold is no threshold', rightEligibility(0, 3), 'no_threshold');
check('no holding is no holding', rightEligibility(5, null), 'below_threshold');

console.log('— rights needing attention —');
const documented = (key, extra = {}) => ({ rightKey: key, status: 'available', thresholdPct: null, documentRef: 'SHA 2025 cl. 8', ...extra });
const allGood = CRITICAL_RIGHT_KEYS.map(k => documented(k));
check('a fully documented set needs nothing', rightsNeedingAttention(allGood, 10), []);
// Every OTHER critical right is correctly reported as unrecorded, so these
// look only at the one under test. The full-set case is two checks below.
const whyFor = (rows, key, ownership = 10) =>
    rightsNeedingAttention([...allGood.filter(r => r.rightKey !== key), ...rows], ownership)
        .filter(r => r.rightKey === key).map(r => r.why);
check('an undocumented right is flagged',
      whyFor([documented('board_seat', { documentRef: '' })], 'board_seat'), ['not documented']);
check('a right lost is flagged',
      whyFor([documented('board_seat', { status: 'lost' })], 'board_seat'), ['lost']);
check('dilution below the threshold is flagged',
      whyFor([documented('board_seat', { thresholdPct: 5 })], 'board_seat', 3), ['below threshold']);
check('the same right above the threshold is not',
      whyFor([documented('board_seat', { thresholdPct: 5 })], 'board_seat', 7), []);
check('a right we never had is not a problem',
      whyFor([{ rightKey: 'board_seat', status: 'not_available', thresholdPct: null, documentRef: '' }], 'board_seat'), []);
check('an unrecorded critical right is a gap', rightsNeedingAttention([], 10).map(r => r.why),
      CRITICAL_RIGHT_KEYS.map(() => 'not recorded'));
check('an unrecorded non-critical right is not', rightsNeedingAttention([], 10)
      .some(r => r.rightKey === 'drag_along'), false);
check('it names the right', rightsNeedingAttention(
    [...allGood.filter(r => r.rightKey !== 'liquidation_preference'),
     documented('liquidation_preference', { documentRef: '' })], 10)[0].label, 'Liquidation Preference');

console.log('— missing key documents —');
check('nothing recorded means all six missing', missingKeyDocuments([]).length, 6);
check('a pending document does not count as held', missingKeyDocuments(
    KEY_DOCUMENT_KEYS.map(k => ({ companyId: 'c', docType: k, status: 'pending', docDate: null, updatedAt: null }))).length, 6);
check('all six received means none missing', missingKeyDocuments(
    KEY_DOCUMENT_KEYS.map(k => ({ companyId: 'c', docType: k, status: 'received', docDate: null, updatedAt: null }))), []);
check('one gap is named', missingKeyDocuments(
    KEY_DOCUMENT_KEYS.filter(k => k !== 'sha').map(k => ({ companyId: 'c', docType: k, status: 'received', docDate: null, updatedAt: null })))
    .map(d => d.label), ['SHA']);

console.log('— the six KPI cards —');
const companies = [
    { id: 'a', companyName: 'Acme', currentOwnership: 7 },
    { id: 'b', companyName: 'Beta', currentOwnership: 3 },
];
const docs = [
    ...KEY_DOCUMENT_KEYS.map(k => ({ companyId: 'a', docType: k, status: 'received', docDate: null, updatedAt: null })),
    { companyId: 'b', docType: 'term_sheet', status: 'received', docDate: null, updatedAt: null },
    { companyId: 'b', docType: 'sha', status: 'pending', docDate: null, updatedAt: null },
    { companyId: 'b', docType: 'cap_table', status: 'pending', docDate: null, updatedAt: null },
];
const actions = [
    { id: '1', companyId: 'a', priority: 'critical', status: 'open', dueDate: '2026-10-20' },
    { id: '2', companyId: 'b', priority: 'high', status: 'open', dueDate: '2026-09-01' },
    { id: '3', companyId: 'b', priority: 'critical', status: 'closed', dueDate: '2026-10-09' },
    { id: '4', companyId: null, priority: 'low', status: 'open', dueDate: null },
    { id: '5', companyId: 'a', priority: 'medium', status: 'open', dueDate: '2027-06-01' },
];
const rights = new Map([
    ['a', CRITICAL_RIGHT_KEYS.map(k => documented(k))],
    ['b', [documented('board_seat', { thresholdPct: 5 })]],
]);
const k = legalKpis(companies, docs, actions, rights, { withinDays: 30, now: NOW });
check('companies', k.totalCompanies, 2);
check('documents pending', k.documentsPending, 2);
check('critical actions counts open ones only', k.criticalActions, 1);
check('upcoming within 30 days', k.upcomingDeadlines, 1);
check('overdue is counted apart', k.overdueActions, 1);
check('a far-off deadline is not upcoming', k.upcomingDeadlines < 2, true);
check('companies missing key docs', k.companiesMissingKeyDocs, 1);
check('rights requiring attention', k.rightsRequiringAttention, 1 + (CRITICAL_RIGHT_KEYS.length - 1));
check('a 90-day view sees more', legalKpis(companies, docs, actions, rights, { withinDays: 90, now: NOW }).upcomingDeadlines, 1);
check('an empty portfolio is all zeroes', legalKpis([], [], [], new Map(), { now: NOW }).companiesMissingKeyDocs, 0);

console.log('— dates —');
check('twelve days away', daysUntil('2026-10-20', NOW), 12);
check('today', daysUntil('2026-10-08', NOW), 0);
check('a week ago', daysUntil('2026-10-01', NOW), -7);
check('no date', daysUntil(null, NOW), null);
check('junk', daysUntil('soon', NOW), null);
check('ageing', ageingDays('2026-09-08T00:00:00Z', NOW), 30);
check('ageing is never negative', ageingDays('2026-12-01T00:00:00Z', NOW), 0);
check('no timestamp, no ageing', ageingDays(null, NOW), null);

console.log('— how an action reads —');
check('overdue', actionAlert({ status: 'open', dueDate: '2026-10-01' }, { now: NOW }).label, '7d overdue');
check('overdue is red', actionAlert({ status: 'open', dueDate: '2026-10-01' }, { now: NOW }).color, '#b91c1c');
check('due today', actionAlert({ status: 'open', dueDate: '2026-10-08' }, { now: NOW }).label, 'Due today');
check('due soon', actionAlert({ status: 'open', dueDate: '2026-10-20' }, { now: NOW }).urgency, 'due_soon');
check('scheduled', actionAlert({ status: 'open', dueDate: '2027-01-01' }, { now: NOW }).urgency, 'scheduled');
check('closed outranks its date', actionAlert({ status: 'closed', dueDate: '2020-01-01' }, { now: NOW }).urgency, 'closed');
check('on hold still ages', actionAlert({ status: 'on_hold', dueDate: '2026-10-01' }, { now: NOW }).urgency, 'overdue');
check('no due date', actionAlert({ status: 'open', dueDate: null }, { now: NOW }).label, 'No due date');

console.log('— search across all six columns —');
const row = {
    companyName: 'Acme Robotics', investmentEntity: 'Dholakia Ventures LLP',
    investmentType: 'CCPS', round: 'Series A', status: 'Active',
    documentTypes: ['Term Sheet', 'SHA'],
};
check('by company', matchesSearch(row, 'acme'), true);
check('by entity', matchesSearch(row, 'dholakia ventures llp'), true);
check('by instrument', matchesSearch(row, 'ccps'), true);
check('by round', matchesSearch(row, 'series a'), true);
check('by status', matchesSearch(row, 'active'), true);
check('by document type', matchesSearch(row, 'sha'), true);
check('two terms must both match', matchesSearch(row, 'acme ccps'), true);
check('and narrow rather than widen', matchesSearch(row, 'acme debt'), false);
check('an empty query matches everything', matchesSearch(row, '   '), true);
check('no match', matchesSearch(row, 'zzz'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
