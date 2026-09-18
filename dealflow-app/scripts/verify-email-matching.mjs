// Guards the logic that decides which company an inbound email belongs to.
//
// This is the riskiest code in the ingestion path: failing to match creates a
// duplicate a human can merge, but matching two DIFFERENT companies silently
// welds them together, and there is no undo for that. The cases below pin both
// directions — what must club, and what must never.
//
// Run with: npm run test:email

import { deriveCompanyName, matchCompany, normalizeCompanyName, companyNameFromDomain } from '../.email-test/email-company.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? '\u2705' : '\u274c'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

console.log('— company name from an email —');
// The bug being fixed: subject lines becoming company names.
eq('subject is a topic, domain wins', deriveCompanyName({
    aiName: null, senderName: 'Ravi Kumar', senderEmail: 'ravi@acmelabs.io',
    subject: 'Pitch Deck - Seed Round',
}), 'Acmelabs');   // one word in the domain stays one word — nothing says where to split it
eq('no AI, free mail, topic subject -> sender, not subject', deriveCompanyName({
    aiName: null, senderName: 'Ravi Kumar', senderEmail: 'ravi.kumar@gmail.com',
    subject: 'Investment Opportunity',
}), 'Ravi Kumar');
eq('AI name kept', deriveCompanyName({
    aiName: 'Zippy Logistics', senderName: 'Ravi', senderEmail: 'ravi@gmail.com',
    subject: 'Fwd: pitch deck',
}), 'Zippy Logistics');
eq('AI echoing the subject is rejected', deriveCompanyName({
    aiName: 'Pitch Deck', senderName: 'Ravi', senderEmail: 'ravi@zippy.in',
    subject: 'Pitch Deck',
}), 'Zippy');
eq('AI echoing the sender name is rejected', deriveCompanyName({
    aiName: 'Ravi Kumar', senderName: 'Ravi Kumar', senderEmail: 'ravi@zippy.in',
    subject: 'Hello',
}), 'Zippy');
eq('AI agreeing with the domain is kept even if it echoes', deriveCompanyName({
    aiName: 'Zippy', senderName: 'Zippy', senderEmail: 'hi@zippy.in',
    subject: 'x',
}), 'Zippy');
eq('bare-name subject accepted when nothing else identifies it', deriveCompanyName({
    aiName: null, senderName: 'Ravi', senderEmail: 'ravi@gmail.com',
    subject: 'Nova Robotics',
}), 'Nova Robotics');
eq('sentence subject refused', deriveCompanyName({
    aiName: null, senderName: 'Ravi', senderEmail: 'ravi@gmail.com',
    subject: 'Following up on our conversation last week about funding',
}), 'Ravi');

console.log('— name normalisation —');
eq('legal suffix stripped', normalizeCompanyName('Acme Technologies Pvt Ltd'), 'acme technologies');
eq('punctuation stripped, legal suffix stripped', normalizeCompanyName('Acme-Labs, Inc.'), 'acme labs');
eq('descriptive words are KEPT so distinct firms stay distinct',
    normalizeCompanyName('Acme Labs') === normalizeCompanyName('Acme Technologies'), false);
eq('legal variants of one firm still agree',
    normalizeCompanyName('Acme Technologies Pvt Ltd'), normalizeCompanyName('Acme Technologies'));
eq('already bare', normalizeCompanyName('Acme'), 'acme');
eq('distinct names stay distinct', normalizeCompanyName('Acme') === normalizeCompanyName('Acorn'), false);

console.log('— domain —');
eq('free provider gives nothing', companyNameFromDomain('a@gmail.com'), null);
eq('work domain', companyNameFromDomain('a@nova-robotics.com'), 'Nova Robotics');

console.log('— matching (the merge risk) —');
const book = [
    { id: '1', company_name: 'Acme Technologies Pvt Ltd', founder_email: 'ravi@acme.io' },
    { id: '2', company_name: 'Nova Robotics', founder_email: 'me@gmail.com' },
    { id: '3', company_name: 'Acorn Health', founder_email: 'x@acornhealth.com' },
];
eq('exact address', matchCompany(book, { companyName: 'Whatever', senderEmail: 'ravi@acme.io' })?.id, '1');
eq('co-founder on same work domain', matchCompany(book, { companyName: 'Whatever', senderEmail: 'priya@acme.io' })?.matchedBy, 'domain');
eq('name match across providers', matchCompany(book, { companyName: 'Acme Technologies', senderEmail: 'ravi@gmail.com' })?.id, '1');
eq('a differently-named firm is NOT merged in', matchCompany(book, { companyName: 'Acme Labs', senderEmail: 'z@gmail.com' }), null);
eq('different company is NOT merged', matchCompany(book, { companyName: 'Acorn Health', senderEmail: 'new@gmail.com' })?.id, '3');
eq('unrelated company creates nothing', matchCompany(book, { companyName: 'Zephyr AI', senderEmail: 'z@zephyr.ai' }), null);
// The dangerous one: two personal gmail addresses must not match each other by domain.
eq('gmail does NOT match gmail by domain', matchCompany(
    [{ id: '9', company_name: 'Totally Different', founder_email: 'someone@gmail.com' }],
    { companyName: 'Another Co', senderEmail: 'other@gmail.com' },
), null);
eq('spelling variant joins the existing company', matchCompany(
    [{ id: '7', company_name: 'Dholakia', founder_email: 'a@gmail.com' }],
    { companyName: "Dholakiya's", senderEmail: 'b@yahoo.com' },
)?.id, '7');
eq('a containing name is NOT merged automatically', matchCompany(
    [{ id: '7', company_name: 'Dholakia', founder_email: 'a@gmail.com' }],
    { companyName: 'Dholakia Ventures', senderEmail: 'b@yahoo.com' },
), null);
eq('short name does not match loosely', matchCompany(
    [{ id: '9', company_name: 'AB', founder_email: 'a@x.com' }],
    { companyName: 'AB', senderEmail: 'b@gmail.com' },
), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
