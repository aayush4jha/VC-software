'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { CompanyRound, PriorityLevel, DealSourceType, ShareType } from '@/types/database';

const rounds: CompanyRound[] = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
const priorities: PriorityLevel[] = ['Low', 'Medium', 'High'];
const dealSourceTypes: DealSourceType[] = ['Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'];
const shareTypes: ShareType[] = ['Primary', 'Secondary'];

export default function CompanyForm() {
    const {
        showCompanyForm, setShowCompanyForm, editingCompany, setEditingCompany,
        industries, users, dealSourceNames, pipelineStages,
        createCompany, updateCompany, companies,
    } = useAppContext();

    const isEditing = !!editingCompany;
    const [form, setForm] = useState({
        company_name: '',
        founder_name: '',
        founder_email: '',
        pipeline_stage_id: '',
        analyst_id: '',
        company_round: 'Seed' as CompanyRound,
        priority_level: 'Medium' as PriorityLevel,
        industry_id: '',
        sub_industry: '',
        share_type: 'Primary' as ShareType,
        deal_source_type: 'Founder Network' as DealSourceType,
        deal_source_name_id: '',
        total_fund_raise: '',
        valuation: '',
        google_drive_link: '',
        custom_tags: '',
        sla_deadline: '',
        linked_previous_entry_id: '',
    });
    const [saving, setSaving] = useState(false);

    // State for the "Link to Previous Entry" searchable dropdown
    const [linkSearch, setLinkSearch] = useState('');
    const [showLinkDropdown, setShowLinkDropdown] = useState(false);
    const linkDropdownRef = useRef<HTMLDivElement>(null);

    // Filtered companies for the link dropdown
    const filteredLinkCompanies = linkSearch.trim()
        ? companies.filter(c =>
            c.companyName.toLowerCase().includes(linkSearch.toLowerCase()) &&
            c.id !== editingCompany?.id // don't allow linking to self
        ).slice(0, 10)
        : [];

    // Get the display name of the currently linked company
    const linkedCompanyName = form.linked_previous_entry_id
        ? companies.find(c => c.id === form.linked_previous_entry_id)?.companyName || ''
        : '';

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (linkDropdownRef.current && !linkDropdownRef.current.contains(e.target as Node)) {
                setShowLinkDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Populate form when editing
    React.useEffect(() => {
        if (editingCompany) {
            setForm({
                company_name: editingCompany.companyName,
                founder_name: editingCompany.founderName,
                founder_email: editingCompany.founderEmail,
                pipeline_stage_id: editingCompany.pipelineStageId,
                analyst_id: editingCompany.analystId || '',
                company_round: editingCompany.companyRound,
                priority_level: editingCompany.priorityLevel,
                industry_id: editingCompany.industryId,
                sub_industry: editingCompany.subIndustry,
                share_type: editingCompany.shareType,
                deal_source_type: editingCompany.dealSourceType,
                deal_source_name_id: editingCompany.dealSourceNameId,
                total_fund_raise: editingCompany.totalFundRaise?.toString() || '',
                valuation: editingCompany.valuation?.toString() || '',
                google_drive_link: editingCompany.googleDriveLink || '',
                custom_tags: editingCompany.customTags?.join(', ') || '',
                sla_deadline: editingCompany.slaDeadline || '',
                linked_previous_entry_id: editingCompany.linkedPreviousEntryId || '',
            });
            // Pre-populate the search field with the linked company name
            if (editingCompany.linkedPreviousEntryId) {
                const linked = companies.find(c => c.id === editingCompany.linkedPreviousEntryId);
                if (linked) setLinkSearch(linked.companyName);
            }
        } else {
            setForm(f => ({ ...f, pipeline_stage_id: pipelineStages[0]?.id || '', industry_id: industries[0]?.id || '', deal_source_name_id: dealSourceNames[0]?.id || '' }));
        }
    }, [editingCompany, pipelineStages, industries, dealSourceNames, companies]);

    if (!showCompanyForm) return null;

    const handleClose = () => {
        setShowCompanyForm(false);
        setEditingCompany(null);
    };

    const handleSubmit = async () => {
        if (!form.company_name || !form.founder_name || !form.founder_email) return;
        setSaving(true);
        const data: Record<string, unknown> = {
            companyName: form.company_name,
            founderName: form.founder_name,
            founderEmail: form.founder_email,
            pipelineStageId: form.pipeline_stage_id,
            analystId: form.analyst_id || null,
            companyRound: form.company_round,
            priorityLevel: form.priority_level,
            industryId: form.industry_id,
            subIndustry: form.sub_industry,
            shareType: form.share_type,
            dealSourceType: form.deal_source_type,
            dealSourceNameId: form.deal_source_name_id,
            totalFundRaise: form.total_fund_raise ? parseFloat(form.total_fund_raise) : null,
            valuation: form.valuation ? parseFloat(form.valuation) : null,
            googleDriveLink: form.google_drive_link || null,
            customTags: form.custom_tags ? form.custom_tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            slaDeadline: form.sla_deadline || null,
            linkedPreviousEntryId: form.linked_previous_entry_id || null,
        };
        if (isEditing) {
            await updateCompany(editingCompany!.id, data);
        } else {
            await createCompany(data);
        }
        setSaving(false);
        handleClose();
    };

    const upd = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

    const handleSelectLinkedCompany = (companyId: string, companyName: string) => {
        setForm(f => ({ ...f, linked_previous_entry_id: companyId }));
        setLinkSearch(companyName);
        setShowLinkDropdown(false);
    };

    const handleClearLinkedCompany = () => {
        setForm(f => ({ ...f, linked_previous_entry_id: '' }));
        setLinkSearch('');
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh' }}>
                <div className="modal-header">
                    <div className="modal-title">{isEditing ? 'Edit Company' : 'Add New Company'}</div>
                    <button className="btn btn-ghost btn-sm" onClick={handleClose}><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Company Name *</label>
                            <input className="form-input" placeholder="Enter company name" value={form.company_name} onChange={upd('company_name')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Pipeline Stage</label>
                            <select className="form-select" value={form.pipeline_stage_id} onChange={upd('pipeline_stage_id')}>
                                {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Founder Name *</label>
                            <input className="form-input" placeholder="Enter founder name" value={form.founder_name} onChange={upd('founder_name')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Founder Email *</label>
                            <input className="form-input" type="email" placeholder="founder@company.com" value={form.founder_email} onChange={upd('founder_email')} />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Assign to Analyst</label>
                            <select className="form-select" value={form.analyst_id} onChange={upd('analyst_id')}>
                                <option value="">Unassigned</option>
                                {users.filter(u => u.role === 'analyst').map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Round</label>
                            <select className="form-select" value={form.company_round} onChange={upd('company_round')}>
                                {rounds.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Priority Level</label>
                            <select className="form-select" value={form.priority_level} onChange={upd('priority_level')}>
                                {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Industry</label>
                            <select className="form-select" value={form.industry_id} onChange={upd('industry_id')}>
                                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Sub-Industry</label>
                            <input className="form-input" placeholder="e.g. B2B Payments" value={form.sub_industry} onChange={upd('sub_industry')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Share Type</label>
                            <select className="form-select" value={form.share_type} onChange={upd('share_type')}>
                                {shareTypes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Deal Source Type</label>
                            <select className="form-select" value={form.deal_source_type} onChange={upd('deal_source_type')}>
                                {dealSourceTypes.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Deal Source Name</label>
                            <select className="form-select" value={form.deal_source_name_id} onChange={upd('deal_source_name_id')}>
                                {dealSourceNames.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Total Fund Raise (&#8377;)</label>
                            <input className="form-input" type="number" placeholder="e.g. 150000000" value={form.total_fund_raise} onChange={upd('total_fund_raise')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Valuation (&#8377;)</label>
                            <input className="form-input" type="number" placeholder="e.g. 600000000" value={form.valuation} onChange={upd('valuation')} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Google Drive Link</label>
                        <input className="form-input" type="url" placeholder="https://drive.google.com/..." value={form.google_drive_link} onChange={upd('google_drive_link')} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Custom Tags</label>
                        <input className="form-input" placeholder="Enter tags separated by commas" value={form.custom_tags} onChange={upd('custom_tags')} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">SLA Deadline</label>
                        <input className="form-input" type="date" value={form.sla_deadline} onChange={upd('sla_deadline')} />
                    </div>

                    <div className="form-group" ref={linkDropdownRef} style={{ position: 'relative' }}>
                        <label className="form-label">Link to Previous Entry</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 32 }}
                                placeholder="Search company name..."
                                value={linkSearch}
                                onChange={e => {
                                    setLinkSearch(e.target.value);
                                    setShowLinkDropdown(true);
                                    // If the user clears the search, also clear the linked id
                                    if (!e.target.value.trim()) {
                                        setForm(f => ({ ...f, linked_previous_entry_id: '' }));
                                    }
                                }}
                                onFocus={() => {
                                    if (linkSearch.trim()) setShowLinkDropdown(true);
                                }}
                            />
                            {form.linked_previous_entry_id && (
                                <button
                                    type="button"
                                    onClick={handleClearLinkedCompany}
                                    style={{
                                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2,
                                    }}
                                    title="Clear linked company"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        {form.linked_previous_entry_id && linkedCompanyName && (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                Linked to: {linkedCompanyName}
                            </div>
                        )}
                        {showLinkDropdown && filteredLinkCompanies.length > 0 && (
                            <div
                                style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                    background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-primary, #e2e8f0)',
                                    borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200,
                                    overflowY: 'auto', marginTop: 4,
                                }}
                            >
                                {filteredLinkCompanies.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => handleSelectLinkedCompany(c.id, c.companyName)}
                                        style={{
                                            padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                            borderBottom: '1px solid var(--border-primary, #f1f5f9)',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <div style={{ fontWeight: 500 }}>{c.companyName}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.founderName} &middot; {c.companyRound}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {showLinkDropdown && linkSearch.trim() && filteredLinkCompanies.length === 0 && (
                            <div
                                style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                    background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-primary, #e2e8f0)',
                                    borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    padding: '8px 12px', fontSize: 13, color: '#94a3b8', marginTop: 4,
                                }}
                            >
                                No matching companies found
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                        <Plus size={14} /> {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Company'}
                    </button>
                </div>
            </div>
        </div>
    );
}
