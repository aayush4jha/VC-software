'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Shield, Users, Building2, BarChart3, Activity, Settings,
    Plus, Trash2, ChevronDown, Search, RefreshCw, AlertTriangle, Eye
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';

type AdminSection = 'overview' | 'companies' | 'users' | 'settings';

export default function AdminPage() {
    const {
        user, companies, users, pipelineStages, industries,
        dealSourceNames, rejectionReasonCategories,
        getUserById, getStageById, getIndustryById,
        deleteCompany, setSelectedCompany, refreshData,
    } = useAppContext();

    const [activeSection, setActiveSection] = useState<AdminSection>('overview');
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await refreshData();
        setRefreshing(false);
    };

    // Stats
    const activeCompanies = companies.filter(c => !c.terminalStatus);
    const rejectedCompanies = companies.filter(c => c.terminalStatus === 'Rejected');
    const totalPipeline = activeCompanies.reduce((sum, c) => sum + (c.totalFundRaise || 0), 0);
    const avgDays = activeCompanies.length > 0
        ? Math.round(activeCompanies.reduce((sum, c) => sum + getDaysInPipeline(c.createdAt), 0) / activeCompanies.length)
        : 0;
    const overdueCount = activeCompanies.filter(c => c.isOverdue || getDaysInPipeline(c.createdAt) > 25).length;

    const stageDistribution = pipelineStages.map(s => ({
        stage: s,
        count: activeCompanies.filter(c => c.pipelineStageId === s.id).length,
    }));

    const filteredCompanies = companies.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return c.companyName.toLowerCase().includes(q) ||
            c.founderName.toLowerCase().includes(q) ||
            c.founderEmail.toLowerCase().includes(q);
    });

    const sections: { id: AdminSection; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'companies', label: 'All Companies', icon: Building2 },
        { id: 'users', label: 'Team', icon: Users },
        { id: 'settings', label: 'Configuration', icon: Settings },
    ];

    if (user?.role !== 'admin' && user?.role !== 'partner') {
        return (
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <TopHeader title="Admin" subtitle="Access restricted" />
                    <div className="page-content page-enter">
                        <div className="empty-state" style={{ height: '60vh' }}>
                            <div className="empty-state-icon"><Shield size={28} /></div>
                            <div className="empty-state-title">Access Denied</div>
                            <div className="empty-state-text">
                                You need admin or partner privileges to access this page.
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Admin Dashboard" subtitle="System management & analytics" />
                <div className="page-content page-enter">
                    {/* Section navigation */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        {sections.map(sec => {
                            const Icon = sec.icon;
                            return (
                                <button
                                    key={sec.id}
                                    className={`btn ${activeSection === sec.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                    onClick={() => setActiveSection(sec.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Icon size={14} /> {sec.label}
                                </button>
                            );
                        })}
                        <div style={{ flex: 1 }} />
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>

                    {/* Overview */}
                    {activeSection === 'overview' && (
                        <div>
                            <div className="dashboard-grid">
                                <div className="stat-card purple">
                                    <div className="stat-label">Total Companies</div>
                                    <div className="stat-value">{companies.length}</div>
                                    <div className="stat-change">{activeCompanies.length} active · {rejectedCompanies.length} rejected</div>
                                </div>
                                <div className="stat-card blue">
                                    <div className="stat-label">Pipeline Value</div>
                                    <div className="stat-value">{formatCurrency(totalPipeline)}</div>
                                    <div className="stat-change">Total fund raise across pipeline</div>
                                </div>
                                <div className="stat-card amber">
                                    <div className="stat-label">Avg. Days in Pipeline</div>
                                    <div className="stat-value">{avgDays}d</div>
                                    <div className="stat-change">Across {activeCompanies.length} active deals</div>
                                </div>
                                <div className="stat-card red">
                                    <div className="stat-label">Overdue</div>
                                    <div className="stat-value">{overdueCount}</div>
                                    <div className="stat-change">{overdueCount > 0 ? 'Action required' : 'All clear'}</div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
                                {/* Stage distribution */}
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <BarChart3 size={16} style={{ color: 'var(--primary)' }} /> Pipeline by Stage
                                    </h3>
                                    {stageDistribution.map(({ stage, count }) => (
                                        <div key={stage.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                                            borderBottom: '1px solid var(--border-light)',
                                        }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{stage.name}</span>
                                            <div style={{ width: 100, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${activeCompanies.length > 0 ? (count / activeCompanies.length) * 100 : 0}%`,
                                                    height: '100%', background: stage.color, borderRadius: 3,
                                                }} />
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'right' }}>{count}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Team overview */}
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Users size={16} style={{ color: 'var(--primary)' }} /> Team Overview
                                    </h3>
                                    {users.map(u => {
                                        const assigned = activeCompanies.filter(c => c.analystId === u.id).length;
                                        return (
                                            <div key={u.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                                                borderBottom: '1px solid var(--border-light)',
                                            }}>
                                                <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                                    {u.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.email}</div>
                                                </div>
                                                <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'partner' ? 'badge-warning' : 'badge-info'}`}>
                                                    {u.role}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>
                                                    {assigned} deals
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Overdue companies */}
                            {overdueCount > 0 && (
                                <div className="card" style={{ padding: 20, marginTop: 20 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}>
                                        <AlertTriangle size={16} /> Overdue Companies ({overdueCount})
                                    </h3>
                                    <div className="table-container">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Company</th>
                                                    <th>Stage</th>
                                                    <th>Analyst</th>
                                                    <th>Days</th>
                                                    <th>Priority</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeCompanies.filter(c => c.isOverdue || getDaysInPipeline(c.createdAt) > 25).map(c => {
                                                    const stage = getStageById(c.pipelineStageId);
                                                    const analyst = c.analystId ? getUserById(c.analystId) : null;
                                                    return (
                                                        <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                                            <td><span className="table-company-name">{c.companyName}</span></td>
                                                            <td><span className="badge badge-primary">{stage?.name}</span></td>
                                                            <td>{analyst?.name || <span className="badge badge-warning">Unassigned</span>}</td>
                                                            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{getDaysInPipeline(c.createdAt)}d</td>
                                                            <td>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <span className={`priority-dot ${c.priorityLevel.toLowerCase()}`} />
                                                                    {c.priorityLevel}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* All Companies */}
                    {activeSection === 'companies' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <div className="header-search" style={{ flex: 1 }}>
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search companies..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                                    {filteredCompanies.length} of {companies.length} companies
                                </span>
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Company</th>
                                            <th>Founder</th>
                                            <th>Stage</th>
                                            <th>Industry</th>
                                            <th>Round</th>
                                            <th>Analyst</th>
                                            <th>Days</th>
                                            <th>Raise</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCompanies.map(c => {
                                            const stage = getStageById(c.pipelineStageId);
                                            const industry = getIndustryById(c.industryId);
                                            const analyst = c.analystId ? getUserById(c.analystId) : null;
                                            return (
                                                <tr key={c.id}>
                                                    <td><span className="table-company-name">{c.companyName}</span></td>
                                                    <td>
                                                        <div>
                                                            <div style={{ fontSize: 13 }}>{c.founderName}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.founderEmail}</div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="table-stage-badge" style={{ background: `${stage?.color}15`, color: stage?.color }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage?.color, display: 'inline-block' }} />
                                                            {stage?.name}
                                                        </span>
                                                    </td>
                                                    <td><span className="badge badge-primary">{industry?.name}</span></td>
                                                    <td>{c.companyRound}</td>
                                                    <td>{analyst?.name || <span className="badge badge-warning">—</span>}</td>
                                                    <td>{getDaysInPipeline(c.createdAt)}d</td>
                                                    <td>{c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '—'}</td>
                                                    <td>
                                                        {c.terminalStatus ? (
                                                            <span className="badge badge-danger">{c.terminalStatus}</span>
                                                        ) : (
                                                            <span className="badge badge-info">Active</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => setSelectedCompany(c)}
                                                                title="View details"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => deleteCompany(c.id)}
                                                                title="Delete"
                                                                style={{ color: 'var(--danger)' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Users */}
                    {activeSection === 'users' && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                                Team Members ({users.length})
                            </h2>
                            <div className="config-list">
                                {users.map(u => {
                                    const assigned = activeCompanies.filter(c => c.analystId === u.id).length;
                                    return (
                                        <div key={u.id} className="config-item" style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div className="kanban-card-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                                                    {u.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{assigned} active deals</span>
                                                <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'partner' ? 'badge-warning' : 'badge-info'}`}>
                                                    {u.role}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Configuration */}
                    {activeSection === 'settings' && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>System Configuration</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pipeline Stages ({pipelineStages.length})</h3>
                                    {pipelineStages.map(s => (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Order: {s.order}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Industries ({industries.length})</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {industries.map(i => (
                                            <span key={i.id} className="badge badge-primary">{i.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Deal Sources ({dealSourceNames.length})</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {dealSourceNames.map(d => (
                                            <span key={d.id} className="badge badge-neutral">{d.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="card" style={{ padding: 20 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Rejection Categories ({rejectionReasonCategories.length})</h3>
                                    {rejectionReasonCategories.map(cat => (
                                        <div key={cat.id} style={{ marginBottom: 8 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{cat.name}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 12 }}>
                                                {cat.subReasons.map(sub => (
                                                    <span key={sub.id} className="badge badge-neutral" style={{ fontSize: 11 }}>{sub.name}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
