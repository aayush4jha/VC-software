import {
  getLatestValuation, getCurrentOwnership, getInitialOwnership,
  computeOwnershipChain, getTerminalValue, getCompanyMOIC,
} from '../.portfolio-test/portfolio-utils.mjs';

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(52)} got ${Number(actual).toFixed(2)}  want ${Number(expected).toFixed(2)}`);
  ok ? pass++ : fail++;
};

const base = {
  id: 'x', createdAt: '2023-01-01', entryDate: '2023-01-01',
  initialInvestment: 53966600, entryValuation: 7636000000,
  entryPostMoneyValuation: 7636000000, entryOwnership: null,
  currentOwnership: null, latestValuation: null,
  portfolioStatus: 'Active', companyRound: 'Series B',
};
const round = (o = {}) => ({
  id: 'r1', roundName: 'Series C', roundDate: '2024-01-01',
  didWeInvest: true, ourInvestment: 10000000,
  postMoneyValuation: 20000000000, preMoneyValuation: 18000000000,
  totalRaised: 2000000000, roundValuation: 20000000000,
  dilutionPercent: null, ownershipSought: null, ownershipAfter: null,
  ourValueTodayOverride: null, ...o,
});

console.log('\nRULE: a typed value overrides the formula\n');
check('Latest Valuation typed',      getLatestValuation({...base, latestValuation: 9000000000}, []), 9000000000);
check('Current Ownership typed',     getCurrentOwnership({...base, currentOwnership: 0.59}, []), 0.59);
check('Entry Ownership typed',       getInitialOwnership({...base, entryOwnership: 1.25}), 1.25);
const cO = computeOwnershipChain(base, [round({dilutionPercent: 3.5})]);
check('Round dilution % typed',      cO[1].passiveDilution, 3.5);
const cS = computeOwnershipChain(base, [round({ownershipSought: 2.75})]);
check('Round ownership sought typed',cS[1].ownershipSought, 2.75);
const cA = computeOwnershipChain(base, [round({ownershipAfter: 4.4})]);
check('Round ownership after typed', cA[1].ownershipAfter, 4.4);
check('Round our-value-today typed', getTerminalValue(base, [round({ourValueTodayOverride: 12345678})]), 12345678);

console.log('\nRULE: clearing the field falls back to the formula\n');
check('Latest Valuation cleared',    getLatestValuation(base, []), 7636000000);
check('Current Ownership cleared',   getCurrentOwnership(base, []), (53966600/7636000000)*100);
check('Entry Ownership cleared',     getInitialOwnership(base), (53966600/7636000000)*100);
const cAuto = computeOwnershipChain(base, [round()]);
check('Round dilution auto',         cAuto[1].passiveDilution, (53966600/7636000000)*100*(2000000000/20000000000));

console.log('\nRULE: dependent values move with the override\n');
const typed = {...base, currentOwnership: 0.59};
check('Terminal follows typed ownership', getTerminalValue(typed, []), 7636000000*0.0059);
check('MOIC follows typed ownership',     getCompanyMOIC(typed, []), (7636000000*0.0059)/53966600);
const raised = {...typed, latestValuation: 10000000000};
check('Terminal follows raised valuation', getTerminalValue(raised, []), 10000000000*0.0059);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
