import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden, invalidateAuthCache, type ApiActor } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';

// Allowed tables — prevents arbitrary table access
const ALLOWED_TABLES = new Set([
    'companies', 'pipeline_stages', 'industries', 'deal_source_names',
    'rejection_reason_categories', 'rejection_sub_reasons', 'rejection_records',
    'comments', 'activity_logs', 'notifications', 'saved_views', 'email_logs',
    'profiles', 'ingested_emails', 'company_scores', 'company_feedback', 'audit_logs', 'booking_tokens',
    'portfolio_follow_ons', 'company_notes', 'investment_vehicles',
    // 02_Legal Page and 01_Fund Page. The two trackers are readable here but
    // written through /api/legal/tracker, which appends to the history tables
    // first — the sheet requires old versions to be retained, and the proxy
    // has no way to do that.
    'legal_documents', 'investor_rights', 'legal_actions',
    'legal_document_history', 'investor_rights_history',
    'fund_accounts', 'fund_transactions', 'fund_adjustments', 'fund_imports',
]);

type Operation = 'select' | 'insert' | 'update' | 'delete';

// Reading a table requires holding at least one of these page permissions.
// Tables backing pages everyone uses (companies, stages, lookups) are absent
// and readable by any member; tables scoped to a single section are listed so
// a member without that section cannot pull its data straight from the proxy,
// even though the page itself is already blocked in middleware.
const TABLE_READ_PERMISSIONS: Record<string, string[]> = {
    portfolio_follow_ons: ['portfolio', 'analytics', 'legal', 'fund'],
    company_notes: ['portfolio', 'dealflow', 'analytics', 'legal'],
    email_logs: ['emails', 'dealflow'],
    ingested_emails: ['emails', 'dealflow'],
    audit_logs: ['audit-trail'],
    rejection_records: ['dealflow', 'analytics', 'pipeline-analytics'],
    legal_documents: ['legal'],
    legal_document_history: ['legal'],
    investor_rights: ['legal'],
    investor_rights_history: ['legal'],
    legal_actions: ['legal'],
    fund_accounts: ['fund'],
    fund_transactions: ['fund'],
    fund_adjustments: ['fund'],
    fund_imports: ['fund'],
};

// Tables only an admin may write to. `profiles` carries `role` and
// `permissions`, so an ordinary member who could update it could grant
// themselves the admin page — the proxy runs as service role and RLS never
// sees these statements.
const ADMIN_WRITE_TABLES = new Set(['profiles']);

// The audit trail is append-only: it exists to record what happened, so the
// proxy must not offer a way to rewrite or erase it.
const APPEND_ONLY_TABLES = new Set([
    'audit_logs', 'legal_document_history', 'investor_rights_history', 'fund_imports',
]);

// Writing these here would skip the history append, so the proxy refuses and
// names the route that does it properly. Applies to admins too: the rule is
// about keeping the record, not about who is allowed to change it.
const HISTORY_TRACKED_TABLES: Record<string, string> = {
    legal_documents: '/api/legal/tracker',
    investor_rights: '/api/legal/tracker',
};

function authorize(actor: ApiActor, table: string, operation: Operation): string | null {
    if (operation !== 'select' && HISTORY_TRACKED_TABLES[table]) {
        return `${table} keeps a version history — write it through ${HISTORY_TRACKED_TABLES[table]}.`;
    }
    if (actor.isAdmin) return null;

    if (operation === 'select') {
        const required = TABLE_READ_PERMISSIONS[table];
        if (required && !hasAnyPermission(actor, required)) {
            return `You do not have access to ${table}.`;
        }
        return null;
    }

    if (ADMIN_WRITE_TABLES.has(table)) {
        return `Only an admin can modify ${table}.`;
    }
    if (APPEND_ONLY_TABLES.has(table) && operation !== 'insert') {
        return `${table} is append-only.`;
    }

    // Writes to a section-scoped table need the same permission as reads.
    const required = TABLE_READ_PERMISSIONS[table];
    if (required && !hasAnyPermission(actor, required)) {
        return `You do not have access to ${table}.`;
    }
    return null;
}

export async function POST(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    // Verified identity + workspace membership. Previously this route trusted
    // an unverified base64 decode of the bearer token, which let anyone drive
    // the service-role client as any user id they cared to name.
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const actor = auth.actor;

    const body = await request.json();
    const { table, operation, data, match, order, filter, single, limit: queryLimit } = body as {
        table: string;
        operation: Operation;
        data?: Record<string, unknown>;
        match?: Record<string, unknown>;
        order?: { column: string; ascending?: boolean } | string;
        filter?: { column: string; op: string; value: unknown }[];
        single?: boolean;
        limit?: number;
    };

    // Normalize order: allow `order: 'column_name'` as shorthand for ascending order.
    const normalizedOrder =
        typeof order === 'string'
            ? { column: order, ascending: true }
            : order;

    if (!ALLOWED_TABLES.has(table)) {
        return NextResponse.json({ error: `Table '${table}' not allowed` }, { status: 400 });
    }

    const denial = authorize(actor, table, operation);
    if (denial) return forbidden(denial);

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // A write to `profiles` changes who can do what, so the cached membership
    // lookups have to go — otherwise a revoked permission would keep working
    // until the cache window closed.
    if (table === 'profiles' && operation !== 'select') {
        invalidateAuthCache();
    }

    try {
        if (operation === 'select') {
            let query = db.from(table).select('*');
            if (filter) {
                for (const f of filter) {
                    if (f.op === 'eq') query = query.eq(f.column, f.value);
                    else if (f.op === 'in') query = query.in(f.column, f.value as unknown[]);
                    else if (f.op === 'neq') query = query.neq(f.column, f.value);
                }
            }
            // `match` shorthand: applies eq filters for each key/value
            if (match) {
                for (const [key, val] of Object.entries(match)) {
                    query = query.eq(key, val as never);
                }
            }
            if (normalizedOrder) query = query.order(normalizedOrder.column, { ascending: normalizedOrder.ascending ?? true });
            if (queryLimit) query = query.limit(queryLimit);
            if (single) {
                const { data: result, error } = await query.single();
                if (error) return NextResponse.json({ error: error.message }, { status: 400 });
                return NextResponse.json({ data: result });
            }
            const { data: result, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ data: result });
        }

        if (operation === 'insert') {
            if (!data) return NextResponse.json({ error: 'Missing data' }, { status: 400 });
            const query = Array.isArray(data)
                ? db.from(table).insert(data).select()
                : db.from(table).insert(data).select().single();
            const { data: result, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ data: result });
        }

        if (operation === 'update') {
            if (!data || !match) return NextResponse.json({ error: 'Missing data or match' }, { status: 400 });
            let query = db.from(table).update(data);
            for (const [key, val] of Object.entries(match)) {
                query = query.eq(key, val);
            }
            const { data: result, error } = await query.select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ data: result });
        }

        if (operation === 'delete') {
            if (!match) return NextResponse.json({ error: 'Missing match' }, { status: 400 });
            let query = db.from(table).delete();
            for (const [key, val] of Object.entries(match)) {
                query = query.eq(key, val);
            }
            const { data: result, error } = await query.select();
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ data: result });
        }

        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    } catch (err) {
        console.error('[/api/db] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
