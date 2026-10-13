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
    dashboardHead?: string; acName?: string; financialYear?: string;
    amount: number; currency: string; amountInr: number | null;
    balanceAfter: number | null; category: string; categoryReason: string;
    majorHead: string; issues: string[]; sourceRow: number; sheetName: string;
    companyName?: string;
}

interface PortfolioIncoming {
    kind: 'investment' | 'exit';
    financialYear: string; fundType?: string; investedFrom?: string; company: string;
    status?: string; stage?: string; investedOn?: string | null; amount: number;
    soldOn?: string | null; consideration?: number | null; exitKind?: string;
    currentValue?: number | null; postMoney?: number | null; equityPct?: number | null;
    multiple?: number | null; writeoffYear?: string;
    sourceSheet: string; sourceRow: number;
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
    const portfolio: PortfolioIncoming[] = Array.isArray(body.portfolio) ? body.portfolio : [];
    const dashboard = body.dashboard && typeof body.dashboard === 'object' ? body.dashboard : null;

    if (rows.length === 0 && adjustments.length === 0 && portfolio.length === 0 && !dashboard) {
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
                // The firm's UAE entities: FZ LLC, DMCC, RAK, and anything
                // holding dirhams. Getting this wrong puts a UAE balance in
                // the India card, where it reads as a figure nobody recognises.
                country: /\b(?:fz|llc|dmcc|rak|dubai|uae)\b/i.test(a.entity) || a.currency === 'AED'
                    ? 'UAE' : 'India',
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
        // Her own words, kept verbatim: the platform's category is a summary
        // of these, not a replacement for them.
        dashboard_head: (r.dashboardHead || '').slice(0, 120),
        ac_name: (r.acName || '').slice(0, 120),
        financial_year: (r.financialYear || '').slice(0, 20),
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
    // How many of those were already on record, for the message.
    const existingKeys = new Set<string>();
    {
        const keys = toInsert.map(r => r.import_key);
        for (let i = 0; i < keys.length; i += 500) {
            const { data } = await client.from('fund_transactions')
                .select('import_key').in('import_key', keys.slice(i, i + 500));
            for (const row of data || []) existingKeys.add(row.import_key as string);
        }
    }
    const duplicates = existingKeys.size;
    for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        // A row already seen is REFRESHED, not skipped. Uploading the same
        // file twice must not double the ledger — hence the key — but it must
        // be able to correct it: when the parser improves, re-uploading is the
        // only way the existing rows ever get the better reading. Skipping
        // them left 895 transactions with no entity after the fix that found
        // their entity, and every balance on the page at zero.
        const { data, error } = await client.from('fund_transactions')
            .upsert(chunk, { onConflict: 'organization_id,import_key' })
            .select('id');
        if (error) return NextResponse.json({ error: `Import failed partway: ${error.message}` }, { status: 500 });
        imported += (data || []).length;
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

    // The investment and exit sheets. Same idempotency rule as the ledger:
    // a re-upload must leave the portfolio exactly as it was.
    let portfolioSaved = 0;
    if (portfolio.length > 0) {
        const { data, error } = await client.from('fund_portfolio_rows').upsert(
            portfolio.map(p => ({
                organization_id: ORGANIZATION_ID,
                kind: p.kind,
                financial_year: (p.financialYear || '').slice(0, 20),
                fund_type: (p.fundType || '').slice(0, 40),
                invested_from: (p.investedFrom || '').slice(0, 120),
                company: (p.company || '').slice(0, 200),
                status: (p.status || '').slice(0, 60),
                stage: (p.stage || '').slice(0, 60),
                invested_on: p.investedOn || null,
                amount: Number(p.amount) || 0,
                sold_on: p.soldOn || null,
                consideration: p.consideration ?? null,
                exit_kind: p.exitKind || null,
                current_value: p.currentValue ?? null,
                post_money: p.postMoney ?? null,
                equity_pct: p.equityPct ?? null,
                multiple: p.multiple ?? null,
                writeoff_year: (p.writeoffYear || '').slice(0, 20),
                source_file: fileName.slice(0, 200),
                source_sheet: p.sourceSheet.slice(0, 120),
                source_row: p.sourceRow,
                import_key: `${fileName}::${p.sourceSheet}::${p.sourceRow}::${p.kind}`,
                imported_by: auth.actor.userId,
            })),
            { onConflict: 'organization_id,import_key', ignoreDuplicates: true },
        ).select('id');
        if (error && !/relation .* does not exist|schema cache/i.test(error.message)) {
            return NextResponse.json({ error: `Transactions imported, but the investment sheets failed: ${error.message}` }, { status: 500 });
        }
        portfolioSaved = (data || []).length;
    }

    // Sheet1's own yearly table, kept on the import record. It holds figures
    // no other sheet does — a market value for a past year, most of all — and
    // the tracker lays them over what it computes.
    const flagged = rows.filter(r => (r.issues || []).length > 0).length;
    await client.from('fund_imports').insert({
        organization_id: ORGANIZATION_ID,
        file_name: fileName.slice(0, 200),
        sheet_summary: dashboard ? { ...sheetSummary, __dashboard: dashboard } : sheetSummary,
        rows_imported: imported,
        rows_skipped: duplicates,
        rows_flagged: flagged,
        imported_by: auth.actor.userId,
    });

    return NextResponse.json({
        imported, duplicates, flagged, adjustments: adjustmentsSaved, portfolio: portfolioSaved,
        note: duplicates > 0
            ? `${duplicates} row${duplicates === 1 ? ' was' : 's were'} already on record and have been refreshed.`
            : null,
    });
}
