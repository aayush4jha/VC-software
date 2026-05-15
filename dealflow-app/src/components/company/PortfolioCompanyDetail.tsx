'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, FileText, Loader2, Pencil, Check, Scale } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/context';
import {
    getTotalInvested, getLatestValuation, getCurrentOwnership,
    getCompanyIRR, getCompanyMOIC, formatPortfolioCurrency,
    formatMOIC, formatXIRR, PORTFOLIO_STAGE_COLORS,
    getPortfolioStage,
} from '@/lib/portfolio-utils';
import type { Company, FollowOnRound } from '@/types/database';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

const AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatarColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function PortfolioCompanyDetail() {
    const router = useRouter();
    const {
        selectedCompany, setSelectedCompany,
        getIndustryById, getDealSourceNameById, getUserById,
        fetchFollowOns, addFollowOn, deleteFollowOn, updateCompany, deleteCompany,
        setEditingCompany, setShowCompanyForm, setCompanyFormPortfolioMode,
        dealSourceNames, users,
    } = useAppContext();

    const [followOns, setFollowOns] = useState<FollowOnRound[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAddRound, setShowAddRound] = useState(false);
    const [savingRound, setSavingRound] = useState(false);
    const [saveRoundError, setSaveRoundError] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [notesValue, setNotesValue] = useState('');
    const [notesDirty, setNotesDirty] = useState(false);
    const [editField, setEditField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // New round form
    const [roundForm, setRoundForm] = useState({
        round_name: 'Series A', round_date: '', total_raised: '', our_investment: '',
        did_we_invest: true, pre_money_valuation: '', post_money_valuation: '',
        share_price: '', num_shares: '', total_shares: '',
        ownership_sought: '', ownership_after: '',
        investor_names: '', notes: '',
    });

    const FOLLOWON_ROUND_OPTIONS = [
        'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A',
        'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO',
    ] as const;

    const c = selectedCompany;

    // Only show for portfolio companies
    const isPortfolio = c?.terminalStatus === 'Portfolio';

    const loadFollowOns = useCallback(async () => {
        if (!c) return;
        setLoading(true);
        try {
            const fos = await fetchFollowOns(c.id);
            setFollowOns(fos);
        } catch { setFollowOns([]); }
        setLoading(false);
    }, [c?.id, fetchFollowOns]);

    useEffect(() => {
        if (c && isPortfolio) {
            loadFollowOns();
            setNotesValue(c.notes || '');
            setNotesDirty(false);
        }
    }, [c?.id, isPortfolio]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!c || !isPortfolio) return null;

    const industry = getIndustryById(c.industryId || '')?.name || '';
    const sourcer = getDealSourceNameById(c.dealSourceNameId || '')?.name || '';
    const analyst = c.analystId ? getUserById(c.analystId)?.name || '' : '';
    const stage = getPortfolioStage(c);
    const status = c.portfolioStatus || 'Active';
    const totalInvested = getTotalInvested(c, followOns);
    const latestVal = getLatestValuation(c, followOns);
    const ownership = getCurrentOwnership(c, followOns);
    const moic = getCompanyMOIC(c, followOns);
    const irr = getCompanyIRR(c, followOns);
    const initials = c.companyName?.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'NA';

    const handleClose = () => setSelectedCompany(null);

    const startEdit = (field: string, currentValue: string | number | null) => {
        setEditField(field);
        setEditValue(currentValue?.toString() || '');
    };

    const saveField = async () => {
        if (!editField) return;
        const data: Record<string, unknown> = {};
        const numericFields = [
            'initialInvestment', 'entryValuation', 'entryOwnership', 'currentOwnership',
            'latestValuation', 'exitValue', 'sharePrice', 'numShares', 'totalShares',
            'entryPreMoneyValuation', 'entryPostMoneyValuation',
        ];
        if (numericFields.includes(editField)) {
            data[editField] = editValue ? parseFloat(editValue) : null;
            // Keep legacy entryValuation in sync with post-money on save.
            if (editField === 'entryPostMoneyValuation' && data[editField] != null) {
                data.entryValuation = data[editField];
            }
        } else {
            data[editField] = editValue || null;
        }
        await updateCompany(c.id, data);
        setSelectedCompany({ ...c, ...data } as Company);
        setEditField(null);
        setEditValue('');
    };

    const cancelEdit = () => { setEditField(null); setEditValue(''); };

    const handleEdit = () => {
        setCompanyFormPortfolioMode(true);
        setEditingCompany(c);
        setShowCompanyForm(true);
    };

    const handleDelete = async () => {
        await deleteCompany(c.id);
        setSelectedCompany(null);
    };

    const handleSaveNotes = async () => {
        await updateCompany(c.id, { notes: notesValue });
        setNotesDirty(false);
    };

    const handleAddRound = async () => {
        setSaveRoundError(null);
        if (!roundForm.round_name) {
            setSaveRoundError('Pick a round name.');
            return;
        }
        // Default to today if no date was entered, instead of silently failing.
        const roundDate = roundForm.round_date || new Date().toISOString().slice(0, 10);

        setSavingRound(true);

        const toNum = (s: string): number | null => {
            if (!s) return null;
            const n = parseFloat(s);
            return Number.isFinite(n) ? n : null;
        };

        const ourInv = toNum(roundForm.our_investment);
        const postMoney = toNum(roundForm.post_money_valuation);
        const preMoney = toNum(roundForm.pre_money_valuation);
        const sharePrice = toNum(roundForm.share_price);
        const numShares = toNum(roundForm.num_shares);
        const totalShares = toNum(roundForm.total_shares);
        const ownerAfter = toNum(roundForm.ownership_after);
        const ownerSought = toNum(roundForm.ownership_sought);
        const impliedRaised = postMoney != null && preMoney != null ? postMoney - preMoney : null;
        const totalRaised = toNum(roundForm.total_raised) ?? impliedRaised;

        const created = await addFollowOn({
            companyId: c.id,
            organizationId: ORGANIZATION_ID,
            roundName: roundForm.round_name,
            roundDate,
            totalRaised,
            ourInvestment: roundForm.did_we_invest ? ourInv : null,
            didWeInvest: roundForm.did_we_invest,
            preMoneyValuation: preMoney,
            postMoneyValuation: postMoney,
            roundValuation: postMoney,
            sharePrice,
            numShares,
            totalShares,
            ownershipSought: roundForm.did_we_invest ? ownerSought : null,
            ownershipAfter: ownerAfter,
            investorNames: roundForm.investor_names,
            notes: roundForm.notes,
        });

        if (!created) {
            setSavingRound(false);
            setSaveRoundError('Could not save round. Check the browser console for the database error (e.g. the new columns may not be applied to the DB yet — run supabase/portfolio-extras.sql).');
            return;
        }

        // Optimistically show the new round immediately.
        setFollowOns(prev => [...prev, created]);

        // Auto-update company fields based on the new round
        const companyUpdates: Record<string, unknown> = {};
        if (postMoney != null && postMoney > 0) {
            companyUpdates.latestValuation = postMoney;
        }
        if (ownerAfter != null) {
            companyUpdates.currentOwnership = ownerAfter;
        }
        const knownStages = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
        if (knownStages.includes(roundForm.round_name)) {
            companyUpdates.companyRound = roundForm.round_name;
        }
        if (Object.keys(companyUpdates).length > 0) {
            await updateCompany(c.id, companyUpdates);
        }

        setRoundForm({
            round_name: 'Series A', round_date: '', total_raised: '', our_investment: '',
            did_we_invest: true, pre_money_valuation: '', post_money_valuation: '',
            share_price: '', num_shares: '', total_shares: '',
            ownership_sought: '', ownership_after: '',
            investor_names: '', notes: '',
        });
        setShowAddRound(false);
        setSavingRound(false);
        // Re-load from server to get the canonical row (including server-generated fields)
        loadFollowOns();
    };

    const handleDeleteRound = async (id: string) => {
        await deleteFollowOn(id);
        loadFollowOns();
    };

    const entryDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--';
    const sortedFollowOns = [...followOns].sort((a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '92vh', overflow: 'auto' }}>
                {/* Header */}
                <div className="modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="modal-title">Company Details</div>
                    <button className="btn btn-ghost btn-sm" onClick={handleClose}><X size={18} /></button>
                </div>

                <div style={{ padding: 24 }}>
                    {/* Company Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 12,
                            backgroundColor: avatarColor(c.companyName || ''),
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20, fontWeight: 700, flexShrink: 0,
                        }}>
                            {initials}
                        </div>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{c.companyName}</div>
                            <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                                {industry}{industry && c.hqLocation ? ' \u2022 ' : ''}{c.hqLocation || ''}
                            </div>
                        </div>
                    </div>

                    {/* Stage + Status badges */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        <span className="badge" style={{
                            backgroundColor: `${PORTFOLIO_STAGE_COLORS[stage] || '#6366f1'}20`,
                            color: PORTFOLIO_STAGE_COLORS[stage] || '#6366f1',
                        }}>{stage}</span>
                        <span className="badge" style={{
                            backgroundColor: status === 'Active' ? 'var(--success-bg)' : status === 'Exited' ? 'var(--info-bg)' : 'var(--danger-bg)',
                            color: status === 'Active' ? 'var(--success)' : status === 'Exited' ? 'var(--info)' : 'var(--danger)',
                        }}>{status === 'Active' ? '\u25CF ' : ''}{status}</span>
                    </div>

                    {/* 4 Metric Cards — clickable to edit */}
                    <div className="portfolio-detail-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
                        <MetricCard
                            label="Total Invested" value={totalInvested > 0 ? formatPortfolioCurrency(totalInvested) : '--'}
                            color="#10b981" sub={followOns.length > 0 ? `Initial + ${followOns.filter(f => f.didWeInvest).length} follow-ons` : 'Set initial investment below'}
                            field="initialInvestment" rawValue={c.initialInvestment?.toString() || ''} type="number"
                            editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit}
                            editLabel="Initial Investment (₹)"
                        />
                        <MetricCard
                            label="Latest Valuation" value={latestVal > 0 ? formatPortfolioCurrency(latestVal) : '--'}
                            sub={followOns.length > 0 ? 'From latest round' : 'Entry valuation'}
                            field="latestValuation" rawValue={(c.latestValuation || c.entryValuation || '')?.toString()} type="number"
                            editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit}
                            editLabel="Latest Valuation (₹)"
                        />
                        <MetricCard
                            label="Current Ownership" value={ownership > 0 ? `${ownership.toFixed(2)}%` : '--'}
                            sub={followOns.length > 0 ? 'After dilution' : 'Entry ownership'}
                            field="currentOwnership" rawValue={(c.currentOwnership || c.entryOwnership || '')?.toString()} type="number"
                            editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit}
                            editLabel="Current Ownership (%)"
                        />
                        <div style={metricCardStyle}>
                            <div style={metricLabelStyle}>IRR</div>
                            <div style={{ ...metricValueStyle, color: irr && irr >= 0 ? '#10b981' : irr && irr < 0 ? '#ef4444' : 'var(--text-primary)' }}>
                                {formatXIRR(irr)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                MOIC: {totalInvested > 0 ? formatMOIC(moic) : '--'}
                            </div>
                        </div>
                    </div>

                    {/* Investment Details + Team */}
                    <div className="portfolio-detail-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                        <div>
                            <h3 style={sectionTitleStyle}>Investment Details</h3>
                            <div style={detailCardStyle}>
                                <EditableRow label="Entry Date" value={entryDate} field="createdAt" type="date" rawValue={c.createdAt?.split('T')[0] || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Stage" value={c.companyRound || '--'} field="companyRound" rawValue={c.companyRound || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Initial Investment" value={c.initialInvestment ? formatPortfolioCurrency(c.initialInvestment) : '--'} field="initialInvestment" type="number" rawValue={c.initialInvestment?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Share Price" value={c.sharePrice != null ? `₹${c.sharePrice.toLocaleString('en-IN')}` : '--'} field="sharePrice" type="number" rawValue={c.sharePrice?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="No. of Shares at Entry" value={c.numShares != null ? c.numShares.toLocaleString('en-IN') : '--'} field="numShares" type="number" rawValue={c.numShares?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Total No. of Shares (company)" value={c.totalShares != null ? c.totalShares.toLocaleString('en-IN') : '--'} field="totalShares" type="number" rawValue={c.totalShares?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Pre-money" value={c.entryPreMoneyValuation ? formatPortfolioCurrency(c.entryPreMoneyValuation) : '--'} field="entryPreMoneyValuation" type="number" rawValue={c.entryPreMoneyValuation?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Post-money" value={(c.entryPostMoneyValuation ?? c.entryValuation) ? formatPortfolioCurrency((c.entryPostMoneyValuation ?? c.entryValuation) as number) : '--'} field="entryPostMoneyValuation" type="number" rawValue={(c.entryPostMoneyValuation ?? c.entryValuation)?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Ownership %" value={c.entryOwnership ? `${c.entryOwnership}%` : (c.initialInvestment && (c.entryPostMoneyValuation || c.entryValuation) ? `${((c.initialInvestment / ((c.entryPostMoneyValuation || c.entryValuation) as number)) * 100).toFixed(2)}%` : '--')} field="entryOwnership" type="number" rawValue={c.entryOwnership?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Current Ownership %" value={ownership > 0 ? `${ownership.toFixed(2)}%` : '--'} field="currentOwnership" type="number" rawValue={c.currentOwnership?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <DetailRow label="MOIC" value={totalInvested > 0 ? formatMOIC(moic) : '--'} />
                            </div>
                        </div>
                        <div>
                            <h3 style={sectionTitleStyle}>Team & Info</h3>
                            <div style={detailCardStyle}>
                                <EditableRow label="Founder" value={c.founderName || '--'} field="founderName" rawValue={c.founderName || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Email" value={c.founderEmail || '--'} field="founderEmail" rawValue={c.founderEmail || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="HQ Location" value={c.hqLocation || '--'} field="hqLocation" rawValue={c.hqLocation || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Latest Valuation" value={latestVal > 0 ? formatPortfolioCurrency(latestVal) : '--'} field="latestValuation" type="number" rawValue={c.latestValuation?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Status" value={status} field="portfolioStatus" rawValue={status} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={['Active', 'Exited', 'Written Off']} />
                                {status === 'Exited' && (
                                    <EditableRow label="Exit Value" value={c.exitValue ? formatPortfolioCurrency(c.exitValue) : '--'} field="exitValue" type="number" rawValue={c.exitValue?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                )}
                                <EditableRow
                                    label="Deal Sourcer" value={sourcer || '--'} field="dealSourceNameId"
                                    rawValue={c.dealSourceNameId || ''} editField={editField} editValue={editValue}
                                    onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit}
                                    selectOptions={dealSourceNames.map(d => d.id)}
                                    selectLabels={Object.fromEntries(dealSourceNames.map(d => [d.id, d.name]))}
                                />
                                <EditableRow
                                    label="Analyst" value={analyst || '--'} field="analystId"
                                    rawValue={c.analystId || ''} editField={editField} editValue={editValue}
                                    onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit}
                                    selectOptions={users.map(u => u.id)}
                                    selectLabels={Object.fromEntries(users.map(u => [u.id, u.name]))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Follow-on Rounds */}
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 style={sectionTitleStyle}>Follow-on Rounds</h3>
                            <button className="btn btn-sm btn-primary" onClick={() => setShowAddRound(!showAddRound)}>
                                <Plus size={14} /> Add Round
                            </button>
                        </div>

                        {/* Add Round Form */}
                        {showAddRound && (() => {
                            const toNum = (s: string) => {
                                if (!s) return null;
                                const n = parseFloat(s);
                                return Number.isFinite(n) ? n : null;
                            };
                            const previewPre = toNum(roundForm.pre_money_valuation);
                            const previewPost = toNum(roundForm.post_money_valuation);
                            const previewShares = toNum(roundForm.num_shares);
                            const previewPrice = toNum(roundForm.share_price);
                            const previewOwn = toNum(roundForm.ownership_after);
                            const previewImpliedRaised = previewPre != null && previewPost != null ? previewPost - previewPre : null;
                            const previewValueByShares = previewShares != null && previewPrice != null ? previewShares * previewPrice : null;
                            const previewValueByEquity = previewOwn != null && previewPost != null ? (previewOwn / 100) * previewPost : null;
                            const previewValueToday = previewValueByShares ?? previewValueByEquity;

                            return (
                            <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10, marginBottom: 12, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div className="form-group">
                                        <label className="form-label">Round Name *</label>
                                        <select className="form-select" value={roundForm.round_name}
                                            onChange={e => setRoundForm(f => ({ ...f, round_name: e.target.value }))}>
                                            {FOLLOWON_ROUND_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Date *</label>
                                        <input className="form-input" type="date" value={roundForm.round_date}
                                            onChange={e => setRoundForm(f => ({ ...f, round_date: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Pre-money Valuation (&#8377;)</label>
                                        <input className="form-input" type="number" placeholder="Pre-money"
                                            value={roundForm.pre_money_valuation} onChange={e => setRoundForm(f => ({ ...f, pre_money_valuation: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Post-money Valuation (&#8377;)</label>
                                        <input className="form-input" type="number" placeholder="Post-money"
                                            value={roundForm.post_money_valuation} onChange={e => setRoundForm(f => ({ ...f, post_money_valuation: e.target.value }))} />
                                        {previewImpliedRaised != null && previewImpliedRaised > 0 && (
                                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                Pre + Raised = Post &rarr; Raised: {formatPortfolioCurrency(previewImpliedRaised)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Share Price (&#8377;)</label>
                                        <input className="form-input" type="number" placeholder="e.g. 1500"
                                            value={roundForm.share_price} onChange={e => setRoundForm(f => ({ ...f, share_price: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">No. of Shares at Entry (this round)</label>
                                        <input className="form-input" type="number" placeholder="e.g. 5000"
                                            value={roundForm.num_shares} onChange={e => setRoundForm(f => ({ ...f, num_shares: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Total No. of Shares (company)</label>
                                        <input className="form-input" type="number" placeholder="Company's total outstanding shares"
                                            value={roundForm.total_shares} onChange={e => setRoundForm(f => ({ ...f, total_shares: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Total Raised (&#8377;)</label>
                                        <input className="form-input" type="number"
                                            placeholder={previewImpliedRaised != null && previewImpliedRaised > 0 ? `Auto: ${formatPortfolioCurrency(previewImpliedRaised)}` : 'Total round size'}
                                            value={roundForm.total_raised}
                                            onChange={e => setRoundForm(f => ({ ...f, total_raised: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Did We Invest?</label>
                                        <select className="form-select" value={roundForm.did_we_invest ? 'yes' : 'no'}
                                            onChange={e => setRoundForm(f => ({ ...f, did_we_invest: e.target.value === 'yes' }))}>
                                            <option value="yes">Yes</option>
                                            <option value="no">No (Passive Dilution)</option>
                                        </select>
                                    </div>
                                    {roundForm.did_we_invest && (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Our Investment (&#8377;)</label>
                                                <input className="form-input" type="number" placeholder="Our cheque size"
                                                    value={roundForm.our_investment} onChange={e => setRoundForm(f => ({ ...f, our_investment: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Ownership Sought in Round (%)</label>
                                                <input className="form-input" type="number" step="0.01" placeholder="e.g. 2.5"
                                                    value={roundForm.ownership_sought}
                                                    onChange={e => setRoundForm(f => ({ ...f, ownership_sought: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total Ownership After Round (%)</label>
                                                <input className="form-input" type="number" step="0.01" placeholder="e.g. 8.5"
                                                    value={roundForm.ownership_after}
                                                    onChange={e => setRoundForm(f => ({ ...f, ownership_after: e.target.value }))} />
                                            </div>
                                        </>
                                    )}
                                    {!roundForm.did_we_invest && (
                                        <div className="form-group">
                                            <label className="form-label">Ownership After Dilution (%)</label>
                                            <input className="form-input" type="number" step="0.01" placeholder="e.g. 6.0"
                                                value={roundForm.ownership_after}
                                                onChange={e => setRoundForm(f => ({ ...f, ownership_after: e.target.value }))} />
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Other Investors</label>
                                        <input className="form-input" placeholder="e.g. Sequoia, Accel"
                                            value={roundForm.investor_names} onChange={e => setRoundForm(f => ({ ...f, investor_names: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Our Value Today</label>
                                        <div className="form-input" style={{
                                            display: 'flex', alignItems: 'center',
                                            background: 'var(--bg-secondary)',
                                            color: previewValueToday != null ? '#10b981' : 'var(--text-tertiary)',
                                            fontWeight: 600,
                                        }}>
                                            {previewValueToday != null ? formatPortfolioCurrency(previewValueToday) : '—'}
                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8, fontWeight: 400 }}>
                                                {previewValueByShares != null ? '(shares × price)' : previewValueByEquity != null ? '(equity% × post)' : ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {saveRoundError && (
                                    <div style={{
                                        marginTop: 12, padding: '8px 12px',
                                        background: 'var(--danger-bg, #fef2f2)',
                                        color: 'var(--danger, #b91c1c)',
                                        border: '1px solid var(--danger, #b91c1c)',
                                        borderRadius: 6, fontSize: 12,
                                    }}>
                                        {saveRoundError}
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddRound(false); setSaveRoundError(null); }}>Cancel</button>
                                    <button className="btn btn-primary btn-sm" onClick={handleAddRound} disabled={savingRound}>
                                        {savingRound ? <><Loader2 size={14} className="spin" /> Saving...</> : 'Save Round'}
                                    </button>
                                </div>
                            </div>
                            );
                        })()}

                        {/* Existing rounds */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>Loading...</div>
                        ) : sortedFollowOns.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                No follow-on rounds yet
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {sortedFollowOns.map(fo => {
                                    const post = fo.postMoneyValuation ?? fo.roundValuation ?? null;
                                    const valueByShares = fo.numShares != null && fo.sharePrice != null ? fo.numShares * fo.sharePrice : null;
                                    const valueByEquity = fo.ownershipAfter != null && post != null ? (fo.ownershipAfter / 100) * post : null;
                                    const valueToday = valueByShares ?? valueByEquity;
                                    return (
                                    <div key={fo.id} style={{
                                        padding: 14, background: 'var(--bg-tertiary)', borderRadius: 8,
                                        border: '1px solid var(--border)', fontSize: 13,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="badge badge-info" style={{ fontSize: 11 }}>{fo.roundName}</span>
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                                                    {new Date(fo.roundDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteRound(fo.id)} title="Delete round">
                                                <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Total Raised</div>
                                                <div style={{ fontWeight: 600 }}>{fo.totalRaised ? formatPortfolioCurrency(fo.totalRaised) : '--'}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                                                    {fo.didWeInvest ? 'Our Investment' : 'We Passed'}
                                                </div>
                                                <div style={{ fontWeight: 600, color: fo.didWeInvest ? '#10b981' : 'var(--text-tertiary)' }}>
                                                    {fo.didWeInvest && fo.ourInvestment ? formatPortfolioCurrency(fo.ourInvestment) : (fo.didWeInvest ? '--' : 'Diluted')}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Ownership After</div>
                                                <div style={{ fontWeight: 600 }}>{fo.ownershipAfter != null ? `${fo.ownershipAfter}%` : '--'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Pre-money</div>
                                                <div style={{ fontWeight: 500, fontSize: 12 }}>{fo.preMoneyValuation ? formatPortfolioCurrency(fo.preMoneyValuation) : '--'}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Post-money</div>
                                                <div style={{ fontWeight: 500, fontSize: 12 }}>{post ? formatPortfolioCurrency(post) : '--'}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Share Price</div>
                                                <div style={{ fontWeight: 500, fontSize: 12 }}>{fo.sharePrice != null ? `\u20b9${fo.sharePrice.toLocaleString('en-IN')}` : '--'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Shares at Entry (this round)</div>
                                                <div style={{ fontWeight: 500, fontSize: 12 }}>{fo.numShares != null ? fo.numShares.toLocaleString('en-IN') : '--'}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Total Shares (company)</div>
                                                <div style={{ fontWeight: 500, fontSize: 12 }}>{fo.totalShares != null ? fo.totalShares.toLocaleString('en-IN') : '--'}</div>
                                            </div>
                                        </div>
                                        {fo.didWeInvest && fo.ownershipSought != null && (
                                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                Ownership sought this round: <strong style={{ color: 'var(--text-primary)' }}>{fo.ownershipSought}%</strong>
                                            </div>
                                        )}
                                        <div style={{
                                            marginTop: 8,
                                            paddingTop: 8,
                                            borderTop: '1px dashed var(--border)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            fontSize: 12,
                                        }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>
                                                Our Value Today
                                                <span style={{ marginLeft: 6, fontSize: 10 }}>
                                                    {valueByShares != null ? '(shares \u00d7 price)' : valueByEquity != null ? '(equity% \u00d7 post)' : ''}
                                                </span>
                                            </span>
                                            <span style={{ fontWeight: 700, color: valueToday != null ? '#10b981' : 'var(--text-tertiary)' }}>
                                                {valueToday != null ? formatPortfolioCurrency(valueToday) : '--'}
                                            </span>
                                        </div>
                                        {fo.investorNames && (
                                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                Investors: {fo.investorNames}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: 20 }}>
                        <h3 style={sectionTitleStyle}>Notes</h3>
                        <textarea
                            className="form-input"
                            rows={3}
                            placeholder="Add notes..."
                            value={notesValue}
                            onChange={e => { setNotesValue(e.target.value); setNotesDirty(true); }}
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                        {notesDirty && (
                            <button className="btn btn-sm btn-primary" onClick={handleSaveNotes} style={{ marginTop: 6 }}>
                                Save Notes
                            </button>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 24px', borderTop: '1px solid var(--border)',
                }}>
                    <button className="btn btn-sm" onClick={() => setShowDeleteConfirm(true)}
                        style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}>
                        Delete
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-outline"
                            onClick={() => { setSelectedCompany(null); router.push(`/legal/${c.id}`); }}
                            title="Open this company in the Legal tab"
                        >
                            <Scale size={14} /> Go to Legal
                        </button>
                        <button className="btn btn-ghost" onClick={handleClose}>Close</button>
                        <button className="btn btn-primary" onClick={handleEdit}>Edit Company</button>
                    </div>
                </div>

                {/* Delete Confirm */}
                {showDeleteConfirm && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit',
                    }}>
                        <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, textAlign: 'center', maxWidth: 320 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>Delete {c.companyName}?</div>
                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>This cannot be undone.</div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                                <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={handleDelete}>Delete</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{label}</span>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{value}</span>
        </div>
    );
}

interface EditableRowProps {
    label: string;
    value: string;
    field: string;
    rawValue: string;
    editField: string | null;
    editValue: string;
    type?: string;
    selectOptions?: string[];
    selectLabels?: Record<string, string>;
    onStart: (field: string, val: string) => void;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

function EditableRow({ label, value, field, rawValue, editField, editValue, type, selectOptions, selectLabels, onStart, onChange, onSave, onCancel }: EditableRowProps) {
    const isEditing = editField === field;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 8 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flexShrink: 0 }}>{label}</span>
            {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {selectOptions ? (
                        <select
                            className="form-select"
                            value={editValue}
                            onChange={e => onChange(e.target.value)}
                            autoFocus
                            style={{ fontSize: 12, padding: '3px 6px', height: 28 }}
                        >
                            <option value="">-- None --</option>
                            {selectOptions.map(o => (
                                <option key={o} value={o}>{selectLabels ? selectLabels[o] || o : o}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            className="form-input"
                            type={type || 'text'}
                            value={editValue}
                            onChange={e => onChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                            autoFocus
                            style={{ fontSize: 12, padding: '3px 6px', height: 28, width: 130 }}
                        />
                    )}
                    <button onClick={onSave} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Check size={14} style={{ color: 'var(--success)' }} />
                    </button>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{value}</span>
                    <button
                        onClick={() => onStart(field, rawValue)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                    >
                        <Pencil size={12} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                </div>
            )}
        </div>
    );
}

interface MetricCardProps {
    label: string;
    value: string;
    color?: string;
    sub?: string;
    field: string;
    rawValue: string;
    type?: string;
    editLabel?: string;
    editField: string | null;
    editValue: string;
    onStart: (field: string, val: string) => void;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

function MetricCard({ label, value, color, sub, field, rawValue, type, editLabel, editField: ef, editValue: ev, onStart, onChange, onSave, onCancel }: MetricCardProps) {
    const isEditing = ef === field;
    return (
        <div style={{ ...metricCardStyle, cursor: isEditing ? 'default' : 'pointer', position: 'relative' }}
            onClick={() => { if (!isEditing) onStart(field, rawValue); }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={metricLabelStyle}>{label}</div>
                {!isEditing && (
                    <Pencil size={11} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                )}
            </div>
            {isEditing ? (
                <div style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>{editLabel || label}</div>
                    <input
                        className="form-input"
                        type={type || 'text'}
                        value={ev}
                        onChange={e => onChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                        autoFocus
                        style={{ fontSize: 13, padding: '4px 8px', height: 30, width: '100%' }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={onCancel} style={{ fontSize: 11, padding: '2px 8px' }}>Cancel</button>
                        <button className="btn btn-primary" onClick={onSave} style={{ fontSize: 11, padding: '2px 8px' }}>Save</button>
                    </div>
                </div>
            ) : (
                <>
                    <div style={{ ...metricValueStyle, color: color || 'var(--text-primary)' }}>{value}</div>
                    {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</div>}
                </>
            )}
        </div>
    );
}

const metricCardStyle: React.CSSProperties = {
    padding: 14, background: 'var(--bg-tertiary)', borderRadius: 10,
    border: '1px solid var(--border)',
};
const metricLabelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4,
};
const metricValueStyle: React.CSSProperties = {
    fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
};
const sectionTitleStyle: React.CSSProperties = {
    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10,
};
const detailCardStyle: React.CSSProperties = {
    padding: 14, background: 'var(--bg-tertiary)', borderRadius: 10,
    border: '1px solid var(--border)',
};
