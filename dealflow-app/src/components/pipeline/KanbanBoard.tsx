'use client';

import React, { useState } from 'react';
import { Pencil, Video, Mail, Trash2, Briefcase, XCircle, FileText } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';
import { Company, PipelineStage, RejectionRecord } from '@/types/database';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

function CompanyKanbanCard({ company, index }: { company: Company; index: number }) {
    const { setSelectedCompany, setEditingCompany, setShowCompanyForm, setShowCalendarInvite, setShowEmailCompose, getUserById, getIndustryById, deleteCompany, setTerminalStatus, deckEmailLinks } = useAppContext();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showPortfolioConfirm, setShowPortfolioConfirm] = useState(false);
    const analyst = company.analystId ? getUserById(company.analystId) : null;
    const industry = getIndustryById(company.industryId);
    const days = getDaysInPipeline(company.createdAt);

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCompany(company);
        setShowCompanyForm(true);
    };

    const handleScheduleCall = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedCompany(company);
        setShowCalendarInvite(true);
    };

    const handleSendEmail = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedCompany(company);
        setShowEmailCompose(true);
    };

    const handleMoveToPortfolio = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowPortfolioConfirm(true);
    };

    const confirmMoveToPortfolio = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await setTerminalStatus(company.id, 'Portfolio');
        setShowPortfolioConfirm(false);
    };

    const cancelMoveToPortfolio = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowPortfolioConfirm(false);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const confirmDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteCompany(company.id);
        setShowDeleteConfirm(false);
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(false);
    };

    return (
        <Draggable draggableId={company.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`kanban-card ${company.priorityLevel === 'High' ? 'high-priority' : ''} ${company.isOverdue ? 'overdue' : ''} ${company.needsReview ? 'needs-review' : ''}`}
                    onClick={() => setSelectedCompany(company)}
                    style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.9 : 1,
                    }}
                >
                    {company.needsReview && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 10, fontWeight: 600,
                            color: '#8b5cf6',
                            background: 'rgba(139,92,246,0.1)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            marginBottom: 4,
                        }}>
                            <Mail size={10} /> Draft — Needs Review
                        </div>
                    )}
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
                    {(company.deckEmailLink || deckEmailLinks[company.id]) && (
                        <a
                            href={company.deckEmailLink || deckEmailLinks[company.id]}
                            target="_blank"
                            rel="noopener"
                            onClick={e => e.stopPropagation()}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 600, color: '#8b5cf6',
                                background: 'rgba(139,92,246,0.1)',
                                padding: '2px 8px', borderRadius: 4,
                                marginTop: 4, textDecoration: 'none',
                            }}
                            title="Open pitch deck email in Gmail"
                        >
                            <FileText size={10} /> Open Mail
                        </a>
                    )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                                className="kanban-card-edit-btn"
                                onClick={handleSendEmail}
                                title="Send email"
                                style={{ color: '#10b981' }}
                            >
                                <Mail size={12} />
                            </button>
                            <button
                                className="kanban-card-edit-btn"
                                onClick={handleScheduleCall}
                                title="Schedule Google Meet call"
                                style={{ color: '#06b6d4' }}
                            >
                                <Video size={12} />
                            </button>
                            <button
                                className="kanban-card-edit-btn"
                                onClick={handleMoveToPortfolio}
                                title="Move to Portfolio"
                                style={{ color: '#10b981' }}
                            >
                                <Briefcase size={12} />
                            </button>
                            <button
                                className="kanban-card-edit-btn"
                                onClick={handleDelete}
                                title="Delete company"
                                style={{ color: '#ef4444' }}
                            >
                                <Trash2 size={12} />
                            </button>
                            {company.totalFundRaise && (
                                <span className="kanban-card-amount">{formatCurrency(company.totalFundRaise)}</span>
                            )}
                        </div>
                    </div>
                    {showPortfolioConfirm && (
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                marginTop: 8,
                                padding: '10px 12px',
                                background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.2)',
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        >
                            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 6 }}>
                                Move {company.companyName} to Portfolio?
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    className="btn btn-sm"
                                    onClick={confirmMoveToPortfolio}
                                    style={{ background: '#10b981', color: '#fff', border: 'none', fontSize: 11, padding: '4px 10px' }}
                                >
                                    Move to Portfolio
                                </button>
                                <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={cancelMoveToPortfolio}
                                    style={{ fontSize: 11, padding: '4px 10px' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    {showDeleteConfirm && (
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                marginTop: 8,
                                padding: '10px 12px',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        >
                            <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                                Delete {company.companyName}?
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    className="btn btn-sm"
                                    onClick={confirmDelete}
                                    style={{ background: '#ef4444', color: '#fff', border: 'none', fontSize: 11, padding: '4px 10px' }}
                                >
                                    Delete
                                </button>
                                <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={cancelDelete}
                                    style={{ fontSize: 11, padding: '4px 10px' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Draggable>
    );
}

function RejectedCompanyCard({ company, rejectionRecord }: { company: Company; rejectionRecord?: RejectionRecord }) {
    const { setSelectedCompany, getUserById, getIndustryById, rejectionReasonCategories } = useAppContext();
    const analyst = company.analystId ? getUserById(company.analystId) : null;
    const industry = getIndustryById(company.industryId);
    const days = getDaysInPipeline(company.createdAt);

    // Resolve rejection reason names from category/sub-reason IDs
    const reasonNames: string[] = [];
    if (rejectionRecord?.reasons) {
        for (const r of rejectionRecord.reasons) {
            const cat = rejectionReasonCategories.find(c => c.id === r.categoryId);
            if (cat) {
                const subNames = r.subReasonIds
                    .map(sid => cat.subReasons.find(sr => sr.id === sid)?.name)
                    .filter(Boolean) as string[];
                if (subNames.length > 0) {
                    reasonNames.push(...subNames);
                } else {
                    reasonNames.push(cat.name);
                }
            }
        }
    }

    return (
        <div
            className="kanban-card"
            onClick={() => setSelectedCompany(company)}
            style={{ borderLeft: '3px solid #ef4444' }}
        >
            <div className="kanban-card-header">
                <span className="kanban-card-name">{company.companyName}</span>
                <span className={`priority-dot ${company.priorityLevel.toLowerCase()}`} title={company.priorityLevel} />
            </div>
            <div className="kanban-card-founder">{company.founderName}</div>
            <div className="kanban-card-tags">
                {industry && <span className="badge badge-primary">{industry.name}</span>}
                <span className="badge badge-neutral">{company.companyRound}</span>
            </div>
            {reasonNames.length > 0 && (
                <div style={{
                    marginTop: 6,
                    padding: '6px 8px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: 6,
                    fontSize: 11,
                }}>
                    <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Rejection Reasons
                    </div>
                    {reasonNames.map((name, i) => (
                        <div key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            • {name}
                        </div>
                    ))}
                </div>
            )}
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
    const { searchQuery, activeFilters, companies, pipelineStages, getIndustryById, moveCompanyStage, rejectionRecords } = useAppContext();

    // Rejected companies for the Rejected column
    const rejectedCompanies = companies.filter(c => {
        if (c.terminalStatus !== 'Rejected') return false;
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
        return true;
    });

    // Build a map of companyId -> rejection record for quick lookup
    const rejectionRecordMap = new Map(rejectionRecords.map(r => [r.companyId, r]));

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

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        // Dropped outside a droppable area
        if (!destination) return;

        // Dropped in the same column at the same position (no move)
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        // If the card moved to a different column, update the stage
        if (destination.droppableId !== source.droppableId) {
            moveCompanyStage(draggableId, destination.droppableId);
        }
    };

    const stageFilter = activeFilters.stage || [];
    const showRejectedColumn = stageFilter.length === 0 || stageFilter.includes('__rejected__');

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="kanban-board">
                {pipelineStages.filter(stage => stageFilter.length === 0 || stageFilter.includes(stage.id)).map((stage) => {
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
                            <Droppable droppableId={stage.id}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className="kanban-column-body"
                                        style={{
                                            background: snapshot.isDraggingOver ? 'var(--bg-tertiary, rgba(0,0,0,0.05))' : undefined,
                                            transition: 'background-color 0.2s ease',
                                            minHeight: 80,
                                        }}
                                    >
                                        {stageCompanies.map((company, index) => (
                                            <CompanyKanbanCard key={company.id} company={company} index={index} />
                                        ))}
                                        {provided.placeholder}
                                        {stageCompanies.length === 0 && !snapshot.isDraggingOver && (
                                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                                No companies
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    );
                })}

                {/* Rejected Companies Column */}
                {showRejectedColumn && <div className="kanban-column">
                    <div className="kanban-column-header">
                        <div className="kanban-column-title">
                            <span className="kanban-column-dot" style={{ background: '#ef4444' }} />
                            Rejected
                        </div>
                        <span className="kanban-column-count">{rejectedCompanies.length}</span>
                    </div>
                    <div className="kanban-column-body" style={{ minHeight: 80 }}>
                        {rejectedCompanies.map((company) => (
                            <RejectedCompanyCard
                                key={company.id}
                                company={company}
                                rejectionRecord={rejectionRecordMap.get(company.id)}
                            />
                        ))}
                        {rejectedCompanies.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                No rejected companies
                            </div>
                        )}
                    </div>
                </div>}
            </div>
        </DragDropContext>
    );
}
