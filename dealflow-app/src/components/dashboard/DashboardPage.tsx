'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { BarChart3, AlertTriangle, ArrowRight, Users, Sparkles, PhoneCall, UserPlus, Video } from 'lucide-react';
import TopHeader from '@/components/layout/TopHeader';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';
import { useAppContext } from '@/lib/context';

interface ScheduledCall {
    id: string;
    companyId: string | null;
    companyName: string;
    attendeeName: string;
    attendeeEmail: string;
    hostName: string;
    hostEmail: string;
    eventTitle: string;
    durationMinutes: number;
    bookedSlot: string;
    meetLink: string | null;
    eventLink: string | null;
}

export default function DashboardPage() {
    const {
        setSelectedCompany, companies, pipelineStages, user, getUserById,
        getIndustryById, getStageById, getUnassignedCompanies, users, assignAnalyst,
    } = useAppContext();

    const isPartnerOrAdmin = user?.role === 'partner' || user?.role === 'admin';

    // ── Derived data ─────────────────────────────────────────────

    const activeCompanies = useMemo(
        () => companies.filter(c => !c.terminalStatus),
        [companies],
    );

    const myCompanies = useMemo(
        () => activeCompanies.filter(c => c.analystId === user?.id),
        [activeCompanies, user],
    );

    const unassigned = getUnassignedCompanies();
    const pendingReview = useMemo(() => activeCompanies.filter(c => c.needsReview), [activeCompanies]);
    const totalPipeline = activeCompanies.length;

    // Time helpers
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── 1. Intro Call companies (replaces mock "Today's Calls") ──
    // Find the 3rd pipeline stage (Intro Call) and its neighbors (2nd and 4th)
    const sortedStages = useMemo(
        () => [...pipelineStages].sort((a, b) => a.order - b.order),
        [pipelineStages],
    );

    // Upcoming scheduled calls come from booking_tokens (both the direct
    // "Create Event & Meet" path and the founder-pick-a-slot flow write
    // there). Fetched from a dedicated endpoint rather than filtering the
    // companies list so it stays correct even without the non-existent
    // companies.meet_event_date column.
    const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>([]);
    const refreshScheduledCalls = useCallback(async () => {
        try {
            const res = await fetch('/api/scheduled-calls');
            if (!res.ok) return;
            const data = await res.json();
            setScheduledCalls(data.calls || []);
        } catch {
            /* ignore — dashboard will just show empty state */
        }
    }, []);
    useEffect(() => { refreshScheduledCalls(); }, [refreshScheduledCalls]);
    // Pick up newly-scheduled calls when the user returns to this tab
    useEffect(() => {
        const onFocus = () => refreshScheduledCalls();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refreshScheduledCalls]);

    // ── 2. New Assignments (assigned to me, created in last 7 days) ──
    const newAssignments = useMemo(
        () => activeCompanies.filter(c =>
            c.analystId === user?.id && new Date(c.createdAt) >= sevenDaysAgo
        ),
        [activeCompanies, user, sevenDaysAgo],
    );

    // ── 3. Pipeline stage distribution ──
    const stageDistribution = useMemo(
        () => pipelineStages.map(s => ({
            stage: s,
            count: activeCompanies.filter(c => c.pipelineStageId === s.id).length,
        })),
        [pipelineStages, activeCompanies],
    );

    // ── 4. Overdue: analyst sees own, partner/admin sees all ──
    const overdueCompanies = useMemo(() => {
        const pool = isPartnerOrAdmin ? activeCompanies : myCompanies;
        return pool.filter(c => c.isOverdue || getDaysInPipeline(c.createdAt) > 25);
    }, [activeCompanies, myCompanies, isPartnerOrAdmin]);

    // ── 6. AI Insights: only companies with actual quickSummary ──
    const companiesWithInsights = useMemo(
        () => companies.filter(c => c.quickSummary && c.quickSummary.trim().length > 0).slice(0, 3),
        [companies],
    );

    // ── 7. Computed stats (replace hardcoded) ──
    // Active pipeline change: compare current total with how many existed > 30 days ago
    const oldCompaniesCount = useMemo(
        () => activeCompanies.filter(c => new Date(c.createdAt) < thirtyDaysAgo).length,
        [activeCompanies, thirtyDaysAgo],
    );
    const newLastMonth = totalPipeline - oldCompaniesCount;
    const pipelineChangePct = oldCompaniesCount > 0
        ? Math.round((newLastMonth / oldCompaniesCount) * 100)
        : totalPipeline > 0 ? 100 : 0;

    // My companies: how many new this week
    const myNewThisWeek = useMemo(
        () => myCompanies.filter(c => new Date(c.createdAt) >= sevenDaysAgo).length,
        [myCompanies, sevenDaysAgo],
    );

    return (
        <>
            <TopHeader title="Dashboard" subtitle={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user?.name?.split(' ')[0] || 'there'}`} />
            <div className="page-content page-enter">
                {/* ── Stats ─────────────────────────────────────── */}
                <div className="dashboard-grid">
                    <div className="stat-card purple">
                        <div className="stat-label">Active Pipeline</div>
                        <div className="stat-value">{totalPipeline}</div>
                        <div className={`stat-change ${pipelineChangePct >= 0 ? 'up' : 'down'}`}>
                            {pipelineChangePct >= 0 ? '\u2191' : '\u2193'} {Math.abs(pipelineChangePct)}% vs 30d ago
                        </div>
                    </div>
                    <div className="stat-card blue">
                        <div className="stat-label">My Companies</div>
                        <div className="stat-value">{myCompanies.length}</div>
                        <div className="stat-change up">
                            {myNewThisWeek} new this week
                        </div>
                    </div>
                    <div className="stat-card amber">
                        <div className="stat-label">Unassigned</div>
                        <div className="stat-value">{unassigned.length}</div>
                        <div className="stat-change">{unassigned.length > 0 ? 'Needs attention' : 'All clear'}</div>
                    </div>
                    <div className="stat-card red">
                        <div className="stat-label">At Risk / Overdue</div>
                        <div className="stat-value">{overdueCompanies.length}</div>
                        <div className="stat-change down">
                            {overdueCompanies.length > 0 ? 'Action required' : 'All clear'}
                        </div>
                    </div>
                    {pendingReview.length > 0 && (
                        <div className="stat-card purple">
                            <div className="stat-label">Needs Review</div>
                            <div className="stat-value">{pendingReview.length}</div>
                            <div className="stat-change">From email ingestion</div>
                        </div>
                    )}
                </div>

                {/* ── Main grid: Intro Call + Pipeline Distribution ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* 1. Scheduled Calls (all upcoming meetings across the pipeline) */}
                    <div className="dashboard-section">
                        <div className="dashboard-section-title">
                            <PhoneCall size={18} style={{ color: 'var(--primary)' }} /> Scheduled Calls
                        </div>
                        <div className="calls-strip" style={{ flexDirection: 'column' }}>
                            {scheduledCalls.length === 0 ? (
                                <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                                    No upcoming calls scheduled
                                </div>
                            ) : (
                                scheduledCalls.map(call => {
                                    const company = call.companyId ? companies.find(co => co.id === call.companyId) : null;
                                    const stage = company ? getStageById(company.pipelineStageId) : null;
                                    const when = new Date(call.bookedSlot);
                                    const now = new Date();
                                    const sameDay = when.toDateString() === now.toDateString();
                                    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
                                    const isTomorrow = when.toDateString() === tomorrow.toDateString();
                                    const datePart = sameDay
                                        ? 'Today'
                                        : isTomorrow
                                            ? 'Tomorrow'
                                            : when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
                                    const timePart = when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
                                    return (
                                        <div key={call.id} className="call-card" style={{ minWidth: 'auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div className="call-card-company">{call.companyName || call.eventTitle}</div>
                                                    <div className="call-card-founder">{call.attendeeName}{call.attendeeEmail ? ` · ${call.attendeeEmail}` : ''}</div>
                                                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                                                            {datePart} &middot; {timePart}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                            {call.durationMinutes} min
                                                        </span>
                                                        {stage && (
                                                            <span className="badge badge-primary" style={{ fontSize: 11 }}>{stage.name}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                    {call.meetLink && (
                                                        <a
                                                            href={call.meetLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="btn btn-sm"
                                                            style={{
                                                                background: '#00897B', color: '#fff',
                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <Video size={12} /> Join
                                                        </a>
                                                    )}
                                                    {company && (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCompany(company)}>View</button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 3. Pipeline Distribution */}
                    <div className="dashboard-section">
                        <div className="dashboard-section-title">
                            <BarChart3 size={18} style={{ color: 'var(--primary)' }} /> Pipeline Distribution
                        </div>
                        <div className="card">
                            {stageDistribution.map(({ stage, count }) => (
                                <div key={stage.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                                    borderBottom: '1px solid var(--border-light)',
                                }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{stage.name}</span>
                                    <div style={{ width: 120, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{
                                            width: totalPipeline > 0 ? `${(count / totalPipeline) * 100}%` : '0%',
                                            height: '100%',
                                            background: stage.color,
                                            borderRadius: 3,
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'right' }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── 2. New Assignments ──────────────────────────── */}
                {newAssignments.length > 0 && (
                    <div className="dashboard-section">
                        <div className="dashboard-section-title">
                            <UserPlus size={18} style={{ color: 'var(--primary)' }} /> New Assignments (Last 7 Days)
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Founder</th>
                                        <th>Stage</th>
                                        <th>Added</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newAssignments.map(c => {
                                        const stage = getStageById(c.pipelineStageId);
                                        const daysAgo = getDaysInPipeline(c.createdAt);
                                        return (
                                            <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                                <td><span className="table-company-name">{c.companyName}</span></td>
                                                <td>{c.founderName}</td>
                                                <td><span className="badge badge-primary">{stage?.name}</span></td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                                    {daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`}
                                                </td>
                                                <td>
                                                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedCompany(c); }}>
                                                        View <ArrowRight size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── 4. Overdue Items ──────────────────────────── */}
                {overdueCompanies.length > 0 && (
                    <div className="dashboard-section">
                        <div className="dashboard-section-title" style={{ color: 'var(--danger)' }}>
                            <AlertTriangle size={18} /> Overdue / At Risk {isPartnerOrAdmin ? '(All)' : '(My Companies)'}
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        {isPartnerOrAdmin && <th>Analyst</th>}
                                        <th>Stage</th>
                                        <th>Days</th>
                                        <th>Priority</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overdueCompanies.map(c => {
                                        const stage = getStageById(c.pipelineStageId);
                                        const analyst = c.analystId ? getUserById(c.analystId) : null;
                                        return (
                                            <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                                <td><span className="table-company-name">{c.companyName}</span></td>
                                                {isPartnerOrAdmin && (
                                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        {analyst?.name || 'Unassigned'}
                                                    </td>
                                                )}
                                                <td><span className="badge badge-primary">{stage?.name}</span></td>
                                                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{getDaysInPipeline(c.createdAt)}d</td>
                                                <td>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className={`priority-dot ${c.priorityLevel.toLowerCase()}`} />
                                                        {c.priorityLevel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedCompany(c); }}>
                                                        Review <ArrowRight size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── 5. Unassigned Queue ──────────────────────── */}
                {isPartnerOrAdmin && unassigned.length > 0 && (
                    <div className="dashboard-section">
                        <div className="assignment-queue">
                            <div className="assignment-queue-header">
                                <div className="assignment-queue-title">
                                    <Users size={16} /> Unassigned Companies ({unassigned.length})
                                </div>
                            </div>
                            {unassigned.map(c => {
                                const industry = getIndustryById(c.industryId);
                                return (
                                    <div key={c.id} className="assignment-item">
                                        <div className="assignment-item-info">
                                            <span className="assignment-item-name">{c.companyName}</span>
                                            <span className="badge badge-primary">{industry?.name}</span>
                                            <span className="badge badge-neutral">{c.companyRound}</span>
                                        </div>
                                        <select
                                            className="form-select"
                                            style={{ width: 160, padding: '6px 10px', fontSize: 12 }}
                                            onChange={e => { if (e.target.value) assignAnalyst(c.id, e.target.value); }}
                                            defaultValue=""
                                        >
                                            <option value="">Assign to...</option>
                                            {users.filter(u => u.role === 'analyst').map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* For analysts: small unassigned indicator */}
                {!isPartnerOrAdmin && unassigned.length > 0 && (
                    <div className="dashboard-section">
                        <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                            <Users size={16} style={{ color: 'var(--warning)' }} />
                            <span>{unassigned.length} unassigned {unassigned.length === 1 ? 'company' : 'companies'} in the queue</span>
                        </div>
                    </div>
                )}

                {/* ── 6. Recent AI Insights ───────────────────── */}
                {companiesWithInsights.length > 0 && (
                    <div className="dashboard-section">
                        <div className="dashboard-section-title">
                            <Sparkles size={18} style={{ color: 'var(--primary)' }} /> Recent AI Insights
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                            {companiesWithInsights.map(c => (
                                <div key={c.id} className="ai-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedCompany(c)}>
                                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.companyName}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        {c.quickSummary!.length > 120 ? `${c.quickSummary!.substring(0, 120)}...` : c.quickSummary}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
