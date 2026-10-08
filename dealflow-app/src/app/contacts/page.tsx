'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo } from 'react';
import { Users, Mail, Calendar, Building2, Search, Pencil, Check, X } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import BulkEmailModal from '@/components/common/BulkEmailModal';
import { useAppContext } from '@/lib/context';
import type { Company, Founder } from '@/types/database';

// Contact categories shown as filter chips. Investment Bankers and Venture
// Capitalists need a dedicated contacts table to populate — they render as
// empty groups until that ships.
type ContactCategory = 'portfolio-founder' | 'normal-founder' | 'investment-banker' | 'venture-capitalist';

const CATEGORY_LABELS: Record<ContactCategory, string> = {
    'portfolio-founder': 'Portfolio Founders',
    'normal-founder': 'Normal Founders',
    'investment-banker': 'Investment Bankers',
    'venture-capitalist': 'Venture Capitalists',
};

interface FounderContact {
    /** Stable id: company.id + founder index */
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    companyId: string;
    category: ContactCategory;
    status: 'Pipeline' | 'Portfolio' | 'Rejected';
    industry: string;
    lastActivity: string;
    founderIndex: number;
    _companyRef: Company;
}

function ContactsContent() {
    const {
        companies,
        getIndustryById,
        setSelectedCompany,
        setShowEmailCompose,
        setShowCalendarInvite,
        updateCompany,
    } = useAppContext();

    const [localSearch, setLocalSearch] = useState('');
    const [activeCategories, setActiveCategories] = useState<Set<ContactCategory>>(new Set());
    // Inline edit state — which contact + which field is in edit, plus the draft value.
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState('');

    // Aggregate every founder from every company's founders array. Falls
    // back to the legacy founderName / founderEmail for companies that
    // haven't migrated to the new array yet.
    const founders = useMemo<FounderContact[]>(() => {
        const out: FounderContact[] = [];

        for (const c of companies) {
            // Legacy fallback: synthesize a single founder from founderName / founderEmail
            // when the founders array is empty.
            const rawFounders: Founder[] = c.founders && c.founders.length > 0
                ? c.founders
                : (c.founderName || c.founderEmail)
                    ? [{ name: c.founderName || '', email: c.founderEmail || '', phone: undefined }]
                    : [];

            for (let i = 0; i < rawFounders.length; i++) {
                const f = rawFounders[i];
                if (!f.name && !f.email && !f.phone) continue;

                let status: FounderContact['status'] = 'Pipeline';
                if (c.terminalStatus === 'Portfolio') status = 'Portfolio';
                else if (c.terminalStatus === 'Rejected') status = 'Rejected';

                const category: ContactCategory = status === 'Portfolio' ? 'portfolio-founder' : 'normal-founder';
                const industry = getIndustryById(c.industryId);

                out.push({
                    id: `${c.id}:${i}`,
                    name: f.name || '',
                    email: f.email || '',
                    phone: f.phone || '',
                    company: c.companyName,
                    companyId: c.id,
                    category,
                    status,
                    industry: industry?.name || '--',
                    lastActivity: c.updatedAt || c.createdAt,
                    founderIndex: i,
                    _companyRef: c,
                });
            }
        }

        return out.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    }, [companies, getIndustryById]);

    // Apply filters: category chips + search.
    const filtered = useMemo(() => {
        const q = localSearch.toLowerCase();
        return founders.filter(f => {
            if (activeCategories.size > 0 && !activeCategories.has(f.category)) return false;
            if (!q) return true;
            return (
                f.name.toLowerCase().includes(q) ||
                f.email.toLowerCase().includes(q) ||
                f.phone.toLowerCase().includes(q) ||
                f.company.toLowerCase().includes(q) ||
                f.industry.toLowerCase().includes(q) ||
                f.status.toLowerCase().includes(q)
            );
        });
    }, [founders, localSearch, activeCategories]);

    // Bulk email selection. Keyed by contact id (company id + founder index),
    // so the same person at two companies is two rows here and one send — the
    // modal dedups by address.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showBulkEmail, setShowBulkEmail] = useState(false);

    // Per-category counts shown on the chips.
    const categoryCounts = useMemo(() => {
        const counts: Record<ContactCategory, number> = {
            'portfolio-founder': 0,
            'normal-founder': 0,
            'investment-banker': 0,
            'venture-capitalist': 0,
        };
        for (const f of founders) counts[f.category]++;
        return counts;
    }, [founders]);

    // Clicking "Portfolio Founders" both filters to them and selects them, so
    // emailing a whole category is one click rather than a filter followed by
    // a select-all. Turning the chip off releases that category's selection
    // again — otherwise people stay selected after they are out of view.
    const toggleCategory = (cat: ContactCategory) => {
        const inCategory = founders.filter(f => f.category === cat && f.email.includes('@')).map(f => f.id);
        const turningOn = !activeCategories.has(cat);
        setActiveCategories(prev => {
            const next = new Set(prev);
            if (turningOn) next.add(cat); else next.delete(cat);
            return next;
        });
        setSelected(prev => {
            const next = new Set(prev);
            for (const id of inCategory) {
                if (turningOn) next.add(id); else next.delete(id);
            }
            return next;
        });
    };

    const selectableIds = useMemo(
        () => filtered.filter(f => f.email.includes('@')).map(f => f.id),
        [filtered],
    );
    const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

    const toggleSelected = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Select-all applies to what the filters currently show, so "email every
    // portfolio founder" is a category chip plus one click.
    const toggleSelectAll = () => setSelected(prev => {
        if (selectableIds.every(id => prev.has(id))) {
            const next = new Set(prev);
            selectableIds.forEach(id => next.delete(id));
            return next;
        }
        return new Set([...prev, ...selectableIds]);
    });

    const bulkRecipients = useMemo(
        () => founders
            .filter(f => selected.has(f.id) && f.email.includes('@'))
            .map(f => ({
                email: f.email,
                founderName: f.name,
                companyName: f.company,
                companyId: f.companyId,
            })),
        [founders, selected],
    );

    const handleEmailClick = (c: FounderContact) => {
        setSelectedCompany(c._companyRef);
        setShowEmailCompose(true);
    };

    const handleCalendarClick = (c: FounderContact) => {
        setSelectedCompany(c._companyRef);
        setShowCalendarInvite(true);
    };

    // Persist an edit by mutating the company's founders array and saving.
    const saveEdit = async (contact: FounderContact, field: 'name' | 'email' | 'phone', value: string) => {
        const c = contact._companyRef;
        const baseFounders: Founder[] = c.founders && c.founders.length > 0
            ? c.founders
            : (c.founderName || c.founderEmail)
                ? [{ name: c.founderName || '', email: c.founderEmail || '' }]
                : [];

        const next = baseFounders.map((f, i) => i === contact.founderIndex ? { ...f, [field]: value } : f);
        const payload: Record<string, unknown> = { founders: next };
        // Keep the legacy single-name / single-email columns in sync with
        // the first founder so older readers stay correct.
        if (contact.founderIndex === 0) {
            if (field === 'name') payload.founderName = value;
            if (field === 'email') payload.founderEmail = value;
        }
        await updateCompany(c.id, payload);
        setEditingKey(null);
        setDraft('');
    };

    const startEdit = (contact: FounderContact, field: 'name' | 'email' | 'phone', current: string) => {
        setEditingKey(`${contact.id}:${field}`);
        setDraft(current);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setDraft('');
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

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'Portfolio': return 'badge badge-success';
            case 'Rejected': return 'badge badge-danger';
            default: return 'badge badge-info';
        }
    };

    return (
        <>
            <TopHeader title="Contacts" subtitle="Founders & key relationships" />
            <div className="page-content page-enter">
                {/* Category filter chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {(Object.keys(CATEGORY_LABELS) as ContactCategory[]).map(cat => {
                        const active = activeCategories.has(cat);
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => toggleCategory(cat)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
                                    background: active ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                                    color: active ? '#6366f1' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                {CATEGORY_LABELS[cat]}
                                <span style={{
                                    fontSize: 10,
                                    padding: '1px 6px',
                                    borderRadius: 999,
                                    background: active ? '#6366f1' : 'var(--bg-tertiary)',
                                    color: active ? '#fff' : 'var(--text-tertiary)',
                                }}>
                                    {categoryCounts[cat]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="toolbar">
                    <div className="toolbar-left">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {filtered.length} {filtered.length === 1 ? 'contact' : 'contacts'}
                        </span>
                    </div>
                    <div className="toolbar-right">
                        {selected.size > 0 && (
                            <>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setShowBulkEmail(true)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Mail size={14} /> Email {selected.size} selected
                                </button>
                                <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
                                    Clear
                                </button>
                            </>
                        )}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                type="text"
                                placeholder="Search contacts..."
                                value={localSearch}
                                onChange={e => setLocalSearch(e.target.value)}
                                className="search-input"
                                style={{ paddingLeft: 32, width: 260 }}
                            />
                        </div>
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state" style={{ height: '50vh' }}>
                        <div className="empty-state-icon"><Users size={28} /></div>
                        <div className="empty-state-title">
                            {founders.length === 0 ? 'No Contacts Yet' : 'No Matches'}
                        </div>
                        <div className="empty-state-text">
                            {founders.length === 0
                                ? 'Contacts will appear here as founders are added to companies.'
                                : activeCategories.size > 0 && [...activeCategories].every(c => c === 'investment-banker' || c === 'venture-capitalist')
                                    ? 'No contacts in this category yet. IB and VC contacts will appear here once a dedicated contacts table is added.'
                                    : 'Try adjusting your search or filters.'}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table contacts-table">
                            <colgroup>
                                <col style={{ width: '3%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '6%' }} />
                                <col style={{ width: '4%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            title="Select every contact the filters are showing"
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Company</th>
                                    <th>Status</th>
                                    <th>Industry</th>
                                    <th>Last</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(c.id)}
                                                disabled={!c.email.includes('@')}
                                                onChange={() => toggleSelected(c.id)}
                                                title={c.email.includes('@') ? 'Select for bulk email' : 'No email address on this contact'}
                                                style={{ cursor: c.email.includes('@') ? 'pointer' : 'not-allowed' }}
                                            />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                                                    {(c.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <EditableCell
                                                    isEditing={editingKey === `${c.id}:name`}
                                                    value={c.name || '--'}
                                                    draft={draft}
                                                    onStart={() => startEdit(c, 'name', c.name)}
                                                    onChange={setDraft}
                                                    onSave={() => saveEdit(c, 'name', draft)}
                                                    onCancel={cancelEdit}
                                                    placeholder="Founder name"
                                                />
                                            </div>
                                        </td>
                                        <td>
                                            <EditableCell
                                                isEditing={editingKey === `${c.id}:email`}
                                                value={c.email || '--'}
                                                draft={draft}
                                                onStart={() => startEdit(c, 'email', c.email)}
                                                onChange={setDraft}
                                                onSave={() => saveEdit(c, 'email', draft)}
                                                onCancel={cancelEdit}
                                                placeholder="founder@company.com"
                                                inputType="email"
                                                color="var(--primary)"
                                            />
                                        </td>
                                        <td>
                                            <EditableCell
                                                isEditing={editingKey === `${c.id}:phone`}
                                                value={c.phone || '--'}
                                                draft={draft}
                                                onStart={() => startEdit(c, 'phone', c.phone)}
                                                onChange={setDraft}
                                                onSave={() => saveEdit(c, 'phone', draft)}
                                                onCancel={cancelEdit}
                                                placeholder="+91 9XXXXXXXXX"
                                                inputType="tel"
                                            />
                                        </td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.3 }}>
                                                <Building2 size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                                                <span style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{c.company}</span>
                                            </span>
                                        </td>
                                        <td><span className={getStatusBadgeClass(c.status)}>{c.status}</span></td>
                                        <td style={{ wordBreak: 'break-word' }}>{c.industry}</td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                            {formatRelativeDate(c.lastActivity)}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Send email"
                                                    onClick={() => handleEmailClick(c)}
                                                    style={{ padding: 4 }}
                                                >
                                                    <Mail size={13} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Schedule meeting"
                                                    onClick={() => handleCalendarClick(c)}
                                                    style={{ padding: 4 }}
                                                >
                                                    <Calendar size={13} />
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

            {showBulkEmail && (
                <BulkEmailModal
                    recipients={bulkRecipients}
                    onClose={() => { setShowBulkEmail(false); }}
                />
            )}
        </>
    );
}

// Inline-editable text cell. Click the pencil to edit, Enter to save,
// Escape to cancel. Displays the value otherwise.
function EditableCell({ isEditing, value, draft, onStart, onChange, onSave, onCancel, placeholder, inputType, color }: {
    isEditing: boolean;
    value: string;
    draft: string;
    onStart: () => void;
    onChange: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
    placeholder?: string;
    inputType?: string;
    color?: string;
}) {
    if (isEditing) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                    type={inputType || 'text'}
                    value={draft}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                    autoFocus
                    placeholder={placeholder}
                    style={{
                        flex: 1, minWidth: 0, fontSize: 13, padding: '4px 6px',
                        height: 28, border: '1px solid var(--border)', borderRadius: 4,
                    }}
                />
                <button onClick={onSave} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    <Check size={14} style={{ color: 'var(--success)' }} />
                </button>
                <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                    <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                </button>
            </div>
        );
    }
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }}>
            <span style={{ wordBreak: 'break-word', color, fontSize: 13 }}>{value}</span>
            <button
                onClick={onStart}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                title="Edit"
            >
                <Pencil size={11} style={{ color: 'var(--text-tertiary)' }} />
            </button>
        </div>
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
