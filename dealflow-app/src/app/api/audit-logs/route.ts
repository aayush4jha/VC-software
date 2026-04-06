import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Check admin access
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'partner'].includes(profile.role)) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '200');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Fetch audit logs with company names and user names
    const [logsRes, companiesRes, profilesRes] = await Promise.all([
        db.from('audit_logs').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        db.from('companies').select('id, company_name').eq('organization_id', ORGANIZATION_ID),
        db.from('profiles').select('id, name, role').eq('organization_id', ORGANIZATION_ID),
    ]);

    return NextResponse.json({
        logs: logsRes.data || [],
        companies: (companiesRes.data || []).reduce((m: Record<string, string>, c: { id: string; company_name: string }) => { m[c.id] = c.company_name; return m; }, {}),
        users: (profilesRes.data || []).reduce((m: Record<string, { name: string; role: string }>, p: { id: string; name: string; role: string }) => { m[p.id] = { name: p.name, role: p.role }; return m; }, {}),
    });
}
