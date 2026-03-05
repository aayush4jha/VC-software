'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { Briefcase, Search } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';

function PortfolioContent() {
    const {
        companies,
        getIndustryById,
        setSelectedCompany,
        searchQuery,
        setSearchQuery,
    } = useAppContext();

    const portfolioCompanies = companies.filter(c => c.terminalStatus === 'Portfolio');

    const filtered = portfolioCompanies.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            c.companyName.toLowerCase().includes(q) ||
            c.founderName.toLowerCase().includes(q) ||
            c.founderEmail.toLowerCase().includes(q)
        );
    });

    return (
        <>
            <TopHeader title="Portfolio" subtitle={`${portfolioCompanies.length} invested companies`} />
            <div className="page-content page-enter">
                <div className="toolbar">
                    <div className="toolbar-left">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
                        </span>
                    </div>
                    <div className="toolbar-right">
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                type="text"
                                placeholder="Search portfolio..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="search-input"
                                style={{ paddingLeft: 32, width: 220 }}
                            />
                        </div>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state" style={{ height: '60vh' }}>
                        <div className="empty-state-icon"><Briefcase size={28} /></div>
                        <div className="empty-state-title">
                            {portfolioCompanies.length === 0
                                ? 'No Portfolio Companies Yet'
                                : 'No Results Found'}
                        </div>
                        <div className="empty-state-text">
                            {portfolioCompanies.length === 0
                                ? 'Companies marked as "Portfolio" in the pipeline will appear here. Move a company to Portfolio status from the deal flow pipeline.'
                                : 'Try adjusting your search query to find what you are looking for.'}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Company Name</th>
                                    <th>Founder Name</th>
                                    <th>Founder Email</th>
                                    <th>Industry</th>
                                    <th>Round</th>
                                    <th>Valuation</th>
                                    <th>Date Added</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(company => {
                                    const industry = getIndustryById(company.industryId);
                                    const days = getDaysInPipeline(company.createdAt);
                                    return (
                                        <tr
                                            key={company.id}
                                            onClick={() => setSelectedCompany(company)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="kanban-card-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                                                        {company.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="table-company-name">{company.companyName}</span>
                                                </div>
                                            </td>
                                            <td>{company.founderName}</td>
                                            <td style={{ color: 'var(--primary)' }}>{company.founderEmail}</td>
                                            <td>{industry?.name || '--'}</td>
                                            <td><span className="badge badge-info">{company.companyRound}</span></td>
                                            <td>{company.valuation ? formatCurrency(company.valuation) : '--'}</td>
                                            <td>
                                                <span title={new Date(company.createdAt).toLocaleDateString()}>
                                                    {new Date(company.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 12 }}>
                                                        ({days}d ago)
                                                    </span>
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

export default function PortfolioPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <PortfolioContent />
            </main>
            <CompanyDetail />
            <RejectionFlow />
            <EmailCompose />
            <CalendarInvite />
            <CompanyForm />
        </div>
    );
}
