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
}

function AuditTrailContent() {
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [companies, setCompanies] = useState<Record<string, string>>({});
    const [users, setUsers] = useState<Record<string, { name: string; role: string }>>({});
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
        const rows = [['ID', 'Timestamp', 'User', 'Role', 'Company', 'Action', 'Entity', 'Field', 'Old Value', 'New Value', 'Details'].join(',')];
        for (const l of filtered) {
            const userName = l.user_id ? users[l.user_id]?.name || '' : '';
            const userRole = l.user_id ? users[l.user_id]?.role || '' : '';
            const companyName = l.company_id ? companies[l.company_id] || '' : '';
            rows.push([l.id, l.created_at, `"${userName}"`, userRole, `"${companyName}"`, l.action, l.entity, l.field || '', `"${(l.old_value || '').replace(/"/g, '""')}"`, `"${(l.new_value || '').replace(/"/g, '""')}"`, `"${l.details.replace(/"/g, '""')}"`].join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const actionColor: Record<string, string> = {
        field_update: '#3b82f6', stage_change: '#8b5cf6', created: '#10b981',
        rejected: '#ef4444', assigned: '#06b6d4', terminal_status_set: '#f59e0b',
        approved: '#10b981', terminal_status_resolved: '#6366f1',
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
                        {actionTypes.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                    </select>
                    <select className="form-input" value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ width: 180, fontSize: 13, height: 36 }}>
                        <option value="">All users</option>
                        {userList.map(([id, u]) => <option key={id} value={id}>{u.name}</option>)}
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
                        <div style={{ fontWeight: 600 }}>No audit entries found</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Changes will appear here as users update company data.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filtered.map(l => {
                            const userName = l.user_id ? users[l.user_id]?.name || 'System' : 'System';
                            const userRole = l.user_id ? users[l.user_id]?.role || '' : '';
                            const companyName = l.company_id ? companies[l.company_id] || 'Unknown' : '—';
                            const color = actionColor[l.action] || 'var(--text-secondary)';
                            const time = new Date(l.created_at);
                            return (
                                <div key={l.id} style={{
                                    display: 'flex', gap: 12, padding: '10px 14px',
                                    borderBottom: '1px solid var(--border-light)',
                                    fontSize: 13, alignItems: 'flex-start',
                                }}>
                                    {/* Time */}
                                    <div style={{ width: 130, flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                        <div>{time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                        <div>{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                    {/* Action badge */}
                                    <div style={{ width: 110, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                            background: `${color}15`, color,
                                            textTransform: 'uppercase', letterSpacing: '0.3px',
                                        }}>
                                            {l.action.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    {/* User */}
                                    <div style={{ width: 120, flexShrink: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>{userName}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{userRole}</div>
                                    </div>
                                    {/* Company */}
                                    <div style={{ width: 140, flexShrink: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {companyName}
                                    </div>
                                    {/* Change details */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {l.field ? (
                                            <div>
                                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{l.field}</span>
                                                {l.old_value && l.new_value ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12 }}>
                                                        <span style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '1px 6px', borderRadius: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{l.old_value}</span>
                                                        <ArrowRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                                        <span style={{ color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '1px 6px', borderRadius: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{l.new_value}</span>
                                                    </div>
                                                ) : l.new_value ? (
                                                    <div style={{ fontSize: 12, marginTop: 2 }}>
                                                        Set to: <span style={{ color: '#10b981', fontWeight: 500 }}>{l.new_value}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div style={{ color: 'var(--text-secondary)' }}>{l.details}</div>
                                        )}
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
