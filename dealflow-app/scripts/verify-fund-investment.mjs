// Guards the drawdown schedule and metrics for funds we invest in as an LP.
// Run with: npm run test:fund

import { buildDrawdownSchedule, validateFundTerms, fundInvestmentMetrics, latestNav, monthsBetweenContributions }
    from '../.fund-test/fund-investment.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};
const sum = xs => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

console.log('— drawdown schedule —');
const q = buildDrawdownSchedule({ commitment: 10000000, downPayment: 2000000, installments: 4, contributionType: 'Quarterly', startDate: '2026-01-15' });
eq('down payment first, then 4 installments', q.length, 5);
eq('down payment is the start date', [q[0].dueDate, q[0].amount, q[0].isDownPayment], ['2026-01-15', 2000000, true]);
eq('installments split the rest', q.slice(1).map(d => d.amount), [2000000, 2000000, 2000000, 2000000]);
eq('quarterly dates', q.slice(1).map(d => d.dueDate), ['2026-04-15', '2026-07-15', '2026-10-15', '2027-01-15']);
eq('the whole commitment is scheduled', sum(q), 10000000);

// 900,000 over 7 does not divide evenly — the remainder has to go somewhere.
const m = buildDrawdownSchedule({ commitment: 1000000, downPayment: 100000, installments: 7, contributionType: 'Monthly', startDate: '2026-01-31' });
eq('monthly: down payment + 7 installments', m.length, 8);
eq('month-end dates clamp and return', [m[1].dueDate, m[2].dueDate], ['2026-02-28', '2026-03-31']);
eq('awkward split still totals the commitment exactly', sum(m), 1000000);
eq('installments are even to the paisa', m[1].amount, 128571.43);
eq('the last one absorbs the remainder', m.at(-1).amount !== m[1].amount, true);

const a = buildDrawdownSchedule({ commitment: 5000000, downPayment: 0, installments: 3, contributionType: 'Annually', startDate: '2026-06-01' });
eq('no down payment means no entry for it', a[0].sequence, 1);
eq('annual dates', a.map(d => d.dueDate), ['2027-06-01', '2028-06-01', '2029-06-01']);

const c = buildDrawdownSchedule({ commitment: 3000000, downPayment: 1000000, installments: 2, contributionType: 'Custom', startDate: '2026-02-01', customDates: ['2026-05-20', '2026-11-09'] });
eq('custom uses the dates given', c.map(d => d.dueDate), ['2026-02-01', '2026-05-20', '2026-11-09']);
eq('custom totals the commitment', sum(c), 3000000);
eq('fully paid up front needs no installments', buildDrawdownSchedule({ commitment: 500000, downPayment: 500000, installments: 0, contributionType: 'Annually', startDate: '2026-01-01' }).length, 1);

console.log('— validation —');
const base = { commitment: 100, downPayment: 10, installments: 2, contributionType: 'Quarterly', startDate: '2026-01-01' };
eq('valid passes', validateFundTerms(base), null);
eq('zero commitment refused', validateFundTerms({ ...base, commitment: 0 }) !== null, true);
eq('down payment over the commitment refused', validateFundTerms({ ...base, downPayment: 200 }) !== null, true);
eq('a shortfall with no installments refused', validateFundTerms({ ...base, installments: 0 }) !== null, true);
eq('custom without dates refused', validateFundTerms({ ...base, contributionType: 'Custom' }) !== null, true);
eq('custom with the wrong number of dates refused', validateFundTerms({ ...base, contributionType: 'Custom', customDates: ['2026-05-01'] }) !== null, true);
eq('custom with a date each passes', validateFundTerms({ ...base, contributionType: 'Custom', customDates: ['2026-05-01', '2026-09-01'] }), null);
eq('missing start date refused', validateFundTerms({ ...base, startDate: '' }) !== null, true);

console.log('— NAV and metrics —');
const navs = [
    { asOfDate: '2026-03-31', nav: 2200000 },
    { asOfDate: '2026-09-30', nav: 2600000 },
    { asOfDate: '2026-06-30', nav: 2400000 },
];
eq('latest NAV is by date, not order', latestNav(navs).nav, 2600000);
eq('no entries means no NAV', latestNav([]), null);

const drawdowns = [
    { amount: 2000000, status: 'Paid', amountPaid: 2000000 },
    { amount: 2000000, status: 'Paid', amountPaid: null },
    { amount: 2000000, status: 'Pending', amountPaid: null },
];
const metrics = fundInvestmentMetrics(10000000, drawdowns, navs, 2000000);
eq('drawn counts only what is paid', metrics.drawn, 4000000);
eq('a paid drawdown with no recorded amount uses the scheduled one', metrics.drawn, 4000000);
eq('outstanding is the rest of the commitment', metrics.outstanding, 6000000);
eq('current NAV is the newest report', [metrics.currentNav, metrics.navAsOf], [2600000, '2026-09-30']);
eq('gain is NAV less what was drawn', metrics.gain, -1400000);
eq('multiple', metrics.multiple, 0.65);
const noNav = fundInvestmentMetrics(1000000, [{ amount: 100000, status: 'Paid' }], [], 90000);
eq('with no reports, NAV at investment stands in', [noNav.currentNav, noNav.navAsOf], [90000, null]);
eq('nothing drawn gives no multiple', fundInvestmentMetrics(100, [], [], 50).multiple, null);

console.log('— intervals —');
eq('monthly', monthsBetweenContributions('Monthly'), 1);
eq('quarterly', monthsBetweenContributions('Quarterly'), 3);
eq('annually', monthsBetweenContributions('Annually'), 12);
eq('custom is not derived', monthsBetweenContributions('Custom'), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
