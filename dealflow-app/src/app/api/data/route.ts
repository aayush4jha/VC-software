import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // Fetch all data in parallel using service role (bypasses RLS)
    const [
        { data: companies, error: e1 },
        { data: stages, error: e2 },
        { data: industries, error: e3 },
        { data: sources, error: e4 },
        { data: categories, error: e5 },
        { data: subReasons, error: e6 },
        { data: notifications, error: e7 },
        { data: profiles, error: e8 },
        { data: savedViews, error: e9 },
        { data: rejectionRecords, error: e10 },
    ] = await Promise.all([
        db.from('companies').select('*').eq('organization_id', ORGANIZATION_ID).order('created_at', { ascending: false }),
        db.from('pipeline_stages').select('*').eq('organization_id', ORGANIZATION_ID).order('order'),
        db.from('industries').select('*').eq('organization_id', ORGANIZATION_ID).order('name'),
        db.from('deal_source_names').select('*').eq('organization_id', ORGANIZATION_ID).order('name'),
        db.from('rejection_reason_categories').select('*').eq('organization_id', ORGANIZATION_ID).order('name'),
        db.from('rejection_sub_reasons').select('*'),
        db.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        db.from('profiles').select('*').eq('organization_id', ORGANIZATION_ID),
        db.from('saved_views').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        db.from('rejection_records').select('*').eq('organization_id', ORGANIZATION_ID).order('created_at', { ascending: false }),
    ]);

    const errors: Record<string, unknown> = {};
    if (e1) errors.companies = e1.message;
    if (e2) errors.stages = e2.message;
    if (e3) errors.industries = e3.message;
    if (e4) errors.sources = e4.message;
    if (e5) errors.categories = e5.message;
    if (e6) errors.subReasons = e6.message;
    if (e7) errors.notifications = e7.message;
    if (e8) errors.profiles = e8.message;
    if (e9) errors.savedViews = e9.message;
    if (e10) errors.rejectionRecords = e10.message;

    if (Object.keys(errors).length > 0) {
        console.error('[/api/data] errors:', errors);
    }

    return NextResponse.json({
        companies: companies || [],
        stages: stages || [],
        industries: industries || [],
        sources: sources || [],
        categories: categories || [],
        subReasons: subReasons || [],
        notifications: notifications || [],
        profiles: profiles || [],
        savedViews: savedViews || [],
        rejectionRecords: rejectionRecords || [],
    });
}
