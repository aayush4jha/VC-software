// Guards the WhatsApp webhook's trust boundary and parsing.
// Run with: npm run test:whatsapp

import { createHmac } from 'crypto';
import { verifyWebhookSignature, normalizePhone, isValidPhone, parseWebhookMessages, isHelpCommand }
    from '../.whatsapp-test/whatsapp.mjs';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (ok) pass++;
    else { fail++; console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

console.log('— signature (the only defence against forged messages) —');
const secret = 'app-secret-123';
const body = '{"entry":[{"changes":[]}]}';
const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
eq('genuine signature accepted', verifyWebhookSignature(body, sig, secret), true);
eq('tampered body rejected', verifyWebhookSignature(body.replace('[]', '[1]'), sig, secret), false);
eq('wrong secret rejected', verifyWebhookSignature(body, sig, 'other-secret'), false);
eq('missing header rejected', verifyWebhookSignature(body, null, secret), false);
eq('missing secret rejected (fail closed)', verifyWebhookSignature(body, sig, ''), false);
eq('sha1 header rejected', verifyWebhookSignature(body, sig.replace('sha256=', 'sha1='), secret), false);
eq('garbage hex rejected without throwing', verifyWebhookSignature(body, 'sha256=zz' + 'a'.repeat(62), secret), false);
eq('short signature rejected without throwing', verifyWebhookSignature(body, 'sha256=abcd', secret), false);

console.log('— phone numbers —');
eq('10-digit Indian mobile gets 91', normalizePhone('98765 43210'), '919876543210');
eq('+91 with spaces', normalizePhone('+91 98765-43210'), '919876543210');
eq('leading 0 trunk prefix', normalizePhone('09876543210'), '919876543210');
eq('00 international prefix', normalizePhone('00971501234567'), '971501234567');
eq('foreign number kept', normalizePhone('+971 50 123 4567'), '971501234567');
eq('landline-looking 10 digits not rewritten', normalizePhone('2212345678'), '2212345678');
eq('valid', isValidPhone('919876543210'), true);
eq('too short invalid', isValidPhone('12345'), false);

console.log('— webhook payloads —');
const payload = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '919876543210', profile: { name: 'Aayush' } }],
    messages: [
        { id: 'm1', from: '919876543210', timestamp: '1760000000', type: 'text', text: { body: 'StrainX raising 5Cr' } },
        { id: 'm2', from: '919876543210', timestamp: '1760000001', type: 'document',
          document: { id: 'media1', mime_type: 'application/pdf', filename: 'StrainX_Deck.pdf', caption: 'deck' } },
        { id: 'm3', from: '919876543210', timestamp: '1760000002', type: 'image', image: { id: 'media2', mime_type: 'image/jpeg' } },
        { id: 'm4', from: '919876543210', timestamp: '1760000003', type: 'audio', audio: { id: 'x' } },
    ],
} }] }] };
const msgs = parseWebhookMessages(payload);
eq('all four messages parsed', msgs.map(m => m.kind), ['text', 'document', 'image', 'unsupported']);
eq('text body', msgs[0].text, 'StrainX raising 5Cr');
eq('document filename and caption', [msgs[1].media?.filename, msgs[1].text], ['StrainX_Deck.pdf', 'deck']);
eq('profile name attached', msgs[0].profileName, 'Aayush');
eq('delivery receipts yield nothing', parseWebhookMessages({ entry: [{ changes: [{ value: { statuses: [{ id: 's' }] } }] }] }), []);
eq('junk yields nothing', parseWebhookMessages(null), []);

console.log('— commands —');
eq('help', isHelpCommand(' Help! '), true);
eq('hi', isHelpCommand('hi'), true);
eq('a sentence is not a command', isHelpCommand('hi, this is StrainX'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
