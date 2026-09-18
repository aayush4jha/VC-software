// Guards the debt repayment arithmetic. These figures are emailed to borrowers
// as amounts due, so they are pinned against independently known values.
//
// Run with: npm run test:debt

import { buildSchedule, validateDebtTerms, dueDateFor, termCount, daysBetween, scheduledTerm, reminderStageFor }
    from '../.debt-test/debt-schedule.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};
const sum = (xs, k) => Math.round(xs.reduce((s, x) => s + x[k], 0) * 100) / 100;

console.log('— EMI —');
// Standard textbook figure: ₹1,00,000 at 12% p.a. over 12 months -> EMI ₹8,884.88
const emi = buildSchedule({ principal: 100000, annualRatePct: 12, tenureMonths: 12, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-15' });
eq('12 terms', emi.length, 12);
eq('first instalment is the textbook EMI', emi[0].total, 8884.88);
eq('first term interest is 1% of principal', emi[0].interest, 1000);
eq('instalments are level (term 6)', emi[5].total, 8884.88);
eq('principal repaid is exactly the amount lent', sum(emi, 'principal'), 100000);
eq('closes at exactly zero', emi[11].closingBalance, 0);
eq('last instalment within a rupee of the EMI', Math.abs(emi[11].total - 8884.88) < 1, true);

console.log('— interest each term, principal at the end —');
const bullet = buildSchedule({ principal: 1000000, annualRatePct: 12, tenureMonths: 12, frequency: 'Quarterly', repaymentType: 'interest_only_bullet', startDate: '2026-04-01' });
eq('4 quarterly terms', bullet.length, 4);
eq('3% interest a quarter', bullet[0].interest, 30000);
eq('no principal before the end', bullet.slice(0, 3).every(t => t.principal === 0), true);
eq('full principal on the last term', bullet[3].principal, 1000000);
eq('last term = interest + principal', bullet[3].total, 1030000);
eq('balance stays whole until the end', bullet[2].closingBalance, 1000000);
eq('quarterly due dates', bullet.map(t => t.dueDate), ['2026-07-01', '2026-10-01', '2027-01-01', '2027-04-01']);

console.log('— edges —');
const zero = buildSchedule({ principal: 1200, annualRatePct: 0, tenureMonths: 12, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-01' });
eq('0% EMI splits principal evenly', zero.map(t => t.total).every(v => v === 100), true);
const annual = buildSchedule({ principal: 500000, annualRatePct: 10, tenureMonths: 12, frequency: 'Annually', repaymentType: 'interest_only_bullet', startDate: '2026-03-10' });
eq('annual single term', [annual.length, annual[0].total, annual[0].dueDate], [1, 550000, '2027-03-10']);
const half = buildSchedule({ principal: 600000, annualRatePct: 9, tenureMonths: 24, frequency: 'Half-yearly', repaymentType: 'emi', startDate: '2026-01-01' });
eq('half-yearly: 4 terms, 4.5% a term', [half.length, half[0].interest], [4, 27000]);
eq('half-yearly principal adds up', sum(half, 'principal'), 600000);
// Uneven amounts must still close at exactly zero.
const odd = buildSchedule({ principal: 123456.78, annualRatePct: 13.37, tenureMonths: 36, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-01' });
eq('awkward amounts still close to zero', [odd.at(-1).closingBalance, sum(odd, 'principal')], [0, 123456.78]);

console.log('— due dates —');
eq('31st into February clamps to the 28th', dueDateFor('2026-01-31', 1), '2026-02-28');
eq('...and returns to the 31st, not drifting', dueDateFor('2026-01-31', 2), '2026-03-31');
eq('leap year', dueDateFor('2028-01-31', 1), '2028-02-29');
eq('crosses the year', dueDateFor('2026-11-15', 3), '2027-02-15');

console.log('— validation —');
eq('valid terms pass', validateDebtTerms({ principal: 1, annualRatePct: 12, tenureMonths: 12, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-01' }), null);
eq('tenure must fit the frequency', validateDebtTerms({ principal: 1, annualRatePct: 12, tenureMonths: 10, frequency: 'Quarterly', repaymentType: 'emi', startDate: '2026-01-01' }) !== null, true);
eq('zero amount refused', validateDebtTerms({ principal: 0, annualRatePct: 12, tenureMonths: 12, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-01' }) !== null, true);
eq('missing start date refused', validateDebtTerms({ principal: 5, annualRatePct: 12, tenureMonths: 12, frequency: 'Monthly', repaymentType: 'emi', startDate: '' }) !== null, true);
eq('fractional tenure refused', validateDebtTerms({ principal: 5, annualRatePct: 12, tenureMonths: 1.5, frequency: 'Monthly', repaymentType: 'emi', startDate: '2026-01-01' }) !== null, true);

console.log('— helpers —');
eq('term count', termCount({ tenureMonths: 24, frequency: 'Quarterly' }), 8);
eq('term past the tenure is null', scheduledTerm({ principal: 100, annualRatePct: 12, tenureMonths: 12, frequency: 'Annually', repaymentType: 'emi', startDate: '2026-01-01' }, 2), null);
eq('days until due', daysBetween('2026-01-01', '2026-01-08'), 7);
eq('days overdue are negative', daysBetween('2026-01-08', '2026-01-01'), -7);

console.log('— reminder timing (what a borrower receives, and when) —');
const due = '2026-10-15';
const base = { dueDate: due, reminderDaysBefore: 7, beforeSentAt: null, dueSentAt: null, lastOverdueAt: null };
eq('nothing 8 days out', reminderStageFor(base, '2026-10-07'), null);
eq('upcoming at 7 days out', reminderStageFor(base, '2026-10-08'), 'upcoming');
eq('upcoming not repeated once sent', reminderStageFor({ ...base, beforeSentAt: '2026-10-08T03:30:00Z' }, '2026-10-10'), null);
eq('due on the day', reminderStageFor({ ...base, beforeSentAt: '2026-10-08T03:30:00Z' }, due), 'due');
eq('due not repeated the same day', reminderStageFor({ ...base, dueSentAt: '2026-10-15T03:30:00Z' }, due), null);
eq('overdue the day after', reminderStageFor({ ...base, dueSentAt: '2026-10-15T03:30:00Z' }, '2026-10-16'), 'overdue');
eq('overdue quiet for a week', reminderStageFor({ ...base, lastOverdueAt: '2026-10-16T03:30:00Z' }, '2026-10-22'), null);
eq('overdue repeats after 7 days', reminderStageFor({ ...base, lastOverdueAt: '2026-10-16T03:30:00Z' }, '2026-10-23'), 'overdue');
eq('missed run: past due gets overdue, never a late "upcoming"', reminderStageFor(base, '2026-10-20'), 'overdue');
eq('0 days-before means no upcoming reminder', reminderStageFor({ ...base, reminderDaysBefore: 0 }, '2026-10-14'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
