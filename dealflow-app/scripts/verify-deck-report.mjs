// Guards how a person's pitch emails are grouped into companies in their deck
// report — the same grouping the daily email uses.
//
// Run with: npm run test:deckreport

import { buildDeckReport } from '../.deckreport-test/deck-report.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};
const row = (id, company, email, at, deck = true, name = '') => ({
    gmail_message_id: id, sender_name: name, sender_email: email, subject: `s${id}`,
    received_at: at, company_name: company, attachment_names: deck ? [`${company}.pdf`] : [], has_pitch_deck: deck,
});

const rows = [
    row('1', 'Dholakia', 'a@gmail.com', '2026-09-10T10:00:00Z'),
    row('2', "Dholakiya's", 'b@yahoo.com', '2026-09-12T10:00:00Z'),          // same company, other spelling
    row('3', 'Nova Robotics', 'ravi@novarobotics.ai', '2026-09-11T10:00:00Z'),
    row('4', 'Nova Robotix', 'priya@novarobotics.ai', '2026-09-13T10:00:00Z', false), // co-founder, same domain
    row('5', 'Acme Labs', 'x@gmail.com', '2026-09-09T10:00:00Z'),
    row('6', 'Acme Technologies', 'y@gmail.com', '2026-09-09T11:00:00Z'),    // a different firm
];
const companies = [
    { id: 'c1', company_name: 'Nova Robotics Pvt Ltd', founder_email: 'ravi@novarobotics.ai', terminal_status: null, pipeline_stage_id: 's1' },
    { id: 'c2', company_name: 'Acme Technologies', founder_email: 'z@acme.io', terminal_status: 'Portfolio', pipeline_stage_id: null },
];
const report = buildDeckReport(rows, companies, { s1: 'Screening' });

const byName = n => report.find(g => g.companyName === n);
eq('four companies, not six', report.length, 4);
eq('spelling variants grouped', byName('Dholakia')?.emails.length, 2);
eq('co-founder on the same domain grouped', byName('Nova Robotics')?.senders.length, 2);
eq('decks counted, not emails', byName('Nova Robotics')?.deckCount, 1);
eq('Acme Labs kept apart from Acme Technologies', !!byName('Acme Labs') && !!byName('Acme Technologies'), true);
eq('newest company first', report[0].companyName, 'Nova Robotics');
eq('newest email first inside a group', byName('Dholakia')?.emails[0].messageId, '2');
eq('on platform via founder email, with stage', byName('Nova Robotics')?.onPlatform, { id: 'c1', name: 'Nova Robotics Pvt Ltd', where: 'Deal Flow · Screening' });
eq('on platform via name, in portfolio', byName('Acme Technologies')?.onPlatform?.where, 'Portfolio');
eq('new company flagged as new', byName('Dholakia')?.onPlatform, null);
eq('empty input is an empty report', buildDeckReport([], companies, {}), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
