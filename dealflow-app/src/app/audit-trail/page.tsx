'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, FileText, ArrowRight, Download } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';

interface AuditEntry {
    id: string;
    company_id: string | null;
    user_id: string | null;
    action: string;
    entity: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
    details: string;
    created_at: string;
    source: string;
}

function AuditTrailContent() {
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [companies, setCompanies] = useState<Record<string, string>>({});
    const [users, setUsers] = useState<Record<string, { name: string; role: string }>>({});
    const [stages, setStages] = useState<Record<string, { name: string; color: string }>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterUser, setFilterUser] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/audit-logs?limit=500');
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to load'); return; }
            setLogs(data.logs || []);
            setCompanies(data.companies || {});
            setUsers(data.users || {});
            setStages(data.stages || {});
        } catch { setError('Network error'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const filtered = logs.filter(l => {
        if (filterAction && l.action !== filterAction) return false;
        if (filterUser && l.user_id !== filterUser) return false;
        if (search) {
            const q = search.toLowerCase();
            const companyName = l.company_id ? companies[l.company_id] || '' : '';
            const userName = l.user_id ? users[l.user_id]?.name || '' : '';
            return companyName.toLowerCase().includes(q)
                || userName.toLowerCase().includes(q)
                || l.details.toLowerCase().includes(q)
                || (l.field || '').toLowerCase().includes(q);
        }
        return true;
    });

    const actionTypes = [...new Set(logs.map(l => l.action))].sort();
    const userList = Object.entries(users).sort(([, a], [, b]) => a.name.localeCompare(b.name));

    const handleExport = () => {
        const rows = [['Change ID', 'Timestamp', 'User', 'Role', 'Company', 'Action', 'Field', 'Old Value', 'New Value', 'Details'].join(',')];
        for (const l of filtered) {
            const userName = l.user_id ? users[l.user_id]?.name || '' : '';
            const userRole = l.user_id ? users[l.user_id]?.role || '' : '';
            const companyName = l.company_id ? companies[l.company_id] || '' : '';
            const oldDisplay = l.field === 'pipeline_stage' && l.old_value ? stages[l.old_value]?.name || l.old_value : l.old_value || '';
            const newDisplay = l.field === 'pipeline_stage' && l.new_value ? stages[l.new_value]?.name || l.new_value : l.new_value || '';
            rows.push([l.id, l.created_at, `"${userName}"`, userRole, `"${companyName}"`, l.action, l.field || '', `"${oldDisplay.replace(/"/g, '""')}"`, `"${newDisplay.replace(/"/g, '""')}"`, `"${l.details.replace(/"/g, '""')}"`].join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const actionLabels: Record<string, { label: string; color: string }> = {
        created: { label: 'Created', color: '#10b981' },
        stage_change: { label: 'Stage Move', color: '#8b5cf6' },
        assigned: { label: 'Assigned', color: '#06b6d4' },
        rejected: { label: 'Rejected', color: '#ef4444' },
        terminal_status_set: { label: 'Status Set', color: '#f59e0b' },
        terminal_status_resolved: { label: 'Status Resolved', color: '#6366f1' },
        approved: { label: 'Approved', color: '#10b981' },
        field_update: { label: 'Field Update', color: '#3b82f6' },
    };

    if (error) {
        return (
            <>
                <TopHeader title="Audit Trail" subtitle="Change history" />
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
            </>
        );
    }

    return (
        <>
            <TopHeader title="Audit Trail" subtitle={`${filtered.length} entries`} />
            <div className="page-content page-enter" style={{ padding: 24 }}>
                {/* Filters */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 250px', maxWidth: 350 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input className="search-input" placeholder="Search company, user, field..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: '100%' }} />
                    </div>
                    <select className="form-input" value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ width: 180, fontSize: 13, height: 36 }}>
                        <option value="">All actions</option>
                        {actionTypes.map(a => <option key={a} value={a}>{actionLabels[a]?.label || a}</option>)}
                    </select>
                    <select className="form-input" value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ width: 180, fontSize: 13, height: 36 }}>
                        <option value="">All users</option>
                        {userList.map(([id, u]) => <option key={id} value={id}>{u.name} ({u.role})</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Download size={14} /> Export CSV
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 8, color: 'var(--text-tertiary)' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading audit logs...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <FileText size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                        <div style={{ fontWeight: 600 }}>No entries found</div>
                    </div>
                ) : (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {/* Table header */}
                        <div style={{ display: 'flex', padding: '10px 16px', borderBottom: '2px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <div style={{ width: 150 }}>Timestamp</div>
                            <div style={{ width: 110 }}>Action</div>
                            <div style={{ width: 140 }}>Who</div>
                            <div style={{ width: 160 }}>Company</div>
                            <div style={{ flex: 1 }}>What Changed</div>
                            <div style={{ width: 80, textAlign: 'right', fontSize: 10 }}>ID</div>
                        </div>
                        {/* Rows */}
                        {filtered.map(l => {
                            const userName = l.user_id ? users[l.user_id]?.name || 'System' : 'System';
                            const userRole = l.user_id ? users[l.user_id]?.role || '' : '';
                            const companyName = l.company_id ? companies[l.company_id] || 'Deleted' : '—';
                            const actionInfo = actionLabels[l.action] || { label: l.action, color: 'var(--text-secondary)' };
                            const time = new Date(l.created_at);

                            // Resolve stage names for stage_change actions
                            let oldDisplay = l.old_value || '';
                            let newDisplay = l.new_value || '';
                            if (l.field === 'pipeline_stage' || l.action === 'stage_change') {
                                if (l.old_value && stages[l.old_value]) oldDisplay = stages[l.old_value].name;
                                if (l.new_value && stages[l.new_value]) newDisplay = stages[l.new_value].name;
                            }

                            return (
                                <div key={l.id} style={{
                                    display: 'flex', padding: '10px 16px', borderBottom: '1px solid var(--border-light)',
                                    fontSize: 13, alignItems: 'center',
                                    transition: 'background 0.1s',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Timestamp */}
                                    <div style={{ width: 150, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                                        <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                        <div>{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                    </div>
                                    {/* Action */}
                                    <div style={{ width: 110 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                                            background: `${actionInfo.color}15`, color: actionInfo.color,
                                        }}>
                                            {actionInfo.label}
                                        </span>
                                    </div>
                                    {/* Who */}
                                    <div style={{ width: 140 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className="kanban-card-avatar" style={{ width: 24, height: 24, fontSize: 9, flexShrink: 0 }}>
                                                {userName.split(' ').map(n => n[0]).join('')}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{userName}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{userRole}</div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Company */}
                                    <div style={{ width: 160, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {companyName}
                                    </div>
                                    {/* What Changed */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {(l.action === 'stage_change' && oldDisplay && newDisplay) ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 500 }}>{oldDisplay}</span>
                                                <ArrowRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.08)', color: '#10b981', fontWeight: 500 }}>{newDisplay}</span>
                                            </div>
                                        ) : l.field && oldDisplay && newDisplay ? (
                                            <div>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>{l.field}: </span>
                                                <span style={{ fontSize: 12, color: '#ef4444' }}>{oldDisplay}</span>
                                                <span style={{ margin: '0 4px', color: 'var(--text-tertiary)' }}>→</span>
                                                <span style={{ fontSize: 12, color: '#10b981' }}>{newDisplay}</span>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.details}</div>
                                        )}
                                    </div>
                                    {/* ID */}
                                    <div style={{ width: 80, textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                                        {l.id.slice(0, 8)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

export default function AuditTrailPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <AuditTrailContent />
            </main>
        </div>
    );
}
