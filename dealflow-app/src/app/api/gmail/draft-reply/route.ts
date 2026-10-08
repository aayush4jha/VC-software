import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { callGeminiMultimodal } from '@/lib/gemini';
import { matchCompany } from '@/lib/email-company';
import { classifyEmail, type EmailCategory } from '@/lib/email-triage';
import { DRAFT_FORMAT, parseDraft, looksLikeCommentary, fallbackReply } from '@/lib/reply-draft';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// Every email gets a draft, but a founder's pitch and a bank alert do not want
// the same reply. This is what changes between them.
const TONE_BY_CATEGORY: Record<EmailCategory, string> = {
    'Deals': 'An inbound pitch. Thank them, show you read the specific thing they sent, and either ask the one question that decides whether this is worth a call, or propose a call by asking for their times. Do not promise to invest, to review by a date, or to introduce anyone.',
    'Portfolio Companies': 'A company we have already backed. Warm and familiar. Answer what they asked, offer help where it is genuinely ours to offer (intros, hiring, the next round), and keep it brief.',
    'Calls': 'Someone wants time. Agree in principle and ask for their availability, or give a window to choose from — never invent a specific slot. If the purpose is unclear, ask what they would like to cover.',
    'Events': 'An invitation. Thank them, and either express interest and ask for the details that decide it (date, format, who else is attending), or decline politely without inventing a conflicting commitment.',
    'Promotions': 'Marketing, a newsletter or a cold sales approach. Keep it to two or three lines: a polite decline, or a request to be taken off the list, or a single question if the offer is genuinely relevant to a venture firm. Never enthusiastic.',
    'Other': 'Acknowledge what they wrote, answer anything directly asked, and ask what they need from us if it is unclear. Short and courteous.',
};

export const maxDuration = 60;

/**
 * Drafts the reply a founder's email is owed, so the person only has to read it
 * and send. Written in the first person for Dholakia Ventures, grounded in what
 * the email actually says and in what the platform already knows about that
 * company — its stage, and whether it is in the pipeline or the portfolio.
 *
 * Never sends anything. The draft is returned for a human to approve.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const subject: string = String(body.subject || '');
    const emailBody: string = String(body.emailBody || body.snippet || '');
    const senderName: string = String(body.senderName || '');
    const senderEmail: string = String(body.senderEmail || '');
    const intent: string = typeof body.intent === 'string' ? body.intent.slice(0, 400) : '';
    if (!senderEmail) return NextResponse.json({ error: 'Missing sender' }, { status: 400 });

    // The partner's own name: the reply is written as them and signed by them.
    let partnerName = '';
    try {
        const url0 = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key0 = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url0 && key0) {
            const db0 = createServiceClient(url0, key0);
            const { data: me } = await db0.from('profiles').select('name').eq('id', auth.actor.userId).maybeSingle();
            partnerName = (me?.name || '').trim().split(/\s+/)[0] || '';
        }
        if (!partnerName && auth.actor.email) {
            // No name on the profile: the address's own local part is still
            // closer to a signature than nothing at all.
            const local = auth.actor.email.split('@')[0].split(/[._-]/)[0];
            partnerName = local ? local[0].toUpperCase() + local.slice(1) : '';
        }
    } catch { /* an unsigned draft is still a draft */ }

    // What we already know about them changes what a sensible reply says.
    let context = '';
    let companyId: string | null = null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
        try {
            const db = createServiceClient(url, key);
            const { data: companies } = await db.from('companies')
                .select('id, company_name, founder_email, terminal_status, company_round, pipeline_stage_id, quick_summary')
                .eq('organization_id', ORGANIZATION_ID);
            const match = matchCompany(companies || [], {
                companyName: String(body.derivedCompanyName || ''),
                senderEmail,
                senderName,
            });
            if (match) {
                const c = (companies || []).find(x => x.id === match.id);
                companyId = match.id;
                context = `This sender is already on our platform as "${c?.company_name}"`
                    + (c?.terminal_status === 'Portfolio' ? ', a PORTFOLIO company we have invested in.'
                        : ` — currently in our deal pipeline at the ${c?.company_round || 'early'} stage.`);
            }
        } catch { /* a reply without context is still a reply */ }
    }

    // The tone table is keyed by category, so it is read after classifying.
    const classification = classifyEmail({
        subject, text: emailBody, senderEmail,
        attachmentNames: Array.isArray(body.attachmentNames) ? body.attachmentNames : [],
    });

    const senderFirst = (senderName || '').trim().split(/\s+/)[0] || '';

    const prompt = `Write the REPLY ${partnerName || 'a partner'} at Dholakia Ventures will send to the email below.

You are not describing the email, deciding whether it deserves an answer, or explaining anything. You are writing the words that will be sent. Output nothing but those words.

Write in the first person, as ${partnerName || 'the partner'} — "I", not "we at Dholakia Ventures" unless the firm is genuinely the actor. It must read as if a person typed it in thirty seconds: no analysis, no preamble such as "Here is a draft", no square-bracket placeholders, no mention of being an assistant.

THE EMAIL THEY RECEIVED
From: ${senderName} <${senderEmail}>
Subject: ${subject}
Body:
${emailBody.slice(0, 5000)}

WHAT WE KNOW
${context || 'This sender is not yet on our platform — treat this as an inbound approach.'}
This email looks like: ${classification.category} (${classification.reason}).
${intent ? `\nTHE PARTNER WANTS THE REPLY TO: ${intent}\n` : ''}
HOW TO WRITE IT
- Warm, direct, and short — four to eight lines. Indian business English, no flourish.
- Answer what they actually asked. If they asked for a call, respond to that; if they sent a deck, acknowledge it specifically.
- Reference one concrete detail from their email so it is plainly not a form letter.
- Never invent a decision, a number, a date or a commitment we have not made. If a next step needs a date, ask them for times rather than inventing one.
- Open with "Hi ${senderFirst || 'there'}," and close with "Best," on its own line then "${partnerName || ''}".
- No subject line, no "Dear Sir/Madam", no bracketed blanks to fill in.
- Write a reply for EVERY email. There is always a sensible one, even if it is a two-line decline.

WHAT A GOOD REPLY LOOKS LIKE FOR THIS KIND OF EMAIL
${TONE_BY_CATEGORY[classification.category]}

${DRAFT_FORMAT}`;

    const attempt = async (extra: string) => parseDraft(await callGeminiMultimodal(
        [{ text: extra ? `${prompt}\n\n${extra}` : prompt }],
        // A reply plus its note. 900 cut longer ones off mid-sentence.
        { temperature: 0.4, maxOutputTokens: 2400, label: 'draft-reply' },
    ));

    try {
        let draft = await attempt('');
        if (!draft.reply || looksLikeCommentary(draft.reply)) {
            // It described the email instead of answering it. Say so plainly
            // and ask again; models comply when told exactly what went wrong.
            draft = await attempt(
                'Your previous answer described the email instead of replying to it. Do not do that. '
                + `Output only the message body, starting with "Hi ${senderFirst || 'there'}," and ending with "Best,".`,
            );
        }
        if (!draft.reply || looksLikeCommentary(draft.reply)) {
            // Still unusable: a plain template beats commentary in a send box.
            draft = {
                reply: fallbackReply(classification.category, senderFirst, partnerName),
                note: 'Written from a template — the draft came back unusable, so edit before sending.',
                skip: false,
            };
        }
        // A no-reply sender is worth flagging, but the draft is still written:
        // it is often forwarded elsewhere or sent to a real address on the thread.
        const noReplyAddress = /no-?reply|donotreply|notifications?@/i.test(senderEmail);
        return NextResponse.json({
            shouldReply: true,
            reply: draft.reply,
            note: [
                draft.note,
                noReplyAddress ? 'This came from a no-reply address, so it may bounce.' : '',
            ].filter(Boolean).join(' '),
            category: classification.category,
            companyId,
        });
    } catch (err) {
        // The model could not be reached at all. Hand over the template rather
        // than an error: the partner still has something to send.
        console.error('[draft-reply]', (err as Error).message);
        return NextResponse.json({
            shouldReply: true,
            reply: fallbackReply(classification.category, senderFirst, partnerName),
            note: 'Written from a template — the drafting service could not be reached.',
            category: classification.category,
            companyId,
        });
    }
}
