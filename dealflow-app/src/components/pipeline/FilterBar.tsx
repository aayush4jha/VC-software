'use client';

import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { users, industries, pipelineStages } from '@/lib/mock-data';
import { CompanyRound, PriorityLevel } from '@/types/database';

const priorities: PriorityLevel[] = ['High', 'Medium', 'Low'];
const rounds: CompanyRound[] = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];

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
                                    {selected.includes(opt.value) && '✓'}
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
    const { activeFilters, setActiveFilters } = useAppContext();
    const totalFilters = Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0);

    return (
        <div className="filter-bar">
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
            {totalFilters > 0 && (
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveFilters({})}
                    style={{ color: 'var(--danger)' }}
                >
                    <X size={14} /> Clear all ({totalFilters})
                </button>
            )}
        </div>
    );
}
