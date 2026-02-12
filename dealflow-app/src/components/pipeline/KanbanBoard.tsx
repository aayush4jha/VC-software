'use client';

import React from 'react';
import { Pencil } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import {
    companies, pipelineStages, getCompaniesByStage, getUserById,
    getIndustryById, formatCurrency, getDaysInPipeline,
} from '@/lib/mock-data';
import { Company, PipelineStage } from '@/types/database';

function CompanyKanbanCard({ company }: { company: Company }) {
    const { setSelectedCompany, setEditingCompany, setShowCompanyForm } = useAppContext();
    const analyst = company.analystId ? getUserById(company.analystId) : null;
    const industry = getIndustryById(company.industryId);
    const days = getDaysInPipeline(company.createdAt);

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCompany(company);
        setShowCompanyForm(true);
    };

    return (
        <div
            className={`kanban-card ${company.priorityLevel === 'High' ? 'high-priority' : ''} ${company.isOverdue ? 'overdue' : ''}`}
            onClick={() => setSelectedCompany(company)}
        >
            <div className="kanban-card-header">
                <span className="kanban-card-name">{company.companyName}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        className="kanban-card-edit-btn"
                        onClick={handleEdit}
                        title="Edit company"
                    >
                        <Pencil size={12} />
                    </button>
                    <span className={`priority-dot ${company.priorityLevel.toLowerCase()}`} title={company.priorityLevel} />
                </div>
            </div>
            <div className="kanban-card-founder">{company.founderName}</div>
            <div className="kanban-card-tags">
                {industry && <span className="badge badge-primary">{industry.name}</span>}
                <span className="badge badge-neutral">{company.companyRound}</span>
            </div>
            <div className="kanban-card-footer">
                <div className="kanban-card-meta">
                    {analyst ? (
                        <div className="kanban-card-avatar" title={analyst.name}>
                            {analyst.name.split(' ').map(n => n[0]).join('')}
                        </div>
                    ) : (
                        <span className="badge badge-warning" style={{ fontSize: '10px', padding: '2px 6px' }}>Unassigned</span>
                    )}
                    <span className="kanban-card-days">{days}d</span>
                </div>
                {company.totalFundRaise && (
                    <span className="kanban-card-amount">{formatCurrency(company.totalFundRaise)}</span>
                )}
            </div>
        </div>
    );
}

export default function KanbanBoard() {
    const { searchQuery, activeFilters } = useAppContext();

    const filteredCompanies = companies.filter(c => {
        if (c.terminalStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const industry = getIndustryById(c.industryId);
            if (
                !c.companyName.toLowerCase().includes(q) &&
                !c.founderName.toLowerCase().includes(q) &&
                !c.founderEmail.toLowerCase().includes(q) &&
                !(industry?.name.toLowerCase().includes(q)) &&
                !c.subIndustry.toLowerCase().includes(q) &&
                !c.customTags.some(t => t.toLowerCase().includes(q))
            ) return false;
        }
        if (activeFilters.priority?.length) {
            if (!activeFilters.priority.includes(c.priorityLevel)) return false;
        }
        if (activeFilters.industry?.length) {
            if (!activeFilters.industry.includes(c.industryId)) return false;
        }
        if (activeFilters.analyst?.length) {
            if (!c.analystId || !activeFilters.analyst.includes(c.analystId)) return false;
        }
        if (activeFilters.round?.length) {
            if (!activeFilters.round.includes(c.companyRound)) return false;
        }
        return true;
    });

    return (
        <div className="kanban-board">
            {pipelineStages.map((stage) => {
                const stageCompanies = filteredCompanies.filter(c => c.pipelineStageId === stage.id);
                return (
                    <div key={stage.id} className="kanban-column">
                        <div className="kanban-column-header">
                            <div className="kanban-column-title">
                                <span className="kanban-column-dot" style={{ background: stage.color }} />
                                {stage.name}
                            </div>
                            <span className="kanban-column-count">{stageCompanies.length}</span>
                        </div>
                        <div className="kanban-column-body">
                            {stageCompanies.map((company) => (
                                <CompanyKanbanCard key={company.id} company={company} />
                            ))}
                            {stageCompanies.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                    No companies
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
