'use client';

import React, { useState } from 'react';
import { ArrowUpDown, Video } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import {
    companies, getUserById, getIndustryById, getStageById,
    getDealSourceNameById, formatCurrency, getDaysInPipeline
} from '@/lib/mock-data';

export default function TableView() {
    const { setSelectedCompany, setShowCalendarInvite, searchQuery, activeFilters } = useAppContext();
    const [sortField, setSortField] = useState<string>('companyName');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const filtered = companies.filter(c => {
        if (c.terminalStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const industry = getIndustryById(c.industryId);
            if (
                !c.companyName.toLowerCase().includes(q) &&
                !c.founderName.toLowerCase().includes(q) &&
                !(industry?.name.toLowerCase().includes(q))
            ) return false;
        }
        if (activeFilters.priority?.length && !activeFilters.priority.includes(c.priorityLevel)) return false;
        if (activeFilters.industry?.length && !activeFilters.industry.includes(c.industryId)) return false;
        if (activeFilters.analyst?.length && (!c.analystId || !activeFilters.analyst.includes(c.analystId))) return false;
        if (activeFilters.round?.length && !activeFilters.round.includes(c.companyRound)) return false;
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        let av: string | number = '', bv: string | number = '';
        switch (sortField) {
            case 'companyName': av = a.companyName; bv = b.companyName; break;
            case 'founderName': av = a.founderName; bv = b.founderName; break;
            case 'priority': av = a.priorityLevel; bv = b.priorityLevel; break;
            case 'round': av = a.companyRound; bv = b.companyRound; break;
            case 'days': av = getDaysInPipeline(a.createdAt); bv = getDaysInPipeline(b.createdAt); break;
            case 'raise': av = a.totalFundRaise || 0; bv = b.totalFundRaise || 0; break;
        }
        if (typeof av === 'string') {
            return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
        }
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    const handleSort = (field: string) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const SortHeader = ({ field, label }: { field: string; label: string }) => (
        <th onClick={() => handleSort(field)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label} <ArrowUpDown size={12} />
            </span>
        </th>
    );

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <SortHeader field="companyName" label="Company" />
                        <SortHeader field="founderName" label="Founder" />
                        <th>Stage</th>
                        <SortHeader field="priority" label="Priority" />
                        <th>Industry</th>
                        <SortHeader field="round" label="Round" />
                        <th>Analyst</th>
                        <th>Deal Source</th>
                        <SortHeader field="days" label="Days" />
                        <SortHeader field="raise" label="Raise" />
                        <th>SLA</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((c) => {
                        const analyst = c.analystId ? getUserById(c.analystId) : null;
                        const industry = getIndustryById(c.industryId);
                        const stage = getStageById(c.pipelineStageId);
                        const source = getDealSourceNameById(c.dealSourceNameId);
                        const days = getDaysInPipeline(c.createdAt);
                        const slaStatus = c.isOverdue ? 'overdue' : days > 20 ? 'at-risk' : 'on-track';

                        return (
                            <tr key={c.id} onClick={() => setSelectedCompany(c)}>
                                <td><span className="table-company-name">{c.companyName}</span></td>
                                <td>{c.founderName}</td>
                                <td>
                                    <span className="table-stage-badge" style={{
                                        background: `${stage?.color}15`,
                                        color: stage?.color
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage?.color, display: 'inline-block' }} />
                                        {stage?.name}
                                    </span>
                                </td>
                                <td>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span className={`priority-dot ${c.priorityLevel.toLowerCase()}`} />
                                        {c.priorityLevel}
                                    </span>
                                </td>
                                <td><span className="badge badge-primary">{industry?.name}</span></td>
                                <td>{c.companyRound}</td>
                                <td>{analyst?.name || <span className="badge badge-warning">Unassigned</span>}</td>
                                <td>{source?.name}</td>
                                <td>{days}d</td>
                                <td>{c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '—'}</td>
                                <td>
                                    <span className={`sla-indicator ${slaStatus}`}>
                                        {slaStatus === 'on-track' ? '✓ On Track' : slaStatus === 'at-risk' ? '⚠ At Risk' : '✕ Overdue'}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCompany(c);
                                            setShowCalendarInvite(true);
                                        }}
                                        title="Schedule Google Meet call"
                                        style={{ padding: '4px 8px', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                                    >
                                        <Video size={13} /> Meet
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
