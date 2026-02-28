'use client';

import React from 'react';
import { BarChart3, TrendingUp, Clock, AlertTriangle, Calendar, ArrowRight, Users, Sparkles } from 'lucide-react';
import TopHeader from '@/components/layout/TopHeader';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';
import { useAppContext } from '@/lib/context';

export default function DashboardPage() {
    const { setSelectedCompany, companies, pipelineStages, user, getUserById, getIndustryById, getStageById, getUnassignedCompanies, users, assignAnalyst } = useAppContext();
    const myCompanies = companies.filter(c => c.analystId === user?.id && !c.terminalStatus);
    const overdueCompanies = myCompanies.filter(c => c.isOverdue || getDaysInPipeline(c.createdAt) > 25);
    const unassigned = getUnassignedCompanies();
    const totalPipeline = companies.filter(c => !c.terminalStatus).length;

    const stageDistribution = pipelineStages.map(s => ({
        stage: s,
        count: companies.filter(c => c.pipelineStageId === s.id && !c.terminalStatus).length,
    }));

    // Mock today's calls
    const todaysCalls = [
        { time: '10:30 AM', company: 'NovaPay', founder: 'Amit Sharma', type: 'Intro Call' },
        { time: '2:00 PM', company: 'DevForge', founder: 'Karthik Nair', type: 'Follow-up' },
        { time: '4:30 PM', company: 'ShieldNet', founder: 'Ravi Kumar', type: 'Deep Dive' },
    ];

    return (
        <>
            <TopHeader title="Dashboard" subtitle={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user?.name?.split(' ')[0] || 'there'}`} />
            <div className="page-content page-enter">
                {/* Stats */}
                <div className="dashboard-grid">
                    <div className="stat-card purple">
                        <div className="stat-label">Active Pipeline</div>
                        <div className="stat-value">{totalPipeline}</div>
                        <div className="stat-change up">↑ 12% from last month</div>
                    </div>
                    <div className="stat-card blue">
                        <div className="stat-label">My Companies</div>
                        <div className="stat-value">{myCompanies.length}</div>
                        <div className="stat-change up">3 new this week</div>
                    </div>
                    <div className="stat-card amber">
                        <div className="stat-label">Unassigned</div>
                        <div className="stat-value">{unassigned.length}</div>
                        <div className="stat-change">{unassigned.length > 0 ? 'Needs attention' : 'All clear'}</div>
                    </div>
                    <div className="stat-card red">
                        <div className="stat-label">At Risk / Overdue</div>
                        <div className="stat-value">{overdueCompanies.length}</div>
                        <div className="stat-change down">Action required</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* Today's Calls */}
                    <div className="dashboard-section">
                        <div className="dashboard-section-title">
                            <Calendar size={18} style={{ color: 'var(--primary)' }} /> Today&apos;s Calls
                        </div>
                        <div className="calls-strip" style={{ flexDirection: 'column' }}>
                            {todaysCalls.map((call, i) => (
                                <div key={i} className="call-card" style={{ minWidth: 'auto' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div className="call-card-time">{call.time}</div>
                                            <div className="call-card-company">{call.company}</div>
                                            <div className="call-card-founder">{call.founder} — {call.type}</div>
                                        </div>
                                        <button className="btn btn-secondary btn-sm">Join</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pipeline Distribution */}
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
                                            width: `${(count / totalPipeline) * 100}%`,
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

                {/* Overdue Items */}
                {overdueCompanies.length > 0 && (
                    <div className="dashboard-section">
                        <div className="dashboard-section-title" style={{ color: 'var(--danger)' }}>
                            <AlertTriangle size={18} /> Overdue / At Risk
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Stage</th>
                                        <th>Days</th>
                                        <th>Priority</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overdueCompanies.map(c => {
                                        const stage = getStageById(c.pipelineStageId);
                                        return (
                                            <tr key={c.id} onClick={() => setSelectedCompany(c)}>
                                                <td><span className="table-company-name">{c.companyName}</span></td>
                                                <td><span className="badge badge-primary">{stage?.name}</span></td>
                                                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{getDaysInPipeline(c.createdAt)}d</td>
                                                <td>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className={`priority-dot ${c.priorityLevel.toLowerCase()}`} />
                                                        {c.priorityLevel}
                                                    </span>
                                                </td>
                                                <td><button className="btn btn-primary btn-sm">Review <ArrowRight size={12} /></button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Unassigned Queue (for partners) */}
                {unassigned.length > 0 && (
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
                                        <select className="form-select" style={{ width: 160, padding: '6px 10px', fontSize: 12 }} onChange={e => { if (e.target.value) assignAnalyst(c.id, e.target.value); }}>
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

                {/* Recent AI Insights */}
                <div className="dashboard-section">
                    <div className="dashboard-section-title">
                        <Sparkles size={18} style={{ color: 'var(--primary)' }} /> Recent AI Insights
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        {companies.filter(c => c.quickSummary).slice(0, 3).map(c => (
                            <div key={c.id} className="ai-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedCompany(c)}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.companyName}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    {c.quickSummary?.substring(0, 120)}...
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
