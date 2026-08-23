import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireMember, forbidden } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    // Gate on the page permission rather than the role. Roles are free-text
    // titles here, so an ['admin', 'partner'] check denied anyone explicitly
    // granted the audit trail under a different title.
    if (!hasAnyPermission(auth.actor, ['audit-trail'])) {
        return forbidden('You do not have access to the audit trail.');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Config missing' }, { status: 500 });

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '500');

    // Fetch from BOTH activity_logs (existing data) and audit_logs (field-level, if table exists)
    const [activityRes, companiesRes, profilesRes, stagesRes] = await Promise.all([
        db.from('activity_logs')
            .select('id, company_id, user_id, action, details, from_stage_id, to_stage_id, created_at')
            .order('created_at', { ascending: false })
            .limit(limit),
        db.from('companies').select('id, company_name').eq('organization_id', ORGANIZATION_ID),
        db.from('profiles').select('id, name, role').eq('organization_id', ORGANIZATION_ID),
        db.from('pipeline_stages').select('id, name, color').eq('organization_id', ORGANIZATION_ID),
    ]);

    // Also try to fetch audit_logs if table exists
    let auditEntries: any[] = [];
    try {
        const { data } = await db.from('audit_logs')
            .select('id, company_id, user_id, action, entity, field, old_value, new_value, details, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        auditEntries = data || [];
    } catch { /* table may not exist yet */ }

    // Normalize activity_logs into audit format
    const activities = (activityRes.data || []).map((a: any) => ({
        id: a.id,
        company_id: a.company_id,
        user_id: a.user_id,
        action: a.action,
        entity: 'company',
        field: a.action === 'stage_change' ? 'pipeline_stage' : null,
        old_value: a.from_stage_id || null,
        new_value: a.to_stage_id || null,
        details: a.details || '',
        created_at: a.created_at,
        source: 'activity',
    }));

    // Merge and sort by timestamp
    const allLogs = [
        ...activities,
        ...auditEntries.map((a: any) => ({ ...a, source: 'audit' })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
     .slice(0, limit);

    // Build lookup maps
    const companyMap = (companiesRes.data || []).reduce((m: Record<string, string>, c: any) => {
        m[c.id] = c.company_name; return m;
    }, {});

    const userMap = (profilesRes.data || []).reduce((m: Record<string, { name: string; role: string }>, p: any) => {
        m[p.id] = { name: p.name, role: p.role }; return m;
    }, {});

    const stageMap = (stagesRes.data || []).reduce((m: Record<string, { name: string; color: string }>, s: any) => {
        m[s.id] = { name: s.name, color: s.color }; return m;
    }, {});

    return NextResponse.json({
        logs: allLogs,
        companies: companyMap,
        users: userMap,
        stages: stageMap,
    });
}
