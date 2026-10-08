import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { LEGAL_DOCUMENT_TYPES, INVESTOR_RIGHTS } from '@/lib/legal-tracker';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

const DOC_KEYS = new Set(LEGAL_DOCUMENT_TYPES.map(d => d.key));
const RIGHT_KEYS = new Set(INVESTOR_RIGHTS.map(r => r.key));

/** The migration has not been applied yet, rather than a real failure. */
function missingTable(message: string): boolean {
    return /relation .* does not exist|schema cache|could not find the table/i.test(message);
}

const NEEDS_MIGRATION = {
    error: 'The legal tracker needs supabase/legal-fund-master.sql applied in the Supabase SQL editor.',
    needsMigration: true,
};

/**
 * GET — everything 02_Legal Page needs, in one request: the document tracker,
 * the rights tracker and the action tracker for the whole portfolio.
 *
 * The master table in section B is deliberately NOT returned. Company name,
 * entity, instrument, date, amount, status, ownership and round all live on
 * companies and are already loaded by the app; copying them here is how two
 * screens end up disagreeing about one company.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const [docs, rights, actions] = await Promise.all([
        client.from('legal_documents').select('*').eq('organization_id', ORGANIZATION_ID),
        client.from('investor_rights').select('*').eq('organization_id', ORGANIZATION_ID),
        client.from('legal_actions').select('*').eq('organization_id', ORGANIZATION_ID)
            .order('due_date', { ascending: true, nullsFirst: false }),
    ]);

    for (const r of [docs, rights, actions]) {
        if (r.error) {
            if (missingTable(r.error.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 200 });
            return NextResponse.json({ error: r.error.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        documents: docs.data || [],
        rights: rights.data || [],
        actions: actions.data || [],
    });
}

/**
 * POST — change one document row or one right row.
 *
 * "Do not overwrite old versions of documents or rights; retain version/date
 * history." The previous row is copied into its history table BEFORE the new
 * value lands, so the record of what the tracker said is never lost — not even
 * when a correction is itself a mistake.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const body = await request.json();
    const kind: string = String(body.kind || '');
    const companyId: string = String(body.companyId || '');
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    if (kind === 'document') {
        const docType = String(body.docType || '');
        if (!DOC_KEYS.has(docType)) {
            return NextResponse.json({ error: `Unknown document type "${docType}"` }, { status: 400 });
        }

        const { data: existing, error: readErr } = await client
            .from('legal_documents').select('*')
            .eq('company_id', companyId).eq('doc_type', docType).maybeSingle();
        if (readErr && missingTable(readErr.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 200 });

        if (existing) {
            // History first. If this fails the change is refused, because a
            // tracker that forgets what it used to say is worse than one that
            // occasionally will not change.
            const { error: histErr } = await client.from('legal_document_history').insert({
                organization_id: ORGANIZATION_ID,
                company_id: companyId,
                doc_type: docType,
                status: existing.status,
                doc_date: existing.doc_date,
                version: existing.version,
                link: existing.link,
                storage_path: existing.storage_path,
                remarks: existing.remarks,
                changed_by: auth.actor.userId,
            });
            if (histErr) return NextResponse.json({ error: `Could not record the previous version: ${histErr.message}` }, { status: 500 });
        }

        const row = {
            organization_id: ORGANIZATION_ID,
            company_id: companyId,
            doc_type: docType,
            status: ['received', 'pending', 'na'].includes(body.status) ? body.status : 'pending',
            doc_date: body.docDate || null,
            version: String(body.version ?? existing?.version ?? ''),
            link: String(body.link ?? existing?.link ?? ''),
            storage_path: body.storagePath ?? existing?.storage_path ?? null,
            remarks: String(body.remarks ?? existing?.remarks ?? ''),
            updated_by: auth.actor.userId,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await client.from('legal_documents')
            .upsert(row, { onConflict: 'company_id,doc_type' }).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ document: data });
    }

    if (kind === 'right') {
        const rightKey = String(body.rightKey || '');
        if (!RIGHT_KEYS.has(rightKey)) {
            return NextResponse.json({ error: `Unknown right "${rightKey}"` }, { status: 400 });
        }

        const { data: existing, error: readErr } = await client
            .from('investor_rights').select('*')
            .eq('company_id', companyId).eq('right_key', rightKey).maybeSingle();
        if (readErr && missingTable(readErr.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 200 });

        if (existing) {
            const { error: histErr } = await client.from('investor_rights_history').insert({
                organization_id: ORGANIZATION_ID,
                company_id: companyId,
                right_key: rightKey,
                status: existing.status,
                threshold_pct: existing.threshold_pct,
                condition_text: existing.condition_text,
                document_ref: existing.document_ref,
                next_action: existing.next_action,
                changed_by: auth.actor.userId,
            });
            if (histErr) return NextResponse.json({ error: `Could not record the previous version: ${histErr.message}` }, { status: 500 });
        }

        const threshold = body.thresholdPct === '' || body.thresholdPct === null || body.thresholdPct === undefined
            ? null : Number(body.thresholdPct);

        const row = {
            organization_id: ORGANIZATION_ID,
            company_id: companyId,
            right_key: rightKey,
            status: ['available', 'not_available', 'triggered', 'lost', 'unknown'].includes(body.status)
                ? body.status : 'unknown',
            threshold_pct: threshold !== null && isFinite(threshold) ? threshold : null,
            condition_text: String(body.conditionText ?? existing?.condition_text ?? ''),
            document_ref: String(body.documentRef ?? existing?.document_ref ?? ''),
            next_action: String(body.nextAction ?? existing?.next_action ?? ''),
            updated_by: auth.actor.userId,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await client.from('investor_rights')
            .upsert(row, { onConflict: 'company_id,right_key' }).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ right: data });
    }

    return NextResponse.json({ error: 'kind must be "document" or "right"' }, { status: 400 });
}
