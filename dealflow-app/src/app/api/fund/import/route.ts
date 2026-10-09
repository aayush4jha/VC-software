import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { LEDGER_CATEGORIES } from '@/lib/fund-ledger';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const MAX_ROWS = 20000;

// A year of statements across several accounts is a lot of inserts.
export const maxDuration = 300;

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

const VALID_CATEGORY = new Set<string>(LEDGER_CATEGORIES);

interface IncomingRow {
    entity: string; bank: string; accountLabel: string; date: string | null; description: string;
    amount: number; currency: string; amountInr: number | null;
    balanceAfter: number | null; category: string; categoryReason: string;
    majorHead: string; issues: string[]; sourceRow: number; sheetName: string;
    companyName?: string;
}

interface IncomingAdjustment {
    date: string | null; entity: string; category: string; amount: number;
    currency: string; reason: string; approvedBy: string; remarks: string;
}

/**
 * POST — the parsed master file.
 *
 * The browser does the reading: a workbook is megabytes, the request body is
 * capped well below that, and the parser is the same pure module the tests
 * cover. What arrives here is already normalised rows, so this route's job is
 * to validate them, resolve the accounts they belong to, and insert them
 * exactly once.
 *
 * Idempotent by `import_key`. Uploading the same file twice must not double
 * the fund position, which is the worst failure this page can have.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const body = await request.json();
    const fileName = String(body.fileName || 'upload.xlsx');
    const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : [];
    const adjustments: IncomingAdjustment[] = Array.isArray(body.adjustments) ? body.adjustments : [];
    const sheetSummary = body.sheetSummary && typeof body.sheetSummary === 'object' ? body.sheetSummary : {};

    if (rows.length === 0 && adjustments.length === 0) {
        return NextResponse.json({ error: 'Nothing to import from that file.' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
        return NextResponse.json({
            error: `That file has ${rows.length} transactions; ${MAX_ROWS} is the most that can go in one upload.`,
        }, { status: 400 });
    }

    // Accounts named by the file but not on record are created, so a new bank
    // does not have to be set up by hand before its statement can be read.
    const { data: existingAccounts, error: accErr } = await client
        .from('fund_accounts').select('*').eq('organization_id', ORGANIZATION_ID);
    if (accErr) {
        if (/relation .* does not exist|schema cache/i.test(accErr.message)) {
            return NextResponse.json({
                needsMigration: true,
                error: 'The fund ledger needs supabase/legal-fund-master.sql applied in the Supabase SQL editor.',
            });
        }
        return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    const accountKey = (entity: string, bank: string, account: string) =>
        `${entity.trim().toLowerCase()}::${bank.trim().toLowerCase()}::${account.trim().toLowerCase()}`;
    const accountIds = new Map<string, string>();
    for (const a of existingAccounts || []) accountIds.set(accountKey(a.entity, a.bank, a.account_label || ''), a.id);

    const needed = new Map<string, { entity: string; bank: string; accountLabel: string; currency: string }>();
    for (const r of rows) {
        const key = accountKey(r.entity || '', r.bank || '', r.accountLabel || '');
        if (!r.entity?.trim() || accountIds.has(key) || needed.has(key)) continue;
        needed.set(key, {
            entity: r.entity.trim(), bank: (r.bank || '').trim(),
            accountLabel: (r.accountLabel || '').trim(), currency: r.currency || 'INR',
        });
    }
    if (needed.size > 0) {
        const { data: created, error } = await client.from('fund_accounts').insert(
            [...needed.values()].map(a => ({
                organization_id: ORGANIZATION_ID,
                entity: a.entity,
                bank: a.bank,
                account_label: a.accountLabel,
                country: /fz|llc|dubai|uae/i.test(a.entity) || a.currency === 'AED' ? 'UAE' : 'India',
                currency: a.currency,
            })),
        ).select();
        if (error) return NextResponse.json({ error: `Could not record the accounts: ${error.message}` }, { status: 500 });
        for (const a of created || []) accountIds.set(accountKey(a.entity, a.bank, a.account_label || ''), a.id);
    }

    const toInsert = rows.map(r => ({
        organization_id: ORGANIZATION_ID,
        account_id: accountIds.get(accountKey(r.entity || '', r.bank || '', r.accountLabel || '')) || null,
        entity: (r.entity || '').trim(),
        bank: (r.bank || '').trim(),
        txn_date: r.date,
        description: (r.description || '').slice(0, 500),
        amount: Number(r.amount) || 0,
        currency: (r.currency || 'INR').toUpperCase().slice(0, 8),
        amount_inr: r.amountInr === null || r.amountInr === undefined ? null : Number(r.amountInr),
        balance_after: r.balanceAfter === null || r.balanceAfter === undefined ? null : Number(r.balanceAfter),
        category: VALID_CATEGORY.has(r.category) ? r.category : 'unclassified',
        category_source: (r.categoryReason || 'rule').slice(0, 200),
        major_head: (r.majorHead || '').slice(0, 120),
        counterparty: (r.companyName || '').slice(0, 160),
        data_issues: Array.isArray(r.issues) ? r.issues.slice(0, 10) : [],
        source_file: fileName.slice(0, 200),
        source_sheet: (r.sheetName || '').slice(0, 120),
        source_row: r.sourceRow ?? null,
        import_key: `${fileName}::${r.sheetName}::${r.sourceRow}::${Math.abs(Number(r.amount) || 0)}`,
        imported_by: auth.actor.userId,
    }));

    // In chunks: one statement with twenty thousand rows is refused.
    let imported = 0;
    let duplicates = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        const { data, error } = await client.from('fund_transactions')
            // Already-seen rows are left exactly as they are rather than
            // overwritten: a re-upload must change nothing.
            .upsert(chunk, { onConflict: 'organization_id,import_key', ignoreDuplicates: true })
            .select('id');
        if (error) return NextResponse.json({ error: `Import failed partway: ${error.message}` }, { status: 500 });
        imported += (data || []).length;
        duplicates += chunk.length - (data || []).length;
    }

    let adjustmentsSaved = 0;
    if (adjustments.length > 0) {
        const { data, error } = await client.from('fund_adjustments').insert(
            adjustments.map(a => ({
                organization_id: ORGANIZATION_ID,
                adj_date: a.date,
                entity: (a.entity || '').trim(),
                category: (a.category || 'adjustment').slice(0, 60),
                amount: Number(a.amount) || 0,
                currency: (a.currency || 'INR').toUpperCase().slice(0, 8),
                amount_inr: (a.currency || 'INR') === 'INR' ? Number(a.amount) || 0 : null,
                reason: a.reason.slice(0, 500),
                approved_by: (a.approvedBy || '').slice(0, 120),
                remarks: (a.remarks || '').slice(0, 500),
                created_by: auth.actor.userId,
            })),
        ).select('id');
        if (error) return NextResponse.json({ error: `Transactions imported, but the adjustments failed: ${error.message}` }, { status: 500 });
        adjustmentsSaved = (data || []).length;
    }

    const flagged = rows.filter(r => (r.issues || []).length > 0).length;
    await client.from('fund_imports').insert({
        organization_id: ORGANIZATION_ID,
        file_name: fileName.slice(0, 200),
        sheet_summary: sheetSummary,
        rows_imported: imported,
        rows_skipped: duplicates,
        rows_flagged: flagged,
        imported_by: auth.actor.userId,
    });

    return NextResponse.json({
        imported, duplicates, flagged, adjustments: adjustmentsSaved,
        note: duplicates > 0
            ? `${duplicates} row${duplicates === 1 ? ' was' : 's were'} already imported and left untouched.`
            : null,
    });
}
