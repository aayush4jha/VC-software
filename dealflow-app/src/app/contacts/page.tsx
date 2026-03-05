'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo } from 'react';
import { Users, Mail, Calendar, Building2, Search } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import { useAppContext } from '@/lib/context';

interface FounderContact {
    name: string;
    email: string;
    company: string;
    companyId: string;
    status: 'Pipeline' | 'Portfolio' | 'Rejected';
    industry: string;
    lastActivity: string;
    /** Reference to the full company object for actions */
    _companyRef: import('@/types/database').Company;
}

function ContactsContent() {
    const {
        companies,
        getIndustryById,
        setSelectedCompany,
        setShowEmailCompose,
        setShowCalendarInvite,
    } = useAppContext();

    const [localSearch, setLocalSearch] = useState('');

    // Build deduplicated founders list from ALL companies (pipeline, portfolio, rejected, etc.)
    const founders = useMemo<FounderContact[]>(() => {
        const seen = new Map<string, FounderContact>();

        for (const c of companies) {
            const email = (c.founderEmail || '').toLowerCase().trim();
            if (!email) continue;

            // Determine display status
            let status: FounderContact['status'] = 'Pipeline';
            if (c.terminalStatus === 'Portfolio') status = 'Portfolio';
            else if (c.terminalStatus === 'Rejected') status = 'Rejected';

            const industry = getIndustryById(c.industryId);

            // If we already saw this email, prefer the most "active" entry:
            // Portfolio > Pipeline > Rejected
            const existing = seen.get(email);
            const statusPriority: Record<string, number> = { Portfolio: 3, Pipeline: 2, Rejected: 1 };
            if (existing && (statusPriority[existing.status] || 0) >= (statusPriority[status] || 0)) {
                continue;
            }

            seen.set(email, {
                name: c.founderName,
                email: c.founderEmail,
                company: c.companyName,
                companyId: c.id,
                status,
                industry: industry?.name || '--',
                lastActivity: c.updatedAt || c.createdAt,
                _companyRef: c,
            });
        }

        return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [companies, getIndustryById]);

    // Filter by local search
    const filtered = useMemo(() => {
        if (!localSearch) return founders;
        const q = localSearch.toLowerCase();
        return founders.filter(f =>
            f.name.toLowerCase().includes(q) ||
            f.email.toLowerCase().includes(q) ||
            f.company.toLowerCase().includes(q) ||
            f.industry.toLowerCase().includes(q) ||
            f.status.toLowerCase().includes(q)
        );
    }, [founders, localSearch]);

    const handleEmailClick = (founder: FounderContact) => {
        setSelectedCompany(founder._companyRef);
        setShowEmailCompose(true);
    };

    const handleCalendarClick = (founder: FounderContact) => {
        setSelectedCompany(founder._companyRef);
        setShowCalendarInvite(true);
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'Portfolio': return 'badge badge-success';
            case 'Rejected': return 'badge badge-danger';
            default: return 'badge badge-info';
        }
    };

    const formatRelativeDate = (dateStr: string) => {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <>
            <TopHeader title="Contacts" subtitle="Founders database" />
            <div className="page-content page-enter">
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {filtered.length} {filtered.length === 1 ? 'founder' : 'founders'}
                        </span>
                    </div>
                    <div className="toolbar-right">
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                type="text"
                                placeholder="Search founders..."
                                value={localSearch}
                                onChange={e => setLocalSearch(e.target.value)}
                                className="search-input"
                                style={{ paddingLeft: 32, width: 240 }}
                            />
                        </div>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state" style={{ height: '60vh' }}>
                        <div className="empty-state-icon"><Users size={28} /></div>
                        <div className="empty-state-title">
                            {founders.length === 0 ? 'No Contacts Yet' : 'No Results Found'}
                        </div>
                        <div className="empty-state-text">
                            {founders.length === 0
                                ? 'Contacts will appear here as companies are added to the pipeline.'
                                : 'Try adjusting your search query to find the contact you are looking for.'}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Company</th>
                                    <th>Status</th>
                                    <th>Industry</th>
                                    <th>Last Activity</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((f, i) => (
                                    <tr key={f.email + '-' + i}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className="kanban-card-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                                                    {f.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="table-company-name">{f.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--primary)' }}>{f.email}</td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Building2 size={14} style={{ color: 'var(--text-tertiary)' }} />
                                                {f.company}
                                            </span>
                                        </td>
                                        <td><span className={getStatusBadgeClass(f.status)}>{f.status}</span></td>
                                        <td>{f.industry}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                            {formatRelativeDate(f.lastActivity)}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Send email"
                                                    onClick={() => handleEmailClick(f)}
                                                >
                                                    <Mail size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Schedule meeting"
                                                    onClick={() => handleCalendarClick(f)}
                                                >
                                                    <Calendar size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

export default function ContactsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <ContactsContent />
            </main>
            <EmailCompose />
            <CalendarInvite />
        </div>
    );
}
