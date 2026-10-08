// Pins src/lib/reply-templates.ts — see package.json's test:templates.
//
// The point of a template is that it can be sent as it stands. So: no blank
// left where a name should be, no stray placeholder, and a sign-off every time.

import { REPLY_TEMPLATES, fillTemplate, templatesFor }
    from '../.templates-test/reply-templates.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)?.slice(0, 200)}\n     want: ${JSON.stringify(want)?.slice(0, 200)}`); }
}

const byId = (id) => REPLY_TEMPLATES.find(t => t.id === id);

console.log('— filling one in —');
const filled = fillTemplate(byId('deal-ask-traction'), {
    senderName: 'Ravi Mehta', companyName: 'Acme Robotics', signOffName: 'Aayush',
});
check('greets by first name only', filled.startsWith('Hi Ravi,'), true);
check('names the company', filled.includes('Acme Robotics'), true);
check('signs off', filled.endsWith('Best,\nAayush'), true);
check('leaves no placeholder behind', /\{\{/.test(filled), false);

console.log('— what is missing is written around, not left blank —');
const noName = fillTemplate(byId('deal-ask-deck'), { signOffName: 'Aayush' });
check('an unknown sender is "there"', noName.startsWith('Hi there,'), true);
const noCompany = fillTemplate(byId('deal-ask-traction'), { senderName: 'Ravi', signOffName: 'Aayush' });
check('no company leaves no dangling phrase', noCompany.includes('look at .'), false);
check('and no empty "at"', / at\s*\n/.test(noCompany), false);
check('and no placeholder', /\{\{/.test(noCompany), false);
check('an unknown partner still signs off', fillTemplate(byId('holding'), {}).endsWith('Best,'), true);
check('a raw string can be filled too', fillTemplate('Hi {{first_name}},', { senderName: 'Priya' }), 'Hi Priya,\n\nBest,');

console.log('— every template is sendable as it stands —');
for (const t of REPLY_TEMPLATES) {
    const out = fillTemplate(t, { senderName: 'Ravi Mehta', companyName: 'Acme', signOffName: 'Aayush' });
    const bare = fillTemplate(t, {});
    const ok = !/\{\{/.test(out) && !/\{\{/.test(bare)
        && out.startsWith('Hi ') && out.includes('Best,')
        && !/\s[.,]/.test(bare.replace(/\n/g, ' ').replace(/  +/g, ' '));
    check(`${t.id} survives both a full and an empty context`, ok, true);
}

console.log('— the set itself —');
check('ids are unique', new Set(REPLY_TEMPLATES.map(t => t.id)).size, REPLY_TEMPLATES.length);
check('labels are unique', new Set(REPLY_TEMPLATES.map(t => t.label)).size, REPLY_TEMPLATES.length);
check('labels are short enough for a button', REPLY_TEMPLATES.every(t => t.label.length <= 30), true);
check('every category has at least one of its own', ['Deals', 'Portfolio Companies', 'Calls', 'Events', 'Promotions']
    .every(c => REPLY_TEMPLATES.some(t => t.categories.includes(c))), true);

console.log('— ordering —');
const forDeals = templatesFor('Deals');
check('a deal template comes first', forDeals[0].categories.includes('Deals'), true);
check('nothing is hidden', forDeals.length, REPLY_TEMPLATES.length);
check('an unknown category shows everything', templatesFor(undefined).length, REPLY_TEMPLATES.length);
check('promotions leads with the unsubscribe', templatesFor('Promotions')[0].id, 'promo-unsubscribe');
check('events lead with an event reply', templatesFor('Events')[0].categories.includes('Events'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
