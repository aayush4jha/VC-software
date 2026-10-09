import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember } from '@/lib/api-auth';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// A ledger is tens of thousands of rows; the page reads them all to total them.
export const maxDuration = 60;

function db() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

function missingTable(message: string): boolean {
    return /relation .* does not exist|schema cache|could not find the table/i.test(message);
}

/**
 * GET — the accounts, the ledger and the adjustments behind 01_Fund Page.
 *
 * Rows are returned rather than totals. Every filter the sheet asks for —
 * financial year on either convention, entity, bank, currency, Actual or
 * Adjusted, as-of date — has to recompute the same figures from the same
 * transactions, and "both views must use the same underlying data" is only
 * true if there is one set of data and the totals are a function of it.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const client = db();
    if (!client) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const [accounts, transactions, adjustments, imports, rules, settings] = await Promise.all([
        client.from('fund_accounts').select('*').eq('organization_id', ORGANIZATION_ID).order('entity'),
        client.from('fund_transactions').select('*').eq('organization_id', ORGANIZATION_ID)
            .order('txn_date', { ascending: true, nullsFirst: false }).limit(20000),
        client.from('fund_adjustments').select('*').eq('organization_id', ORGANIZATION_ID).order('adj_date'),
        client.from('fund_imports').select('*').eq('organization_id', ORGANIZATION_ID)
            .order('created_at', { ascending: false }).limit(10),
        client.from('fund_mapping_rules').select('*').eq('organization_id', ORGANIZATION_ID)
            .order('priority', { ascending: true }),
        client.from('fund_settings').select('*').eq('organization_id', ORGANIZATION_ID).maybeSingle(),
    ]);

    for (const r of [accounts, transactions, adjustments, imports, rules, settings]) {
        if (r.error) {
            if (missingTable(r.error.message)) {
                return NextResponse.json({
                    needsMigration: true,
                    error: 'The fund ledger needs supabase/legal-fund-master.sql applied in the Supabase SQL editor.',
                });
            }
            return NextResponse.json({ error: r.error.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        accounts: accounts.data || [],
        transactions: transactions.data || [],
        adjustments: adjustments.data || [],
        imports: imports.data || [],
        rules: rules.data || [],
        settings: settings.data || null,
        // The page says so when it has hit the ceiling, rather than quietly
        // totalling a slice of the ledger.
        truncated: (transactions.data || []).length >= 20000,
    });
}
