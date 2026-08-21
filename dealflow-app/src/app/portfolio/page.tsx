'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, LayoutGrid, List, Plus } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import PortfolioCompanyDetail from '@/components/company/PortfolioCompanyDetail';
import CompanyForm from '@/components/company/CompanyForm';
import PortfolioCompanyForm from '@/components/company/PortfolioCompanyForm';
import { useAppContext } from '@/lib/context';
import {
    getPortfolioStage,
    getCurrentStage,
    getTotalInvested,
    getCompanyMOIC,
    getLatestValuation,
    formatPortfolioCurrency,
    formatMOIC,
    PORTFOLIO_STAGES,
    PORTFOLIO_STAGE_COLORS,
} from '@/lib/portfolio-utils';

import type { Company, FollowOnRound } from '@/types/database';

// ─── Avatar color helper ──────────────────────────
const AVATAR_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
];

function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
    return name
        .split(/\s+/)
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// ─── Types ────────────────────────────────────────
type CompanyView = 'board' | 'table';
type GroupByMode = 'current' | 'entry';

// ─── Portfolio Content ────────────────────────────
function PortfolioContent() {
    const {
        companies, users, industries, dealSourceNames,
        getIndustryById, getDealSourceNameById, getUserById,
        setSelectedCompany,
        searchQuery, setSearchQuery,
        setShowCompanyForm, setCompanyFormPortfolioMode,
        fetchAllFollowOns,
    } = useAppContext();

    const [companyView, setCompanyView] = useState<CompanyView>('board');
    const [groupBy, setGroupBy] = useState<GroupByMode>('current');
    const [filterIndustry, setFilterIndustry] = useState<string>('all');
    const [filterStage, setFilterStage] = useState<string>('all');
    const [filterCurrentStage, setFilterCurrentStage] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterSourcer, setFilterSourcer] = useState<string>('all');
    const [followOnsByCompany, setFollowOnsByCompany] = useState<Record<string, FollowOnRound[]>>({});

    useEffect(() => {
        let cancelled = false;
        fetchAllFollowOns().then(rows => {
            if (cancelled) return;
            const grouped: Record<string, FollowOnRound[]> = {};
            rows.forEach(r => {
                if (!grouped[r.companyId]) grouped[r.companyId] = [];
                grouped[r.companyId].push(r);
            });
            setFollowOnsByCompany(grouped);
        }).catch(() => { if (!cancelled) setFollowOnsByCompany({}); });
        return () => { cancelled = true; };
    }, [fetchAllFollowOns]);

    // Portfolio companies = terminalStatus === 'Portfolio'
    const portfolioCompanies = useMemo(
        () => companies.filter(c => c.terminalStatus === 'Portfolio'),
        [companies]
    );

    // Unique values for filter dropdowns
    const uniqueIndustries = useMemo(() => {
        const ids = new Set(portfolioCompanies.map(c => c.industryId).filter(Boolean));
        return Array.from(ids).map(id => {
            const ind = getIndustryById(id!);
            return ind ? { id: ind.id, name: ind.name } : null;
        }).filter(Boolean) as { id: string; name: string }[];
    }, [portfolioCompanies, getIndustryById]);

    const uniqueStages = useMemo(() => {
        const stages = new Set(portfolioCompanies.map(c => c.companyRound).filter(Boolean));
        return Array.from(stages);
    }, [portfolioCompanies]);

    const uniqueCurrentStages = useMemo(() => {
        const stages = new Set<string>();
        portfolioCompanies.forEach(c => {
            const s = getCurrentStage(c, followOnsByCompany[c.id] || []);
            if (s) stages.add(s);
        });
        return Array.from(stages);
    }, [portfolioCompanies, followOnsByCompany]);

    const uniqueSourcers = useMemo(() => {
        const ids = new Set(portfolioCompanies.map(c => c.dealSourceNameId).filter(Boolean));
        return Array.from(ids).map(id => {
            const src = getDealSourceNameById(id!);
            return src ? { id: src.id, name: src.name } : null;
        }).filter(Boolean) as { id: string; name: string }[];
    }, [portfolioCompanies, getDealSourceNameById]);

    // Apply filters & search
    const filtered = useMemo(() => {
        return portfolioCompanies.filter(c => {
            if (filterIndustry !== 'all' && c.industryId !== filterIndustry) return false;
            if (filterStage !== 'all' && c.companyRound !== filterStage) return false;
            if (filterCurrentStage !== 'all'
                && getCurrentStage(c, followOnsByCompany[c.id] || []) !== filterCurrentStage) return false;
            if (filterStatus !== 'all' && (c.portfolioStatus || 'Active') !== filterStatus) return false;
            if (filterSourcer !== 'all' && c.dealSourceNameId !== filterSourcer) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (c.companyName || '').toLowerCase();
                const founder = (c.founderName || '').toLowerCase();
                const industry = getIndustryById(c.industryId || '')?.name?.toLowerCase() || '';
                if (!name.includes(q) && !founder.includes(q) && !industry.includes(q)) return false;
            }
            return true;
        });
    }, [portfolioCompanies, filterIndustry, filterStage, filterCurrentStage, filterStatus, filterSourcer, searchQuery, getIndustryById, followOnsByCompany]);

    // Group companies for board view
    const groupedCompanies = useMemo(() => {
        const groups: Record<string, Company[]> = {};
        PORTFOLIO_STAGES.forEach(stage => {
            groups[stage] = [];
        });

        filtered.forEach(c => {
            let stage: string;
            if (groupBy === 'current') {
                // Derive from latest follow-on round so a company that entered
                // at Seed and has since taken a Series B round groups under
                // Series B. Falls back to the entry round when there are no
                // follow-ons. getPortfolioStage would return c.companyRound
                // (the entry stage) which is wrong for this mode.
                stage = getCurrentStage(c, followOnsByCompany[c.id] || []);
            } else {
                stage = c.companyRound || 'Pre-Seed';
            }
            if (!groups[stage]) {
                groups[stage] = [];
            }
            groups[stage].push(c);
        });

        return groups;
    }, [filtered, groupBy, followOnsByCompany]);

    const handleAddPortfolioCompany = () => {
        setCompanyFormPortfolioMode(true);
        setShowCompanyForm(true);
    };

    // ─── Render Board Card ────────────────────────
    const renderBoardCard = (c: Company) => {
        const industry = getIndustryById(c.industryId || '')?.name || '';
        const sourcer = getDealSourceNameById(c.dealSourceNameId || '')?.name || '';
        const invested = getTotalInvested(c, followOnsByCompany[c.id] || []);
        const initials = getInitials(c.companyName || 'NA');
        const avatarBg = getAvatarColor(c.companyName || '');

        return (
            <div key={c.id} className="portfolio-board-card" onClick={() => setSelectedCompany(c)}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: avatarBg,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 600,
                            flexShrink: 0,
                        }}
                    >
                        {initials}
                    </div>
                    <div>
                        <div className="portfolio-board-card-name">{c.companyName}</div>
                        <div className="portfolio-board-card-meta">
                            {industry}{industry && c.hqLocation ? ' \u00b7 ' : ''}{c.hqLocation || ''}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sourcer}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>
                        {invested > 0 ? formatPortfolioCurrency(invested) : '\u2014'}
                    </span>
                </div>
            </div>
        );
    };

    // ─── Render Board View ────────────────────────
    const renderBoardView = () => (
        <div className="portfolio-board" style={{ marginTop: 16 }}>
            {PORTFOLIO_STAGES.map(stage => {
                const stageCompanies = groupedCompanies[stage] || [];
                if (stageCompanies.length === 0 && groupBy === 'entry') return null;
                return (
                    <div key={stage} className="portfolio-board-column">
                        <div className="portfolio-board-column-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="col-dot" style={{ backgroundColor: PORTFOLIO_STAGE_COLORS[stage] || '#94a3b8' }} />
                                <span>{stage}</span>
                            </div>
                            <span className="portfolio-board-column-count">{stageCompanies.length}</span>
                        </div>
                        <div className="portfolio-board-column-body">
                            {stageCompanies.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                                    No companies
                                </div>
                            ) : (
                                stageCompanies.map(c => renderBoardCard(c))
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // ─── Render Table View ────────────────────────
    const renderTableView = () => (
        <div className="table-container" style={{ marginTop: 16 }}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Company</th>
                        <th>Industry</th>
                        <th>Location</th>
                        <th>Stage</th>
                        <th>Invested</th>
                        <th>Valuation</th>
                        <th>MOIC</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(c => {
                        const industry = getIndustryById(c.industryId || '')?.name || '\u2014';
                        const companyFollowOns = followOnsByCompany[c.id] || [];
                        const invested = getTotalInvested(c, companyFollowOns);
                        const valuation = getLatestValuation(c, companyFollowOns);
                        const moic = getCompanyMOIC(c, companyFollowOns);
                        const status = c.portfolioStatus || 'Active';
                        const stage = getPortfolioStage(c);

                        return (
                            <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 6,
                                                backgroundColor: getAvatarColor(c.companyName || ''),
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {getInitials(c.companyName || 'NA')}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{c.companyName}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.founderName}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>{industry}</td>
                                <td>{c.hqLocation || '\u2014'}</td>
                                <td>
                                    <span
                                        className="badge"
                                        style={{
                                            backgroundColor: `${PORTFOLIO_STAGE_COLORS[stage] || '#94a3b8'}20`,
                                            color: PORTFOLIO_STAGE_COLORS[stage] || '#94a3b8',
                                        }}
                                    >
                                        {stage}
                                    </span>
                                </td>
                                <td style={{ fontWeight: 600, color: '#10b981' }}>
                                    {invested > 0 ? formatPortfolioCurrency(invested) : '\u2014'}
                                </td>
                                <td>{valuation > 0 ? formatPortfolioCurrency(valuation) : '\u2014'}</td>
                                <td>
                                    <span style={{
                                        fontWeight: 600,
                                        color: moic >= 1 ? '#10b981' : moic > 0 ? '#f59e0b' : 'var(--text-secondary)',
                                    }}>
                                        {invested > 0 ? formatMOIC(moic) : '\u2014'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`badge ${
                                        status === 'Active' ? 'badge-success' :
                                        status === 'Exited' ? 'badge-info' :
                                        'badge-danger'
                                    }`}>
                                        {status}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                                No portfolio companies found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <>
            <TopHeader title="Portfolio Companies" subtitle={`${filtered.length} companies`} />
            <div className="page-content">
                {/* Toolbar */}
                <div className="toolbar">
                    <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* Filter dropdowns */}
                        <select
                            className="portfolio-select"
                            value={filterIndustry}
                            onChange={e => setFilterIndustry(e.target.value)}
                        >
                            <option value="all">Industry</option>
                            {uniqueIndustries.map(ind => (
                                <option key={ind.id} value={ind.id}>{ind.name}</option>
                            ))}
                        </select>

                        <select
                            className="portfolio-select"
                            value={filterStage}
                            onChange={e => setFilterStage(e.target.value)}
                        >
                            <option value="all">Entry Stage</option>
                            {uniqueStages.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>

                        <select
                            className="portfolio-select"
                            value={filterCurrentStage}
                            onChange={e => setFilterCurrentStage(e.target.value)}
                        >
                            <option value="all">Current Stage</option>
                            {uniqueCurrentStages.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>

                        <select
                            className="portfolio-select"
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="all">Status</option>
                            <option value="Active">Active</option>
                            <option value="Exited">Exited</option>
                            <option value="Written Off">Written Off</option>
                        </select>

                        <select
                            className="portfolio-select"
                            value={filterSourcer}
                            onChange={e => setFilterSourcer(e.target.value)}
                        >
                            <option value="all">Sourcer</option>
                            {uniqueSourcers.map(src => (
                                <option key={src.id} value={src.id}>{src.name}</option>
                            ))}
                        </select>

                        {/* Group by toggle */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 13, color: 'var(--text-secondary)',
                        }}>
                            <span>Group by:</span>
                            <div className="view-toggle">
                                <button
                                    className={`view-toggle-btn ${groupBy === 'current' ? 'active' : ''}`}
                                    onClick={() => setGroupBy('current')}
                                    style={{ fontSize: 12 }}
                                >
                                    Current
                                </button>
                                <button
                                    className={`view-toggle-btn ${groupBy === 'entry' ? 'active' : ''}`}
                                    onClick={() => setGroupBy('entry')}
                                    style={{ fontSize: 12 }}
                                >
                                    Entry
                                </button>
                            </div>
                        </div>

                        {/* Company count */}
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
                        </span>
                    </div>

                    <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{
                                position: 'absolute', left: 10, top: '50%',
                                transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
                            }} />
                            <input
                                className="search-input"
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ paddingLeft: 32, width: 160 }}
                            />
                        </div>

                        {/* View toggle */}
                        <div className="view-toggle">
                            <button
                                className={`view-toggle-btn ${companyView === 'board' ? 'active' : ''}`}
                                onClick={() => setCompanyView('board')}
                            >
                                <LayoutGrid size={14} /> Board
                            </button>
                            <button
                                className={`view-toggle-btn ${companyView === 'table' ? 'active' : ''}`}
                                onClick={() => setCompanyView('table')}
                            >
                                <List size={14} /> Table
                            </button>
                        </div>

                        {/* Add Company */}
                        <button className="btn btn-primary" onClick={handleAddPortfolioCompany}>
                            <Plus size={16} /> Add Company
                        </button>
                    </div>
                </div>

                {/* Content */}
                {companyView === 'board' ? renderBoardView() : renderTableView()}
            </div>
        </>
    );
}

// ─── Page ─────────────────────────────────────────
export default function PortfolioPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <PortfolioContent />
            </main>
            <PortfolioCompanyDetail />
            <CompanyForm />
            <PortfolioCompanyForm />
        </div>
    );
}
