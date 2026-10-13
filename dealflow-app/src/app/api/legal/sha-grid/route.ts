import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { trackerUpdatesFrom, type ShaGrid } from '@/lib/sha-grid';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

const missingTable = (m: string) => /relation .* does not exist|schema cache|could not find the table/i.test(m);

const NEEDS_MIGRATION = {
    needsMigration: true,
    error: 'Storing SHA grids needs supabase/sha-grids.sql applied in the Supabase SQL editor.',
};

/** GET ?companyId= — the newest grid uploaded for that company. */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const companyId = new URL(request.url).searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const { data, error } = await client.from('company_sha_grids')
        .select('*').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(5);

    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ current: data?.[0] ?? null, history: data?.slice(1) ?? [] });
}

/**
 * PATCH { id, overrides } — corrections to a stored grid's cells.
 *
 * Kept beside the grid rather than written into it, so the sheet as uploaded
 * stays exactly as uploaded and a correction survives the same sheet being
 * uploaded again. The sheet remains the record; these are what the firm says
 * it should have said.
 */
export async function PATCH(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { id, overrides } = await request.json();
    if (!id || typeof overrides !== 'object' || overrides === null) {
        return NextResponse.json({ error: 'id and overrides are required' }, { status: 400 });
    }
    const trimmed = Object.fromEntries(
        Object.entries(overrides as Record<string, unknown>)
            .slice(0, 2000)
            .map(([k, v]) => [k.slice(0, 300), String(v ?? '').slice(0, 2000)]),
    );

    const { data, error } = await client.from('company_sha_grids')
        .update({ overrides: trimmed }).eq('id', id).select().single();
    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ grid: data });
}

/**
 * POST { companyId, grid, fileName, sheetName } — store a parsed grid.
 *
 * The grid is stored whole and the tracker is updated from it in the same
 * request, so the counts on the Legal page reflect the sheet that was just
 * uploaded. The tracker write cannot fail the upload: the grid IS the record,
 * and losing it because an index could not be rebuilt would be the wrong way
 * round.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const body = await request.json();
    const companyId = String(body.companyId || '');
    const grid = body.grid as ShaGrid | undefined;
    if (!companyId || !grid || !Array.isArray(grid.rights)) {
        return NextResponse.json({ error: 'companyId and a parsed grid are required' }, { status: 400 });
    }

    const { data: stored, error } = await client.from('company_sha_grids').insert({
        organization_id: ORGANIZATION_ID,
        company_id: companyId,
        grid,
        sheet_name: String(body.sheetName || '').slice(0, 160),
        file_name: String(body.fileName || '').slice(0, 200),
        rights_count: grid.rights.length,
        column_count: grid.columns?.length ?? 0,
        warnings: (grid.warnings || []).slice(0, 20),
        uploaded_by: auth.actor.userId,
    }).select().single();

    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep the tracker in step, with the history each change owes.
    const { updates, unmatched } = trackerUpdatesFrom(grid);
    let tracked = 0;
    const trackerProblems: string[] = [];

    for (const u of updates) {
        try {
            const { data: existing } = await client.from('investor_rights').select('*')
                .eq('company_id', companyId).eq('right_key', u.rightKey).maybeSingle();

            if (existing) {
                await client.from('investor_rights_history').insert({
                    organization_id: ORGANIZATION_ID,
                    company_id: companyId,
                    right_key: u.rightKey,
                    status: existing.status,
                    threshold_pct: existing.threshold_pct,
                    condition_text: existing.condition_text,
                    document_ref: existing.document_ref,
                    next_action: existing.next_action,
                    changed_by: auth.actor.userId,
                });
            }

            const { error: upsertErr } = await client.from('investor_rights').upsert({
                organization_id: ORGANIZATION_ID,
                company_id: companyId,
                right_key: u.rightKey,
                status: u.status,
                threshold_pct: u.thresholdPct,
                condition_text: u.conditionText,
                document_ref: u.documentRef,
                updated_by: auth.actor.userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'company_id,right_key' });
            if (upsertErr) trackerProblems.push(`${u.rightName}: ${upsertErr.message}`);
            else tracked++;
        } catch (e) {
            trackerProblems.push(`${u.rightName}: ${(e as Error).message}`);
        }
    }

    return NextResponse.json({
        grid: stored,
        tracked,
        // Rights the sheet has and the tracker has no slot for. They are kept
        // in the grid and shown; this is only about the counts.
        unmatched,
        trackerProblems,
    });
}
