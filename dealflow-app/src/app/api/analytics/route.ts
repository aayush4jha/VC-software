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

    // Fetch all data in parallel
    const [companiesRes, stagesRes, activityRes, profilesRes] = await Promise.all([
        db.from('companies').select('id, company_name, analyst_id, pipeline_stage_id, priority_level, terminal_status, created_at, industry_id, company_round').eq('organization_id', ORGANIZATION_ID),
        db.from('pipeline_stages').select('id, name, color, order').eq('organization_id', ORGANIZATION_ID).order('order'),
        db.from('activity_logs').select('id, company_id, user_id, action, details, from_stage_id, to_stage_id, created_at').order('created_at', { ascending: false }).limit(2000),
        db.from('profiles').select('id, name, email, role').eq('organization_id', ORGANIZATION_ID),
    ]);

    const companies = companiesRes.data || [];
    const stages = stagesRes.data || [];
    const activities = activityRes.data || [];
    const profiles = profilesRes.data || [];

    // ─── Pipeline Overview ───
    const activeCompanies = companies.filter(c => !c.terminal_status);
    const rejectedCompanies = companies.filter(c => c.terminal_status === 'Rejected');
    const portfolioCompanies = companies.filter(c => c.terminal_status === 'Portfolio');

    // Stage distribution
    const stageDistribution = stages.map(s => ({
        id: s.id, name: s.name, color: s.color, order: s.order,
        count: activeCompanies.filter(c => c.pipeline_stage_id === s.id).length,
    }));

    // Conversion funnel: how many companies reached each stage
    const stageMoves = activities.filter(a => a.action === 'stage_change' && a.to_stage_id);
    const stageReachCounts: Record<string, Set<string>> = {};
    for (const s of stages) stageReachCounts[s.id] = new Set();
    // Current stage counts
    for (const c of activeCompanies) {
        if (c.pipeline_stage_id && stageReachCounts[c.pipeline_stage_id]) {
            stageReachCounts[c.pipeline_stage_id].add(c.id);
        }
    }
    // Historical stage transitions
    for (const a of stageMoves) {
        if (a.to_stage_id && stageReachCounts[a.to_stage_id]) {
            stageReachCounts[a.to_stage_id].add(a.company_id);
        }
    }
    const conversionFunnel = stages.map(s => ({
        name: s.name, color: s.color,
        reached: stageReachCounts[s.id]?.size || 0,
    }));

    // ─── Time Analytics ───
    // Average time per stage (from stage_change logs)
    const stageTimeMap: Record<string, number[]> = {};
    const companyStageEntry: Record<string, Record<string, string>> = {}; // companyId -> stageId -> entryTime

    // Build entry times from activity logs (oldest first)
    const sortedActivities = [...activities].reverse();
    for (const a of sortedActivities) {
        if (a.action === 'stage_change' && a.from_stage_id && a.to_stage_id) {
            // Record when they left the from_stage
            const entryTime = companyStageEntry[a.company_id]?.[a.from_stage_id];
            if (entryTime) {
                const durationDays = (new Date(a.created_at).getTime() - new Date(entryTime).getTime()) / (1000 * 60 * 60 * 24);
                if (!stageTimeMap[a.from_stage_id]) stageTimeMap[a.from_stage_id] = [];
                stageTimeMap[a.from_stage_id].push(durationDays);
            }
            // Mark entry into the new stage
            if (!companyStageEntry[a.company_id]) companyStageEntry[a.company_id] = {};
            companyStageEntry[a.company_id][a.to_stage_id] = a.created_at;
        } else if (a.action === 'created') {
            // First stage entry
            const company = companies.find(c => c.id === a.company_id);
            if (company) {
                if (!companyStageEntry[a.company_id]) companyStageEntry[a.company_id] = {};
                companyStageEntry[a.company_id][company.pipeline_stage_id] = a.created_at;
            }
        }
    }

    const avgTimePerStage = stages.map(s => ({
        name: s.name, color: s.color,
        avgDays: stageTimeMap[s.id]?.length ? Math.round(stageTimeMap[s.id].reduce((a, b) => a + b, 0) / stageTimeMap[s.id].length * 10) / 10 : 0,
        count: stageTimeMap[s.id]?.length || 0,
    }));

    // ─── Analyst Performance ───
    const analystMetrics = profiles.map(p => {
        const assigned = companies.filter(c => c.analyst_id === p.id);
        const userActivities = activities.filter(a => a.user_id === p.id);
        const stageChanges = userActivities.filter(a => a.action === 'stage_change');
        const rejections = userActivities.filter(a => a.action === 'rejected');
        const created = userActivities.filter(a => a.action === 'created');

        return {
            id: p.id, name: p.name, role: p.role,
            totalAssigned: assigned.length,
            activeCompanies: assigned.filter(c => !c.terminal_status).length,
            stageChanges: stageChanges.length,
            rejections: rejections.length,
            companiesAdded: created.length,
            totalActions: userActivities.length,
            conversionRate: assigned.length > 0
                ? Math.round((assigned.filter(c => c.terminal_status === 'Portfolio').length / assigned.length) * 100)
                : 0,
        };
    }).sort((a, b) => b.totalActions - a.totalActions);

    // ─── Outcome Tracking ───
    const outcomeBreakdown = {
        total: companies.length,
        active: activeCompanies.length,
        rejected: rejectedCompanies.length,
        portfolio: portfolioCompanies.length,
        awaitingResponse: companies.filter(c => c.terminal_status === 'Awaiting Response').length,
        blocker: companies.filter(c => c.terminal_status === 'Blocker').length,
        nextRound: companies.filter(c => c.terminal_status === 'Next Round Analysis').length,
    };

    // ─── Pipeline Activity Over Time (last 30 days) ───
    const now = new Date();
    const dailyActivity: { date: string; added: number; moved: number; rejected: number }[] = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayActivities = activities.filter(a => a.created_at?.startsWith(dateStr));
        dailyActivity.push({
            date: dateStr,
            added: dayActivities.filter(a => a.action === 'created').length,
            moved: dayActivities.filter(a => a.action === 'stage_change').length,
            rejected: dayActivities.filter(a => a.action === 'rejected').length,
        });
    }

    // ─── Round Distribution ───
    const roundDistribution: Record<string, number> = {};
    for (const c of activeCompanies) {
        roundDistribution[c.company_round] = (roundDistribution[c.company_round] || 0) + 1;
    }

    // ─── Priority Distribution ───
    const priorityDistribution: Record<string, number> = {};
    for (const c of activeCompanies) {
        priorityDistribution[c.priority_level] = (priorityDistribution[c.priority_level] || 0) + 1;
    }

    return NextResponse.json({
        stageDistribution,
        conversionFunnel,
        avgTimePerStage,
        analystMetrics,
        outcomeBreakdown,
        dailyActivity,
        roundDistribution,
        priorityDistribution,
    });
}
