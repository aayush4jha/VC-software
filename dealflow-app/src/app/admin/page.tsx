'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Shield, Users, Building2, BarChart3, Settings,
    Plus, Trash2, Search, RefreshCw, AlertTriangle, Eye, Check, X, Edit2,
    ChevronDown, Filter,
} from 'lucide-react';
import { ALL_PAGE_PERMISSIONS, type PagePermission } from '@/types/database';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline, isStageOverdue } from '@/lib/context';

type AdminSection = 'overview' | 'companies' | 'users' | 'settings';

function ColumnFilterDropdown({ label, options, selected, onChange }: {
    label: string;
    options: { value: string; label: string; color?: string }[];
    selected: Set<string>;
    onChange: (selected: Set<string>) => void;
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0, openUp: false });
    const hasFilter = selected.size > 0;

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Reposition on scroll so the dropdown follows the button
    const updatePosition = React.useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const dropdownHeight = Math.min(options.length * 38 + 50, 320);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
        setPos({
            top: openUp ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 230),
            openUp,
        });
    }, [options.length]);

    useEffect(() => {
        if (!open) return;
        const onScroll = () => {
            requestAnimationFrame(updatePosition);
        };
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open, updatePosition]);

    const handleToggle = () => {
        if (!open) {
            updatePosition();
        }
        setOpen(o => !o);
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={handleToggle}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    font: 'inherit', fontWeight: 600, fontSize: 12,
                    color: hasFilter ? 'var(--primary)' : 'inherit',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                }}
            >
                {label}
                {hasFilter && (
                    <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--primary)', color: '#fff',
                        fontSize: 10, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {selected.size}
                    </span>
                )}
                <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {open && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
                        minWidth: 220, maxHeight: 320, overflowY: 'auto',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
                        padding: '6px 0',
                    }}
                >
                    {hasFilter && (
                        <button
                            onClick={() => { onChange(new Set()); setOpen(false); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                width: '100%', padding: '8px 14px', border: 'none',
                                background: 'none', cursor: 'pointer', fontSize: 12,
                                color: 'var(--danger)', fontWeight: 600, textAlign: 'left',
                                borderBottom: '1px solid var(--border-color)',
                                marginBottom: 2,
                            }}
                        >
                            <X size={12} /> Clear all
                        </button>
                    )}
                    {options.map(opt => {
                        const isSelected = selected.has(opt.value);
                        return (
                            <label
                                key={opt.value}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                                    color: 'var(--text-primary)',
                                    background: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = isSelected ? 'rgba(59,130,246,0.06)' : 'transparent')}
                                onClick={() => {
                                    const next = new Set(selected);
                                    if (next.has(opt.value)) next.delete(opt.value);
                                    else next.add(opt.value);
                                    onChange(next);
                                }}
                            >
                                <span style={{
                                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                    border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}`,
                                    background: isSelected ? 'var(--primary)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.1s',
                                }}>
                                    {isSelected && <Check size={10} style={{ color: '#fff' }} />}
                                </span>
                                {opt.color && (
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                )}
                                <span style={{ fontWeight: isSelected ? 600 : 400 }}>{opt.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </>
    );
}

export default function AdminPage() {
    const {
        user, companies, users, pipelineStages, industries,
        dealSourceNames, rejectionReasonCategories,
        getUserById, getStageById, getIndustryById,
        deleteCompany, setSelectedCompany, refreshData,
        updateUserPermissions, updateUserRole, inviteUser,
    } = useAppContext();

    const [activeSection, setActiveSection] = useState<AdminSection>('overview');
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState('');
    const [editPermissions, setEditPermissions] = useState<PagePermission[]>([]);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('analyst');
    const [invitePermissions, setInvitePermissions] = useState<PagePermission[]>(['dashboard', 'dealflow', 'contacts', 'emails']);
    const [inviting, setInviting] = useState(false);

    // Column filters for All Companies
    const [filterStage, setFilterStage] = useState<Set<string>>(new Set());
    const [filterIndustry, setFilterIndustry] = useState<Set<string>>(new Set());
    const [filterRound, setFilterRound] = useState<Set<string>>(new Set());
    const [filterAnalyst, setFilterAnalyst] = useState<Set<string>>(new Set());
    const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());

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
    const overdueCount = activeCompanies.filter(c => isStageOverdue(getStageById(c.pipelineStageId)?.name, c.createdAt)).length;

    const stageDistribution = pipelineStages.map(s => ({
        stage: s,
        count: activeCompanies.filter(c => c.pipelineStageId === s.id).length,
    }));

    const ROUND_OPTIONS = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
    const STATUS_OPTIONS = ['Active', 'Portfolio', 'Rejected', 'Awaiting Response', 'Blocker', 'Next Round Analysis'];

    const stageFilterOptions = useMemo(() =>
        pipelineStages.map(s => ({ value: s.id, label: s.name, color: s.color })),
        [pipelineStages]
    );
    const industryFilterOptions = useMemo(() =>
        industries.map(i => ({ value: i.id, label: i.name })),
        [industries]
    );
    const roundFilterOptions = useMemo(() =>
        ROUND_OPTIONS.map(r => ({ value: r, label: r })),
        []
    );
    const analystFilterOptions = useMemo(() => [
        { value: '__unassigned__', label: 'Unassigned' },
        ...users.map(u => ({ value: u.id, label: u.name })),
    ], [users]);
    const statusFilterOptions = useMemo(() =>
        STATUS_OPTIONS.map(s => ({ value: s, label: s })),
        []
    );

    const hasAnyFilter = filterStage.size > 0 || filterIndustry.size > 0 || filterRound.size > 0 || filterAnalyst.size > 0 || filterStatus.size > 0;

    const filteredCompanies = companies.filter(c => {
        if (search) {
            const q = search.toLowerCase();
            if (!c.companyName.toLowerCase().includes(q) &&
                !c.founderName.toLowerCase().includes(q) &&
                !c.founderEmail.toLowerCase().includes(q)) return false;
        }
        if (filterStage.size > 0 && !filterStage.has(c.pipelineStageId)) return false;
        if (filterIndustry.size > 0 && !filterIndustry.has(c.industryId)) return false;
        if (filterRound.size > 0 && !filterRound.has(c.companyRound)) return false;
        if (filterAnalyst.size > 0) {
            const analystKey = c.analystId || '__unassigned__';
            if (!filterAnalyst.has(analystKey)) return false;
        }
        if (filterStatus.size > 0) {
            const status = c.terminalStatus || 'Active';
            if (!filterStatus.has(status)) return false;
        }
        return true;
    });

    const sections: { id: AdminSection; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'companies', label: 'All Companies', icon: Building2 },
        { id: 'users', label: 'Team', icon: Users },
        { id: 'settings', label: 'Configuration', icon: Settings },
    ];

    if (user && !user.permissions.includes('admin') && user.role !== 'admin' && user.role !== 'partner') {
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
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                        {sections.map(sec => {
                            const Icon = sec.icon;
                            return (
                                <button
                                    key={sec.id}
                                    className={`btn ${activeSection === sec.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                    onClick={() => setActiveSection(sec.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Icon size={14} /> <span className="hide-mobile">{sec.label}</span>
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
                            <span className="hide-mobile">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
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

                            <div style={{ display: 'grid', gap: 20, marginTop: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
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
                                                {activeCompanies.filter(c => isStageOverdue(getStageById(c.pipelineStageId)?.name, c.createdAt)).map(c => {
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                                <div className="header-search" style={{ flex: '1 1 200px', minWidth: 160 }}>
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search companies..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                {hasAnyFilter && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            setFilterStage(new Set());
                                            setFilterIndustry(new Set());
                                            setFilterRound(new Set());
                                            setFilterAnalyst(new Set());
                                            setFilterStatus(new Set());
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--danger)', fontSize: 12 }}
                                    >
                                        <Filter size={12} /> Clear filters
                                    </button>
                                )}
                                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                    {filteredCompanies.length} of {companies.length} companies
                                </span>
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Company</th>
                                            <th>Founder</th>
                                            <th><ColumnFilterDropdown label="Stage" options={stageFilterOptions} selected={filterStage} onChange={setFilterStage} /></th>
                                            <th><ColumnFilterDropdown label="Industry" options={industryFilterOptions} selected={filterIndustry} onChange={setFilterIndustry} /></th>
                                            <th><ColumnFilterDropdown label="Round" options={roundFilterOptions} selected={filterRound} onChange={setFilterRound} /></th>
                                            <th><ColumnFilterDropdown label="Analyst" options={analystFilterOptions} selected={filterAnalyst} onChange={setFilterAnalyst} /></th>
                                            <th>Days</th>
                                            <th>Raise</th>
                                            <th><ColumnFilterDropdown label="Status" options={statusFilterOptions} selected={filterStatus} onChange={setFilterStatus} /></th>
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

                    {/* Users & Permissions */}
                    {activeSection === 'users' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h2 style={{ fontSize: 16, fontWeight: 700 }}>
                                    Team Members ({users.length})
                                </h2>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setShowInvite(!showInvite)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    <Plus size={14} /> Invite Member
                                </button>
                            </div>

                            {/* Invite Form */}
                            {showInvite && (
                                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Invite New Team Member</h3>
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                        <input
                                            type="email"
                                            placeholder="Email address"
                                            value={inviteEmail}
                                            onChange={e => setInviteEmail(e.target.value)}
                                            className="form-input"
                                            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Role (e.g. Analyst, Partner, VC Intern)"
                                            value={inviteRole}
                                            onChange={e => setInviteRole(e.target.value)}
                                            style={{ width: 220, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                                            Page Permissions
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {ALL_PAGE_PERMISSIONS.map(p => (
                                                <label
                                                    key={p.key}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                                        background: invitePermissions.includes(p.key) ? 'rgba(59,130,246,0.1)' : 'var(--bg-tertiary)',
                                                        border: `1px solid ${invitePermissions.includes(p.key) ? 'var(--primary)' : 'var(--border-color)'}`,
                                                        fontSize: 12, fontWeight: 500,
                                                        color: invitePermissions.includes(p.key) ? 'var(--primary)' : 'var(--text-secondary)',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={invitePermissions.includes(p.key)}
                                                        onChange={e => {
                                                            if (e.target.checked) {
                                                                setInvitePermissions(prev => [...prev, p.key]);
                                                            } else {
                                                                setInvitePermissions(prev => prev.filter(k => k !== p.key));
                                                            }
                                                        }}
                                                        style={{ display: 'none' }}
                                                    />
                                                    {invitePermissions.includes(p.key) ? <Check size={12} /> : <X size={12} />}
                                                    {p.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={inviting || !inviteEmail}
                                            onClick={async () => {
                                                setInviting(true);
                                                try {
                                                    await inviteUser(inviteEmail, inviteRole, invitePermissions);
                                                    setInviteEmail('');
                                                    setInviteRole('analyst');
                                                    setInvitePermissions(['dashboard', 'dealflow', 'contacts', 'emails']);
                                                    setShowInvite(false);
                                                } catch (err) {
                                                    alert((err as Error).message);
                                                }
                                                setInviting(false);
                                            }}
                                        >
                                            {inviting ? 'Sending...' : 'Send Invite'}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* User list with permissions */}
                            <div className="config-list">
                                {users.map(u => {
                                    const assigned = activeCompanies.filter(c => c.analystId === u.id).length;
                                    const isEditing = editingUserId === u.id;
                                    return (
                                        <div key={u.id} className="config-item" style={{ padding: '14px 16px', flexDirection: 'column', alignItems: 'stretch' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => {
                                                            if (isEditing) {
                                                                setEditingUserId(null);
                                                            } else {
                                                                setEditingUserId(u.id);
                                                                setEditRole(u.role);
                                                                setEditPermissions([...u.permissions]);
                                                            }
                                                        }}
                                                        title="Edit permissions"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Permission badges (read-only) */}
                                            {!isEditing && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, marginLeft: 48 }}>
                                                    {u.permissions.filter(p => (p as string) !== 'ai').map(p => (
                                                        <span key={p} className="badge badge-neutral" style={{ fontSize: 10 }}>{p}</span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Edit mode */}
                                            {isEditing && (
                                                <div style={{ marginTop: 12, marginLeft: 48, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                                    <div style={{ marginBottom: 10 }}>
                                                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                                            Role / Title
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={editRole}
                                                            onChange={e => setEditRole(e.target.value)}
                                                            style={{ width: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}
                                                            placeholder="e.g. Analyst, VC Intern, Investment Associate"
                                                        />
                                                    </div>
                                                    <div style={{ marginBottom: 10 }}>
                                                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                                            Page Permissions
                                                        </label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                            {ALL_PAGE_PERMISSIONS.map(p => (
                                                                <label
                                                                    key={p.key}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                                        padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
                                                                        background: editPermissions.includes(p.key) ? 'rgba(59,130,246,0.1)' : 'var(--bg-tertiary)',
                                                                        border: `1px solid ${editPermissions.includes(p.key) ? 'var(--primary)' : 'var(--border-color)'}`,
                                                                        fontSize: 11, fontWeight: 500,
                                                                        color: editPermissions.includes(p.key) ? 'var(--primary)' : 'var(--text-secondary)',
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editPermissions.includes(p.key)}
                                                                        onChange={e => {
                                                                            if (e.target.checked) {
                                                                                setEditPermissions(prev => [...prev, p.key]);
                                                                            } else {
                                                                                setEditPermissions(prev => prev.filter(k => k !== p.key));
                                                                            }
                                                                        }}
                                                                        style={{ display: 'none' }}
                                                                    />
                                                                    {editPermissions.includes(p.key) ? <Check size={10} /> : <X size={10} />}
                                                                    {p.label}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={async () => {
                                                                await updateUserRole(u.id, editRole);
                                                                await updateUserPermissions(u.id, editPermissions);
                                                                setEditingUserId(null);
                                                            }}
                                                        >
                                                            Save
                                                        </button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingUserId(null)}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
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
                            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
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
