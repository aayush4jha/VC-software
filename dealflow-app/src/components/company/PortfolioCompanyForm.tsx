'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { CompanyRound, ShareType, FollowOnRound, PortfolioHealth, Founder } from '@/types/database';
import { formatPortfolioCurrency } from '@/lib/portfolio-utils';

type PortfolioStatus = 'Active' | 'Exited' | 'Written Off';

const rounds: CompanyRound[] = [
    'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A',
    'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO',
];

// Ensures the rendered options always include the currently-selected value
// even if it isn't in the canonical list (e.g. legacy or custom round names
// pulled from the DB). Without this, the <select> silently displays blank
// because `value` doesn't match any <option>.
function roundOptions(current: string): string[] {
    if (current && !rounds.includes(current as CompanyRound)) {
        return [current, ...rounds];
    }
    return rounds;
}
const shareTypes: ShareType[] = ['Primary', 'Secondary'];
const portfolioStatuses: PortfolioStatus[] = ['Active', 'Exited', 'Written Off'];
const portfolioHealthOptions: PortfolioHealth[] = ['Bullish', 'Base', 'Bearish'];

// Indian states + Union Territories. Datalist suggestions — users can still type any custom location.
const HQ_LOCATION_SUGGESTIONS: string[] = [
    // States
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    // Union Territories
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

interface LocalFollowOn {
    _tempId?: string;
    id?: string;
    roundName: string;
    roundDate: string;
    totalRaised: string;
    ourInvestment: string;
    didWeInvest: boolean;
    preMoneyValuation: string;
    postMoneyValuation: string;
    sharePrice: string;
    numShares: string;
    totalShares: string;
    noOfShares: string;          // For valuation = noOfShares × sharePrice
    ownershipSought: string;
    ownershipAfter: string;
    dilutionPercent: string;
    investorNames: string;
    ourValueTodayOverride: string;
}

function emptyFollowOn(): LocalFollowOn {
    return {
        _tempId: crypto.randomUUID(),
        roundName: 'Series A',
        roundDate: '',
        totalRaised: '',
        ourInvestment: '',
        didWeInvest: false,
        preMoneyValuation: '',
        postMoneyValuation: '',
        sharePrice: '',
        numShares: '',
        totalShares: '',
        noOfShares: '',
        ownershipSought: '',
        ownershipAfter: '',
        dilutionPercent: '',
        investorNames: '',
        ourValueTodayOverride: '',
    };
}

const toNum = (s: string): number | null => {
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
};

export default function PortfolioCompanyForm() {
    const {
        showCompanyForm, setShowCompanyForm,
        editingCompany, setEditingCompany,
        companyFormPortfolioMode, setCompanyFormPortfolioMode,
        industries, users, dealSourceNames, pipelineStages,
        createCompany, updateCompany, addIndustry,
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
        share_price: '',
        num_shares: '',
        total_shares: '',
        entry_pre_money_valuation: '',
        entry_post_money_valuation: '',
        entry_total_raised: '',
        no_of_shares: '',
        entry_ownership: '',
        portfolio_status: 'Active' as PortfolioStatus,
        portfolio_health: '' as PortfolioHealth | '',
        notes: '',
    });

    const [followOns, setFollowOns] = useState<LocalFollowOn[]>([]);
    const [deletedFollowOnIds, setDeletedFollowOnIds] = useState<string[]>([]);
    const [founders, setFounders] = useState<Founder[]>([{ name: '', email: '' }]);
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showNewIndustryInput, setShowNewIndustryInput] = useState(false);
    const [newIndustryName, setNewIndustryName] = useState('');
    const [savingIndustry, setSavingIndustry] = useState(false);

    const handleSaveNewIndustry = async () => {
        const trimmed = newIndustryName.trim();
        if (!trimmed) return;
        const existing = industries.find(i => i.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
            setForm(f => ({ ...f, industry_id: existing.id }));
            setShowNewIndustryInput(false);
            setNewIndustryName('');
            return;
        }
        setSavingIndustry(true);
        const created = await addIndustry(trimmed);
        setSavingIndustry(false);
        if (created) {
            setForm(f => ({ ...f, industry_id: created.id }));
            setShowNewIndustryInput(false);
            setNewIndustryName('');
        }
    };

    // Derived calculations for the entry round
    const investmentNum = toNum(form.initial_investment);
    const preMoneyNum = toNum(form.entry_pre_money_valuation);
    const postMoneyNum = toNum(form.entry_post_money_valuation);
    const totalRaisedNum = toNum(form.entry_total_raised);
    const totalRaisedFromValuations = preMoneyNum != null && postMoneyNum != null ? postMoneyNum - preMoneyNum : null;
    // Auto-derive post-money from pre-money + total raised when the user
    // hasn't typed a post-money value of their own.
    const computedPostMoney = preMoneyNum != null && totalRaisedNum != null ? preMoneyNum + totalRaisedNum : null;
    const effectivePostMoney = postMoneyNum ?? computedPostMoney;
    const computedEntryOwnership =
        investmentNum != null && effectivePostMoney != null && effectivePostMoney > 0
            ? (investmentNum / effectivePostMoney) * 100
            : null;
    // What "entry ownership" actually is after considering both explicit
    // and computed paths — used as the auto value for Total Ownership
    // After Round at the entry row (since there's no prior position to dilute).
    const effectiveEntryOwnership = toNum(form.entry_ownership) ?? computedEntryOwnership;

    // Follow-on rounds — sort by date so Round 1, 2, 3… reflects actual order.
    // Sortable, but state-update operations need the original array index.
    const orderedFollowOns = React.useMemo(() => {
        return followOns
            .map((fo, originalIdx) => ({ fo, originalIdx }))
            .sort((a, b) => {
                const da = a.fo.roundDate ? new Date(a.fo.roundDate).getTime() : Number.POSITIVE_INFINITY;
                const db = b.fo.roundDate ? new Date(b.fo.roundDate).getTime() : Number.POSITIVE_INFINITY;
                return da - db;
            });
    }, [followOns]);

    // Walk the chain in chronological order to compute auto post-money,
    // equity sought, passive dilution, and ownership-after for each row.
    // Matches the formulas in portfolio-utils.computeOwnershipChain.
    const followOnAuto = React.useMemo(() => {
        const entryOwnership = toNum(form.entry_ownership) ?? computedEntryOwnership ?? 0;
        const out: Array<{
            postMoney: number | null;
            ownershipSought: number | null;
            dilution: number | null;
            ownershipAfter: number | null;
        }> = [];
        let prev = entryOwnership;
        for (const { fo } of orderedFollowOns) {
            const pre = toNum(fo.preMoneyValuation);
            const raised = toNum(fo.totalRaised);
            const ourInv = toNum(fo.ourInvestment);
            const postExplicit = toNum(fo.postMoneyValuation);
            const post = postExplicit ?? (pre != null && raised != null ? pre + raised : null);

            const ownershipSoughtExplicit = toNum(fo.ownershipSought);
            const ownershipSoughtAuto = ourInv != null && post != null && post > 0
                ? (ourInv / post) * 100
                : null;
            const ownershipSought = ownershipSoughtExplicit ?? ownershipSoughtAuto;

            const dilutionExplicit = toNum(fo.dilutionPercent);
            const dilutionAuto = raised != null && post != null && post > 0
                ? prev * (raised / post)
                : null;
            const dilution = dilutionExplicit ?? dilutionAuto;

            const ownershipAfterExplicit = toNum(fo.ownershipAfter);
            let ownershipAfterAuto: number | null = null;
            if (dilution != null) {
                ownershipAfterAuto = fo.didWeInvest && ownershipSought != null
                    ? prev - dilution + ownershipSought
                    : prev - dilution;
            }
            const ownershipAfter = ownershipAfterExplicit ?? ownershipAfterAuto;

            out.push({ postMoney: post, ownershipSought, dilution, ownershipAfter });
            if (ownershipAfter != null) prev = ownershipAfter;
        }
        return out;
    }, [orderedFollowOns, form.entry_ownership, computedEntryOwnership]);

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
                share_price: editingCompany.sharePrice?.toString() || '',
                num_shares: editingCompany.numShares?.toString() || '',
                total_shares: editingCompany.totalShares?.toString() || '',
                entry_pre_money_valuation: editingCompany.entryPreMoneyValuation?.toString() || '',
                entry_post_money_valuation:
                    editingCompany.entryPostMoneyValuation?.toString()
                    || editingCompany.entryValuation?.toString()
                    || '',
                entry_total_raised: editingCompany.entryTotalRaised?.toString() || '',
                no_of_shares: editingCompany.noOfShares?.toString() || '',
                entry_ownership: editingCompany.entryOwnership?.toString() || '',
                portfolio_status: editingCompany.portfolioStatus || 'Active',
                portfolio_health: editingCompany.portfolioHealth || '',
                notes: editingCompany.notes || '',
            });

            const existingFounders = editingCompany.founders && editingCompany.founders.length > 0
                ? editingCompany.founders
                : (editingCompany.founderName || editingCompany.founderEmail)
                    ? [{ name: editingCompany.founderName || '', email: editingCompany.founderEmail || '' }]
                    : [{ name: '', email: '' }];
            setFounders(existingFounders);

            fetchFollowOns(editingCompany.id).then((rounds: FollowOnRound[]) => {
                setFollowOns(
                    rounds.map(r => ({
                        id: r.id,
                        roundName: r.roundName,
                        roundDate: r.roundDate ? r.roundDate.slice(0, 10) : '',
                        totalRaised: r.totalRaised?.toString() || '',
                        ourInvestment: r.ourInvestment?.toString() || '',
                        didWeInvest: r.didWeInvest,
                        preMoneyValuation: r.preMoneyValuation?.toString() || '',
                        postMoneyValuation: (r.postMoneyValuation ?? r.roundValuation)?.toString() || '',
                        sharePrice: r.sharePrice?.toString() || '',
                        numShares: r.numShares?.toString() || '',
                        totalShares: r.totalShares?.toString() || '',
                        noOfShares: r.noOfShares?.toString() || '',
                        ownershipSought: r.ownershipSought?.toString() || '',
                        ownershipAfter: r.ownershipAfter?.toString() || '',
                        dilutionPercent: r.dilutionPercent?.toString() || '',
                        investorNames: r.investorNames || '',
                        ourValueTodayOverride: r.ourValueTodayOverride?.toString() || '',
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
            setFounders([{ name: '', email: '' }]);
        }
    }, [editingCompany, isEditing, industries, dealSourceNames, fetchFollowOns]);

    if (!showCompanyForm) return null;
    if (!isEditing && !companyFormPortfolioMode) return null;

    const handleClose = () => {
        setShowCompanyForm(false);
        setEditingCompany(null);
        setCompanyFormPortfolioMode(false);
        setSubmitError(null);
    };

    const upd = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }));

    const addFollowOnRow = () => setFollowOns(prev => [...prev, emptyFollowOn()]);

    const updateFollowOnRow = (index: number, field: keyof LocalFollowOn, value: string | boolean) => {
        setFollowOns(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
    };

    const removeFollowOnRow = (index: number) => {
        const row = followOns[index];
        if (row.id) setDeletedFollowOnIds(prev => [...prev, row.id!]);
        setFollowOns(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        setSubmitError(null);
        const missing: string[] = [];
        if (!form.company_name.trim()) missing.push('Company Name');
        if (!form.industry_id) missing.push('Industry');
        if (!form.hq_location.trim()) missing.push('HQ Location');
        if (!form.deal_source_name_id) missing.push('Deal Sourcer');
        if (!form.analyst_id) missing.push('Analyst');
        if (!form.entry_date) missing.push('Entry Date');
        if (!form.initial_investment) missing.push('Initial Investment');
        if (!form.portfolio_status) missing.push('Status');
        if (missing.length > 0) {
            setSubmitError(`Please fill: ${missing.join(', ')}.`);
            return;
        }

        setSaving(true);

        const preMoney = toNum(form.entry_pre_money_valuation);
        const totalRaised = toNum(form.entry_total_raised);
        // Auto-fill post-money from pre + total raised when the user left it blank.
        const postMoney = toNum(form.entry_post_money_valuation)
            ?? (preMoney != null && totalRaised != null ? preMoney + totalRaised : null);
        const entryOwnership = form.entry_ownership
            ? toNum(form.entry_ownership)
            : computedEntryOwnership;

        const cleanedFounders = founders
            .map(f => ({ name: f.name.trim(), email: f.email.trim() }))
            .filter(f => f.name || f.email);

        const data: Record<string, unknown> = {
            companyName: form.company_name,
            // Mirror the first founder into the legacy single-name / single-email
            // columns so any older readers stay correct.
            founderName: cleanedFounders[0]?.name || '',
            founderEmail: cleanedFounders[0]?.email || '',
            founders: cleanedFounders,
            industryId: form.industry_id,
            hqLocation: form.hq_location,
            dealSourceNameId: form.deal_source_name_id,
            analystId: form.analyst_id || null,
            companyRound: form.entry_stage,
            shareType: form.share_type,
            initialInvestment: toNum(form.initial_investment),
            sharePrice: toNum(form.share_price),
            numShares: toNum(form.num_shares),
            totalShares: toNum(form.total_shares),
            entryPreMoneyValuation: preMoney,
            entryPostMoneyValuation: postMoney,
            // Keep entryValuation in sync with post-money for legacy code paths.
            entryValuation: postMoney ?? toNum(form.entry_post_money_valuation),
            entryTotalRaised: toNum(form.entry_total_raised) ?? totalRaisedFromValuations,
            // Total Ownership After Round at entry equals entry ownership when blank.
            noOfShares: toNum(form.no_of_shares) ?? effectiveEntryOwnership,
            entryOwnership,
            portfolioStatus: form.portfolio_status,
            portfolioHealth: form.portfolio_health || null,
            notes: form.notes,
            pipelineStageId: pipelineStages[0]?.id || '',
            priorityLevel: 'Medium',
            dealSourceType: 'Founder Network',
            subIndustry: '',
        };

        // Build a follow-on payload, filling in any field the user left blank
        // from the auto-derived chain (post-money, equity sought, dilution,
        // ownership-after) so explicit and implicit values stay in sync.
        const buildFollowOnPayload = (
            fo: LocalFollowOn,
            auto: { postMoney: number | null; ownershipSought: number | null; dilution: number | null; ownershipAfter: number | null },
        ) => {
            const pre = toNum(fo.preMoneyValuation);
            const post = toNum(fo.postMoneyValuation) ?? auto.postMoney;
            const totalRaisedFromValuation = post != null && pre != null ? post - pre : null;
            return {
                roundName: fo.roundName,
                roundDate: fo.roundDate || new Date().toISOString(),
                totalRaised: toNum(fo.totalRaised) ?? totalRaisedFromValuation,
                ourInvestment: toNum(fo.ourInvestment),
                didWeInvest: fo.didWeInvest,
                preMoneyValuation: pre,
                postMoneyValuation: post,
                roundValuation: post,
                sharePrice: toNum(fo.sharePrice),
                numShares: toNum(fo.numShares),
                totalShares: toNum(fo.totalShares),
                noOfShares: toNum(fo.noOfShares),
                ownershipSought: fo.didWeInvest ? (toNum(fo.ownershipSought) ?? auto.ownershipSought) : null,
                ownershipAfter: toNum(fo.ownershipAfter) ?? auto.ownershipAfter,
                dilutionPercent: toNum(fo.dilutionPercent) ?? auto.dilution,
                investorNames: fo.investorNames,
                ourValueTodayOverride: toNum(fo.ourValueTodayOverride),
            };
        };

        if (isEditing && editingCompany) {
            await updateCompany(editingCompany.id, data);

            for (const id of deletedFollowOnIds) {
                await deleteFollowOn(id);
            }

            for (let i = 0; i < orderedFollowOns.length; i++) {
                const { fo } = orderedFollowOns[i];
                const payload = buildFollowOnPayload(fo, followOnAuto[i]);
                if (fo.id) {
                    await updateFollowOn(fo.id, payload);
                } else {
                    await addFollowOn({ ...payload, companyId: editingCompany.id });
                }
            }
        } else {
            data.terminalStatus = 'Portfolio';
            const created = await createCompany(data);
            if (!created) {
                setSaving(false);
                setSubmitError('Could not create company. Check the browser console for the database error.');
                return;
            }
            for (let i = 0; i < orderedFollowOns.length; i++) {
                const { fo } = orderedFollowOns[i];
                await addFollowOn({ ...buildFollowOnPayload(fo, followOnAuto[i]), companyId: created.id });
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
                    {/* Company Name + Industry */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Company Name *</label>
                            <input className="form-input" placeholder="Enter company name" value={form.company_name} onChange={upd('company_name')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Industry *</label>
                            {showNewIndustryInput ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        className="form-input"
                                        autoFocus
                                        placeholder="New industry name"
                                        value={newIndustryName}
                                        onChange={e => setNewIndustryName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') { e.preventDefault(); handleSaveNewIndustry(); }
                                            if (e.key === 'Escape') { setShowNewIndustryInput(false); setNewIndustryName(''); }
                                        }}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSaveNewIndustry}
                                        disabled={savingIndustry || !newIndustryName.trim()}
                                    >
                                        {savingIndustry ? '...' : 'Add'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => { setShowNewIndustryInput(false); setNewIndustryName(''); }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <select
                                    className="form-select"
                                    value={form.industry_id}
                                    onChange={e => {
                                        if (e.target.value === '__new__') {
                                            setShowNewIndustryInput(true);
                                            setNewIndustryName('');
                                        } else {
                                            setForm(f => ({ ...f, industry_id: e.target.value }));
                                        }
                                    }}
                                >
                                    <option value="">Select industry</option>
                                    {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    <option value="__new__">+ Add new industry…</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* HQ + Sourcer */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">HQ Location *</label>
                            <input
                                className="form-input"
                                list="hq-location-options"
                                placeholder="Pick a state or type a city/country"
                                value={form.hq_location}
                                onChange={upd('hq_location')}
                            />
                            <datalist id="hq-location-options">
                                {HQ_LOCATION_SUGGESTIONS.map(loc => (
                                    <option key={loc} value={loc} />
                                ))}
                            </datalist>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Deal Sourcer *</label>
                            <select className="form-select" value={form.deal_source_name_id} onChange={upd('deal_source_name_id')}>
                                <option value="">Select deal sourcer</option>
                                {dealSourceNames.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Analyst + Entry Stage */}
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
                            <label className="form-label">Entry Stage *</label>
                            <select className="form-select" value={form.entry_stage} onChange={upd('entry_stage')}>
                                {roundOptions(form.entry_stage).map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Current Stage + Entry Date */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Current Stage *</label>
                            <select className="form-select" value={form.current_stage} onChange={upd('current_stage')}>
                                {roundOptions(form.current_stage).map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Entry Date *</label>
                            <input className="form-input" type="date" value={form.entry_date} onChange={upd('entry_date')} />
                        </div>
                    </div>

                    {/* Initial Investment (Our Investment) + Total Money Raised */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Initial Investment (Our Investment) (&#8377;) *</label>
                            <input className="form-input" type="number" placeholder="e.g. 50000000" value={form.initial_investment} onChange={upd('initial_investment')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Total Money Raised in this Round (&#8377;)</label>
                            <input
                                className="form-input"
                                type="number"
                                placeholder={
                                    totalRaisedFromValuations != null && totalRaisedFromValuations > 0
                                        ? `Implied: ${formatPortfolioCurrency(totalRaisedFromValuations)}`
                                        : 'Total round size'
                                }
                                value={form.entry_total_raised}
                                onChange={upd('entry_total_raised')}
                            />
                            {totalRaisedFromValuations != null && totalRaisedFromValuations > 0 && !form.entry_total_raised && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                    Auto from post &minus; pre: {formatPortfolioCurrency(totalRaisedFromValuations)} (override above if different)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Number of Shares (Owned by DV) + Outstanding Shares */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Number of Shares (Owned by DV)</label>
                            <input className="form-input" type="number" min="0" placeholder="e.g. 40000" value={form.num_shares} onChange={upd('num_shares')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Outstanding Shares</label>
                            <input className="form-input" type="number" min="0" placeholder="Company's total outstanding shares" value={form.total_shares} onChange={upd('total_shares')} />
                        </div>
                    </div>

                    {/* Share Price + Entry Pre-Money */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Share Price (&#8377;)</label>
                            <input className="form-input" type="number" placeholder="e.g. 1250.00" value={form.share_price} onChange={upd('share_price')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Entry Pre-money Valuation (&#8377;)</label>
                            <input className="form-input" type="number" placeholder="Pre-money valuation" value={form.entry_pre_money_valuation} onChange={upd('entry_pre_money_valuation')} />
                        </div>
                    </div>

                    {/* Entry Post-Money + Entry Ownership */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Entry Post-money Valuation (&#8377;)</label>
                            <input
                                className="form-input"
                                type="number"
                                placeholder={
                                    computedPostMoney != null && computedPostMoney > 0
                                        ? `Auto: ${formatPortfolioCurrency(computedPostMoney)}`
                                        : 'Post-money valuation'
                                }
                                value={form.entry_post_money_valuation}
                                onChange={upd('entry_post_money_valuation')}
                            />
                            {computedPostMoney != null && computedPostMoney > 0 && !form.entry_post_money_valuation && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                    Auto from pre-money + total raised: {formatPortfolioCurrency(computedPostMoney)} (override above if different)
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">Entry Ownership (%)</label>
                            <input
                                className="form-input"
                                type="number"
                                placeholder={computedEntryOwnership != null ? `Auto: ${computedEntryOwnership.toFixed(2)}%` : 'Your equity when you invested'}
                                value={form.entry_ownership}
                                onChange={upd('entry_ownership')}
                            />
                            {computedEntryOwnership != null && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                    Computed: Investment / Post-money = {computedEntryOwnership.toFixed(2)}% (override above if needed)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Total Ownership After Round + Share Type */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Total Ownership After Round (%)</label>
                            <input
                                className="form-input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={
                                    effectiveEntryOwnership != null
                                        ? `Auto: ${effectiveEntryOwnership.toFixed(2)}%`
                                        : 'e.g. 8.5'
                                }
                                value={form.no_of_shares}
                                onChange={upd('no_of_shares')}
                            />
                            {effectiveEntryOwnership != null && !form.no_of_shares && (
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                    Auto: equals entry ownership at the entry round = {effectiveEntryOwnership.toFixed(2)}%
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">Share Type</label>
                            <select className="form-select" value={form.share_type} onChange={upd('share_type')}>
                                {shareTypes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Status + Portfolio Health */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Status *</label>
                            <select className="form-select" value={form.portfolio_status} onChange={upd('portfolio_status')}>
                                {portfolioStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Portfolio Health</label>
                            <select className="form-select" value={form.portfolio_health} onChange={upd('portfolio_health')}>
                                <option value="">Select health</option>
                                {portfolioHealthOptions.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Follow-on Rounds */}
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

                        {orderedFollowOns.map(({ fo, originalIdx }, displayIdx) => {
                            const n = displayIdx + 1;
                            const auto = followOnAuto[displayIdx] || { postMoney: null, ownershipSought: null, dilution: null, ownershipAfter: null };
                            const foPost = toNum(fo.postMoneyValuation) ?? auto.postMoney;
                            const foShares = toNum(fo.numShares);
                            const foPrice = toNum(fo.sharePrice);
                            const foOwn = toNum(fo.ownershipAfter) ?? auto.ownershipAfter;
                            // Value today: prefer shares × price, else equity% × post-money
                            const valueByShares = foShares != null && foPrice != null ? foShares * foPrice : null;
                            const valueByEquity = foOwn != null && foPost != null ? (foOwn / 100) * foPost : null;
                            const valueToday = valueByShares ?? valueByEquity;
                            const fmtMoneyPh = (v: number | null) => v != null && v > 0 ? `Auto: ${formatPortfolioCurrency(v)}` : '';
                            const fmtPercentPh = (v: number | null) => v != null ? `Auto: ${v.toFixed(2)}%` : '';

                            return (
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
                                            Round {n}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => removeFollowOnRow(originalIdx)}
                                            type="button"
                                            style={{ color: '#ef4444' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    {/* Round Name + Date */}
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: 12 }}>Round Name</label>
                                            <select
                                                className="form-select"
                                                value={fo.roundName}
                                                onChange={e => updateFollowOnRow(originalIdx, 'roundName', e.target.value)}
                                            >
                                                {roundOptions(fo.roundName).map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: 12 }}>Date</label>
                                            <input
                                                className="form-input"
                                                type="date"
                                                value={fo.roundDate}
                                                onChange={e => updateFollowOnRow(originalIdx, 'roundDate', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Did we Invest */}
                                    <div className="form-row">
                                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 4 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={fo.didWeInvest}
                                                    onChange={e => updateFollowOnRow(originalIdx, 'didWeInvest', e.target.checked)}
                                                />
                                                Did we Invest?
                                            </label>
                                        </div>
                                        <div className="form-group" />
                                    </div>

                                    {fo.didWeInvest && (
                                        <>
                                            {/* Our investment + Total Money Raised */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Our investment in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Our investment amount"
                                                        value={fo.ourInvestment}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ourInvestment', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Total Money Raised in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Total round size"
                                                        value={fo.totalRaised}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'totalRaised', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* No. of Shares + Outstanding Shares */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>No. of Shares in round {n}</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="e.g. 5000"
                                                        value={fo.numShares}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'numShares', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Outstanding Shares in round {n}</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Company's total outstanding shares"
                                                        value={fo.totalShares}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'totalShares', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Share Price + Pre-Money */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Share Price in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="e.g. 1500"
                                                        value={fo.sharePrice}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'sharePrice', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Pre-Money Valuation in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Pre-money"
                                                        value={fo.preMoneyValuation}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'preMoneyValuation', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Post-money (AUTO from pre + raised) + Equity Sought (AUTO) */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Post-money Valuation in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder={fmtMoneyPh(auto.postMoney) || 'Post-money'}
                                                        value={fo.postMoneyValuation}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'postMoneyValuation', e.target.value)}
                                                    />
                                                    {auto.postMoney != null && auto.postMoney > 0 && !fo.postMoneyValuation && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto from pre + total raised: {formatPortfolioCurrency(auto.postMoney)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Equity sought in round {n} (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder={fmtPercentPh(auto.ownershipSought) || 'e.g. 2.5'}
                                                        value={fo.ownershipSought}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ownershipSought', e.target.value)}
                                                    />
                                                    {auto.ownershipSought != null && !fo.ownershipSought && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: our investment ÷ post-money = {auto.ownershipSought.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Dilution (AUTO) + Total Ownership After Round (AUTO) */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Dilution in round {n} (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder={fmtPercentPh(auto.dilution) || 'e.g. 15.0'}
                                                        value={fo.dilutionPercent}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'dilutionPercent', e.target.value)}
                                                    />
                                                    {auto.dilution != null && !fo.dilutionPercent && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: prev ownership × (raised ÷ post-money) = {auto.dilution.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Total ownership after round {n} (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder={fmtPercentPh(auto.ownershipAfter) || 'e.g. 8.5'}
                                                        value={fo.ownershipAfter}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ownershipAfter', e.target.value)}
                                                    />
                                                    {auto.ownershipAfter != null && !fo.ownershipAfter && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: prev − dilution + sought = {auto.ownershipAfter.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Other investors + Our Value Today */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Other investors</label>
                                                    <input
                                                        className="form-input"
                                                        placeholder="e.g. Sequoia, Accel"
                                                        value={fo.investorNames}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'investorNames', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Our Value Today (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder={valueToday != null ? `Auto: ${formatPortfolioCurrency(valueToday)}` : 'Override our value today'}
                                                        value={fo.ourValueTodayOverride}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ourValueTodayOverride', e.target.value)}
                                                    />
                                                    {valueToday != null && !fo.ourValueTodayOverride && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: {formatPortfolioCurrency(valueToday)} {valueByShares != null ? '(shares × price)' : '(equity% × post)'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {!fo.didWeInvest && (
                                        <>
                                            {/* Total Money Raised + Outstanding Shares */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Total Money Raised in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Total round size"
                                                        value={fo.totalRaised}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'totalRaised', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Outstanding Shares in round {n}</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Company's total outstanding shares"
                                                        value={fo.totalShares}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'totalShares', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Share Price + Pre-Money */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Share Price in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="e.g. 1500"
                                                        value={fo.sharePrice}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'sharePrice', e.target.value)}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Pre-money Valuation in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder="Pre-money"
                                                        value={fo.preMoneyValuation}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'preMoneyValuation', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Post-money (AUTO) + Dilution (AUTO) */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Post-money Valuation in round {n} (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder={fmtMoneyPh(auto.postMoney) || 'Post-money'}
                                                        value={fo.postMoneyValuation}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'postMoneyValuation', e.target.value)}
                                                    />
                                                    {auto.postMoney != null && auto.postMoney > 0 && !fo.postMoneyValuation && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto from pre + total raised: {formatPortfolioCurrency(auto.postMoney)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Dilution in round {n} (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder={fmtPercentPh(auto.dilution) || 'e.g. 15.0'}
                                                        value={fo.dilutionPercent}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'dilutionPercent', e.target.value)}
                                                    />
                                                    {auto.dilution != null && !fo.dilutionPercent && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: prev ownership × (raised ÷ post-money) = {auto.dilution.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Total ownership after round + Other investors */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Total ownership after round {n} (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder={fmtPercentPh(auto.ownershipAfter) || 'e.g. 8.5'}
                                                        value={fo.ownershipAfter}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ownershipAfter', e.target.value)}
                                                    />
                                                    {auto.ownershipAfter != null && !fo.ownershipAfter && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: prev − dilution = {auto.ownershipAfter.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Other investors</label>
                                                    <input
                                                        className="form-input"
                                                        placeholder="e.g. Sequoia, Accel"
                                                        value={fo.investorNames}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'investorNames', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Our Value Today */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Our Value Today (&#8377;)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min="0"
                                                        placeholder={valueToday != null ? `Auto: ${formatPortfolioCurrency(valueToday)}` : 'Override our value today'}
                                                        value={fo.ourValueTodayOverride}
                                                        onChange={e => updateFollowOnRow(originalIdx, 'ourValueTodayOverride', e.target.value)}
                                                    />
                                                    {valueToday != null && !fo.ourValueTodayOverride && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                            Auto: {formatPortfolioCurrency(valueToday)} {valueByShares != null ? '(shares × price)' : '(equity% × post)'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="form-group" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Founders — name + email per row */}
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label className="form-label" style={{ margin: 0 }}>Founders</label>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setFounders(prev => [...prev, { name: '', email: '' }])}
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                <Plus size={14} /> Add Founder
                            </button>
                        </div>
                        {founders.map((f, idx) => (
                            <div key={idx} className="form-row" style={{ alignItems: 'center' }}>
                                <div className="form-group">
                                    <input
                                        className="form-input"
                                        placeholder="Founder name"
                                        value={f.name}
                                        onChange={e => setFounders(prev => prev.map((row, i) => i === idx ? { ...row, name: e.target.value } : row))}
                                    />
                                </div>
                                <div className="form-group" style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        className="form-input"
                                        type="email"
                                        placeholder="founder@company.com"
                                        value={f.email}
                                        onChange={e => setFounders(prev => prev.map((row, i) => i === idx ? { ...row, email: e.target.value } : row))}
                                        style={{ flex: 1 }}
                                    />
                                    {founders.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setFounders(prev => prev.filter((_, i) => i !== idx))}
                                            style={{ color: '#ef4444' }}
                                            title="Remove founder"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Notes */}
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

                <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    {submitError && (
                        <div style={{
                            padding: '8px 12px',
                            background: 'var(--danger-bg, #fef2f2)',
                            color: 'var(--danger, #b91c1c)',
                            border: '1px solid var(--danger, #b91c1c)',
                            borderRadius: 6, fontSize: 12,
                        }}>
                            {submitError}
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Company'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
