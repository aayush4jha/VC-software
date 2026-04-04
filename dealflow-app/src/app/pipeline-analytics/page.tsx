'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    BarChart3, Users, Clock, TrendingUp, Loader2,
    ArrowUpRight, ArrowDownRight, Target, AlertTriangle,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';

interface AnalystMetric {
    id: string; name: string; role: string;
    totalAssigned: number; activeCompanies: number;
    stageChanges: number; rejections: number; companiesAdded: number;
    totalActions: number; conversionRate: number;
}

interface Analytics {
    stageDistribution: { id: string; name: string; color: string; order: number; count: number }[];
    conversionFunnel: { name: string; color: string; reached: number }[];
    avgTimePerStage: { name: string; color: string; avgDays: number; count: number }[];
    analystMetrics: AnalystMetric[];
    outcomeBreakdown: { total: number; active: number; rejected: number; portfolio: number; awaitingResponse: number; blocker: number; nextRound: number };
    dailyActivity: { date: string; added: number; moved: number; rejected: number }[];
    roundDistribution: Record<string, number>;
    priorityDistribution: Record<string, number>;
}

function MetricCard({ label, value, icon, color, sub }: { label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }) {
    return (
        <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', flex: '1 1 200px', minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color }}>{value}</div>
                    {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}15`, color }}>{icon}</div>
            </div>
        </div>
    );
}

function BarChart({ data, maxVal }: { data: { label: string; value: number; color: string }[]; maxVal: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, width: 120, textAlign: 'right', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                    <div style={{ flex: 1, height: 24, background: 'var(--bg-tertiary)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ width: maxVal > 0 ? `${(d.value / maxVal) * 100}%` : '0%', height: '100%', background: d.color, borderRadius: 6, transition: 'width 0.5s', minWidth: d.value > 0 ? 2 : 0 }} />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{d.value}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function PipelineAnalyticsContent() {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/analytics');
            const json = await res.json();
            if (res.ok) setData(json);
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading || !data) {
        return (
            <>
                <TopHeader title="Pipeline Analytics" subtitle="Analyst activity & pipeline insights" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 8, color: 'var(--text-tertiary)' }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading analytics...
                </div>
            </>
        );
    }

    const o = data.outcomeBreakdown;
    const maxFunnel = Math.max(...data.conversionFunnel.map(f => f.reached), 1);
    const maxStageTime = Math.max(...data.avgTimePerStage.map(s => s.avgDays), 1);

    // Recent 7-day totals
    const last7 = data.dailyActivity.slice(-7);
    const added7 = last7.reduce((s, d) => s + d.added, 0);
    const moved7 = last7.reduce((s, d) => s + d.moved, 0);
    const rejected7 = last7.reduce((s, d) => s + d.rejected, 0);

    // Activity sparkline (last 30 days)
    const maxDayActivity = Math.max(...data.dailyActivity.map(d => d.added + d.moved + d.rejected), 1);

    return (
        <>
            <TopHeader title="Pipeline Analytics" subtitle={`${o.total} companies tracked`} />
            <div className="page-content page-enter" style={{ padding: 24 }}>

                {/* Top Metrics */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
                    <MetricCard label="Active Pipeline" value={o.active} icon={<TrendingUp size={20} />} color="#6366f1" sub={`${o.total} total`} />
                    <MetricCard label="Portfolio" value={o.portfolio} icon={<Target size={20} />} color="#10b981" sub={`${o.total > 0 ? Math.round((o.portfolio / o.total) * 100) : 0}% conversion`} />
                    <MetricCard label="Rejected" value={o.rejected} icon={<ArrowDownRight size={20} />} color="#ef4444" />
                    <MetricCard label="Blocked / Waiting" value={o.awaitingResponse + o.blocker} icon={<AlertTriangle size={20} />} color="#f59e0b" sub={`${o.awaitingResponse} awaiting, ${o.blocker} blocked`} />
                </div>

                {/* 7-Day Activity Summary */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
                    <MetricCard label="Added (7d)" value={added7} icon={<ArrowUpRight size={20} />} color="#3b82f6" />
                    <MetricCard label="Stage Moves (7d)" value={moved7} icon={<TrendingUp size={20} />} color="#8b5cf6" />
                    <MetricCard label="Rejected (7d)" value={rejected7} icon={<ArrowDownRight size={20} />} color="#ef4444" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                    {/* Stage Distribution */}
                    <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BarChart3 size={16} style={{ color: 'var(--primary)' }} /> Pipeline Stage Distribution
                        </div>
                        <BarChart
                            data={data.stageDistribution.map(s => ({ label: s.name, value: s.count, color: s.color }))}
                            maxVal={Math.max(...data.stageDistribution.map(s => s.count), 1)}
                        />
                    </div>

                    {/* Conversion Funnel */}
                    <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TrendingUp size={16} style={{ color: '#10b981' }} /> Conversion Funnel
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {data.conversionFunnel.map((f, i) => {
                                const pct = maxFunnel > 0 ? Math.round((f.reached / maxFunnel) * 100) : 0;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 12, width: 120, textAlign: 'right', color: 'var(--text-secondary)' }}>{f.name}</span>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <div style={{ height: 28, background: 'var(--bg-tertiary)', borderRadius: 6, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: f.color, borderRadius: 6, opacity: 0.7, transition: 'width 0.5s' }} />
                                            </div>
                                            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600 }}>
                                                {f.reached} ({pct}%)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                    {/* Avg Time Per Stage */}
                    <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={16} style={{ color: '#f59e0b' }} /> Avg. Time Per Stage (days)
                        </div>
                        <BarChart
                            data={data.avgTimePerStage.map(s => ({ label: s.name, value: s.avgDays, color: s.avgDays > 7 ? '#ef4444' : s.avgDays > 3 ? '#f59e0b' : s.color }))}
                            maxVal={maxStageTime}
                        />
                        {data.avgTimePerStage.some(s => s.avgDays > 7) && (
                            <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={12} /> Stages with &gt;7 day averages may be bottlenecks
                            </div>
                        )}
                    </div>

                    {/* Round Distribution */}
                    <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Round Distribution</div>
                        <BarChart
                            data={Object.entries(data.roundDistribution).sort(([, a], [, b]) => b - a).map(([round, count]) => ({
                                label: round, value: count, color: '#6366f1',
                            }))}
                            maxVal={Math.max(...Object.values(data.roundDistribution), 1)}
                        />
                    </div>
                </div>

                {/* Daily Activity (30-day sparkline) */}
                <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 28 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Pipeline Activity (Last 30 Days)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                        {data.dailyActivity.map((d, i) => {
                            const total = d.added + d.moved + d.rejected;
                            const h = maxDayActivity > 0 ? (total / maxDayActivity) * 100 : 0;
                            const color = d.rejected > 0 ? '#ef4444' : d.moved > 0 ? '#8b5cf6' : d.added > 0 ? '#3b82f6' : 'var(--border)';
                            return (
                                <div
                                    key={i}
                                    title={`${d.date}: +${d.added} added, ${d.moved} moved, ${d.rejected} rejected`}
                                    style={{
                                        flex: 1, height: `${Math.max(h, 4)}%`, background: color,
                                        borderRadius: '3px 3px 0 0', transition: 'height 0.3s', cursor: 'pointer', minWidth: 4,
                                        opacity: total > 0 ? 1 : 0.2,
                                    }}
                                />
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
                        <span>{data.dailyActivity[0]?.date}</span>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6', display: 'inline-block' }} /> Added</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#8b5cf6', display: 'inline-block' }} /> Moved</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} /> Rejected</span>
                        </div>
                        <span>{data.dailyActivity[data.dailyActivity.length - 1]?.date}</span>
                    </div>
                </div>

                {/* Analyst Performance Table */}
                <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={16} style={{ color: '#8b5cf6' }} /> Analyst Performance
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    {['Analyst', 'Role', 'Assigned', 'Active', 'Stage Moves', 'Rejections', 'Added', 'Actions', 'Conversion'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.analystMetrics.map(a => (
                                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className="kanban-card-avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                                                    {a.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                {a.name}
                                            </div>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{a.role}</td>
                                        <td style={{ padding: '10px 12px' }}>{a.totalAssigned}</td>
                                        <td style={{ padding: '10px 12px' }}>{a.activeCompanies}</td>
                                        <td style={{ padding: '10px 12px' }}>{a.stageChanges}</td>
                                        <td style={{ padding: '10px 12px', color: a.rejections > 0 ? '#ef4444' : 'inherit' }}>{a.rejections}</td>
                                        <td style={{ padding: '10px 12px' }}>{a.companiesAdded}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{a.totalActions}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                fontWeight: 700,
                                                color: a.conversionRate >= 20 ? '#10b981' : a.conversionRate >= 5 ? '#f59e0b' : 'var(--text-tertiary)',
                                            }}>
                                                {a.conversionRate}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {data.analystMetrics.length === 0 && (
                                    <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>No analyst data yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function PipelineAnalyticsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <PipelineAnalyticsContent />
            </main>
        </div>
    );
}
