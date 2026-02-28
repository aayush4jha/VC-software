'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
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
        createCompany, updateCompany,
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
    });
    const [saving, setSaving] = useState(false);

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
            });
        } else {
            setForm(f => ({ ...f, pipeline_stage_id: pipelineStages[0]?.id || '', industry_id: industries[0]?.id || '', deal_source_name_id: dealSourceNames[0]?.id || '' }));
        }
    }, [editingCompany, pipelineStages, industries, dealSourceNames]);

    if (!showCompanyForm) return null;

    const handleClose = () => {
        setShowCompanyForm(false);
        setEditingCompany(null);
    };

    const handleSubmit = async () => {
        if (!form.company_name || !form.founder_name || !form.founder_email) return;
        setSaving(true);
        const data: Record<string, unknown> = {
            company_name: form.company_name,
            founder_name: form.founder_name,
            founder_email: form.founder_email,
            pipeline_stage_id: form.pipeline_stage_id,
            analyst_id: form.analyst_id || null,
            company_round: form.company_round,
            priority_level: form.priority_level,
            industry_id: form.industry_id,
            sub_industry: form.sub_industry,
            share_type: form.share_type,
            deal_source_type: form.deal_source_type,
            deal_source_name_id: form.deal_source_name_id,
            total_fund_raise: form.total_fund_raise ? parseFloat(form.total_fund_raise) : null,
            valuation: form.valuation ? parseFloat(form.valuation) : null,
            google_drive_link: form.google_drive_link || null,
            custom_tags: form.custom_tags ? form.custom_tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            sla_deadline: form.sla_deadline || null,
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
                            <label className="form-label">Total Fund Raise (₹)</label>
                            <input className="form-input" type="number" placeholder="e.g. 150000000" value={form.total_fund_raise} onChange={upd('total_fund_raise')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Valuation (₹)</label>
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
