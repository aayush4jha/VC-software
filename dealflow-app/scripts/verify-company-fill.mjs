// Guards what a follow-up email may change on a company.
// The dangerous direction is overwriting: somebody typed those values.
//
// Run with: npm run test:fill

import { blanksToFill, describeFill } from '../.fill-test/company-fill.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

const facts = {
    founderName: 'Ravi Kumar', founderEmail: 'ravi@acme.io',
    totalFundRaise: 8, valuation: 60, subIndustry: 'Energy analytics',
    summary: 'AI for energy', industryId: 'ind-1',
};

console.log('— filling blanks —');
eq('an empty company takes everything', blanksToFill({}, facts), {
    founder_name: 'Ravi Kumar', founder_email: 'ravi@acme.io',
    total_fund_raise: 80000000, valuation: 600000000,
    sub_industry: 'Energy analytics', industry_id: 'ind-1', quick_summary: 'AI for energy',
});
eq('crores become rupees', blanksToFill({}, { totalFundRaise: 1.2 }), { total_fund_raise: 12000000 });
eq('blank strings count as empty', blanksToFill({ founder_name: '   ', sub_industry: '' }, facts).founder_name, 'Ravi Kumar');
eq('zero counts as empty for money', blanksToFill({ valuation: 0 }, { valuation: 60 }), { valuation: 600000000 });

console.log('— never overwriting —');
const filled = {
    founder_name: 'Priya', founder_email: 'priya@acme.io', total_fund_raise: 50000000,
    valuation: 400000000, sub_industry: 'Solar', industry_id: 'ind-9', quick_summary: 'Existing summary',
};
eq('a complete company takes nothing', blanksToFill(filled, facts), {});
eq('numeric strings from the database count as set', blanksToFill({ valuation: '400000000' }, { valuation: 60 }), {});
eq('only the blank field is filled', blanksToFill({ ...filled, valuation: null }, facts), { valuation: 600000000 });

console.log('— rubbish in, nothing out —');
eq('nulls offer nothing', blanksToFill({}, { founderName: null, valuation: null }), {});
eq('empty strings offer nothing', blanksToFill({}, { founderName: '  ', subIndustry: '' }), {});
eq('a non-address is not an email', blanksToFill({}, { founderEmail: 'Ravi Kumar' }), {});
eq('negative and zero amounts are ignored', blanksToFill({}, { totalFundRaise: -5, valuation: 0 }), {});
eq('nothing to say means no write', blanksToFill({}, {}), {});

console.log('— stage-like fields are deliberately absent —');
eq('a follow-up cannot change the round', 'company_round' in blanksToFill({}, { ...facts, companyRound: 'Series A' }), false);

console.log('— describing the fill —');
eq('names the fields', describeFill({ founder_email: 'x', valuation: 1 }), 'founder email, valuation');
eq('empty patch describes nothing', describeFill({}), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
