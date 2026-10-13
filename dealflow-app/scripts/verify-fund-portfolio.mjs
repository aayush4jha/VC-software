// Pins src/lib/fund-portfolio.ts — see package.json's test:fundportfolio.
//
// The fixtures are the two sheets as the firm actually writes them, down to
// the month-first dates and the "Exited"/"WRITEOFF" word in the column beside
// the company.

import {
    normalizeFundType, financialYearFor, parsePortfolioInvestments,
    parsePortfolioExits, yearlySummary, summaryTotals,
    parseDashboardSheet, mergeDashboardYears,
} from '../.fundportfolio-test/fund-portfolio.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

console.log('— the three vehicles the summary splits by —');
check('direct', normalizeFundType('Direct'), 'Direct');
check('syndicate', normalizeFundType('Syndicate'), 'Syndicate');
check('fund', normalizeFundType('Fund'), 'Fund');
check('case does not matter', normalizeFundType('direct '), 'Direct');
check('something new is not folded into Direct', normalizeFundType('Secondary'), 'Other');
check('blank', normalizeFundType(''), 'Other');

console.log('— the financial year of a date —');
check('April starts one', financialYearFor('2021-04-01'), '2021-22');
check('March ends it', financialYearFor('2021-03-31'), '2020-21');
check('no date', financialYearFor(null), '');

const INV = [
    ['Status', 'Type of Fund', 'Investment from', 'Date of Investment', 'Investment at stage', 'Company', 'Amount',
     'Post Money Valuation', 'Investment equity', 'Sweat equity', 'Total equity', 'Current round valuation',
     'Current value of investment', 'Expected Multiple', 'Cheque', 'Our reporting period', 'WRITEOFF YEAR'],
    ['Bullish', 'Direct', 'Dravya', '11/18/20', 'Pre-series A', 'Biddano Pvt Ltd', '3,298,558.00',
     '300002337', '1.10%', '0.00%', '1.10%', '2750000000', '53075000', '4.08', '1st', '2020-21', ''],
    ['Winner', 'Direct', 'DVPL', '11/27/20', 'Seed', 'Pocketly Infotech Pvt Ltd', '3,500,640.00',
     '120000000', '2.92%', '0.00%', '6.48%', '1500000000', '187027683', '5.05', '1st', '2020-21', ''],
    ['Potential writeoff', 'Syndicate', 'Dravya', '2/2/21', 'Pre seed', 'BharatX', '1,800,272.00',
     '125660000', '1.43%', '0.00%', '1.43%', '', '300272', '14.73', '1st', '2020-21', ''],
    ['Base', 'Fund', 'DVPL', '5/4/21', 'seed', 'LV Angel Fund', '7,815,065.00',
     '', '', '', '', '', '9000000', '', '1st', '2021-22', ''],
    [null, null, null, null, null, 'TOTAL', null, null, null, null, null, null, null, null, null, null, null],
];
const investments = parsePortfolioInvestments(INV, 0, INV[0].map(h => String(h).toLowerCase()));

console.log('— the investment sheet —');
check('four rows, the total line skipped', investments.length, 4);
check('the amount', investments[0].amount, 3298558);
check('the company', investments[0].company, 'Biddano Pvt Ltd');
check('the vehicle', investments[2].fundType, 'Syndicate');
check('the month-first date', investments[0].investedOn, '2020-11-18');
check('their reporting period wins over the date', investments[0].financialYear, '2020-21');
check('the current value', investments[0].currentValue, 53075000);
check('the equity', investments[1].totalEquityPct, 6.48);
check('the status', investments[2].status, 'Potential writeoff');

const EXITS = [
    ['YEAR', 'Sr no', 'Investment from', 'Investment', 'Short Description', 'Funding Round', 'Date of Investment',
     'No of share', 'Issue Price', 'Amount', 'Post Money Valuation', 'Investment equity', 'Sweat equity',
     'Dilution', 'Total equity', 'Date of Sale', 'No of share sold', 'Remaining share', 'Sale price',
     'Consideration', 'Valuation on Exit', 'Multiple X'],
    ['2022-23', 'Exited', 'DVPL', 'Freightbro', 'digital platform', '', '22.04.2021', '143', '35000', '5,005,000',
     '800000000', '0.63%', '0.00%', '0.23%', '0.40%', '11/17/22', '143', '0', '80000', '11440000', '2860000000', '2.3'],
    ['2021-22', 'Exited', 'DVPL', 'Paperplane', 'digital clinic', 'I-SAFE', '10/27/21', '132', '22813', '3,011,316',
     '125000000', '2.41%', '', '', '2.41%', '8/16/22', '132', '0', '22813', '3011316', '125000000', '1'],
    ['2023-24', 'WRITEOFF', 'DRAVYA', 'Contri', 'class 10', '', '', '', '', '312,501',
     '', '2.50%', '', '', '2.50%', '7/31/24', '', '', '', '283851', '', '0.9'],
];
const exits = parsePortfolioExits(EXITS, 0, EXITS[0].map(h => String(h).toLowerCase()));

console.log('— the exits sheet —');
check('three rows', exits.length, 3);
check('an exit', exits[0].kind, 'exit');
check('a write-off is told apart', exits[2].kind, 'writeoff');
check('the consideration', exits[0].consideration, 11440000);
check('what it cost', exits[0].amount, 5005000);
check('the year the sheet states', exits[0].financialYear, '2022-23');
check('the sale date', exits[0].soldOn, '2022-11-17');

console.log('— the yearly table —');
const rows = yearlySummary(investments, exits);
check('a row per year that has something in it', rows.map(r => r.year), ['2020-21', '2021-22', '2022-23', '2023-24']);
const y1 = rows[0];
check('direct', y1.direct, 3298558 + 3500640);
check('syndicate', y1.syndicate, 1800272);
check('fund is nil that year', y1.fund, 0);
check('total', y1.totalInvestment, 8599470);
check('nothing exited', y1.exits, 0);
check('cumulative starts there', y1.cumulative, 8599470);
// A past year has no market value: the sheets carry today's valuation per
// holding, not a history, so a figure against 2020-21 would be this year's
// number wearing an old date.
check('a past year has no market value', y1.marketValue, null);
check('and therefore no NAV', y1.nav, null);

const y2 = rows[1];
check('the fund cheque lands in its year', y2.fund, 7815065);
// At cost, matching the firm's sheet: Net Investment is capital still at work.
check('an exit is counted at what it cost', y2.exits, 3011316);
check('net investment is what went in less what left', y2.netInvestment, 7815065 - 3011316);
check('cumulative carries forward', y2.cumulative, y1.cumulative + y2.netInvestment);
check('profit is proceeds less cost', y2.profitLoss, 3011316 - 3011316);
check('nor does the year after', y2.marketValue, null);

const y3 = rows[2];
check('a year with only an exit still appears', y3.totalInvestment, 0);
check('and books its gain', y3.profitLoss, 11440000 - 5005000);
check('while its cost leaves the portfolio', y3.exits, 5005000);

const y4 = rows[3];
check('a write-off is counted apart, at cost', y4.writeoffs, 312501);
check('and not as an exit', y4.exits, 0);
check('the latest year carries the market value', y4.marketValue !== null, true);
check('of what is still held, not what was sold', y4.marketValue, 53075000 + 187027683 + 300272 + 9000000);
check('its loss is booked', y4.profitLoss, 283851 - 312501);

console.log('— a position written down without a sale —');
// It never reaches the exits sheet; it is an investment carrying a WRITEOFF
// YEAR, and Sheet1 counts it among that year's write-offs.
const withWriteoff = yearlySummary(
    [...investments, { ...investments[2], status: 'Writeoff', company: 'Gone Ltd',
                       writeoffYear: '2024-25', amount: 2500000, currentValue: 0 }],
    exits,
);
const wy = withWriteoff.find(r => r.year === '2024-25');
check('its year appears in the table', !!wy, true);
check('counted as a write-off at cost', wy.writeoffs, 2500000);
check('and not as an exit', wy.exits, 0);
check('it leaves the cumulative', wy.netInvestment, -2500000);
check('and is not in the market value',
      withWriteoff[withWriteoff.length - 1].marketValue, 53075000 + 187027683 + 300272 + 9000000);

check('a potential write-off is not a write-off', yearlySummary(
    [...investments, { ...investments[0], company: 'Maybe Ltd', status: 'Potential writeoff',
                       writeoffYear: '2024-25', amount: 999, currentValue: 0 }], exits)
    .find(r => r.year === '2024-25')?.writeoffs ?? 0, 0);

console.log('— the totals row —');
const t = summaryTotals(rows);
check('investments add up', t.totalInvestment, 8599470 + 7815065);
check('exits add up at cost', t.exits, 3011316 + 5005000);
check('write-offs add up at cost', t.writeoffs, 312501);
check('cumulative is the last year, not a sum', t.cumulative, rows[rows.length - 1].cumulative);
check('market value likewise', t.marketValue, rows[rows.length - 1].marketValue);
check('and NAV likewise', t.nav, rows[rows.length - 1].nav);
check('an empty portfolio totals to nothing', summaryTotals([]).totalInvestment, 0);
check('and has no NAV', summaryTotals([]).nav, null);
check('and no market value', summaryTotals([]).marketValue, null);

console.log('— the edges —');
check('no rows, no years', yearlySummary([], []), []);
check('an investment with no year is left out of the table',
      yearlySummary([{ ...investments[0], financialYear: '' }], []), []);

console.log('— Sheet1 read as data, not as a brief —');
// Its layout: the yearly table to the right, the balance grid below, with the
// as-of date two rows above the entity names and the currency one row above.
const SHEET1 = [
    ['Step', null, null, null, null, null, null, null, 'dashboard should give me', 'as below'],
    [null, null, null, null, null, null, null, null, 'fund approved with yearly data'],
    [null, 'head will be', 'Fund for investment', null, null, null, null, null, 'fund received', 'india nd uae'],
    [null, null, 'office expense', null, null, null, null, null, null, 'type of investment'],
    [null, null, 'investment', null, null, null, null, null, 'Year', 'Direct', 'Fund', 'Syndicate',
     'Total Investment', 'Exits', 'Writeoffs', 'Net Investment', 'Cumulative Investment as of today',
     'Profit/loss', 'Market Value', 'NAV'],
    [null, null, 'investment exit', null, null, null, null, null, '2020-21', '168571886', '', '2800272',
     '171372158', '0', '0', '171372158', '171372158', '0', '188525092', '1.1'],
    [null, null, null, null, null, null, null, null, '2021-22', '327651558', '7815065', '1500000',
     '336966623', '3011316', '', '333955307', '505327465', '8428684', '1180850654', '2.34'],
    [null, null, null, null, null, null, null, null, null, '1159607782', '100609564', '14772272', '1274989618'],
    [],
    [null, null, null, '1/28/26', '1/28/26', '1/28/26', '1/28/26'],
    [null, null, null, 'INR', 'INR', 'INR', 'INR'],
    [null, 'Particular', null, 'DVLLP', 'DRAVYA', 'RAK', 'NBF'],
    [null, 'Bank Balance', null, '-34863766', '64233480', '15478350', '5475002'],
    [null, 'Payment due', null, '0', '3370384', '8000000', '50000000'],
    [null, 'Closing Balance', null, '-36156126', '60863096', '7478350', '-44524998'],
    [null, 'so this will show balance'],
];
const dash = parseDashboardSheet(SHEET1);
check('it is recognised', !!dash, true);
check('two years, not the totals line', dash.years.map(y => y.year), ['2020-21', '2021-22']);
check('direct', dash.years[0].direct, 168571886);
check('a blank cell is null, not zero', dash.years[0].fund, null);
check('the market value a past year has', dash.years[0].marketValue, 188525092);
check('and its NAV', dash.years[0].nav, 1.1);
check('four entities', dash.entities.map(e => e.name), ['DVLLP', 'DRAVYA', 'RAK', 'NBF']);
check('a negative bank balance', dash.entities[0].bankBalance, -34863766);
check('a payment due', dash.entities[3].paymentDue, 50000000);
check('its currency, from the row above', dash.entities[0].currency, 'INR');
check('its as-of date, from two rows above', dash.entities[0].asOf, '2026-01-28');
check('the closing balance the sheet states', dash.entities[0].closingBalance, -36156126);
check('a sheet with neither table', parseDashboardSheet([['nothing', 'here']]), null);

console.log('— the firm\'s figures laid over the computed ones —');
const computed = yearlySummary(investments, exits);
const mergedYears = mergeDashboardYears(computed, dash.years);
const m1 = mergedYears.find(y => y.year === '2020-21');
check("a market value no other sheet holds now appears", m1.marketValue, 188525092);
check('and its NAV', m1.nav, 1.1);
check('a stated figure wins', m1.direct, 168571886);
check('a year only the other sheets have survives',
      mergedYears.some(y => y.year === '2022-23'), true);
check('a year only Sheet1 has is added', mergeDashboardYears([], dash.years).length, 2);
check('and the years stay in order', mergedYears.map(y => y.year),
      [...mergedYears.map(y => y.year)].sort());
check('nothing stated leaves the computed table alone',
      mergeDashboardYears(computed, []).length, computed.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
