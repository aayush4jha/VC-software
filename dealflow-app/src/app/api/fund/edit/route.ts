import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';
import { LEDGER_CATEGORIES } from '@/lib/fund-ledger';

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

/** What may be corrected, per table. Anything else is refused. */
const EDITABLE: Record<string, string[]> = {
    fund_transactions: [
        'txn_date', 'description', 'amount', 'amount_inr', 'currency', 'category',
        'entity', 'bank', 'major_head', 'dashboard_head', 'ac_name', 'financial_year', 'counterparty',
    ],
    fund_portfolio_rows: [
        'financial_year', 'fund_type', 'company', 'status', 'stage', 'invested_on',
        'amount', 'sold_on', 'consideration', 'current_value', 'writeoff_year', 'exit_kind',
    ],
    fund_accounts: [
        'entity', 'country', 'bank', 'account_label', 'currency',
        'opening_balance', 'stated_balance', 'stated_as_of',
    ],
};

const NUMERIC = new Set([
    'amount', 'amount_inr', 'opening_balance', 'stated_balance',
    'consideration', 'current_value',
]);
const DATES = new Set(['txn_date', 'invested_on', 'sold_on', 'stated_as_of']);

/**
 * POST { table, id, field, value } — correct one value.
 * POST { table, id, revert: true } — put back what the file said.
 *
 * The first correction to a row stores what the import produced, so the file's
 * reading is never lost and the edit can always be undone. The row is then
 * marked, and the importer leaves it alone: an edit that the next upload
 * silently reverses is worse than no edit at all.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { table, id, field, value, revert } = await request.json();
    const allowed = EDITABLE[table];
    if (!allowed) return NextResponse.json({ error: `${table} cannot be edited here.` }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: row, error: readErr } = await client.from(table).select('*').eq('id', id).maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'That row no longer exists.' }, { status: 404 });

    const tracksEdits = table !== 'fund_accounts';

    if (revert) {
        const original = (row.original || {}) as Record<string, unknown>;
        if (!tracksEdits || Object.keys(original).length === 0) {
            return NextResponse.json({ error: 'There is nothing to revert to.' }, { status: 400 });
        }
        const { data, error } = await client.from(table)
            .update({ ...original, edited: false, edited_at: null, original: null })
            .eq('id', id).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ row: data });
    }

    if (!allowed.includes(field)) {
        return NextResponse.json({ error: `${field} cannot be edited.` }, { status: 400 });
    }
    if (field === 'category' && !LEDGER_CATEGORIES.includes(value)) {
        return NextResponse.json({ error: `"${value}" is not a category.` }, { status: 400 });
    }

    let next: unknown = value;
    if (NUMERIC.has(field)) {
        if (value === '' || value === null) next = null;
        else {
            const n = Number(value);
            if (!isFinite(n)) return NextResponse.json({ error: `${field} must be a number.` }, { status: 400 });
            next = n;
        }
    } else if (DATES.has(field)) {
        next = value || null;
    }

    const patch: Record<string, unknown> = { [field]: next };
    if (tracksEdits) {
        patch.edited = true;
        patch.edited_at = new Date().toISOString();
        if (table === 'fund_transactions') patch.edited_by = auth.actor.userId;
        // Only the FIRST correction records what the file said; later ones
        // must not overwrite it, or revert would restore an earlier edit.
        if (!row.original) {
            patch.original = Object.fromEntries(allowed.map(f => [f, row[f]]));
        }
    }

    const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
}
