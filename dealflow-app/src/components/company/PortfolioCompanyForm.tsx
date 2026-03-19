'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { CompanyRound, ShareType, FollowOnRound } from '@/types/database';

type PortfolioStatus = 'Active' | 'Exited' | 'Written Off';

const rounds: CompanyRound[] = [
    'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A',
    'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO',
];
const shareTypes: ShareType[] = ['Primary', 'Secondary'];
const portfolioStatuses: PortfolioStatus[] = ['Active', 'Exited', 'Written Off'];

interface LocalFollowOn {
    _tempId?: string;           // for newly added rows (not yet persisted)
    id?: string;                // for existing rows from DB
    roundName: string;
    roundDate: string;
    totalRaised: string;
    ourInvestment: string;
    didWeInvest: boolean;
    roundValuation: string;
    ownershipAfter: string;
    investorNames: string;
}

function emptyFollowOn(): LocalFollowOn {
    return {
        _tempId: crypto.randomUUID(),
        roundName: '',
        roundDate: '',
        totalRaised: '',
        ourInvestment: '',
        didWeInvest: false,
        roundValuation: '',
        ownershipAfter: '',
        investorNames: '',
    };
}

export default function PortfolioCompanyForm() {
    const {
        showCompanyForm, setShowCompanyForm,
        editingCompany, setEditingCompany,
        companyFormPortfolioMode, setCompanyFormPortfolioMode,
        industries, users, dealSourceNames, pipelineStages,
        createCompany, updateCompany, companies,
        fetchFollowOns, addFollowOn, updateFollowOn, deleteFollowOn,
    } = useAppContext();

    const isEditing = !!editingCompany && editingCompany.terminalStatus === 'Portfolio';

    const [form, setForm] = useState({
        company_name: '',
        industry_id: '',
        hq_location: '',
        deal_source_name_id: '',
        analyst_id: '',
        entry_date: '',
        entry_stage: 'Seed' as CompanyRound,
        current_stage: 'Seed' as CompanyRound,
        initial_investment: '',
        share_type: 'Primary' as ShareType,
        entry_valuation: '',
        entry_ownership: '',
        portfolio_status: 'Active' as PortfolioStatus,
        founder_names: '',
        notes: '',
    });

    const [followOns, setFollowOns] = useState<LocalFollowOn[]>([]);
    const [deletedFollowOnIds, setDeletedFollowOnIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Populate form when editing
    useEffect(() => {
        if (isEditing && editingCompany) {
            setForm({
                company_name: editingCompany.companyName,
                industry_id: editingCompany.industryId,
                hq_location: editingCompany.hqLocation || '',
                deal_source_name_id: editingCompany.dealSourceNameId,
                analyst_id: editingCompany.analystId || '',
                entry_date: editingCompany.createdAt ? editingCompany.createdAt.slice(0, 10) : '',
                entry_stage: editingCompany.companyRound,
                current_stage: editingCompany.companyRound,
                initial_investment: editingCompany.initialInvestment?.toString() || '',
                share_type: editingCompany.shareType,
                entry_valuation: editingCompany.entryValuation?.toString() || '',
                entry_ownership: editingCompany.entryOwnership?.toString() || '',
                portfolio_status: editingCompany.portfolioStatus || 'Active',
                founder_names: editingCompany.founderName || '',
                notes: editingCompany.notes || '',
            });

            // Load follow-on rounds
            fetchFollowOns(editingCompany.id).then((rounds: FollowOnRound[]) => {
                setFollowOns(
                    rounds.map(r => ({
                        id: r.id,
                        roundName: r.roundName,
                        roundDate: r.roundDate ? r.roundDate.slice(0, 10) : '',
                        totalRaised: r.totalRaised?.toString() || '',
                        ourInvestment: r.ourInvestment?.toString() || '',
                        didWeInvest: r.didWeInvest,
                        roundValuation: r.roundValuation?.toString() || '',
                        ownershipAfter: r.ownershipAfter?.toString() || '',
                        investorNames: r.investorNames || '',
                    }))
                );
            });
        } else if (!isEditing) {
            setForm(f => ({
                ...f,
                industry_id: industries[0]?.id || '',
                deal_source_name_id: dealSourceNames[0]?.id || '',
            }));
            setFollowOns([]);
            setDeletedFollowOnIds([]);
        }
    }, [editingCompany, isEditing, industries, dealSourceNames, fetchFollowOns]);

    // Determine visibility
    // When companyFormPortfolioMode is true AND not editing, show this form.
    // When editing a Portfolio company, show this form.
    // Otherwise return null.
    if (!showCompanyForm) return null;
    if (isEditing) {
        // editing a portfolio company - show form
    } else if (companyFormPortfolioMode) {
        // creating a new portfolio company - show form
    } else {
        return null;
    }

    const handleClose = () => {
        setShowCompanyForm(false);
        setEditingCompany(null);
        setCompanyFormPortfolioMode(false);
    };

    const upd = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }));

    const addFollowOnRow = () => {
        setFollowOns(prev => [...prev, emptyFollowOn()]);
    };

    const updateFollowOnRow = (index: number, field: keyof LocalFollowOn, value: string | boolean) => {
        setFollowOns(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
    };

    const removeFollowOnRow = (index: number) => {
        const row = followOns[index];
        if (row.id) {
            setDeletedFollowOnIds(prev => [...prev, row.id!]);
        }
        setFollowOns(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!form.company_name || !form.industry_id || !form.hq_location ||
            !form.deal_source_name_id || !form.analyst_id || !form.entry_date ||
            !form.initial_investment || !form.portfolio_status) return;

        setSaving(true);

        const data: Record<string, unknown> = {
            companyName: form.company_name,
            founderName: form.founder_names,
            founderEmail: '',
            industryId: form.industry_id,
            hqLocation: form.hq_location,
            dealSourceNameId: form.deal_source_name_id,
            analystId: form.analyst_id || null,
            companyRound: form.entry_stage,
            shareType: form.share_type,
            initialInvestment: form.initial_investment ? parseFloat(form.initial_investment) : null,
            entryValuation: form.entry_valuation ? parseFloat(form.entry_valuation) : null,
            entryOwnership: form.entry_ownership ? parseFloat(form.entry_ownership) : null,
            portfolioStatus: form.portfolio_status,
            notes: form.notes,
            pipelineStageId: pipelineStages[0]?.id || '',
            priorityLevel: 'Medium',
            dealSourceType: 'Founder Network',
            subIndustry: '',
        };

        if (isEditing && editingCompany) {
            await updateCompany(editingCompany.id, data);

            // Delete removed follow-ons
            for (const id of deletedFollowOnIds) {
                await deleteFollowOn(id);
            }

            // Update existing / add new follow-ons
            for (const fo of followOns) {
                const foData = {
                    roundName: fo.roundName,
                    roundDate: fo.roundDate || new Date().toISOString(),
                    totalRaised: fo.totalRaised ? parseFloat(fo.totalRaised) : null,
                    ourInvestment: fo.ourInvestment ? parseFloat(fo.ourInvestment) : null,
                    didWeInvest: fo.didWeInvest,
                    roundValuation: fo.roundValuation ? parseFloat(fo.roundValuation) : null,
                    ownershipAfter: fo.ownershipAfter ? parseFloat(fo.ownershipAfter) : null,
                    investorNames: fo.investorNames,
                };
                if (fo.id) {
                    await updateFollowOn(fo.id, foData);
                } else {
                    await addFollowOn({ ...foData, companyId: editingCompany.id });
                }
            }
        } else {
            // Create mode
            data.terminalStatus = 'Portfolio';
            const created = await createCompany(data);

            // Add follow-on rounds after company creation
            if (created) {
                for (const fo of followOns) {
                    await addFollowOn({
                        companyId: created.id,
                        roundName: fo.roundName,
                        roundDate: fo.roundDate || new Date().toISOString(),
                        totalRaised: fo.totalRaised ? parseFloat(fo.totalRaised) : null,
                        ourInvestment: fo.ourInvestment ? parseFloat(fo.ourInvestment) : null,
                        didWeInvest: fo.didWeInvest,
                        roundValuation: fo.roundValuation ? parseFloat(fo.roundValuation) : null,
                        ownershipAfter: fo.ownershipAfter ? parseFloat(fo.ownershipAfter) : null,
                        investorNames: fo.investorNames,
                    });
                }
            }
        }

        setSaving(false);
        handleClose();
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, maxHeight: '90vh' }}>
                <div className="modal-header">
                    <div className="modal-title">
                        {isEditing ? 'Edit Portfolio Company' : 'Add Portfolio Company'}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto' }}>
                    {/* Row 1: Company Name, Industry */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Company Name *</label>
                            <input className="form-input" placeholder="Enter company name" value={form.company_name} onChange={upd('company_name')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Industry *</label>
                            <select className="form-select" value={form.industry_id} onChange={upd('industry_id')}>
                                <option value="">Select industry</option>
                                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 2: HQ Location, Deal Sourcer */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">HQ Location *</label>
                            <input className="form-input" placeholder="e.g. Bangalore, Mumbai" value={form.hq_location} onChange={upd('hq_location')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Deal Sourcer *</label>
                            <select className="form-select" value={form.deal_source_name_id} onChange={upd('deal_source_name_id')}>
                                <option value="">Select deal sourcer</option>
                                {dealSourceNames.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 3: Analyst, Entry Date */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Analyst *</label>
                            <select className="form-select" value={form.analyst_id} onChange={upd('analyst_id')}>
                                <option value="">Select analyst</option>
                                {users.filter(u => u.role === 'analyst').map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Entry Date *</label>
                            <input className="form-input" type="date" value={form.entry_date} onChange={upd('entry_date')} />
                        </div>
                    </div>

                    {/* Row 4: Entry Stage, Current Stage */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Entry Stage *</label>
                            <select className="form-select" value={form.entry_stage} onChange={upd('entry_stage')}>
                                {rounds.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Current Stage *</label>
                            <select className="form-select" value={form.current_stage} onChange={upd('current_stage')}>
                                {rounds.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 5: Initial Investment, Share Type */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Initial Investment (&#8377;) *</label>
                            <input className="form-input" type="number" placeholder="e.g. 50000000" value={form.initial_investment} onChange={upd('initial_investment')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Share Type</label>
                            <select className="form-select" value={form.share_type} onChange={upd('share_type')}>
                                {shareTypes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 6: Entry Valuation, Entry Ownership */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Entry Valuation (&#8377;)</label>
                            <input className="form-input" type="number" placeholder="Valuation when you invested" value={form.entry_valuation} onChange={upd('entry_valuation')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Entry Ownership (%)</label>
                            <input className="form-input" type="number" placeholder="Your equity when you invested" value={form.entry_ownership} onChange={upd('entry_ownership')} />
                        </div>
                    </div>

                    {/* Row 7: Status */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Status *</label>
                            <select className="form-select" value={form.portfolio_status} onChange={upd('portfolio_status')}>
                                {portfolioStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="form-group" />
                    </div>

                    {/* Follow-on Rounds Section */}
                    <div style={{
                        marginTop: 20,
                        padding: 16,
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1px solid var(--border-primary, #e2e8f0)',
                        borderRadius: 8,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <label className="form-label" style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Follow-on Rounds</label>
                            <button className="btn btn-ghost btn-sm" onClick={addFollowOnRow} type="button" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Plus size={14} /> Add Round
                            </button>
                        </div>

                        {followOns.length === 0 && (
                            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                                No follow-on rounds yet
                            </div>
                        )}

                        {followOns.map((fo, idx) => (
                            <div
                                key={fo.id || fo._tempId}
                                style={{
                                    padding: 12,
                                    marginBottom: 8,
                                    background: 'var(--bg-primary, #fff)',
                                    border: '1px solid var(--border-primary, #e2e8f0)',
                                    borderRadius: 6,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>
                                        Round {idx + 1}
                                    </span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => removeFollowOnRow(idx)}
                                        type="button"
                                        style={{ color: '#ef4444' }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Round Name</label>
                                        <input
                                            className="form-input"
                                            placeholder="e.g. Series A"
                                            value={fo.roundName}
                                            onChange={e => updateFollowOnRow(idx, 'roundName', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Round Date</label>
                                        <input
                                            className="form-input"
                                            type="date"
                                            value={fo.roundDate}
                                            onChange={e => updateFollowOnRow(idx, 'roundDate', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Total Raised (&#8377;)</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            placeholder="Total round size"
                                            value={fo.totalRaised}
                                            onChange={e => updateFollowOnRow(idx, 'totalRaised', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Our Investment (&#8377;)</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            placeholder="Our investment amount"
                                            value={fo.ourInvestment}
                                            onChange={e => updateFollowOnRow(idx, 'ourInvestment', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Round Valuation (&#8377;)</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            placeholder="Valuation at this round"
                                            value={fo.roundValuation}
                                            onChange={e => updateFollowOnRow(idx, 'roundValuation', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Ownership After (%)</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            placeholder="Our ownership after round"
                                            value={fo.ownershipAfter}
                                            onChange={e => updateFollowOnRow(idx, 'ownershipAfter', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: 12 }}>Investor Names</label>
                                        <input
                                            className="form-input"
                                            placeholder="e.g. Sequoia, Accel"
                                            value={fo.investorNames}
                                            onChange={e => updateFollowOnRow(idx, 'investorNames', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={fo.didWeInvest}
                                                onChange={e => updateFollowOnRow(idx, 'didWeInvest', e.target.checked)}
                                            />
                                            Did we invest?
                                        </label>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Founders Section */}
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label">Founders</label>
                        <input
                            className="form-input"
                            placeholder="Enter founder names (comma-separated)"
                            value={form.founder_names}
                            onChange={upd('founder_names')}
                        />
                        {form.founder_names && (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                {form.founder_names}
                            </div>
                        )}
                    </div>

                    {/* Notes Section */}
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="form-label">Notes</label>
                        <textarea
                            className="form-input"
                            placeholder="Add any notes about this company..."
                            value={form.notes}
                            onChange={upd('notes')}
                            rows={3}
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Company'}
                    </button>
                </div>
            </div>
        </div>
    );
}
