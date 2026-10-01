// Guards how the inbox is sorted and how overdue a reply is.
// Run with: npm run test:triage

import { classifyEmail, awaitingReply, replyState, REPLY_THRESHOLD_DAYS }
    from '../.triage-test/email-triage.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};
const cat = (input) => classifyEmail({ senderEmail: 'founder@startup.io', text: '', subject: '', ...input }).category;

console.log('— the rule that sets the order —');
eq('a deck that asks for a call is a DEAL', cat({
    subject: 'Investment Opportunity — Veyra',
    text: 'Attaching our pitch deck. Can we connect over a quick call this week?',
    attachmentNames: ['Veyra_Deck.pdf'],
}), 'Deals');
eq('raising money and asking to schedule is still a DEAL', cat({
    subject: 'Seed round', text: 'We are raising a seed round. Can we schedule a call?',
}), 'Deals');
eq('a call with nothing being raised is a CALL', cat({
    subject: 'Quick chat?', text: 'Can we schedule a call next week to catch up?',
}), 'Calls');

console.log('— deals —');
eq('deck attached, no words', cat({ subject: 'Hello', attachmentNames: ['Company.pdf'] }), 'Deals');
eq('fundraising language', cat({ subject: 'Pre-Series A', text: 'We are raising a pre-seed round' }), 'Deals');
eq('term sheet', cat({ subject: 'Term sheet attached', text: 'please review', attachmentNames: ['ts.pdf'] }), 'Deals');

console.log('— portfolio beats everything —');
eq('a portfolio company asking for a call', classifyEmail({
    subject: 'Monthly update', text: 'Can we schedule a call?', senderEmail: 'ceo@strainx.com',
    fromPortfolioCompany: true,
}).category, 'Portfolio Companies');
eq('a portfolio company sending a deck', classifyEmail({
    subject: 'Our new deck', text: 'raising a Series A', senderEmail: 'ceo@strainx.com',
    attachmentNames: ['deck.pdf'], fromPortfolioCompany: true,
}).category, 'Portfolio Companies');

console.log('— calls —');
eq('calendar invitation', cat({ subject: 'Invitation: HEVA AI <> DV @ Wed Sep 2' }), 'Calls');
eq('a meeting link', cat({ subject: 'Chat', text: 'Join at https://meet.google.com/abc-defg' }), 'Calls');
eq('asking for availability', cat({ subject: 'Next steps', text: 'What is your availability on Thursday?' }), 'Calls');

console.log('— events —');
eq('a summit invitation from a person', cat({ subject: 'You are invited to the India VC Summit', text: 'RSVP here' }), 'Events');
eq('a webinar', cat({ subject: 'Webinar on AI in fintech', text: 'Register now to join the webinar' }), 'Events');

console.log('— promotions —');
eq('a no-reply sender', cat({ senderEmail: 'no-reply@startupgrind.com', subject: 'Hello' }), 'Promotions');
eq('List-Unsubscribe makes it bulk', classifyEmail({
    subject: 'Our monthly roundup', text: 'news', senderEmail: 'hello@realperson.com', hasUnsubscribeHeader: true,
}).category, 'Promotions');
eq('the booths blast', cat({ senderEmail: 'events@startupgrind.com', subject: 'LAST CALL: Only 10 startup booths left' }), 'Promotions');
eq('an event blast from a mailing list is a promotion, not an event', classifyEmail({
    subject: 'You are invited to our summit', text: 'register now', senderEmail: 'no-reply@conf.com',
}).category, 'Promotions');
eq('a deck from a bulk sender is STILL a deal', classifyEmail({
    subject: 'deck', text: 'raising', senderEmail: 'no-reply@x.com', attachmentNames: ['d.pdf'],
}).category, 'Deals');

console.log('— nothing matched —');
eq('a plain note', cat({ subject: 'Hi', text: 'Thanks for your time yesterday.' }), 'Other');

console.log('— waiting for a reply —');
const now = new Date('2026-10-10T00:00:00Z');
const msgs = [
    { id: 'a1', threadId: 't1', direction: 'received', receivedAt: '2026-10-09T00:00:00Z' },
    { id: 'a2', threadId: 't2', direction: 'received', receivedAt: '2026-10-05T00:00:00Z' },
    { id: 'a3', threadId: 't2', direction: 'sent', receivedAt: '2026-10-06T00:00:00Z' },
    { id: 'a4', threadId: 't3', direction: 'received', receivedAt: '2026-10-01T00:00:00Z' },
    { id: 'a5', threadId: 't3', direction: 'sent', receivedAt: '2026-10-02T00:00:00Z' },
    { id: 'a6', threadId: 't3', direction: 'received', receivedAt: '2026-10-04T00:00:00Z' },
];
const state = awaitingReply(msgs, now);
eq('unanswered, one day old', state.get('a1'), { replied: false, daysWaiting: 1 });
eq('answered after it arrived', state.get('a2')?.replied, true);
eq('a follow-up after our reply is waiting again', state.get('a6'), { replied: false, daysWaiting: 6 });
eq('the earlier message in that thread was answered', state.get('a4')?.replied, true);
eq('sent mail is not tracked', state.has('a3'), false);

console.log('— colour grading —');
eq('threshold is three days', REPLY_THRESHOLD_DAYS, 3);
eq('today is neutral', replyState(0, false).urgency, 'fresh');
eq('one day is neutral', replyState(1, false).urgency, 'fresh');
eq('two days is due', replyState(2, false).urgency, 'due');
eq('three days is overdue', replyState(3, false).urgency, 'overdue');
eq('nine days is overdue', replyState(9, false).urgency, 'overdue');
eq('replied beats any age', replyState(30, true).urgency, 'replied');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
