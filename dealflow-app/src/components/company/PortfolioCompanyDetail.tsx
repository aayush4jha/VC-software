'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, FileText, Loader2, Pencil, Check, Scale, NotebookPen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/context';
import {
    getTotalInvested, getLatestValuation, getCurrentOwnership,
    getCompanyIRR, getCompanyMOIC, formatPortfolioCurrency, formatPortfolioCurrencyExact,
    formatMOIC, formatXIRR, PORTFOLIO_STAGE_COLORS,
    getPortfolioStage, getCurrentStage, describeDroppedColumns, PORTFOLIO_STAGES,
    getDerivedCurrentOwnership,
} from '@/lib/portfolio-utils';
import type { Company, FollowOnRound, Founder } from '@/types/database';
import { INVESTMENT_TYPES } from '@/types/database';
import InvestmentEntitySelect from '@/components/common/InvestmentEntitySelect';
import InvestmentInstrumentSelect from '@/components/common/InvestmentInstrumentSelect';
import { useEscapeKey } from '@/lib/useEscapeKey';
import CompanyNotesPanel from './CompanyNotesPanel';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// Indian states + UTs — datalist suggestions; user can still type any custom value.
const HQ_LOCATION_SUGGESTIONS: string[] = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

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
        fetchFollowOns, addFollowOn, updateFollowOn, deleteFollowOn, updateCompany, deleteCompany,
        followOnsVersion, fetchCompanyNotes,
        setEditingCompany, setShowCompanyForm, setCompanyFormPortfolioMode,
        dealSourceNames, users,
    } = useAppContext();

    const [followOns, setFollowOns] = useState<FollowOnRound[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAddRound, setShowAddRound] = useState(false);
    const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
    const [savingRound, setSavingRound] = useState(false);
    const [saveRoundError, setSaveRoundError] = useState<string | null>(null);
    const [saveRoundNotice, setSaveRoundNotice] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [confirmDeleteRoundId, setConfirmDeleteRoundId] = useState<string | null>(null);
    const [showNotesPanel, setShowNotesPanel] = useState(false);
    const [notesFullscreen, setNotesFullscreen] = useState(false);
    const [notesCount, setNotesCount] = useState<number | null>(null);
    const [editField, setEditField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [fieldError, setFieldError] = useState<string | null>(null);

    // New round form
    const [roundForm, setRoundForm] = useState({
        round_name: 'Series A', round_date: '', total_raised: '', our_investment: '',
        did_we_invest: true, pre_money_valuation: '', post_money_valuation: '',
        share_price: '', num_shares: '', total_shares: '', dv_total_shares: '',
        ownership_sought: '', ownership_after: '', dilution_percent: '',
        investor_names: '', notes: '', our_value_today_override: '',
        investment_vehicle: '', syndicate_name: '', investment_type: '', investment_instrument: '',
    });

    const resetRoundForm = () => setRoundForm({
        round_name: 'Series A', round_date: '', total_raised: '', our_investment: '',
        did_we_invest: true, pre_money_valuation: '', post_money_valuation: '',
        share_price: '', num_shares: '', total_shares: '', dv_total_shares: '',
        ownership_sought: '', ownership_after: '', dilution_percent: '',
        investor_names: '', notes: '', our_value_today_override: '',
        investment_vehicle: '', syndicate_name: '', investment_type: '', investment_instrument: '',
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
        // Switching companies (or closing the panel) must reset transient UI
        // state — otherwise a left-over showDeleteConfirm from the previous
        // company surfaces as "Delete <new company>?" on the next open.
        setShowDeleteConfirm(false);
        setConfirmDeleteRoundId(null);
        setEditField(null);
        setEditValue('');
        setFieldError(null);
        setShowNotesPanel(false);
        setNotesFullscreen(false);
        setNotesCount(null);
        setSaveRoundError(null);
        setSaveRoundNotice(null);
        // Drop the previous company's rounds too, so its MOIC / IRR can't
        // flash against the new company while the reload is in flight.
        setFollowOns([]);
    }, [c?.id, isPortfolio]);

    // followOnsVersion bumps on every round add / edit / delete, wherever it
    // happened — this panel, or the Edit Portfolio Company modal layered over
    // it. Re-reading here is what makes a saved round (and every figure derived
    // from it: invested, ownership, MOIC, IRR) appear without a page reload.
    useEffect(() => {
        if (c && isPortfolio) {
            loadFollowOns();
        }
    }, [c?.id, isPortfolio, followOnsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // Note count for the header trigger — loaded up front so the badge is
    // accurate before the pane has ever been opened.
    useEffect(() => {
        if (!c || !isPortfolio) return;
        let cancelled = false;
        fetchCompanyNotes(c.id).then(({ notes, error }) => {
            if (cancelled) return;
            setNotesCount(error ? null : notes.length);
        });
        return () => { cancelled = true; };
    }, [c?.id, isPortfolio, fetchCompanyNotes]); // eslint-disable-line react-hooks/exhaustive-deps

    useEscapeKey(!!c && isPortfolio && !showNotesPanel, () => setSelectedCompany(null));

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
            'entryTotalRaised', 'noOfShares', 'dvTotalShares',
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
        // updateCompany writes the saved row straight back into context, which
        // is what re-derives Total Invested / ownership / MOIC / IRR here and
        // the tiles on the board. A rejected write used to be painted on
        // locally anyway, so the panel showed a value the database never took.
        const { error, dropped } = await updateCompany(c.id, data);
        if (error) {
            setFieldError(`Could not save ${editField}: ${error}`);
            return;
        }
        // The write succeeded, but the database had nowhere to put one of the
        // fields. Saying so is the difference between a value that is missing
        // and a value that looks saved and is not.
        setFieldError(describeDroppedColumns(dropped));
        setEditField(null);
        setEditValue('');
    };

    const cancelEdit = () => { setEditField(null); setEditValue(''); setFieldError(null); };

    const handleEdit = () => {
        setCompanyFormPortfolioMode(true);
        setEditingCompany(c);
        setShowCompanyForm(true);
    };

    const handleDelete = async () => {
        await deleteCompany(c.id);
        setShowDeleteConfirm(false);
        setSelectedCompany(null);
    };

    const handleSaveRound = async () => {
        setSaveRoundError(null);
        setSaveRoundNotice(null);
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
        const preMoney = toNum(roundForm.pre_money_valuation);
        const sharePrice = toNum(roundForm.share_price);
        const numShares = toNum(roundForm.num_shares);
        const totalShares = toNum(roundForm.total_shares);
        const dvTotalShares = toNum(roundForm.dv_total_shares);
        const explicitRaised = toNum(roundForm.total_raised);
        const explicitPostMoney = toNum(roundForm.post_money_valuation);

        // Compute the auto chain at save time so blank inputs fall back to
        // the same values the form previews — matches the primary modal.
        const totalRaised = explicitRaised
            ?? (explicitPostMoney != null && preMoney != null ? explicitPostMoney - preMoney : null);
        const postMoney = explicitPostMoney
            ?? (preMoney != null && explicitRaised != null ? preMoney + explicitRaised : null);

        // Previous ownership for the dilution chain.
        const roundIdx = editingRoundId
            ? sortedFollowOns.findIndex(r => r.id === editingRoundId)
            : sortedFollowOns.length;
        const prevOwnership = (() => {
            if (roundIdx <= 0) {
                return c.entryOwnership ?? (
                    c.initialInvestment && (c.entryPostMoneyValuation || c.entryValuation)
                        ? (c.initialInvestment / ((c.entryPostMoneyValuation || c.entryValuation) as number)) * 100
                        : 0
                );
            }
            const earlier = editingRoundId
                ? sortedFollowOns.filter(r => r.id !== editingRoundId).slice(0, roundIdx)
                : sortedFollowOns.slice(0, roundIdx);
            return earlier[earlier.length - 1]?.ownershipAfter ?? 0;
        })();

        const autoEquitySought = ourInv != null && postMoney != null && postMoney > 0
            ? (ourInv / postMoney) * 100
            : null;
        const ownerSought = toNum(roundForm.ownership_sought) ?? autoEquitySought;

        const autoDilution = totalRaised != null && postMoney != null && postMoney > 0
            ? prevOwnership * (totalRaised / postMoney)
            : null;
        const dilution = toNum(roundForm.dilution_percent) ?? autoDilution;

        const autoOwnAfter = dilution != null
            ? (roundForm.did_we_invest && ownerSought != null
                ? prevOwnership - dilution + ownerSought
                : prevOwnership - dilution)
            : null;
        const ownerAfter = toNum(roundForm.ownership_after) ?? autoOwnAfter;

        const payload = {
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
            dvTotalShares,
            ownershipSought: roundForm.did_we_invest ? ownerSought : null,
            ownershipAfter: ownerAfter,
            dilutionPercent: dilution,
            investorNames: roundForm.investor_names,
            notes: roundForm.notes,
            ourValueTodayOverride: toNum(roundForm.our_value_today_override),
            investmentVehicle: roundForm.investment_vehicle || null,
            syndicateName: roundForm.investment_vehicle === 'Syndicate' ? (roundForm.syndicate_name || null) : null,
            investmentType: roundForm.investment_type || null,
            investmentInstrument: roundForm.investment_instrument || null,
        };

        if (editingRoundId) {
            // updateFollowOn resolves with the database error rather than
            // throwing, so this has to be checked — it used to be swallowed,
            // and a rejected UPDATE looked exactly like a successful save.
            const { error, dropped } = await updateFollowOn(editingRoundId, payload);
            if (error) {
                setSavingRound(false);
                setSaveRoundError(`Could not update round: ${error}`);
                return;
            }
            setSaveRoundNotice(describeDroppedColumns(dropped));
        } else {
            const { round: created, dropped } = await addFollowOn({
                ...payload,
                companyId: c.id,
                organizationId: ORGANIZATION_ID,
            });

            if (!created) {
                setSavingRound(false);
                setSaveRoundError('Could not save round. Check the browser console for the database error.');
                return;
            }
            setSaveRoundNotice(describeDroppedColumns(dropped));

            // Optimistically show the new round immediately.
            setFollowOns(prev => [...prev, created]);
        }

        // Auto-update company fields based on the round.
        // companyRound represents the ENTRY round and must not be touched here
        // — Current Stage is derived from the latest follow-on via
        // getCurrentStage(), so writing companyRound on every save would
        // silently clobber the user's entry-stage choice.
        const companyUpdates: Record<string, unknown> = {};
        if (postMoney != null && postMoney > 0) {
            companyUpdates.latestValuation = postMoney;
        }
        if (ownerAfter != null) {
            companyUpdates.currentOwnership = ownerAfter;
        }
        if (Object.keys(companyUpdates).length > 0) {
            const { error } = await updateCompany(c.id, companyUpdates);
            if (error) {
                setSavingRound(false);
                setSaveRoundError(`Round saved, but the company's latest valuation / ownership could not be updated: ${error}`);
                return;
            }
        }

        resetRoundForm();
        setEditingRoundId(null);
        setShowAddRound(false);
        setSavingRound(false);
        // The followOnsVersion effect above re-reads the canonical rows
        // (including server-generated fields) — no explicit reload needed.
    };

    const handleStartEditRound = (fo: FollowOnRound) => {
        setEditingRoundId(fo.id);
        setSaveRoundError(null);
        setRoundForm({
            round_name: fo.roundName || 'Series A',
            round_date: fo.roundDate ? fo.roundDate.slice(0, 10) : '',
            total_raised: fo.totalRaised?.toString() || '',
            our_investment: fo.ourInvestment?.toString() || '',
            did_we_invest: fo.didWeInvest,
            pre_money_valuation: fo.preMoneyValuation?.toString() || '',
            post_money_valuation: (fo.postMoneyValuation ?? fo.roundValuation)?.toString() || '',
            share_price: fo.sharePrice?.toString() || '',
            num_shares: fo.numShares?.toString() || '',
            total_shares: fo.totalShares?.toString() || '',
            dv_total_shares: fo.dvTotalShares?.toString() || '',
            ownership_sought: fo.ownershipSought?.toString() || '',
            ownership_after: fo.ownershipAfter?.toString() || '',
            dilution_percent: fo.dilutionPercent?.toString() || '',
            investor_names: fo.investorNames || '',
            notes: fo.notes || '',
            our_value_today_override: fo.ourValueTodayOverride?.toString() || '',
            investment_vehicle: fo.investmentVehicle || '',
            syndicate_name: fo.syndicateName || '',
            investment_type: fo.investmentType || '',
            investment_instrument: fo.investmentInstrument || '',
        });
        setShowAddRound(true);
    };

    const handleCancelRound = () => {
        resetRoundForm();
        setEditingRoundId(null);
        setShowAddRound(false);
        setSaveRoundError(null);
        setSaveRoundNotice(null);
    };

    const requestDeleteRound = (id: string) => setConfirmDeleteRoundId(id);
    const cancelDeleteRound = () => setConfirmDeleteRoundId(null);
    const confirmDeleteRound = async () => {
        if (!confirmDeleteRoundId) return;
        const { error } = await deleteFollowOn(confirmDeleteRoundId);
        setConfirmDeleteRoundId(null);
        if (error) {
            setSaveRoundError(`Could not delete round: ${error}`);
            return;
        }

        // currentOwnership is the stored value of record and now wins over the
        // derived chain, so removing a round has to write the recomputed figure
        // back — otherwise the ownership from the deleted round would stand
        // forever.
        const remaining = followOns.filter(fo => fo.id !== confirmDeleteRoundId);
        const derived = getDerivedCurrentOwnership(c, remaining);
        if (Number.isFinite(derived)) {
            await updateCompany(c.id, { currentOwnership: derived });
        }
    };

    const effectiveEntryDate = c.entryDate ?? c.createdAt;
    const entryDate = effectiveEntryDate ? new Date(effectiveEntryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--';
    const sortedFollowOns = [...followOns].sort((a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());

    return (
        <div className="modal-overlay" onClick={handleClose}>
            {/* Two columns in one window: details on the left, notes on the
                right. Each column owns its own scroll, so both stay usable
                at once — no overlay sits between them. */}
            <div
                className={`modal pd-shell${showNotesPanel ? ' notes-open' : ''}${notesFullscreen ? ' notes-full' : ''}`}
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: notesFullscreen ? 1600 : showNotesPanel ? 1200 : 720,
                    maxHeight: notesFullscreen ? '96vh' : '92vh',
                }}
            >
              {/* Hidden rather than unmounted while notes are fullscreen, so an
                  in-progress inline field edit survives the round trip. */}
              <div className={`pd-col pd-col-main${notesFullscreen ? ' pd-col-hidden' : ''}`}>
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

                    {/* Stage + Status badges, with the notes pane trigger on the right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                        <span className="badge" style={{
                            backgroundColor: `${PORTFOLIO_STAGE_COLORS[stage] || '#6366f1'}20`,
                            color: PORTFOLIO_STAGE_COLORS[stage] || '#6366f1',
                        }}>{stage}</span>
                        <span className="badge" style={{
                            backgroundColor: status === 'Active' ? 'var(--success-bg)' : status === 'Exited' ? 'var(--info-bg)' : 'var(--danger-bg)',
                            color: status === 'Active' ? 'var(--success)' : status === 'Exited' ? 'var(--info)' : 'var(--danger)',
                        }}>{status === 'Active' ? '\u25CF ' : ''}{status}</span>
                        <button
                            className={`notes-trigger${showNotesPanel ? ' active' : ''}`}
                            style={{ marginLeft: 'auto' }}
                            onClick={() => setShowNotesPanel(v => !v)}
                            title="Open the notes timeline for this company"
                        >
                            <NotebookPen size={13} />
                            Notes
                            {notesCount != null && notesCount > 0 && (
                                <span className="notes-trigger-count">{notesCount}</span>
                            )}
                        </button>
                    </div>

                    {fieldError && (
                        <div style={{
                            marginBottom: 16, padding: '10px 14px',
                            background: 'var(--danger-bg, #fef2f2)',
                            color: 'var(--danger, #b91c1c)',
                            border: '1px solid var(--danger, #b91c1c)',
                            borderRadius: 8, fontSize: 12,
                        }}>
                            {fieldError}
                        </div>
                    )}

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
                            sub={c.latestValuation && c.latestValuation > 0
                                ? 'Set on this company'
                                : followOns.length > 0 ? 'From latest round' : 'Entry valuation'}
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
                                <EditableRow label="Entry Date" value={entryDate} field="entryDate" type="date" rawValue={effectiveEntryDate?.split('T')[0] || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Stage" value={c.companyRound || '--'} field="companyRound" rawValue={c.companyRound || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO']} />
                                <EditableRow label="Current Stage" value={getCurrentStage(c, followOns) || '--'} field="currentStage" rawValue={c.currentStage || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={[...PORTFOLIO_STAGES]} />
                                <EditableRow label="Initial Investment (Our Investment)" value={c.initialInvestment ? formatPortfolioCurrency(c.initialInvestment) : '--'} field="initialInvestment" type="number" rawValue={c.initialInvestment?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Total Money Raised in this Round" value={c.entryTotalRaised ? formatPortfolioCurrency(c.entryTotalRaised) : '--'} field="entryTotalRaised" type="number" rawValue={c.entryTotalRaised?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Number of Shares (Owned by DV)" value={c.numShares != null ? c.numShares.toLocaleString('en-IN') : '--'} field="numShares" type="number" rawValue={c.numShares?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                {(() => {
                                    // Priority: explicit company-level override (c.dvTotalShares) →
                                    // latest follow-on round with dvTotalShares set → entry-round
                                    // share count (total owned at entry equals what we bought).
                                    const sorted = [...followOns].sort(
                                        (a, b) => new Date(b.roundDate).getTime() - new Date(a.roundDate).getTime(),
                                    );
                                    const fromLatestRound = sorted.find(r => r.dvTotalShares != null)?.dvTotalShares ?? null;
                                    const totalDvShares = c.dvTotalShares ?? fromLatestRound ?? c.numShares;
                                    return (
                                        <EditableRow
                                            label="Total Shares Owned by DV"
                                            value={totalDvShares != null ? totalDvShares.toLocaleString('en-IN') : '--'}
                                            field="dvTotalShares"
                                            type="number"
                                            rawValue={c.dvTotalShares?.toString() || ''}
                                            editField={editField}
                                            editValue={editValue}
                                            onStart={startEdit}
                                            onChange={setEditValue}
                                            onSave={saveField}
                                            onCancel={cancelEdit}
                                        />
                                    );
                                })()}
                                <EditableRow label="Outstanding Shares" value={c.totalShares != null ? c.totalShares.toLocaleString('en-IN') : '--'} field="totalShares" type="number" rawValue={c.totalShares?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Share Price" value={c.sharePrice != null ? `₹${c.sharePrice.toLocaleString('en-IN')}` : '--'} field="sharePrice" type="number" rawValue={c.sharePrice?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Pre-money" value={c.entryPreMoneyValuation ? formatPortfolioCurrency(c.entryPreMoneyValuation) : '--'} field="entryPreMoneyValuation" type="number" rawValue={c.entryPreMoneyValuation?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Post-money" value={(c.entryPostMoneyValuation ?? c.entryValuation) ? formatPortfolioCurrency((c.entryPostMoneyValuation ?? c.entryValuation) as number) : '--'} field="entryPostMoneyValuation" type="number" rawValue={(c.entryPostMoneyValuation ?? c.entryValuation)?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Entry Ownership %" value={c.entryOwnership ? `${c.entryOwnership}%` : (c.initialInvestment && (c.entryPostMoneyValuation || c.entryValuation) ? `${((c.initialInvestment / ((c.entryPostMoneyValuation || c.entryValuation) as number)) * 100).toFixed(2)}%` : '--')} field="entryOwnership" type="number" rawValue={c.entryOwnership?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Total Ownership After Round %" value={c.noOfShares != null ? `${c.noOfShares}%` : '--'} field="noOfShares" type="number" rawValue={c.noOfShares?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Current Ownership %" value={ownership > 0 ? `${ownership.toFixed(2)}%` : '--'} field="currentOwnership" type="number" rawValue={c.currentOwnership?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Investment Type" value={c.shareType || '--'} field="shareType" rawValue={c.shareType || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={[...INVESTMENT_TYPES]} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 8, minWidth: 0 }}>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flex: 1, minWidth: 0 }}>Investment Entity</span>
                                    <div style={{ width: 190, flexShrink: 0 }}>
                                        <InvestmentEntitySelect
                                            value={c.investmentVehicle || ''}
                                            labelFontSize={13}
                                            onChange={async v => {
                                                const { error } = await updateCompany(c.id, { investmentVehicle: v || null });
                                                if (error) setFieldError(`Could not save investment entity: ${error}`);
                                            }}
                                        />
                                    </div>
                                </div>
                                {c.investmentVehicle === 'Syndicate' && (
                                    <EditableRow label="Syndicate Name" value={c.syndicateName || '--'} field="syndicateName" rawValue={c.syndicateName || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 8, minWidth: 0 }}>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flex: 1, minWidth: 0 }}>Investment Instrument</span>
                                    <div style={{ width: 190, flexShrink: 0 }}>
                                        <InvestmentInstrumentSelect
                                            value={c.investmentInstrument || ''}
                                            labelFontSize={13}
                                            onChange={async v => {
                                                const { error } = await updateCompany(c.id, { investmentInstrument: v || null });
                                                if (error) setFieldError(`Could not save investment instrument: ${error}`);
                                            }}
                                        />
                                    </div>
                                </div>
                                <EditableRow label="Portfolio Health" value={c.portfolioHealth || '--'} field="portfolioHealth" rawValue={c.portfolioHealth || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={['Bullish', 'Base', 'Bearish']} />
                                <DetailRow label="MOIC" value={totalInvested > 0 ? formatMOIC(moic) : '--'} />
                            </div>
                        </div>
                        <div>
                            <h3 style={sectionTitleStyle}>Team & Info</h3>
                            <div style={detailCardStyle}>
                                <FoundersEditor
                                    company={c}
                                    onChange={async next => {
                                        const data = {
                                            founders: next,
                                            founderName: next[0]?.name || '',
                                            founderEmail: next[0]?.email || '',
                                        };
                                        const { error } = await updateCompany(c.id, data);
                                        if (error) setFieldError(`Could not save founders: ${error}`);
                                    }}
                                />
                                <EditableRow label="HQ Location" value={c.hqLocation || '--'} field="hqLocation" rawValue={c.hqLocation || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} datalistOptions={HQ_LOCATION_SUGGESTIONS} placeholder="Pick a state or type a city/country" />
                                <EditableRow label="Latest Valuation" value={latestVal > 0 ? formatPortfolioCurrency(latestVal) : '--'} field="latestValuation" type="number" rawValue={c.latestValuation?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                <EditableRow label="Status" value={status} field="portfolioStatus" rawValue={status} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} selectOptions={['Active', 'Exited', 'Written Off']} />
                                {(status === 'Exited' || status === 'Written Off') && (
                                    <EditableRow label={status === 'Written Off' ? 'Amount Recovered' : 'Exit Value'} value={c.exitValue ? formatPortfolioCurrency(c.exitValue) : '--'} field="exitValue" type="number" rawValue={c.exitValue?.toString() || ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                                )}
                                {(status === 'Exited' || status === 'Written Off') && (
                                    <EditableRow label={status === 'Written Off' ? 'Recovery Date' : 'Exit Date'} value={c.exitDate ? new Date(c.exitDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'} field="exitDate" type="date" rawValue={c.exitDate ? c.exitDate.slice(0, 10) : ''} editField={editField} editValue={editValue} onStart={startEdit} onChange={setEditValue} onSave={saveField} onCancel={cancelEdit} />
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
                            <button className="btn btn-sm btn-primary" onClick={() => {
                                if (showAddRound) {
                                    handleCancelRound();
                                } else {
                                    setEditingRoundId(null);
                                    resetRoundForm();
                                    setShowAddRound(true);
                                }
                            }}>
                                <Plus size={14} /> Add Round
                            </button>
                        </div>

                        {/* Section-level failure notice — the in-form banner
                            below only renders while the form is open, so a
                            failed delete would otherwise vanish silently. */}
                        {saveRoundError && !showAddRound && (
                            <div style={{
                                marginBottom: 12, padding: '8px 12px',
                                background: 'var(--danger-bg, #fef2f2)',
                                color: 'var(--danger, #b91c1c)',
                                border: '1px solid var(--danger, #b91c1c)',
                                borderRadius: 6, fontSize: 12,
                            }}>
                                {saveRoundError}
                            </div>
                        )}

                        {/* The save went through, but the database had nowhere to
                            put one of the fields. Saying so beats letting a typed
                            value quietly vanish. */}
                        {saveRoundNotice && (
                            <div style={{
                                marginBottom: 12, padding: '8px 12px',
                                background: 'var(--warning-bg, #fffbeb)',
                                color: 'var(--warning, #b45309)',
                                border: '1px solid var(--warning, #d97706)',
                                borderRadius: 6, fontSize: 12,
                            }}>
                                {saveRoundNotice}
                            </div>
                        )}

                        {/* Add Round Form */}
                        {showAddRound && (() => {
                            const toNum = (s: string) => {
                                if (!s) return null;
                                const n = parseFloat(s);
                                return Number.isFinite(n) ? n : null;
                            };
                            const previewPre = toNum(roundForm.pre_money_valuation);
                            const previewRaisedExplicit = toNum(roundForm.total_raised);
                            const previewOurInv = toNum(roundForm.our_investment);
                            const previewShares = toNum(roundForm.num_shares);
                            const previewPrice = toNum(roundForm.share_price);

                            // Determine the round number for label substitution. When editing,
                            // use the existing round's chronological position; when adding
                            // new, it's the next slot.
                            let roundNumber: number;
                            if (editingRoundId) {
                                const idx = sortedFollowOns.findIndex(r => r.id === editingRoundId);
                                roundNumber = idx >= 0 ? idx + 1 : sortedFollowOns.length;
                            } else {
                                roundNumber = sortedFollowOns.length + 1;
                            }

                            // Previous ownership = entry ownership when this is round 1, else
                            // the ownershipAfter of the round immediately before.
                            const prevOwnership: number = (() => {
                                if (roundNumber <= 1) {
                                    return c.entryOwnership ?? (
                                        c.initialInvestment && (c.entryPostMoneyValuation || c.entryValuation)
                                            ? (c.initialInvestment / ((c.entryPostMoneyValuation || c.entryValuation) as number)) * 100
                                            : 0
                                    );
                                }
                                const earlier = editingRoundId
                                    ? sortedFollowOns.filter(r => r.id !== editingRoundId).slice(0, roundNumber - 1)
                                    : sortedFollowOns.slice(0, roundNumber - 1);
                                const last = earlier[earlier.length - 1];
                                return last?.ownershipAfter ?? 0;
                            })();

                            // Auto chain — same formulas as the primary modal and portfolio-utils.
                            const autoPost = previewPre != null && previewRaisedExplicit != null
                                ? previewPre + previewRaisedExplicit
                                : null;
                            const effectivePost = toNum(roundForm.post_money_valuation) ?? autoPost;
                            const autoEquitySought = previewOurInv != null && effectivePost != null && effectivePost > 0
                                ? (previewOurInv / effectivePost) * 100
                                : null;
                            const autoDilution = previewRaisedExplicit != null && effectivePost != null && effectivePost > 0
                                ? prevOwnership * (previewRaisedExplicit / effectivePost)
                                : null;
                            const effectiveDilution = toNum(roundForm.dilution_percent) ?? autoDilution;
                            const effectiveEquitySought = toNum(roundForm.ownership_sought) ?? autoEquitySought;
                            const autoOwnAfter = effectiveDilution != null
                                ? (roundForm.did_we_invest && effectiveEquitySought != null
                                    ? prevOwnership - effectiveDilution + effectiveEquitySought
                                    : prevOwnership - effectiveDilution)
                                : null;
                            const effectiveOwnAfter = toNum(roundForm.ownership_after) ?? autoOwnAfter;

                            const previewValueByShares = previewShares != null && previewPrice != null ? previewShares * previewPrice : null;
                            const previewValueByEquity = effectiveOwnAfter != null && effectivePost != null ? (effectiveOwnAfter / 100) * effectivePost : null;
                            const previewValueToday = previewValueByShares ?? previewValueByEquity;

                            const fmtMoneyPh = (v: number | null) => v != null && v > 0 ? `Auto: ${formatPortfolioCurrencyExact(v)}` : '';
                            const fmtPctPh = (v: number | null) => v != null ? `Auto: ${v.toFixed(2)}%` : '';

                            return (
                            <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10, marginBottom: 12, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    {/* Round Name + Date */}
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

                                    {/* Did we Invest */}
                                    <div className="form-group">
                                        <label className="form-label">Did we Invest?</label>
                                        <select className="form-select" value={roundForm.did_we_invest ? 'yes' : 'no'}
                                            onChange={e => setRoundForm(f => ({ ...f, did_we_invest: e.target.value === 'yes' }))}>
                                            <option value="yes">Yes</option>
                                            <option value="no">No (Passive Dilution)</option>
                                        </select>
                                    </div>
                                    <div className="form-group" />

                                    {roundForm.did_we_invest && (
                                        <>
                                            {/* Our investment + Total Money Raised */}
                                            <div className="form-group">
                                                <label className="form-label">Our investment in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="Our cheque size"
                                                    value={roundForm.our_investment} onChange={e => setRoundForm(f => ({ ...f, our_investment: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total Money Raised in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="Total round size"
                                                    value={roundForm.total_raised}
                                                    onChange={e => setRoundForm(f => ({ ...f, total_raised: e.target.value }))} />
                                            </div>

                                            {/* No. of Shares bought + Total shares owned by DV + Outstanding Shares */}
                                            <div className="form-group">
                                                <label className="form-label">No. of Shares bought in round {roundNumber}</label>
                                                <input className="form-input" type="number" min="0" placeholder="e.g. 5000"
                                                    value={roundForm.num_shares} onChange={e => setRoundForm(f => ({ ...f, num_shares: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total shares owned by DV</label>
                                                <input className="form-input" type="number" min="0" placeholder="DV's cumulative shares after this round"
                                                    value={roundForm.dv_total_shares} onChange={e => setRoundForm(f => ({ ...f, dv_total_shares: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Outstanding Shares in round {roundNumber}</label>
                                                <input className="form-input" type="number" min="0" placeholder="Company's total outstanding shares"
                                                    value={roundForm.total_shares} onChange={e => setRoundForm(f => ({ ...f, total_shares: e.target.value }))} />
                                            </div>
                                            <div className="form-group" />

                                            {/* Share Price + Pre-Money */}
                                            <div className="form-group">
                                                <label className="form-label">Share Price in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="e.g. 1500"
                                                    value={roundForm.share_price} onChange={e => setRoundForm(f => ({ ...f, share_price: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Pre-Money Valuation in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="Pre-money"
                                                    value={roundForm.pre_money_valuation} onChange={e => setRoundForm(f => ({ ...f, pre_money_valuation: e.target.value }))} />
                                            </div>

                                            {/* Post-money (AUTO) + Equity sought (AUTO) */}
                                            <div className="form-group">
                                                <label className="form-label">Post-money Valuation in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0"
                                                    placeholder={fmtMoneyPh(autoPost) || 'Post-money'}
                                                    value={roundForm.post_money_valuation} onChange={e => setRoundForm(f => ({ ...f, post_money_valuation: e.target.value }))} />
                                                {autoPost != null && autoPost > 0 && !roundForm.post_money_valuation && (
                                                    <AutoFillChip
                                                        display={formatPortfolioCurrencyExact(autoPost)}
                                                        formula="Pre-money + total raised"
                                                        onUse={() => setRoundForm(f => ({ ...f, post_money_valuation: String(autoPost) }))}
                                                    />
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Equity sought in round {roundNumber} (%)</label>
                                                <input className="form-input" type="number" min="0" step="0.01"
                                                    placeholder={fmtPctPh(autoEquitySought) || 'e.g. 2.5'}
                                                    value={roundForm.ownership_sought}
                                                    onChange={e => setRoundForm(f => ({ ...f, ownership_sought: e.target.value }))} />
                                                {autoEquitySought != null && !roundForm.ownership_sought && (
                                                    <AutoFillChip
                                                        display={`${autoEquitySought.toFixed(2)}%`}
                                                        formula="Our investment ÷ post-money × 100"
                                                        onUse={() => setRoundForm(f => ({ ...f, ownership_sought: autoEquitySought.toFixed(2) }))}
                                                    />
                                                )}
                                            </div>

                                            {/* Dilution (AUTO) + Total Ownership After Round (AUTO) */}
                                            <div className="form-group">
                                                <label className="form-label">Dilution in round {roundNumber} (%)</label>
                                                <input className="form-input" type="number" min="0" step="0.01"
                                                    placeholder={fmtPctPh(autoDilution) || 'e.g. 15.0'}
                                                    value={roundForm.dilution_percent}
                                                    onChange={e => setRoundForm(f => ({ ...f, dilution_percent: e.target.value }))} />
                                                {autoDilution != null && !roundForm.dilution_percent && (
                                                    <AutoFillChip
                                                        display={`${autoDilution.toFixed(2)}%`}
                                                        formula="Previous ownership × (total raised ÷ post-money)"
                                                        onUse={() => setRoundForm(f => ({ ...f, dilution_percent: autoDilution.toFixed(2) }))}
                                                    />
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total ownership after round {roundNumber} (%)</label>
                                                <input className="form-input" type="number" min="0" step="0.01"
                                                    placeholder={fmtPctPh(autoOwnAfter) || 'e.g. 8.5'}
                                                    value={roundForm.ownership_after}
                                                    onChange={e => setRoundForm(f => ({ ...f, ownership_after: e.target.value }))} />
                                                {autoOwnAfter != null && !roundForm.ownership_after && (
                                                    <AutoFillChip
                                                        display={`${autoOwnAfter.toFixed(2)}%`}
                                                        formula="Previous ownership − dilution + equity sought"
                                                        onUse={() => setRoundForm(f => ({ ...f, ownership_after: autoOwnAfter.toFixed(2) }))}
                                                    />
                                                )}
                                            </div>

                                            {/* Which entity the money came from, and what kind of buy */}
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label">Investment Type</label>
                                                    <select className="form-select" value={roundForm.investment_type}
                                                        onChange={e => setRoundForm(f => ({ ...f, investment_type: e.target.value }))}>
                                                        <option value="">Select type</option>
                                                        {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Investment Entity</label>
                                                    <InvestmentEntitySelect
                                                        value={roundForm.investment_vehicle}
                                                        onChange={v => setRoundForm(f => ({ ...f, investment_vehicle: v }))}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Investment Instrument</label>
                                                    <InvestmentInstrumentSelect
                                                        value={roundForm.investment_instrument}
                                                        onChange={v => setRoundForm(f => ({ ...f, investment_instrument: v }))}
                                                    />
                                                </div>
                                            </div>
                                            {roundForm.investment_vehicle === 'Syndicate' && (
                                                <div className="form-group">
                                                    <label className="form-label">Syndicate Name</label>
                                                    <input className="form-input" placeholder="e.g. Dholakia Angels I"
                                                        value={roundForm.syndicate_name}
                                                        onChange={e => setRoundForm(f => ({ ...f, syndicate_name: e.target.value }))} />
                                                </div>
                                            )}

                                            {/* Other investors + Our Value Today (editable, auto fallback) */}
                                            <div className="form-group">
                                                <label className="form-label">Other investors</label>
                                                <input className="form-input" placeholder="e.g. Sequoia, Accel"
                                                    value={roundForm.investor_names} onChange={e => setRoundForm(f => ({ ...f, investor_names: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Our Value Today (&#8377;)</label>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    min="0"
                                                    placeholder={previewValueToday != null ? `Auto: ${formatPortfolioCurrencyExact(previewValueToday)}` : 'Override our value today'}
                                                    value={roundForm.our_value_today_override}
                                                    onChange={e => setRoundForm(f => ({ ...f, our_value_today_override: e.target.value }))}
                                                />
                                                {previewValueToday != null && !roundForm.our_value_today_override && (
                                                    <AutoFillChip
                                                        display={formatPortfolioCurrencyExact(previewValueToday)}
                                                        formula={previewValueByShares != null ? 'Shares × share price' : 'Equity % × post-money'}
                                                        onUse={() => setRoundForm(f => ({ ...f, our_value_today_override: String(Math.round(previewValueToday)) }))}
                                                    />
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {!roundForm.did_we_invest && (
                                        <>
                                            {/* Total Money Raised + Outstanding Shares */}
                                            <div className="form-group">
                                                <label className="form-label">Total Money Raised in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="Total round size"
                                                    value={roundForm.total_raised}
                                                    onChange={e => setRoundForm(f => ({ ...f, total_raised: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Outstanding Shares in round {roundNumber}</label>
                                                <input className="form-input" type="number" min="0" placeholder="Company's total outstanding shares"
                                                    value={roundForm.total_shares} onChange={e => setRoundForm(f => ({ ...f, total_shares: e.target.value }))} />
                                            </div>

                                            {/* Share Price + Pre-Money */}
                                            <div className="form-group">
                                                <label className="form-label">Share Price in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="e.g. 1500"
                                                    value={roundForm.share_price} onChange={e => setRoundForm(f => ({ ...f, share_price: e.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Pre-money Valuation in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0" placeholder="Pre-money"
                                                    value={roundForm.pre_money_valuation} onChange={e => setRoundForm(f => ({ ...f, pre_money_valuation: e.target.value }))} />
                                            </div>

                                            {/* Post-money (AUTO) + Dilution (AUTO) */}
                                            <div className="form-group">
                                                <label className="form-label">Post-money Valuation in round {roundNumber} (&#8377;)</label>
                                                <input className="form-input" type="number" min="0"
                                                    placeholder={fmtMoneyPh(autoPost) || 'Post-money'}
                                                    value={roundForm.post_money_valuation}
                                                    onChange={e => setRoundForm(f => ({ ...f, post_money_valuation: e.target.value }))} />
                                                {autoPost != null && autoPost > 0 && !roundForm.post_money_valuation && (
                                                    <AutoFillChip
                                                        display={formatPortfolioCurrencyExact(autoPost)}
                                                        formula="Pre-money + total raised"
                                                        onUse={() => setRoundForm(f => ({ ...f, post_money_valuation: String(autoPost) }))}
                                                    />
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Dilution in round {roundNumber} (%)</label>
                                                <input className="form-input" type="number" min="0" step="0.01"
                                                    placeholder={fmtPctPh(autoDilution) || 'e.g. 15.0'}
                                                    value={roundForm.dilution_percent}
                                                    onChange={e => setRoundForm(f => ({ ...f, dilution_percent: e.target.value }))} />
                                                {autoDilution != null && !roundForm.dilution_percent && (
                                                    <AutoFillChip
                                                        display={`${autoDilution.toFixed(2)}%`}
                                                        formula="Previous ownership × (total raised ÷ post-money)"
                                                        onUse={() => setRoundForm(f => ({ ...f, dilution_percent: autoDilution.toFixed(2) }))}
                                                    />
                                                )}
                                            </div>

                                            {/* Total ownership after round (AUTO) + Other investors */}
                                            <div className="form-group">
                                                <label className="form-label">Total ownership after round {roundNumber} (%)</label>
                                                <input className="form-input" type="number" min="0" step="0.01"
                                                    placeholder={fmtPctPh(autoOwnAfter) || 'e.g. 8.5'}
                                                    value={roundForm.ownership_after}
                                                    onChange={e => setRoundForm(f => ({ ...f, ownership_after: e.target.value }))} />
                                                {autoOwnAfter != null && !roundForm.ownership_after && (
                                                    <AutoFillChip
                                                        display={`${autoOwnAfter.toFixed(2)}%`}
                                                        formula="Previous ownership − dilution"
                                                        onUse={() => setRoundForm(f => ({ ...f, ownership_after: autoOwnAfter.toFixed(2) }))}
                                                    />
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Other investors</label>
                                                <input className="form-input" placeholder="e.g. Sequoia, Accel"
                                                    value={roundForm.investor_names} onChange={e => setRoundForm(f => ({ ...f, investor_names: e.target.value }))} />
                                            </div>

                                            {/* Our Value Today */}
                                            <div className="form-group">
                                                <label className="form-label">Our Value Today (&#8377;)</label>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    min="0"
                                                    placeholder={previewValueToday != null ? `Auto: ${formatPortfolioCurrencyExact(previewValueToday)}` : 'Override our value today'}
                                                    value={roundForm.our_value_today_override}
                                                    onChange={e => setRoundForm(f => ({ ...f, our_value_today_override: e.target.value }))}
                                                />
                                                {previewValueToday != null && !roundForm.our_value_today_override && (
                                                    <AutoFillChip
                                                        display={formatPortfolioCurrencyExact(previewValueToday)}
                                                        formula={previewValueByShares != null ? 'Shares × share price' : 'Equity % × post-money'}
                                                        onUse={() => setRoundForm(f => ({ ...f, our_value_today_override: String(Math.round(previewValueToday)) }))}
                                                    />
                                                )}
                                            </div>
                                            <div className="form-group" />
                                        </>
                                    )}
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                        {editingRoundId ? 'Editing existing round' : 'New round'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-ghost btn-sm" onClick={handleCancelRound}>Cancel</button>
                                        <button className="btn btn-primary btn-sm" onClick={handleSaveRound} disabled={savingRound}>
                                            {savingRound ? <><Loader2 size={14} className="spin" /> Saving...</> : (editingRoundId ? 'Update Round' : 'Save Round')}
                                        </button>
                                    </div>
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
                                {sortedFollowOns.map((fo, idx) => {
                                    const n = idx + 1;
                                    const post = fo.postMoneyValuation ?? fo.roundValuation ?? null;
                                    const valueOverride = fo.ourValueTodayOverride;
                                    const valueByShares = fo.numShares != null && fo.sharePrice != null ? fo.numShares * fo.sharePrice : null;
                                    const valueByEquity = fo.ownershipAfter != null && post != null ? (fo.ownershipAfter / 100) * post : null;
                                    const valueToday = valueOverride ?? valueByShares ?? valueByEquity;
                                    const valueSource = valueOverride != null ? 'override'
                                        : valueByShares != null ? 'shares \u00d7 price'
                                        : valueByEquity != null ? 'equity% \u00d7 post'
                                        : null;

                                    return (
                                    <div key={fo.id} style={{
                                        padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10,
                                        border: '1px solid var(--border)', fontSize: 13,
                                    }}>
                                        {/* Header \u2014 round label, date, actions */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <span className="badge badge-info" style={{ fontSize: 11 }}>Round {n} &middot; {fo.roundName}</span>
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                                                    {new Date(fo.roundDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                                    background: fo.didWeInvest ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.18)',
                                                    color: fo.didWeInvest ? '#10b981' : 'var(--text-secondary)',
                                                    textTransform: 'uppercase', letterSpacing: 0.4,
                                                }}>
                                                    {fo.didWeInvest ? 'We invested' : 'We passed (diluted)'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => handleStartEditRound(fo)} title="Edit round">
                                                    <Pencil size={13} />
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => requestDeleteRound(fo.id)} title="Delete round">
                                                    <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Yes-only rows: Our investment + Shares bought + Total DV shares + Equity sought */}
                                        {fo.didWeInvest && (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
                                                    <FollowOnStat
                                                        label={`Our investment in round ${n}`}
                                                        value={fo.ourInvestment != null ? formatPortfolioCurrency(fo.ourInvestment) : '--'}
                                                        accent={fo.ourInvestment != null ? '#10b981' : undefined}
                                                    />
                                                    <FollowOnStat
                                                        label={`No. of Shares bought in round ${n}`}
                                                        value={fo.numShares != null ? fo.numShares.toLocaleString('en-IN') : '--'}
                                                    />
                                                    <FollowOnStat
                                                        label="Total shares owned by DV"
                                                        value={fo.dvTotalShares != null ? fo.dvTotalShares.toLocaleString('en-IN') : '--'}
                                                    />
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
                                                    <FollowOnStat
                                                        label={`Equity sought in round ${n}`}
                                                        value={fo.ownershipSought != null ? `${fo.ownershipSought}%` : '--'}
                                                    />
                                                    <div />
                                                    <div />
                                                </div>
                                            </>
                                        )}

                                        {/* Round-size row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
                                            <FollowOnStat
                                                label={`Total Money Raised in round ${n}`}
                                                value={fo.totalRaised ? formatPortfolioCurrency(fo.totalRaised) : '--'}
                                            />
                                            <FollowOnStat
                                                label={`Outstanding Shares in round ${n}`}
                                                value={fo.totalShares != null ? fo.totalShares.toLocaleString('en-IN') : '--'}
                                            />
                                            <FollowOnStat
                                                label={`Share Price in round ${n}`}
                                                value={fo.sharePrice != null ? `\u20b9${fo.sharePrice.toLocaleString('en-IN')}` : '--'}
                                            />
                                        </div>

                                        {/* Valuation row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
                                            <FollowOnStat
                                                label={`Pre-money Valuation in round ${n}`}
                                                value={fo.preMoneyValuation ? formatPortfolioCurrency(fo.preMoneyValuation) : '--'}
                                            />
                                            <FollowOnStat
                                                label={`Post-money Valuation in round ${n}`}
                                                value={post ? formatPortfolioCurrency(post) : '--'}
                                            />
                                            <FollowOnStat
                                                label={`Total ownership after round ${n}`}
                                                value={fo.ownershipAfter != null ? `${fo.ownershipAfter}%` : '--'}
                                            />
                                        </div>

                                        {/* Dilution */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
                                            <FollowOnStat
                                                label={`Dilution in round ${n}`}
                                                value={fo.dilutionPercent != null ? `${fo.dilutionPercent}%` : '--'}
                                            />
                                            {fo.didWeInvest && (
                                                <>
                                                    <FollowOnStat
                                                        label="Investment type"
                                                        value={fo.investmentType || '--'}
                                                    />
                                                    <FollowOnStat
                                                        label="Entity"
                                                        value={fo.investmentVehicle === 'Syndicate' && fo.syndicateName
                                                            ? `Syndicate — ${fo.syndicateName}`
                                                            : fo.investmentVehicle || '--'}
                                                    />
                                                    <FollowOnStat
                                                        label="Instrument"
                                                        value={fo.investmentInstrument || '--'}
                                                    />
                                                </>
                                            )}
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <FollowOnStat
                                                    label="Other investors"
                                                    value={fo.investorNames || '--'}
                                                />
                                            </div>
                                        </div>

                                        {/* Our Value Today footer */}
                                        <div style={{
                                            paddingTop: 10,
                                            borderTop: '1px dashed var(--border)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}>
                                            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                                                Our Value Today
                                                {valueSource && (
                                                    <span style={{ marginLeft: 6, fontSize: 10 }}>({valueSource})</span>
                                                )}
                                            </span>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: valueToday != null ? '#10b981' : 'var(--text-tertiary)' }}>
                                                {valueToday != null ? formatPortfolioCurrency(valueToday) : '--'}
                                            </span>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
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
              </div>

              {showNotesPanel && (
                <div className={`pd-col pd-col-notes${notesFullscreen ? ' pd-col-notes-full' : ''}`}>
                    <CompanyNotesPanel
                        company={c}
                        onClose={() => { setNotesFullscreen(false); setShowNotesPanel(false); }}
                        onCountChange={setNotesCount}
                        fullscreen={notesFullscreen}
                        onToggleFullscreen={() => setNotesFullscreen(f => !f)}
                    />
                </div>
              )}

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

                {/* Delete Follow-on Round Confirm */}
                {confirmDeleteRoundId && (() => {
                    const roundNumber = sortedFollowOns.findIndex(r => r.id === confirmDeleteRoundId) + 1;
                    if (roundNumber === 0) return null;
                    return (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit',
                        }}>
                            <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, textAlign: 'center', maxWidth: 360 }}>
                                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                    Are you sure you want to delete follow round {roundNumber}?
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>This cannot be undone.</div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                    <button className="btn btn-ghost" onClick={cancelDeleteRound}>Cancel</button>
                                    <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={confirmDeleteRound}>Delete</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────

// Inline editor for the founders array: name + email per row, with an
// Add Founder button, and a remove button on every row past the first.
// Writes the full array via onChange whenever the user commits an edit.
// Clickable chip used under every auto-calculated input. Click → fills the
// input with the raw numeric value. The formula description sits in the
// title attribute so power-users can hover to see where the number came from.
function AutoFillChip({ display, formula, onUse }: { display: string; formula?: string; onUse: () => void }) {
    return (
        <button
            type="button"
            onClick={onUse}
            title={formula}
            style={{
                marginTop: 4,
                padding: '3px 8px',
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid #6366f1',
                background: 'rgba(99, 102, 241, 0.08)',
                color: '#6366f1',
                cursor: 'pointer',
                fontWeight: 500,
            }}
        >
            Auto: {display}
        </button>
    );
}

function FoundersEditor({ company, onChange }: { company: Company; onChange: (next: Founder[]) => Promise<void> | void }) {
    const seed = (): Founder[] => {
        if (company.founders && company.founders.length > 0) return company.founders;
        if (company.founderName || company.founderEmail) {
            return [{ name: company.founderName, email: company.founderEmail }];
        }
        return [{ name: '', email: '' }];
    };
    const [rows, setRows] = useState<Founder[]>(seed);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState('');

    // Re-sync when a different company is opened.
    useEffect(() => {
        setRows(seed());
        setEditingKey(null);
        setDraft('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company.id]);

    const startEdit = (key: string, current: string) => {
        setEditingKey(key);
        setDraft(current);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setDraft('');
    };

    const commit = async (idx: number, field: 'name' | 'email' | 'phone', value: string) => {
        const next = rows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
        setRows(next);
        setEditingKey(null);
        setDraft('');
        await onChange(next);
    };

    const addFounder = () => {
        const next = [...rows, { name: '', email: '', phone: '' }];
        setRows(next);
        // Drop straight into editing the new name field so the user can type immediately.
        setEditingKey(`${next.length - 1}-name`);
        setDraft('');
    };

    const removeFounder = async (idx: number) => {
        const next = rows.filter((_, i) => i !== idx);
        const final = next.length > 0 ? next : [{ name: '', email: '' }];
        setRows(final);
        await onChange(next);
    };

    return (
        <>
            {rows.map((f, idx) => {
                const nameKey = `${idx}-name`;
                const emailKey = `${idx}-email`;
                const phoneKey = `${idx}-phone`;
                const isEditingName = editingKey === nameKey;
                const isEditingEmail = editingKey === emailKey;
                const isEditingPhone = editingKey === phoneKey;
                const founderLabel = rows.length > 1 ? `Founder ${idx + 1}` : 'Founder';
                return (
                    <React.Fragment key={idx}>
                        <FounderFieldRow
                            label={founderLabel}
                            value={f.name}
                            isEditing={isEditingName}
                            draft={draft}
                            onStart={() => startEdit(nameKey, f.name)}
                            onChange={setDraft}
                            onSave={() => commit(idx, 'name', draft)}
                            onCancel={cancelEdit}
                            onRemove={rows.length > 1 ? () => removeFounder(idx) : undefined}
                            placeholder="Founder name"
                        />
                        <FounderFieldRow
                            label="Email"
                            value={f.email}
                            isEditing={isEditingEmail}
                            draft={draft}
                            onStart={() => startEdit(emailKey, f.email)}
                            onChange={setDraft}
                            onSave={() => commit(idx, 'email', draft)}
                            onCancel={cancelEdit}
                            placeholder="founder@company.com"
                            inputType="email"
                        />
                        <FounderFieldRow
                            label="Phone"
                            value={f.phone || ''}
                            isEditing={isEditingPhone}
                            draft={draft}
                            onStart={() => startEdit(phoneKey, f.phone || '')}
                            onChange={setDraft}
                            onSave={() => commit(idx, 'phone', draft)}
                            onCancel={cancelEdit}
                            placeholder="+91 9XXXXXXXXX"
                            inputType="tel"
                        />
                    </React.Fragment>
                );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 0' }}>
                <button
                    type="button"
                    onClick={addFounder}
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                >
                    <Plus size={12} /> Add Founder
                </button>
            </div>
        </>
    );
}

function FounderFieldRow({
    label, value, isEditing, draft,
    onStart, onChange, onSave, onCancel, onRemove,
    placeholder, inputType,
}: {
    label: string;
    value: string;
    isEditing: boolean;
    draft: string;
    onStart: () => void;
    onChange: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
    onRemove?: () => void;
    placeholder?: string;
    inputType?: string;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 8, minWidth: 0, flexWrap: 'wrap', rowGap: 4 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
            {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 120, justifyContent: 'flex-end' }}>
                    <input
                        className="form-input"
                        type={inputType || 'text'}
                        value={draft}
                        onChange={e => onChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                        autoFocus
                        placeholder={placeholder}
                        style={{ fontSize: 12, padding: '3px 6px', height: 28, flex: 1, minWidth: 80, maxWidth: 200 }}
                    />
                    <button onClick={onSave} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Check size={14} style={{ color: 'var(--success)' }} />
                    </button>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{value || '--'}</span>
                    <button
                        onClick={onStart}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                    >
                        <Pencil size={12} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                    {onRemove && (
                        <button
                            onClick={onRemove}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                            title="Remove founder"
                        >
                            <Trash2 size={12} style={{ color: '#ef4444' }} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// One labelled stat in the follow-on summary card. Tight vertical stack:
// uppercase-style caption above, value below. Used by the grid above.
function FollowOnStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div>
            <div style={{
                color: 'var(--text-tertiary)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                fontWeight: 600,
                marginBottom: 2,
            }}>{label}</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: accent || 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-light)', minWidth: 0 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
            <span style={{ fontWeight: 500, fontSize: 13, flexShrink: 0, textAlign: 'right' }}>{value}</span>
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
    /** Free-text input that also offers these as <datalist> suggestions. */
    datalistOptions?: string[];
    /** Placeholder for the free-text input; the datalist branch had HQ's hardcoded. */
    placeholder?: string;
    onStart: (field: string, val: string) => void;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

function EditableRow({ label, value, field, rawValue, editField, editValue, type, selectOptions, selectLabels, datalistOptions, placeholder, onStart, onChange, onSave, onCancel }: EditableRowProps) {
    const isEditing = editField === field;
    const datalistId = datalistOptions ? `editable-row-list-${field}` : undefined;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--border-light)', gap: 8, minWidth: 0, flexWrap: 'wrap', rowGap: 4 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
            {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 120, justifyContent: 'flex-end' }}>
                    {selectOptions ? (
                        <select
                            className="form-select"
                            value={editValue}
                            onChange={e => onChange(e.target.value)}
                            autoFocus
                            style={{ fontSize: 12, padding: '3px 6px', height: 28, flex: 1, minWidth: 80, maxWidth: 180 }}
                        >
                            <option value="">-- None --</option>
                            {selectOptions.map(o => (
                                <option key={o} value={o}>{selectLabels ? selectLabels[o] || o : o}</option>
                            ))}
                        </select>
                    ) : datalistOptions ? (
                        <>
                            <input
                                className="form-input"
                                type="text"
                                list={datalistId}
                                value={editValue}
                                onChange={e => onChange(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                                autoFocus
                                placeholder={placeholder}
                                style={{ fontSize: 12, padding: '3px 6px', height: 28, flex: 1, minWidth: 80, maxWidth: 200 }}
                            />
                            <datalist id={datalistId}>
                                {datalistOptions.map(o => <option key={o} value={o} />)}
                            </datalist>
                        </>
                    ) : (
                        <input
                            className="form-input"
                            type={type || 'text'}
                            value={editValue}
                            onChange={e => onChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                            autoFocus
                            style={{ fontSize: 12, padding: '3px 6px', height: 28, flex: 1, minWidth: 80, maxWidth: 160 }}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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
