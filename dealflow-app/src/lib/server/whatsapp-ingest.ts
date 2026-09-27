import type { SupabaseClient } from '@supabase/supabase-js';
import { callGeminiMultimodal, type GeminiPart } from '@/lib/gemini';
import { companyNameFromDeckFilename, matchCompany } from '@/lib/email-company';
import { isHelpCommand, WHATSAPP_HELP, type InboundMessage } from '@/lib/whatsapp';
import { downloadWhatsAppMedia, sendWhatsAppText } from './whatsapp-api';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'company-documents';
// A follow-up message ("this is StrainX, raising 5Cr") belongs to the deck sent
// just before it. Longer than this and it is treated as a new conversation.
const FOLLOW_UP_WINDOW_MS = 30 * 60 * 1000;
// Gemini reads PDFs and images inline; bigger files are filed but not read.
const MAX_AI_BYTES = 15 * 1024 * 1024;
const CRORE = 10_000_000;

interface Extracted {
    companyName: string | null;
    founderName: string | null;
    founderEmail: string | null;
    companyRound: string | null;
    totalFundRaise: number | null;
    valuation: number | null;
    industry: string | null;
    subIndustry: string | null;
    summary: string | null;
}

const EMPTY: Extracted = {
    companyName: null, founderName: null, founderEmail: null, companyRound: null,
    totalFundRaise: null, valuation: null, industry: null, subIndustry: null, summary: null,
};

const ROUNDS = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];

/** Reads the message text — and the deck itself when it is a PDF or image. */
async function extractStartup(text: string, filename: string | null, file: { mimeType: string; buffer: Buffer } | null): Promise<Extracted> {
    const prompt = `A venture capital team member sent this to their deal-flow bot on WhatsApp. It is about ONE startup.
${text ? `\nMessage text:\n${text.slice(0, 4000)}\n` : ''}${filename ? `\nAttached file name: ${filename}\n` : ''}${file ? '\nThe attached file (a pitch deck or similar) follows.\n' : ''}
Return ONLY a JSON object with these keys, null where unknown — never guess:
{
  "companyName": "the startup's name — not a person, not a word like Deck or Pitch",
  "founderName": "founder's full name",
  "founderEmail": "founder's email",
  "companyRound": "one of: ${ROUNDS.join(', ')}",
  "totalFundRaise": "amount being raised, in INR crores, as a number (convert USD at 83)",
  "valuation": "valuation in INR crores as a number",
  "industry": "primary sector, e.g. FinTech, HealthTech, SaaS, D2C, AI/ML",
  "subIndustry": "more specific sector",
  "summary": "one or two sentences on what the company does"
}`;
    const parts: GeminiPart[] = [{ text: prompt }];
    if (file && file.buffer.length <= MAX_AI_BYTES
        && (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/'))) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.buffer.toString('base64') } });
    }
    try {
        const raw = await callGeminiMultimodal(parts, { temperature: 0.1, maxOutputTokens: 1024, label: 'whatsapp' });
        const json = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        const numv = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
        return {
            companyName: str(json.companyName),
            founderName: str(json.founderName),
            founderEmail: str(json.founderEmail)?.includes('@') ? str(json.founderEmail) : null,
            companyRound: ROUNDS.includes(json.companyRound) ? json.companyRound : null,
            totalFundRaise: numv(json.totalFundRaise),
            valuation: numv(json.valuation),
            industry: str(json.industry),
            subIndustry: str(json.subIndustry),
            summary: str(json.summary),
        };
    } catch (err) {
        console.error('[whatsapp] extraction failed:', (err as Error).message);
        return EMPTY;
    }
}

/** Uploads to private storage, creating the bucket the first time. */
async function storeFile(db: SupabaseClient, path: string, buffer: Buffer, mimeType: string): Promise<string | null> {
    const upload = () => db.storage.from(BUCKET).upload(path, buffer, { contentType: mimeType, upsert: true });
    let { error } = await upload();
    if (error && /not found|does not exist/i.test(error.message)) {
        await db.storage.createBucket(BUCKET, { public: false });
        ({ error } = await upload());
    }
    if (error) {
        console.error('[whatsapp] upload failed:', error.message);
        return null;
    }
    return path;
}

function safeName(name: string): string {
    return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
}

function extensionFor(mimeType: string): string {
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType.includes('presentationml')) return '.pptx';
    if (mimeType.includes('powerpoint')) return '.ppt';
    if (mimeType.startsWith('image/')) return `.${mimeType.split('/')[1].split(';')[0]}`;
    return '';
}

async function saveDocumentRow(
    db: SupabaseClient, companyId: string, file: { name: string; mimeType: string; size: number; path: string | null },
    senderLabel: string, caption: string,
) {
    const { error } = await db.from('company_documents').insert({
        organization_id: ORGANIZATION_ID,
        company_id: companyId,
        file_name: file.name,
        mime_type: file.mimeType,
        size_bytes: file.size,
        is_pitch_deck: /\.(pdf|pptx?|key|odp)$/i.test(file.name),
        source: 'whatsapp',
        storage_path: file.path,
        received_at: new Date().toISOString(),
        sender_email: senderLabel,
        subject: caption.slice(0, 200) || 'Sent on WhatsApp',
    });
    if (error) console.error('[whatsapp] document row failed:', error.message);
}

async function whereIs(db: SupabaseClient, company: { terminal_status: string | null; pipeline_stage_id: string | null }) {
    if (company.terminal_status === 'Portfolio') return 'Portfolio';
    if (company.terminal_status) return company.terminal_status;
    if (!company.pipeline_stage_id) return 'Deal Flow';
    const { data } = await db.from('pipeline_stages').select('name').eq('id', company.pipeline_stage_id).maybeSingle();
    return data?.name ? `Deal Flow · ${data.name}` : 'Deal Flow';
}

/**
 * Handles one inbound WhatsApp message end to end. Every path ends in a reply,
 * so the sender always knows what happened to what they sent.
 */
export async function processWhatsAppMessage(db: SupabaseClient, m: InboundMessage): Promise<void> {
    // 1. Once only. Meta retries deliveries; the unique id recognises a retry.
    const { data: logRow, error: logErr } = await db.from('whatsapp_messages').insert({
        organization_id: ORGANIZATION_ID,
        wa_message_id: m.id,
        from_phone: m.from,
        message_type: m.rawType,
        body: m.text.slice(0, 4000),
        file_name: m.media?.filename ?? null,
    }).select('id').single();
    if (logErr) {
        if (logErr.code !== '23505') console.error('[whatsapp] log insert failed:', logErr.message);
        return;
    }
    const setStatus = (fields: Record<string, unknown>) =>
        db.from('whatsapp_messages').update(fields).eq('id', logRow.id);

    // 2. Only numbers a team member has linked in Settings.
    const { data: sender } = await db.from('whatsapp_senders').select('user_id').eq('phone', m.from).maybeSingle();
    if (!sender) {
        await setStatus({ status: 'unregistered' });
        await sendWhatsAppText(m.from, 'This number is not linked to a Dholakia Ventures account. Add it under Settings → WhatsApp on the platform, then send this again.');
        return;
    }
    const userId: string = sender.user_id;
    await setStatus({ user_id: userId });

    if (m.kind === 'unsupported') {
        await setStatus({ status: 'ignored' });
        await sendWhatsAppText(m.from, 'I can read typed messages, PDFs, PowerPoints and images. Send the deck or the details as text.');
        return;
    }
    if (m.kind === 'text' && isHelpCommand(m.text)) {
        await setStatus({ status: 'ignored' });
        await sendWhatsAppText(m.from, WHATSAPP_HELP);
        return;
    }

    try {
        // 3. The file, if any — stored before anything else so it is never lost.
        let file: { name: string; mimeType: string; size: number; buffer: Buffer; path: string | null } | null = null;
        if (m.media) {
            const dl = await downloadWhatsAppMedia(m.media.id);
            const name = safeName(m.media.filename || `WhatsApp ${m.kind} ${new Date().toISOString().slice(0, 10)}${extensionFor(dl.mimeType)}`);
            const path = await storeFile(db, `whatsapp/${new Date().toISOString().slice(0, 7)}/${m.id}-${name}`, dl.buffer, dl.mimeType);
            file = { name, mimeType: dl.mimeType, size: dl.size, buffer: dl.buffer, path };
        }

        // 4. What company is this?
        const ai = await extractStartup(m.text, file?.name ?? null, file);
        const companyName = ai.companyName || (file ? companyNameFromDeckFilename(file.name) : null);

        const { data: profile } = await db.from('profiles').select('id, name').eq('id', userId).maybeSingle();
        const senderLabel = `WhatsApp · ${profile?.name || m.profileName || `+${m.from}`}`;

        // 5. No name: a follow-up to the last thing this person sent, or ask.
        if (!companyName) {
            // The most recent thing this person sent that either belongs to a
            // company or is itself waiting for a name. If that is a waiting
            // file, this message is not about the older company before it.
            const since = new Date(Date.now() - FOLLOW_UP_WINDOW_MS).toISOString();
            const { data: recent } = await db.from('whatsapp_messages')
                .select('company_id, status').eq('from_phone', m.from)
                .or('company_id.not.is.null,status.eq.awaiting_name')
                .gte('created_at', since).neq('id', logRow.id)
                .order('created_at', { ascending: false }).limit(1).maybeSingle();
            const { data: company } = recent?.company_id && recent.status !== 'awaiting_name'
                ? await db.from('companies').select('id, company_name').eq('id', recent.company_id).maybeSingle()
                : { data: null };
            // A company deleted since then falls through to asking for the name.
            if (company) {
                if (file) await saveDocumentRow(db, company.id, file, senderLabel, m.text);
                if (m.text) {
                    await db.from('activity_logs').insert({
                        company_id: company.id, user_id: userId, action: 'whatsapp_note',
                        details: `WhatsApp from ${senderLabel.replace('WhatsApp · ', '')}: ${m.text.slice(0, 1000)}`,
                    });
                }
                await setStatus({ status: 'attached', company_id: company.id });
                await sendWhatsAppText(m.from, `📎 Added to *${company.company_name}*${file ? ` — ${file.name} saved` : ''}.`);
                return;
            }
            await setStatus({ status: 'awaiting_name', storage_path: file?.path ?? null });
            await sendWhatsAppText(m.from, file
                ? `Got the file, but I can't tell which company it is. Reply with the company name and I'll file it.`
                : `I couldn't find a company name in that. Send the company name (and the deck if you have it).`);
            return;
        }

        // 6. Files sent just before, waiting for a name? This is it — collect
        // every one, so two decks followed by the name are both filed.
        const since = new Date(Date.now() - FOLLOW_UP_WINDOW_MS).toISOString();
        const { data: waitingRows } = await db.from('whatsapp_messages')
            .select('id, file_name, storage_path').eq('from_phone', m.from).eq('status', 'awaiting_name')
            .gte('created_at', since).order('created_at', { ascending: true });
        const waiting = (waitingRows || []) as { id: string; file_name: string | null; storage_path: string | null }[];

        // 7. Existing company (any spelling) or a new one.
        const { data: companyRows } = await db.from('companies')
            .select('id, company_name, founder_email, terminal_status, pipeline_stage_id')
            .eq('organization_id', ORGANIZATION_ID);
        const match = matchCompany(companyRows || [], {
            companyName, senderEmail: ai.founderEmail || '', senderName: m.profileName || '',
        });

        let companyId: string;
        let created = false;
        if (match) {
            companyId = match.id;
        } else {
            const { data: stages } = await db.from('pipeline_stages')
                .select('id').eq('organization_id', ORGANIZATION_ID).order('order', { ascending: true }).limit(1);
            const firstStageId = stages?.[0]?.id;
            if (!firstStageId) throw new Error('no pipeline stages are configured');

            let industryId: string | null = null;
            if (ai.industry) {
                const { data: ind } = await db.from('industries')
                    .select('id').eq('organization_id', ORGANIZATION_ID).ilike('name', ai.industry).limit(1);
                industryId = ind?.[0]?.id ?? null;
            }
            const hasDeck = !!file && /\.(pdf|pptx?|key|odp)$/i.test(file.name);
            const insert: Record<string, unknown> = {
                organization_id: ORGANIZATION_ID,
                company_name: companyName,
                founder_name: ai.founderName || '',
                founder_email: ai.founderEmail || '',
                pipeline_stage_id: firstStageId,
                priority_level: 'Medium',
                company_round: ai.companyRound || 'Seed',
                deal_source_type: 'Founder Network',
                share_type: 'Primary',
                needs_review: true,
                ingestion_source: 'whatsapp',
                custom_tags: hasDeck || waiting.length > 0 ? ['whatsapp-ingested', 'has-pitch-deck'] : ['whatsapp-ingested'],
                sub_industry: ai.subIndustry || '',
                quick_summary: m.text ? `[WhatsApp]\n${m.text.slice(0, 4000)}` : (ai.summary || ''),
            };
            if (industryId) insert.industry_id = industryId;
            // analyst_id references profiles, whose id can differ from the auth
            // id for hand-made profiles — only set it when they agree.
            if (profile?.id) insert.analyst_id = profile.id;
            if (ai.totalFundRaise != null) insert.total_fund_raise = Math.round(ai.totalFundRaise * CRORE);
            if (ai.valuation != null) insert.valuation = Math.round(ai.valuation * CRORE);

            const { data: newCompany, error } = await db.from('companies').insert(insert).select('id').single();
            if (error || !newCompany) throw new Error(error?.message || 'company insert failed');
            companyId = newCompany.id;
            created = true;

            await db.from('activity_logs').insert({
                company_id: companyId, user_id: userId, action: 'created',
                details: `Added from WhatsApp by ${senderLabel.replace('WhatsApp · ', '')}. AI: ${ai.summary || 'N/A'}`,
            });
            const { data: others } = await db.from('profiles').select('id')
                .eq('organization_id', ORGANIZATION_ID).neq('id', userId);
            if (others?.length) {
                await db.from('notifications').insert(others.map((p: { id: string }) => ({
                    user_id: p.id, type: 'new_company', title: 'WhatsApp',
                    message: `${companyName} added from WhatsApp (needs review)`, company_id: companyId,
                })));
            }
        }

        if (file) await saveDocumentRow(db, companyId, file, senderLabel, m.text);
        for (const w of waiting) {
            if (w.storage_path) {
                const pendingName = w.file_name || w.storage_path.split('/').pop() || 'WhatsApp file';
                await saveDocumentRow(db, companyId, {
                    name: pendingName, mimeType: /\.pdf$/i.test(pendingName) ? 'application/pdf' : 'application/octet-stream',
                    size: 0, path: w.storage_path,
                }, senderLabel, '');
            }
            await db.from('whatsapp_messages').update({ status: 'attached', company_id: companyId }).eq('id', w.id);
        }
        if (!created && m.text) {
            await db.from('activity_logs').insert({
                company_id: companyId, user_id: userId, action: 'whatsapp_note',
                details: `WhatsApp from ${senderLabel.replace('WhatsApp · ', '')}: ${m.text.slice(0, 1000)}`,
            });
        }
        await setStatus({ status: created ? 'created' : 'attached', company_id: companyId });

        // 8. Tell them what happened.
        const row = (companyRows || []).find((c: { id: string }) => c.id === companyId);
        const filed = [file?.name, ...waiting.map(w => w.file_name)].filter(Boolean).join(', ');
        if (created) {
            await sendWhatsAppText(m.from, [
                `✅ Added *${companyName}* to Deal Flow (needs review).`,
                ai.companyRound || ai.totalFundRaise ? `${[ai.companyRound, ai.totalFundRaise ? `raising ₹${ai.totalFundRaise} Cr` : null].filter(Boolean).join(', ')}` : null,
                filed ? `📎 ${filed} saved to the company.` : null,
            ].filter(Boolean).join('\n'));
        } else {
            const where = row ? await whereIs(db, row) : 'the platform';
            await sendWhatsAppText(m.from,
                `📎 *${match!.company_name}* is already on the platform (${where}) — filed this there instead of creating a duplicate.${filed ? `\n${filed} saved.` : ''}`);
        }
    } catch (err) {
        const msg = (err as Error).message;
        console.error('[whatsapp] processing failed:', msg);
        await setStatus({ status: 'error', error_message: msg.slice(0, 500) });
        await sendWhatsAppText(m.from, `Sorry — that didn't go through (${msg.slice(0, 120)}). Please try again.`);
    }
}
