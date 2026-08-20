import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Allowed tables — prevents arbitrary table access
const ALLOWED_TABLES = new Set([
    'companies', 'pipeline_stages', 'industries', 'deal_source_names',
    'rejection_reason_categories', 'rejection_sub_reasons', 'rejection_records',
    'comments', 'activity_logs', 'notifications', 'saved_views', 'email_logs',
    'profiles', 'ingested_emails', 'company_scores', 'company_feedback', 'audit_logs', 'booking_tokens',
    'portfolio_follow_ons', 'company_notes',
]);

type Operation = 'select' | 'insert' | 'update' | 'delete';

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    // Validate auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

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

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

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
