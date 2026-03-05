'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, X, Save, BookmarkCheck, Download, Trash2 } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { CompanyRound, DealSourceType, PriorityLevel, TerminalStatus } from '@/types/database';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';

const priorities: PriorityLevel[] = ['High', 'Medium', 'Low'];
const rounds: CompanyRound[] = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
const dealSourceTypes: DealSourceType[] = ['Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'];
const statusOptions: (TerminalStatus | 'Active')[] = ['Active', 'Rejected', 'Awaiting Response', 'Blocker', 'Next Round Analysis', 'Portfolio'];

const SAVED_VIEWS_KEY = 'dealflow_saved_views';

interface LocalSavedView {
    id: string;
    name: string;
    filters: Record<string, string[]>;
}

function loadSavedViews(): LocalSavedView[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(SAVED_VIEWS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function persistSavedViews(views: LocalSavedView[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

interface FilterDropdownProps {
    label: string;
    filterKey: string;
    options: { value: string; label: string }[];
}

function FilterDropdown({ label, filterKey, options }: FilterDropdownProps) {
    const [open, setOpen] = useState(false);
    const { activeFilters, setActiveFilters } = useAppContext();
    const selected = activeFilters[filterKey] || [];

    const toggle = (value: string) => {
        const next = selected.includes(value)
            ? selected.filter(v => v !== value)
            : [...selected, value];
        setActiveFilters({ ...activeFilters, [filterKey]: next });
    };

    return (
        <div className="filter-dropdown">
            <button
                className={`filter-trigger ${selected.length > 0 ? 'active' : ''}`}
                onClick={() => setOpen(!open)}
            >
                {label} {selected.length > 0 && `(${selected.length})`}
                <ChevronDown size={14} />
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
                    <div className="filter-menu">
                        {options.map(opt => (
                            <div
                                key={opt.value}
                                className={`filter-menu-item ${selected.includes(opt.value) ? 'selected' : ''}`}
                                onClick={() => toggle(opt.value)}
                            >
                                <span className={`reason-checkbox ${selected.includes(opt.value) ? 'checked' : ''}`} style={{ width: 16, height: 16 }}>
                                    {selected.includes(opt.value) && '\u2713'}
                                </span>
                                {opt.label}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function FilterBar() {
    const {
        activeFilters, setActiveFilters,
        users, industries, pipelineStages, dealSourceNames,
        companies, getUserById, getIndustryById, getStageById, getDealSourceNameById,
    } = useAppContext();

    const totalFilters = Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0);

    // ── Saved Views (localStorage) ──────────────────
    const [savedViews, setSavedViews] = useState<LocalSavedView[]>([]);
    const [savedViewsOpen, setSavedViewsOpen] = useState(false);

    useEffect(() => {
        setSavedViews(loadSavedViews());
    }, []);

    const handleSaveView = useCallback(() => {
        const name = prompt('Enter a name for this saved view:');
        if (!name || !name.trim()) return;
        const newView: LocalSavedView = {
            id: crypto.randomUUID(),
            name: name.trim(),
            filters: { ...activeFilters },
        };
        const updated = [newView, ...savedViews];
        setSavedViews(updated);
        persistSavedViews(updated);
    }, [activeFilters, savedViews]);

    const handleLoadView = useCallback((view: LocalSavedView) => {
        setActiveFilters(view.filters);
        setSavedViewsOpen(false);
    }, [setActiveFilters]);

    const handleDeleteView = useCallback((id: string) => {
        const updated = savedViews.filter(v => v.id !== id);
        setSavedViews(updated);
        persistSavedViews(updated);
    }, [savedViews]);

    // ── CSV Export ──────────────────────────────────
    const handleExportCSV = useCallback(() => {
        // Apply the same filtering logic used in TableView
        const filtered = companies.filter(c => {
            // Status filter logic
            if (activeFilters.status?.length) {
                const hasActive = activeFilters.status.includes('Active');
                const terminalStatuses = activeFilters.status.filter(s => s !== 'Active');
                const matchesActive = hasActive && !c.terminalStatus;
                const matchesTerminal = terminalStatuses.length > 0 && c.terminalStatus && terminalStatuses.includes(c.terminalStatus);
                if (!matchesActive && !matchesTerminal) return false;
            } else {
                // Default: exclude terminal-status companies (same as existing behaviour)
                if (c.terminalStatus) return false;
            }
            if (activeFilters.priority?.length && !activeFilters.priority.includes(c.priorityLevel)) return false;
            if (activeFilters.industry?.length && !activeFilters.industry.includes(c.industryId)) return false;
            if (activeFilters.analyst?.length && (!c.analystId || !activeFilters.analyst.includes(c.analystId))) return false;
            if (activeFilters.round?.length && !activeFilters.round.includes(c.companyRound)) return false;
            if (activeFilters.stage?.length && !activeFilters.stage.includes(c.pipelineStageId)) return false;
            if (activeFilters.dealSourceType?.length && !activeFilters.dealSourceType.includes(c.dealSourceType)) return false;
            if (activeFilters.dealSourceName?.length && !activeFilters.dealSourceName.includes(c.dealSourceNameId)) return false;
            return true;
        });

        const headers = [
            'Company Name',
            'Founder Name',
            'Founder Email',
            'Stage',
            'Priority',
            'Industry',
            'Round',
            'Analyst',
            'Deal Source',
            'Fund Raise',
            'Valuation',
            'SLA Status',
            'Days in Pipeline',
        ];

        const escapeCSV = (value: string) => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };

        const rows = filtered.map(c => {
            const stage = getStageById(c.pipelineStageId);
            const industry = getIndustryById(c.industryId);
            const analyst = c.analystId ? getUserById(c.analystId) : null;
            const source = getDealSourceNameById(c.dealSourceNameId);
            const days = getDaysInPipeline(c.createdAt);
            const slaStatus = c.isOverdue ? 'Overdue' : days > 20 ? 'At Risk' : 'On Track';

            return [
                c.companyName,
                c.founderName,
                c.founderEmail,
                stage?.name || '',
                c.priorityLevel,
                industry?.name || '',
                c.companyRound,
                analyst?.name || 'Unassigned',
                source?.name || '',
                c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '',
                c.valuation ? formatCurrency(c.valuation) : '',
                slaStatus,
                String(days),
            ].map(escapeCSV).join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dealflow_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [companies, activeFilters, getStageById, getIndustryById, getUserById, getDealSourceNameById]);

    return (
        <div className="filter-bar">
            {/* ── Filter Dropdowns ── */}
            <FilterDropdown
                label="Priority"
                filterKey="priority"
                options={priorities.map(p => ({ value: p, label: p }))}
            />
            <FilterDropdown
                label="Industry"
                filterKey="industry"
                options={industries.map(i => ({ value: i.id, label: i.name }))}
            />
            <FilterDropdown
                label="Analyst"
                filterKey="analyst"
                options={users.filter(u => u.role === 'analyst').map(u => ({ value: u.id, label: u.name }))}
            />
            <FilterDropdown
                label="Round"
                filterKey="round"
                options={rounds.map(r => ({ value: r, label: r }))}
            />
            <FilterDropdown
                label="Stage"
                filterKey="stage"
                options={pipelineStages.map(s => ({ value: s.id, label: s.name }))}
            />
            <FilterDropdown
                label="Deal Source Type"
                filterKey="dealSourceType"
                options={dealSourceTypes.map(t => ({ value: t, label: t }))}
            />
            <FilterDropdown
                label="Deal Source Name"
                filterKey="dealSourceName"
                options={dealSourceNames.map(d => ({ value: d.id, label: d.name }))}
            />
            <FilterDropdown
                label="Status"
                filterKey="status"
                options={statusOptions.map(s => ({ value: s, label: s }))}
            />

            {/* ── Clear All ── */}
            {totalFilters > 0 && (
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveFilters({})}
                    style={{ color: 'var(--danger)' }}
                >
                    <X size={14} /> Clear all ({totalFilters})
                </button>
            )}

            {/* ── Saved Views ── */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Save View button (only shown when filters are active) */}
                {totalFilters > 0 && (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleSaveView}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        title="Save current filters as a view"
                    >
                        <Save size={14} /> Save View
                    </button>
                )}

                {/* Saved Views dropdown */}
                <div className="filter-dropdown">
                    <button
                        className={`filter-trigger ${savedViewsOpen ? 'active' : ''}`}
                        onClick={() => setSavedViewsOpen(!savedViewsOpen)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <BookmarkCheck size={14} /> Saved Views
                        <ChevronDown size={14} />
                    </button>
                    {savedViewsOpen && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSavedViewsOpen(false)} />
                            <div className="filter-menu" style={{ minWidth: 200 }}>
                                {savedViews.length === 0 ? (
                                    <div className="filter-menu-item" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                                        No saved views
                                    </div>
                                ) : (
                                    savedViews.map(view => (
                                        <div
                                            key={view.id}
                                            className="filter-menu-item"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                        >
                                            <span
                                                style={{ flex: 1, cursor: 'pointer' }}
                                                onClick={() => handleLoadView(view)}
                                            >
                                                {view.name}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteView(view.id);
                                                }}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--danger)', padding: 2, display: 'flex', alignItems: 'center',
                                                }}
                                                title="Delete saved view"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Export CSV ── */}
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleExportCSV}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                    title="Export filtered companies as CSV"
                >
                    <Download size={14} /> Export CSV
                </button>
            </div>
        </div>
    );
}
