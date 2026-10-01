import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { callGeminiMultimodal } from '@/lib/gemini';
import { matchCompany } from '@/lib/email-company';
import { classifyEmail } from '@/lib/email-triage';
import { DRAFT_FORMAT, parseDraft } from '@/lib/reply-draft';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

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

    const classification = classifyEmail({
        subject, text: emailBody, senderEmail,
        attachmentNames: Array.isArray(body.attachmentNames) ? body.attachmentNames : [],
    });

    const prompt = `You are drafting a reply on behalf of Dholakia Ventures, an Indian venture capital firm, to an email they received. The reply will be read and sent by a partner at the firm, so write it as them.

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
- No subject line, no "Dear Sir/Madam", no signature block — the sender's name is added automatically.
- If the email does not deserve a reply (a newsletter, a blast), say so instead of writing one.

${DRAFT_FORMAT}`;

    try {
        const raw = await callGeminiMultimodal([{ text: prompt }], {
            temperature: 0.4, maxOutputTokens: 1200, label: 'draft-reply',
        });
        const draft = parseDraft(raw);
        return NextResponse.json({
            shouldReply: !draft.skip && !!draft.reply,
            reply: draft.reply,
            note: draft.note,
            category: classification.category,
            companyId,
        });
    } catch (err) {
        // Only a failed call reaches here now; reading the answer back cannot
        // throw, so a draft is never lost to its own formatting.
        return NextResponse.json({
            error: `Could not draft a reply: ${(err as Error).message}`,
        }, { status: 502 });
    }
}
