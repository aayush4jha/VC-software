'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    X, ChevronRight, ChevronDown, Calendar, Mail, ExternalLink, Clock,
    AlertTriangle, MessageSquare, Sparkles, Send, Pencil, Check, Phone,
    XCircle, ArrowRight, Loader2, Link2, Shield, Pause, RotateCcw,
    FileText, BarChart3, FileSearch, Briefcase, Download, FileDown, Video,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';
import type { TerminalStatus, CompanyRound, PriorityLevel, DealSourceType, ShareType } from '@/types/database';
import { downloadAsDocx, downloadAsPdf } from '@/lib/report-download';

const rounds: CompanyRound[] = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
const priorities: PriorityLevel[] = ['Low', 'Medium', 'High'];
const dealSourceTypes: DealSourceType[] = ['Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'];
const shareTypes: ShareType[] = ['Primary', 'Secondary'];

export default function CompanyDetail() {
    const {
        selectedCompany, setSelectedCompany,
        setShowRejectionFlow, setShowEmailCompose, setShowCalendarInvite,
        getUserById, getIndustryById, getStageById, getDealSourceNameById,
        pipelineStages, user, users, companies, industries, dealSourceNames,
        updateCompany, moveCompanyStage, assignAnalyst, addComment,
        fetchComments, fetchActivity,
        setTerminalStatus, resolveTerminalStatus,
        generateAISummary, generateDeckAnalysis, generateFilterBrief, generateICMemo,
        approveCompany,
        rejectionRecords, rejectionReasonCategories,
        deckEmailLinks,
        fetchScores, addScore, deleteScore,
        analyzeMeetingRecording, fetchAndAnalyzeMeetingRecording,
        fetchFeedback, addFeedback, updateFeedbackStatus, deleteFeedback,
    } = useAppContext();

    const [activeTab, setActiveTab] = useState('overview');
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [showMoveStageDropdown, setShowMoveStageDropdown] = useState(false);
    const [comments, setComments] = useState<import('@/types/database').Comment[]>([]);
    const [activities, setActivities] = useState<import('@/types/database').ActivityLog[]>([]);
    const [newComment, setNewComment] = useState('');

    // Terminal status state
    const [showTerminalMenu, setShowTerminalMenu] = useState(false);
    const [showResolveModal, setShowResolveModal] = useState(false);
    const [resolveTargetStageId, setResolveTargetStageId] = useState('');
    const [settingTerminal, setSettingTerminal] = useState(false);
    const [reminderDate, setReminderDate] = useState('');

    // Deck email search state
    const [searchingDeckEmail, setSearchingDeckEmail] = useState(false);
    const [deckMessageId, setDeckMessageId] = useState<string | null>(null);

    // Scores state
    const [scores, setScores] = useState<import('@/types/database').CompanyScore[]>([]);
    const [showAddScore, setShowAddScore] = useState(false);
    const [newScoreAnalyst, setNewScoreAnalyst] = useState('');
    const [newScoreValue, setNewScoreValue] = useState('');

    // Feedback state
    const [feedbackList, setFeedbackList] = useState<import('@/types/database').CompanyFeedback[]>([]);
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [fbRatings, setFbRatings] = useState<Record<string, number>>({ Market: 3, Team: 3, Product: 3, Traction: 3, Risk: 3 });
    const [fbComment, setFbComment] = useState('');
    const [fbTags, setFbTags] = useState<string[]>([]);

    // AI loading states
    const [generatingSummary, setGeneratingSummary] = useState(false);
    const [analyzingDeck, setAnalyzingDeck] = useState(false);
    const [generatingBrief, setGeneratingBrief] = useState(false);
    const [generatingMemo, setGeneratingMemo] = useState(false);
    const [analyzingRecording, setAnalyzingRecording] = useState(false);

    // Refs (must be before any conditional returns)
    const deckFileRef = useRef<HTMLInputElement>(null);
    const recordingFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (selectedCompany) {
            fetchComments(selectedCompany.id).then(setComments);
            fetchActivity(selectedCompany.id).then(setActivities);
            fetchScores(selectedCompany.id).then(setScores);
            fetchFeedback(selectedCompany.id).then(setFeedbackList);
        }
    }, [selectedCompany, fetchComments, fetchActivity, fetchScores]);

    // Auto-search for deck email when company opens
    useEffect(() => {
        if (!selectedCompany) return;
        // If already have messageId from context cache, use it
        const existing = deckEmailLinks[selectedCompany.id];
        if (existing) {
            setDeckMessageId(existing);
            return;
        }
        // Search for it
        let cancelled = false;
        setDeckMessageId(null);
        setSearchingDeckEmail(true);
        fetch('/api/gmail/find-deck-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyId: selectedCompany.id,
                companyName: selectedCompany.companyName,
                founderName: selectedCompany.founderName,
                founderEmail: selectedCompany.founderEmail,
            }),
        })
            .then(r => r.json())
            .then(data => {
                if (!cancelled && data.found && data.messageId) {
                    setDeckMessageId(data.messageId);
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setSearchingDeckEmail(false); });
        return () => { cancelled = true; };
    }, [selectedCompany?.id]);

    if (!selectedCompany) return null;

    const c = selectedCompany;
    const analyst = c.analystId ? getUserById(c.analystId) : null;
    const industry = getIndustryById(c.industryId);
    const stage = getStageById(c.pipelineStageId);
    const source = getDealSourceNameById(c.dealSourceNameId);
    const days = getDaysInPipeline(c.createdAt);
    const linkedCompany = c.linkedPreviousEntryId ? companies.find(co => co.id === c.linkedPreviousEntryId) : null;

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'ai', label: 'AI Analysis' },
        { id: 'feedback', label: `Feedback (${feedbackList.length})` },
        { id: 'calls', label: 'Calls' },
        { id: 'activity', label: 'Activity' },
        ...(c.terminalStatus === 'Rejected' ? [{ id: 'rejection', label: 'Rejection Reasons' }] : []),
    ];

    const startEdit = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValue(currentValue);
    };

    const saveEdit = async () => {
        if (!editingField || !selectedCompany) return;

        // Handle analyst assignment separately
        if (editingField === 'analystId') {
            await assignAnalyst(selectedCompany.id, editValue || null);
            setEditingField(null);
            setEditValue('');
            return;
        }

        const fieldMap: Record<string, string> = {
            founderName: 'founder_name', founderEmail: 'founder_email',
            companyRound: 'company_round', subIndustry: 'sub_industry',
            dealSourceType: 'deal_source_type', shareType: 'share_type',
            googleDriveLink: 'google_drive_link',
            totalFundRaise: 'total_fund_raise', valuation: 'valuation',
            industryId: 'industry_id', dealSourceNameId: 'deal_source_name_id',
            priorityLevel: 'priority_level',
        };
        const dbField = fieldMap[editingField];
        if (dbField) {
            const val = ['total_fund_raise', 'valuation'].includes(dbField) ? parseFloat(editValue) || null : editValue;
            await updateCompany(selectedCompany.id, { [dbField]: val });
        }
        setEditingField(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setEditingField(null);
        setEditValue('');
    };

    const nextStage = pipelineStages.find(s => s.order === (stage?.order || 0) + 1);
    const availableStages = pipelineStages.filter(s => s.order !== (stage?.order || 0));

    const handleMoveStage = async (targetStageId: string) => {
        setShowMoveStageDropdown(false);
        const error = await moveCompanyStage(c.id, targetStageId);
        if (error) { alert(error); return; }
        // After successful stage move, prompt for feedback
        setActiveTab('feedback');
        setShowFeedbackForm(true);
    };

    // Terminal status handlers
    const handleSetTerminal = async (status: TerminalStatus) => {
        setSettingTerminal(true);
        setShowTerminalMenu(false);
        await setTerminalStatus(c.id, status, reminderDate || undefined);
        setReminderDate('');
        setSettingTerminal(false);
    };

    const handleResolveTerminal = async () => {
        if (!resolveTargetStageId) return;
        await resolveTerminalStatus(c.id, resolveTargetStageId);
        setShowResolveModal(false);
        setResolveTargetStageId('');
    };

    // AI handlers
    const handleGenerateSummary = async () => {
        setGeneratingSummary(true);
        await generateAISummary(c.id);
        setGeneratingSummary(false);
    };

    const handleAnalyzeDeck = async (file?: File) => {
        setAnalyzingDeck(true);
        setActiveTab('ai');
        try {
            let uploadedFile = null;
            if (file) {
                const buffer = await file.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                uploadedFile = { data: base64, mimeType: file.type || 'application/pdf', filename: file.name };
            }
            await generateDeckAnalysis(c.id, uploadedFile);
        } catch (err) {
            alert('Analysis failed: ' + (err as Error).message);
        }
        setAnalyzingDeck(false);
        if (deckFileRef.current) deckFileRef.current.value = '';
    };

    const handleGenerateBrief = async () => {
        setGeneratingBrief(true);
        await generateFilterBrief(c.id);
        setGeneratingBrief(false);
    };

    const handleGenerateMemo = async () => {
        setGeneratingMemo(true);
        await generateICMemo(c.id);
        setGeneratingMemo(false);
    };

    const EditableField = ({ fieldKey, value, style }: { fieldKey: string; value: string; style?: React.CSSProperties }) => {
        if (editingField === fieldKey) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        className="form-input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus
                        style={{ fontSize: 14, padding: '4px 8px', height: 30 }}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={saveEdit} style={{ padding: 4, minWidth: 'auto' }}>
                        <Check size={14} style={{ color: 'var(--success)' }} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit} style={{ padding: 4, minWidth: 'auto' }}>
                        <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                </div>
            );
        }
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={style}>{value}</div>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(fieldKey, value)}
                    style={{ padding: 4, minWidth: 'auto', opacity: 0.4, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                    title={`Edit ${fieldKey}`}
                >
                    <Pencil size={12} />
                </button>
            </div>
        );
    };

    const DropdownField = ({ fieldKey, value, displayValue, options, placeholder }: {
        fieldKey: string;
        value: string;
        displayValue: string;
        options: { value: string; label: string }[];
        placeholder?: string;
    }) => {
        if (editingField === fieldKey) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                        className="form-select"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        autoFocus
                        style={{ fontSize: 14, padding: '4px 8px', height: 30 }}
                    >
                        {placeholder && <option value="">{placeholder}</option>}
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={saveEdit} style={{ padding: 4, minWidth: 'auto' }}>
                        <Check size={14} style={{ color: 'var(--success)' }} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit} style={{ padding: 4, minWidth: 'auto' }}>
                        <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                </div>
            );
        }
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{displayValue || '—'}</div>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(fieldKey, value)}
                    style={{ padding: 4, minWidth: 'auto', opacity: 0.4, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                    title={`Edit ${fieldKey}`}
                >
                    <Pencil size={12} />
                </button>
            </div>
        );
    };

    const terminalStatusColor: Record<string, string> = {
        'Portfolio': '#10b981',
        'Rejected': '#ef4444',
        'Awaiting Response': '#f59e0b',
        'Blocker': '#ef4444',
        'Next Round Analysis': '#6366f1',
    };

    return (
        <>
            <div className="detail-overlay" onClick={() => setSelectedCompany(null)} />
            <div className="detail-panel">
                <div className="detail-panel-header">
                    <div>
                        <div className="detail-panel-title">{c.companyName}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                            <span className="table-stage-badge" style={{
                                background: `${stage?.color}15`, color: stage?.color,
                            }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage?.color, display: 'inline-block' }} />
                                {stage?.name}
                            </span>
                            <span className={`priority-dot ${c.priorityLevel.toLowerCase()}`} />
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.priorityLevel} Priority</span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>•</span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{days} days in pipeline</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCompany(null)}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Terminal Status Banner */}
                {c.terminalStatus && (
                    <div style={{
                        padding: '10px 24px',
                        background: `${terminalStatusColor[c.terminalStatus]}10`,
                        borderBottom: `2px solid ${terminalStatusColor[c.terminalStatus]}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                                background: `${terminalStatusColor[c.terminalStatus]}20`,
                                color: terminalStatusColor[c.terminalStatus],
                            }}>
                                {c.terminalStatus}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {c.terminalStatus === 'Awaiting Response' && 'Waiting for founder response'}
                                {c.terminalStatus === 'Blocker' && 'Blocked — needs resolution'}
                                {c.terminalStatus === 'Next Round Analysis' && 'Tracking for next round'}
                                {c.terminalStatus === 'Portfolio' && 'Invested — portfolio company'}
                                {c.terminalStatus === 'Rejected' && 'Deal rejected'}
                            </span>
                        </div>
                        {c.terminalStatus !== 'Rejected' && c.terminalStatus !== 'Portfolio' && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setResolveTargetStageId(c.pipelineStageId); setShowResolveModal(true); }}
                                style={{ fontSize: 12 }}
                            >
                                <RotateCcw size={12} /> Resolve
                            </button>
                        )}
                    </div>
                )}

                {/* Needs Review Banner (email-ingested drafts) */}
                {c.needsReview && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 24px',
                        background: 'rgba(139,92,246,0.08)',
                        borderBottom: '2px solid rgba(139,92,246,0.2)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8b5cf6' }}>
                            <Mail size={14} />
                            <span>This company was auto-created from an inbound email and needs review.</span>
                        </div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => approveCompany(c.id)}
                            style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontSize: 12 }}
                        >
                            <Check size={14} /> Approve
                        </button>
                    </div>
                )}

                {/* Stage advancement */}
                {!c.terminalStatus && (
                    <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>MOVE TO:</span>
                        {nextStage && (
                            <button
                                key={nextStage.id}
                                className="btn btn-success btn-sm"
                                onClick={() => handleMoveStage(nextStage.id)}
                            >
                                <ChevronRight size={14} /> {nextStage.name}
                            </button>
                        )}
                        <div style={{ position: 'relative', marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowTerminalMenu(!showTerminalMenu)}
                                disabled={settingTerminal}
                                style={{ fontSize: 12 }}
                            >
                                {settingTerminal ? <Loader2 size={12} className="spin" /> : <Pause size={12} />}
                                Status
                                <ChevronDown size={10} />
                            </button>
                            {showTerminalMenu && (
                                <div style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: 6,
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                    minWidth: 260, padding: '6px 0', zIndex: 10,
                                }}>
                                    {/* Current status — what this deal is actually in right now */}
                                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                            Current Status
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage?.color, display: 'inline-block' }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                Active &middot; {stage?.name || 'In pipeline'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                            {days} days in pipeline
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Change To
                                    </div>
                                    {[
                                        { status: 'Awaiting Response' as TerminalStatus, icon: <Clock size={14} />, color: '#f59e0b', desc: 'Waiting for founder reply' },
                                        { status: 'Blocker' as TerminalStatus, icon: <Shield size={14} />, color: '#ef4444', desc: 'Blocked by external factor' },
                                        { status: 'Next Round Analysis' as TerminalStatus, icon: <BarChart3 size={14} />, color: '#6366f1', desc: 'Track for future round' },
                                        { status: 'Portfolio' as TerminalStatus, icon: <Briefcase size={14} />, color: '#10b981', desc: 'Mark as invested' },
                                    ].map(item => (
                                        <button
                                            key={item.status}
                                            onClick={() => handleSetTerminal(item.status)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                padding: '9px 14px', background: 'none', border: 'none',
                                                cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                        >
                                            <span style={{ color: item.color }}>{item.icon}</span>
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{item.status}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                    {/* Reminder date for Awaiting/Blocker */}
                                    <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Reminder Date (optional)</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={reminderDate}
                                            onChange={e => setReminderDate(e.target.value)}
                                            style={{ fontSize: 12, padding: '4px 8px', height: 28 }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="detail-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`detail-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="detail-panel-body">
                    {activeTab === 'overview' && (
                        <div>
                            {/* Quick Summary — only show if not raw email pitch */}
                            {c.quickSummary && !c.quickSummary.startsWith('[Email Pitch]') && (
                                <div className="ai-card" style={{ marginBottom: 20 }}>
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">AI Quick Summary</span>
                                    </div>
                                    <div className="ai-card-body">{c.quickSummary}</div>
                                </div>
                            )}

                            {/* Linked Previous Entry */}
                            {linkedCompany && (
                                <div style={{
                                    padding: '10px 14px', marginBottom: 16,
                                    background: 'var(--primary-bg)', border: '1px solid var(--primary)',
                                    borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <Link2 size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        Linked to previous entry:
                                    </span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setSelectedCompany(linkedCompany)}
                                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', padding: '2px 6px' }}
                                    >
                                        {linkedCompany.companyName} <ExternalLink size={12} />
                                    </button>
                                </div>
                            )}

                            {/* Core Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Founder Name</label>
                                    <EditableField fieldKey="founderName" value={c.founderName} style={{ fontSize: 14, fontWeight: 500 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Founder Email</label>
                                    <EditableField fieldKey="founderEmail" value={c.founderEmail} style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary)' }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Analyst</label>
                                    <DropdownField
                                        fieldKey="analystId"
                                        value={c.analystId || ''}
                                        displayValue={analyst?.name || 'Unassigned'}
                                        placeholder="Unassigned"
                                        options={users.map(u => ({ value: u.id, label: u.name }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Company Round</label>
                                    <DropdownField
                                        fieldKey="companyRound"
                                        value={c.companyRound}
                                        displayValue={c.companyRound}
                                        options={rounds.map(r => ({ value: r, label: r }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Priority Level</label>
                                    <DropdownField
                                        fieldKey="priorityLevel"
                                        value={c.priorityLevel}
                                        displayValue={c.priorityLevel}
                                        options={priorities.map(p => ({ value: p, label: p }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Industry</label>
                                    <DropdownField
                                        fieldKey="industryId"
                                        value={c.industryId}
                                        displayValue={industry?.name || '—'}
                                        options={industries.map(i => ({ value: i.id, label: i.name }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Sub-Industry</label>
                                    <EditableField fieldKey="subIndustry" value={c.subIndustry} style={{ fontSize: 14 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deal Source Type</label>
                                    <DropdownField
                                        fieldKey="dealSourceType"
                                        value={c.dealSourceType}
                                        displayValue={c.dealSourceType}
                                        options={dealSourceTypes.map(d => ({ value: d, label: d }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deal Source Name</label>
                                    <DropdownField
                                        fieldKey="dealSourceNameId"
                                        value={c.dealSourceNameId}
                                        displayValue={source?.name || '—'}
                                        options={dealSourceNames.map(d => ({ value: d.id, label: d.name }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Total Fund Raise</label>
                                    <EditableField fieldKey="totalFundRaise" value={c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '—'} style={{ fontSize: 18, fontWeight: 700 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Valuation</label>
                                    <EditableField fieldKey="valuation" value={c.valuation ? formatCurrency(c.valuation) : '—'} style={{ fontSize: 18, fontWeight: 700 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Share Type</label>
                                    <DropdownField
                                        fieldKey="shareType"
                                        value={c.shareType}
                                        displayValue={c.shareType}
                                        options={shareTypes.map(s => ({ value: s, label: s }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Google Drive</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {c.googleDriveLink ? (
                                            <a href={c.googleDriveLink} target="_blank" rel="noopener" style={{ fontSize: 14, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                Open Data Room <ExternalLink size={12} />
                                            </a>
                                        ) : (
                                            <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Not linked</span>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => startEdit('googleDriveLink', c.googleDriveLink || '')}
                                            style={{ padding: 4, minWidth: 'auto', opacity: 0.4, transition: 'opacity 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                                            title="Edit Google Drive Link"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                    {editingField === 'googleDriveLink' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                            <input
                                                className="form-input"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                                autoFocus
                                                placeholder="https://drive.google.com/..."
                                                style={{ fontSize: 14, padding: '4px 8px', height: 30 }}
                                            />
                                            <button className="btn btn-ghost btn-sm" onClick={saveEdit} style={{ padding: 4, minWidth: 'auto' }}>
                                                <Check size={14} style={{ color: 'var(--success)' }} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={cancelEdit} style={{ padding: 4, minWidth: 'auto' }}>
                                                <X size={14} style={{ color: 'var(--text-tertiary)' }} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Mail Received (Deck)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {deckMessageId ? (
                                            <a
                                                href={`/emails?messageId=${deckMessageId}`}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    fontSize: 13, fontWeight: 500, color: '#fff',
                                                    background: '#8b5cf6', padding: '6px 14px',
                                                    borderRadius: 6, textDecoration: 'none',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#7c3aed')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '#8b5cf6')}
                                            >
                                                <Mail size={14} /> Open Mail
                                            </a>
                                        ) : searchingDeckEmail ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)' }}>
                                                <Loader2 size={14} className="spin" /> Searching Gmail...
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                                                Mail not found yet
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="form-group" style={{ marginTop: 16 }}>
                                <label className="form-label">Tags</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {c.customTags.map(tag => (
                                        <span key={tag} className="badge badge-neutral">{tag}</span>
                                    ))}
                                    {c.customTags.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No tags</span>}
                                </div>
                            </div>

                            {/* Stage Deadlines */}
                            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                                    Stage Deadlines
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {pipelineStages.map(s => {
                                        const dl = c.stageDeadlines?.[s.id];
                                        const isCurrent = c.pipelineStageId === s.id;
                                        let countdown = '';
                                        let countdownColor = '';
                                        if (dl) {
                                            const now = new Date();
                                            now.setHours(0, 0, 0, 0);
                                            const deadline = new Date(dl);
                                            deadline.setHours(0, 0, 0, 0);
                                            const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                            if (diff < 0) { countdown = `Overdue by ${Math.abs(diff)}d`; countdownColor = '#ef4444'; }
                                            else if (diff === 0) { countdown = 'Last day'; countdownColor = '#ef4444'; }
                                            else if (diff === 1) { countdown = '1 day left'; countdownColor = '#f59e0b'; }
                                            else if (diff <= 3) { countdown = `${diff} days left`; countdownColor = '#f59e0b'; }
                                            else { countdown = `${diff} days left`; countdownColor = '#10b981'; }
                                        }
                                        return (
                                            <div key={s.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 10px', borderRadius: 6,
                                                background: isCurrent ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                border: isCurrent ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                                            }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: 12, fontWeight: isCurrent ? 600 : 400, flex: 1, color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                    {s.name}
                                                </span>
                                                {countdown && (
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: countdownColor, whiteSpace: 'nowrap' }}>
                                                        {countdown}
                                                    </span>
                                                )}
                                                <input
                                                    type="date"
                                                    value={dl ? dl.split('T')[0] : ''}
                                                    onChange={async (e) => {
                                                        const newDeadlines = { ...(c.stageDeadlines || {}), [s.id]: e.target.value || undefined };
                                                        if (!e.target.value) delete newDeadlines[s.id];
                                                        await updateCompany(c.id, { stageDeadlines: newDeadlines });
                                                    }}
                                                    style={{ fontSize: 11, padding: '2px 6px', height: 26, width: 120, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Comments */}
                            <div style={{ marginTop: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <MessageSquare size={16} /> Comments ({comments.length})
                                </h3>
                                {comments.map(cm => {
                                    const author = getUserById(cm.authorId);
                                    return (
                                        <div key={cm.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <div className="kanban-card-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
                                                    {author?.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{author?.name}</span>
                                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                    {new Date(cm.createdAt).toLocaleDateString('en-IN')}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: 30 }}>{cm.text}</p>
                                        </div>
                                    );
                                })}
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                    <input
                                        className="form-input"
                                        placeholder="Add a comment..."
                                        style={{ flex: 1 }}
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newComment.trim()) {
                                                addComment(c.id, newComment.trim()).then(cm => { if (cm) setComments(prev => [...prev, cm]); });
                                                setNewComment('');
                                            }
                                        }}
                                    />
                                    <button className="btn btn-primary btn-sm" onClick={() => {
                                        if (newComment.trim()) {
                                            addComment(c.id, newComment.trim()).then(cm => { if (cm) setComments(prev => [...prev, cm]); });
                                            setNewComment('');
                                        }
                                    }}>
                                        <Send size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div>
                            {/* Analyze Button + Upload — always visible */}
                            {!analyzingDeck && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={() => handleAnalyzeDeck()} disabled={analyzingDeck} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <FileSearch size={14} /> {c.deckAnalysis ? 'Re-analyze' : 'Analyze Deck / Summary'}
                                        </button>
                                        <input
                                            ref={deckFileRef}
                                            type="file"
                                            accept=".pdf,.pptx,.ppt"
                                            style={{ display: 'none' }}
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) handleAnalyzeDeck(file);
                                            }}
                                        />
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => deckFileRef.current?.click()}
                                            disabled={analyzingDeck}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                                        >
                                            <FileText size={14} /> Upload Deck
                                        </button>
                                    </div>
                                    {!c.deckAnalysis && (
                                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                                            Analyze from the pitch email, or manually upload a PDF/PPTX deck for AI analysis.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Loading state */}
                            {analyzingDeck && (
                                <div className="ai-card" style={{ marginBottom: 16, textAlign: 'center', padding: 40 }}>
                                    <Loader2 size={24} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>Generating Investment Analysis Report...</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>This may take 10-15 seconds</div>
                                </div>
                            )}

                            {/* Full Analysis Report */}
                            {c.deckAnalysis && (
                                <div>
                                    {/* Download Button */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                            onClick={() => {
                                                const d = c.deckAnalysis!;
                                                const sections = [
                                                    `INVESTMENT ANALYSIS REPORT — ${c.companyName}`,
                                                    `Generated: ${new Date().toLocaleDateString()}`,
                                                    `\n${'='.repeat(60)}`,
                                                    `\nVERDICT: ${d.verdict || 'N/A'}`,
                                                    d.confidenceScore ? `Confidence: ${d.confidenceScore}%` : '',
                                                    `\n${'='.repeat(60)}`,
                                                    `\nEXECUTIVE SUMMARY\n${d.summary || 'N/A'}`,
                                                    `\nPROBLEM\n${d.problem || 'N/A'}`,
                                                    `\nSOLUTION\n${d.solution || 'N/A'}`,
                                                    `\nMARKET\n${d.market || 'N/A'}`,
                                                    `\nBUSINESS MODEL\n${d.businessModel || 'N/A'}`,
                                                    `\nTRACTION\n${d.traction || 'N/A'}`,
                                                    `\nTEAM\n${d.team || 'N/A'}`,
                                                    d.competitiveLandscape ? `\nCOMPETITIVE LANDSCAPE\n${d.competitiveLandscape}` : '',
                                                    d.financialProjection ? `\nFINANCIAL PROJECTION\n${d.financialProjection}` : '',
                                                    d.investmentThesis ? `\nINVESTMENT THESIS\n${d.investmentThesis}` : '',
                                                    d.strengths?.length ? `\nSTRENGTHS\n${d.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
                                                    d.risks?.length ? `\nRISKS\n${d.risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '',
                                                    d.redFlags?.length ? `\nRED FLAGS\n${d.redFlags.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '',
                                                    d.dueDiligenceQuestions?.length ? `\nDUE DILIGENCE QUESTIONS\n${d.dueDiligenceQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
                                                ].filter(Boolean).join('\n');
                                                const blob = new Blob([sections], { type: 'text/plain' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `${c.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Analysis_Report.txt`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                        >
                                            <Download size={14} /> Download Report
                                        </button>
                                    </div>
                                    {/* Verdict Banner */}
                                    {c.deckAnalysis.verdict && (
                                        <div style={{
                                            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                                            background: c.deckAnalysis.verdict?.includes('INVEST') ? 'rgba(16,185,129,0.1)' : c.deckAnalysis.verdict?.includes('PASS') ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                            border: `1px solid ${c.deckAnalysis.verdict?.includes('INVEST') ? 'rgba(16,185,129,0.3)' : c.deckAnalysis.verdict?.includes('PASS') ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 14, color: c.deckAnalysis.verdict?.includes('INVEST') ? '#10b981' : c.deckAnalysis.verdict?.includes('PASS') ? '#ef4444' : '#f59e0b' }}>
                                                    Verdict: {c.deckAnalysis.verdict}
                                                </div>
                                            </div>
                                            {(c.deckAnalysis.confidenceScore ?? 0) > 0 && (
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    Confidence: <strong>{c.deckAnalysis.confidenceScore}%</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Scores Section */}
                                    <div style={{
                                        padding: 16, borderRadius: 10, marginBottom: 16,
                                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>Scores</div>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => setShowAddScore(!showAddScore)}
                                                style={{ fontSize: 12 }}
                                            >
                                                {showAddScore ? 'Cancel' : '+ Add Score'}
                                            </button>
                                        </div>

                                        {/* Add Score Form */}
                                        {showAddScore && (
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Analyst</label>
                                                    <select
                                                        className="form-input"
                                                        value={newScoreAnalyst}
                                                        onChange={e => setNewScoreAnalyst(e.target.value)}
                                                        style={{ fontSize: 13, padding: '6px 8px', height: 34 }}
                                                    >
                                                        <option value="">Select analyst...</option>
                                                        {users.map(u => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div style={{ width: 100 }}>
                                                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Score (%)</label>
                                                    <input
                                                        className="form-input"
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={newScoreValue}
                                                        onChange={e => setNewScoreValue(e.target.value)}
                                                        placeholder="0-100"
                                                        style={{ fontSize: 13, padding: '6px 8px', height: 34 }}
                                                    />
                                                </div>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    style={{ height: 34, fontSize: 12 }}
                                                    disabled={!newScoreAnalyst || !newScoreValue}
                                                    onClick={async () => {
                                                        const val = parseInt(newScoreValue);
                                                        if (isNaN(val) || val < 0 || val > 100) return;
                                                        const result = await addScore(c.id, 'analyst', val, newScoreAnalyst);
                                                        if (result) {
                                                            setScores(prev => [result, ...prev]);
                                                            setNewScoreAnalyst('');
                                                            setNewScoreValue('');
                                                            setShowAddScore(false);
                                                        }
                                                    }}
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        )}

                                        {/* Score List */}
                                        {scores.length === 0 && !showAddScore && (
                                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 12 }}>
                                                No scores yet. Analyze the deck to get an AI score, or add analyst scores manually.
                                            </div>
                                        )}
                                        {scores.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {scores.map(s => {
                                                    const scorer = s.scorerType === 'ai' ? null : getUserById(s.scorerId || '');
                                                    const color = s.score >= 70 ? '#10b981' : s.score >= 40 ? '#f59e0b' : '#ef4444';
                                                    return (
                                                        <div key={s.id} style={{
                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                            padding: '8px 12px', background: 'var(--bg-secondary)',
                                                            borderRadius: 8, border: '1px solid var(--border)',
                                                        }}>
                                                            <div style={{
                                                                width: 32, height: 32, borderRadius: '50%',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: 11, fontWeight: 700, color: '#fff',
                                                                background: s.scorerType === 'ai' ? '#8b5cf6' : 'var(--primary)',
                                                                flexShrink: 0,
                                                            }}>
                                                                {s.scorerType === 'ai' ? 'AI' : scorer?.name.split(' ').map(n => n[0]).join('') || '?'}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: 13, fontWeight: 600 }}>
                                                                    {s.scorerType === 'ai' ? 'AI Confidence Score' : scorer?.name || 'Unknown Analyst'}
                                                                </div>
                                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                                    {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </div>
                                                            </div>
                                                            {/* Score bar */}
                                                            <div style={{ width: 80, marginRight: 8 }}>
                                                                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                                                    <div style={{ width: `${s.score}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
                                                                </div>
                                                            </div>
                                                            <div style={{ fontSize: 16, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>
                                                                {s.score}%
                                                            </div>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={async () => {
                                                                    await deleteScore(s.id);
                                                                    setScores(prev => prev.filter(sc => sc.id !== s.id));
                                                                }}
                                                                style={{ padding: 4, minWidth: 'auto', opacity: 0.4 }}
                                                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                                                                title="Delete score"
                                                            >
                                                                <X size={14} style={{ color: '#ef4444' }} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="ai-card" style={{ marginBottom: 16 }}>
                                        <div className="ai-card-header">
                                            <div className="ai-card-icon"><Sparkles size={14} /></div>
                                            <span className="ai-card-title">Investment Analysis Report</span>
                                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => downloadAsPdf({ companyName: c.companyName, analysis: c.deckAnalysis! })}
                                                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                                                    title="Download as PDF"
                                                >
                                                    <FileDown size={12} /> PDF
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => downloadAsDocx({ companyName: c.companyName, analysis: c.deckAnalysis! })}
                                                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                                                    title="Download as DOCX"
                                                >
                                                    <FileDown size={12} /> DOCX
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => handleAnalyzeDeck()} disabled={analyzingDeck} style={{ fontSize: 11 }}>
                                                    Re-analyze
                                                </button>
                                            </div>
                                        </div>
                                        <div className="ai-card-body">
                                            <div className="ai-section">
                                                <div className="ai-section-title">Executive Summary</div>
                                                {Array.isArray(c.deckAnalysis.summary) ? <ul className="ai-list">{c.deckAnalysis.summary.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.summary}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Problem Analysis</div>
                                                {Array.isArray(c.deckAnalysis.problem) ? <ul className="ai-list">{c.deckAnalysis.problem.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.problem}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Solution & Product</div>
                                                {Array.isArray(c.deckAnalysis.solution) ? <ul className="ai-list">{c.deckAnalysis.solution.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.solution}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Market Opportunity (TAM/SAM/SOM)</div>
                                                {Array.isArray(c.deckAnalysis.market) ? <ul className="ai-list">{c.deckAnalysis.market.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.market}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Business Model & Unit Economics</div>
                                                {Array.isArray(c.deckAnalysis.businessModel) ? <ul className="ai-list">{c.deckAnalysis.businessModel.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.businessModel}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Traction & Metrics</div>
                                                {Array.isArray(c.deckAnalysis.traction) ? <ul className="ai-list">{c.deckAnalysis.traction.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.traction}</p>}
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Team Assessment</div>
                                                {Array.isArray(c.deckAnalysis.team) ? <ul className="ai-list">{c.deckAnalysis.team.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.team}</p>}
                                            </div>
                                            {c.deckAnalysis.competitiveLandscape && (Array.isArray(c.deckAnalysis.competitiveLandscape) ? c.deckAnalysis.competitiveLandscape.length > 0 : true) && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Competitive Landscape</div>
                                                    {Array.isArray(c.deckAnalysis.competitiveLandscape) ? <ul className="ai-list">{c.deckAnalysis.competitiveLandscape.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.competitiveLandscape}</p>}
                                                </div>
                                            )}
                                            {c.deckAnalysis.financialProjection && (Array.isArray(c.deckAnalysis.financialProjection) ? c.deckAnalysis.financialProjection.length > 0 : true) && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Financial Projections</div>
                                                    {Array.isArray(c.deckAnalysis.financialProjection) ? <ul className="ai-list">{c.deckAnalysis.financialProjection.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.financialProjection}</p>}
                                                </div>
                                            )}
                                            {c.deckAnalysis.investmentThesis && (Array.isArray(c.deckAnalysis.investmentThesis) ? c.deckAnalysis.investmentThesis.length > 0 : true) && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Investment Thesis</div>
                                                    {Array.isArray(c.deckAnalysis.investmentThesis) ? <ul className="ai-list">{c.deckAnalysis.investmentThesis.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <p>{c.deckAnalysis.investmentThesis}</p>}
                                                </div>
                                            )}
                                            <div className="ai-section">
                                                <div className="ai-section-title" style={{ color: '#10b981' }}>Strengths</div>
                                                <ul className="ai-list">
                                                    {(c.deckAnalysis.strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                                                </ul>
                                            </div>
                                            {(c.deckAnalysis.risks || []).length > 0 && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title" style={{ color: '#f59e0b' }}>Risks</div>
                                                    <ul className="ai-list">
                                                        {(c.deckAnalysis.risks ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            <div className="ai-section">
                                                <div className="ai-section-title" style={{ color: '#ef4444' }}>Red Flags</div>
                                                <ul className="ai-list red-flags">
                                                    {(c.deckAnalysis.redFlags || []).map((f: string, i: number) => <li key={i}>{f}</li>)}
                                                </ul>
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Due Diligence Questions</div>
                                                <ul className="ai-list">
                                                    {(c.deckAnalysis.dueDiligenceQuestions || c.deckAnalysis.suggestedQuestions || []).map((q: string, i: number) => <li key={i}>{q}</li>)}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Empty state */}
                            {!c.deckAnalysis && !analyzingDeck && (
                                <div className="empty-state" style={{ marginTop: 20 }}>
                                    <div className="empty-state-icon"><FileSearch size={24} /></div>
                                    <div className="empty-state-title">No Analysis Yet</div>
                                    <div className="empty-state-text">Click &quot;Analyze Deck / Summary&quot; above to generate a detailed AI-powered investment report</div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'feedback' && (
                        <div>
                            {/* Add Feedback Button */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <div style={{ fontSize: 15, fontWeight: 700 }}>Feedback &amp; Evaluations</div>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowFeedbackForm(!showFeedbackForm)}>
                                    {showFeedbackForm ? 'Cancel' : '+ Add Feedback'}
                                </button>
                            </div>

                            {/* Add Feedback Form */}
                            {showFeedbackForm && (
                                <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Rate this company</div>

                                    {/* Rating sliders */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 16 }}>
                                        {(['Market', 'Team', 'Product', 'Traction', 'Risk'] as const).map(cat => (
                                            <div key={cat}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 500 }}>{cat}</span>
                                                    <span style={{ fontWeight: 700, color: fbRatings[cat] >= 4 ? '#10b981' : fbRatings[cat] >= 3 ? '#f59e0b' : '#ef4444' }}>{fbRatings[cat]}/5</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {[1, 2, 3, 4, 5].map(v => (
                                                        <button
                                                            key={v}
                                                            onClick={() => setFbRatings(prev => ({ ...prev, [cat]: v }))}
                                                            style={{
                                                                flex: 1, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer',
                                                                background: v <= fbRatings[cat] ? (fbRatings[cat] >= 4 ? '#10b981' : fbRatings[cat] >= 3 ? '#f59e0b' : '#ef4444') : 'var(--border)',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Tags */}
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Tags</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {(['Strong Team', 'Weak Team', 'Large Market', 'Niche Market', 'High Risk', 'Low Risk', 'Follow-up Required', 'Strong Traction', 'No Traction', 'Competitive Moat', 'Crowded Space', 'Scalable', 'Needs Data']).map(tag => (
                                                <button
                                                    key={tag}
                                                    onClick={() => setFbTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                                    style={{
                                                        fontSize: 11, padding: '3px 8px', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer',
                                                        background: fbTags.includes(tag) ? 'var(--primary)' : 'var(--bg-secondary)',
                                                        color: fbTags.includes(tag) ? '#fff' : 'var(--text-secondary)',
                                                        fontWeight: fbTags.includes(tag) ? 600 : 400,
                                                    }}
                                                >
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Comment */}
                                    <textarea
                                        className="form-input"
                                        rows={3}
                                        value={fbComment}
                                        onChange={e => setFbComment(e.target.value)}
                                        placeholder="Your insights, concerns, or observations..."
                                        style={{ fontSize: 13, resize: 'vertical', marginBottom: 12 }}
                                    />

                                    <button
                                        className="btn btn-primary btn-sm"
                                        disabled={!fbComment.trim()}
                                        onClick={async () => {
                                            const result = await addFeedback({
                                                companyId: c.id, stageId: c.pipelineStageId,
                                                ratings: fbRatings, comment: fbComment, tags: fbTags,
                                            });
                                            if (result) {
                                                setFeedbackList(prev => [result, ...prev]);
                                                setFbComment('');
                                                setFbTags([]);
                                                setFbRatings({ Market: 3, Team: 3, Product: 3, Traction: 3, Risk: 3 });
                                                setShowFeedbackForm(false);
                                            }
                                        }}
                                    >
                                        Submit Feedback
                                    </button>
                                </div>
                            )}

                            {/* Analytics Summary */}
                            {feedbackList.length > 0 && (
                                <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                                        Average Ratings ({feedbackList.length} review{feedbackList.length > 1 ? 's' : ''})
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                                        {(['Market', 'Team', 'Product', 'Traction', 'Risk'] as const).map(cat => {
                                            const values = feedbackList.map(f => f.ratings[cat]).filter(v => typeof v === 'number');
                                            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                                            const color = avg >= 4 ? '#10b981' : avg >= 3 ? '#f59e0b' : '#ef4444';
                                            return (
                                                <div key={cat} style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{avg.toFixed(1)}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{cat}</div>
                                                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 6, overflow: 'hidden' }}>
                                                        <div style={{ width: `${(avg / 5) * 100}%`, height: '100%', borderRadius: 2, background: color }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Recommendation Score */}
                                    {(() => {
                                        const allAvgs = (['Market', 'Team', 'Product', 'Traction'] as const).map(cat => {
                                            const values = feedbackList.map(f => f.ratings[cat]).filter(v => typeof v === 'number');
                                            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                                        });
                                        const riskAvg = feedbackList.map(f => f.ratings['Risk']).filter(v => typeof v === 'number');
                                        const riskScore = riskAvg.length > 0 ? riskAvg.reduce((a, b) => a + b, 0) / riskAvg.length : 3;
                                        const positiveAvg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
                                        const recScore = Math.round(((positiveAvg * 0.7 + (6 - riskScore) * 0.3) / 5) * 100);
                                        const recColor = recScore >= 70 ? '#10b981' : recScore >= 50 ? '#f59e0b' : '#ef4444';
                                        const recLabel = recScore >= 70 ? 'INVEST' : recScore >= 50 ? 'FURTHER REVIEW' : 'PASS';
                                        return (
                                            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: `${recColor}10`, border: `1px solid ${recColor}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: recColor }}>{recLabel}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Recommendation based on team feedback</div>
                                                </div>
                                                <div style={{ fontSize: 20, fontWeight: 700, color: recColor }}>{recScore}%</div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Feedback History */}
                            {feedbackList.length === 0 && !showFeedbackForm && (
                                <div className="empty-state">
                                    <div className="empty-state-icon"><MessageSquare size={24} /></div>
                                    <div className="empty-state-title">No Feedback Yet</div>
                                    <div className="empty-state-text">Add your evaluation to start tracking opinions across the team.</div>
                                </div>
                            )}

                            {feedbackList.map(fb => {
                                const author = getUserById(fb.userId);
                                const stage = getStageById(fb.stageId);
                                return (
                                    <div key={fb.id} style={{
                                        padding: 14, marginBottom: 10, borderRadius: 10,
                                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                        opacity: fb.status === 'resolved' ? 0.6 : 1,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                                    {author?.name.split(' ').map(n => n[0]).join('') || '?'}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{author?.name || 'Unknown'}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                        {stage && <><span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, display: 'inline-block', marginRight: 4 }} />{stage.name} • </>}
                                                        {new Date(fb.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {fb.status === 'active' && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => { updateFeedbackStatus(fb.id, 'addressed'); setFeedbackList(prev => prev.map(f => f.id === fb.id ? { ...f, status: 'addressed' } : f)); }} style={{ fontSize: 10, padding: '2px 6px' }}>
                                                        Mark Addressed
                                                    </button>
                                                )}
                                                {fb.status === 'addressed' && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => { updateFeedbackStatus(fb.id, 'resolved'); setFeedbackList(prev => prev.map(f => f.id === fb.id ? { ...f, status: 'resolved' } : f)); }} style={{ fontSize: 10, padding: '2px 6px', color: '#10b981' }}>
                                                        Resolve
                                                    </button>
                                                )}
                                                <button className="btn btn-ghost btn-sm" onClick={() => { deleteFeedback(fb.id); setFeedbackList(prev => prev.filter(f => f.id !== fb.id)); }} style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>

                                        {/* Mini ratings bar */}
                                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                            {(['Market', 'Team', 'Product', 'Traction', 'Risk'] as const).map(cat => {
                                                const v = fb.ratings[cat] ?? 0;
                                                const color = v >= 4 ? '#10b981' : v >= 3 ? '#f59e0b' : '#ef4444';
                                                return (
                                                    <div key={cat} style={{ fontSize: 11 }}>
                                                        <span style={{ color: 'var(--text-tertiary)' }}>{cat.slice(0, 3)}: </span>
                                                        <span style={{ fontWeight: 700, color }}>{v}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Comment */}
                                        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{fb.comment}</div>

                                        {/* Tags */}
                                        {fb.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                                {fb.tags.map(tag => (
                                                    <span key={tag} className="badge badge-neutral" style={{ fontSize: 10 }}>{tag}</span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Status badge */}
                                        {fb.status !== 'active' && (
                                            <div style={{ marginTop: 6 }}>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                                                    background: fb.status === 'addressed' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                                                    color: fb.status === 'addressed' ? '#f59e0b' : '#10b981',
                                                }}>
                                                    {fb.status === 'addressed' ? 'Addressed' : 'Resolved'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'calls' && (
                        <div>
                            {/* Fetch & Analyze Recording */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            setAnalyzingRecording(true);
                                            try {
                                                await fetchAndAnalyzeMeetingRecording(c.id);
                                            } catch (err) {
                                                alert((err as Error).message);
                                            }
                                            setAnalyzingRecording(false);
                                        }}
                                        disabled={analyzingRecording}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        {analyzingRecording ? <><Loader2 size={14} className="spin" /> Analyzing...</> : <><Video size={14} /> Fetch &amp; Analyze Recording</>}
                                    </button>
                                    <input
                                        ref={recordingFileRef}
                                        type="file"
                                        accept="video/*,audio/*"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setAnalyzingRecording(true);
                                            try {
                                                const buffer = await file.arrayBuffer();
                                                const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                                                await analyzeMeetingRecording(c.id, { data: base64, mimeType: file.type, filename: file.name });
                                            } catch (err) {
                                                alert('Analysis failed: ' + (err as Error).message);
                                            }
                                            setAnalyzingRecording(false);
                                            if (recordingFileRef.current) recordingFileRef.current.value = '';
                                        }}
                                    />
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => recordingFileRef.current?.click()}
                                        disabled={analyzingRecording}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                                    >
                                        <FileText size={14} /> Upload Manually
                                    </button>
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                                    Auto-fetches the meeting recording from Google Drive, transcribes it, analyzes facial expressions &amp; body language, and extracts key insights.
                                </p>
                            </div>

                            {/* Loading state */}
                            {analyzingRecording && (
                                <div className="ai-card" style={{ marginBottom: 16, textAlign: 'center', padding: 40 }}>
                                    <Loader2 size={24} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>Fetching &amp; Analyzing Meeting Recording...</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Searching Google Drive, downloading recording, transcribing, and analyzing. This may take 30-60 seconds.</div>
                                </div>
                            )}

                            {c.callTranscript ? (
                                <div>
                                    <div className="card" style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 700 }}>Meeting Recording Analysis</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                    {c.callTranscript.date} • {c.callTranscript.duration} • {c.callTranscript.platform}
                                                </div>
                                            </div>
                                            {c.callTranscript.recordingUrl && (
                                                <a href={c.callTranscript.recordingUrl} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                                                    Play Recording
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Sentiment Summary */}
                                    {c.callTranscript.sentimentSummary && (
                                        <div style={{
                                            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                                            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Overall Sentiment
                                            </div>
                                            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                                                {c.callTranscript.sentimentSummary}
                                            </div>
                                        </div>
                                    )}

                                    {/* Facial / Behavioral Analysis */}
                                    {c.callTranscript.facialAnalysis && (
                                        <div className="ai-card" style={{ marginBottom: 16 }}>
                                            <div className="ai-card-header">
                                                <div className="ai-card-icon"><Sparkles size={14} /></div>
                                                <span className="ai-card-title">Expression & Behavior Analysis</span>
                                            </div>
                                            <div className="ai-card-body">
                                                <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                                    {c.callTranscript.facialAnalysis}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Participant Behavior */}
                                    {c.callTranscript.participantBehavior && c.callTranscript.participantBehavior.length > 0 && (
                                        <div className="ai-card" style={{ marginBottom: 16 }}>
                                            <div className="ai-card-header">
                                                <div className="ai-card-icon"><Sparkles size={14} /></div>
                                                <span className="ai-card-title">Participant Assessment</span>
                                            </div>
                                            <div className="ai-card-body">
                                                {c.callTranscript.participantBehavior.map((p, i) => (
                                                    <div key={i} style={{ padding: '8px 0', borderBottom: i < c.callTranscript!.participantBehavior!.length - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 13, lineHeight: 1.6 }}>
                                                        {p}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Key Points & Action Items */}
                                    <div className="ai-card" style={{ marginBottom: 16 }}>
                                        <div className="ai-card-header">
                                            <div className="ai-card-icon"><Sparkles size={14} /></div>
                                            <span className="ai-card-title">Key Insights</span>
                                        </div>
                                        <div className="ai-card-body">
                                            {c.callTranscript.keyPoints.length > 0 && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Key Points</div>
                                                    <ul className="ai-list">{c.callTranscript.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                                </div>
                                            )}
                                            {c.callTranscript.actionItems.length > 0 && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Action Items</div>
                                                    <ul className="ai-list">{c.callTranscript.actionItems.map((a, i) => <li key={i}>{a}</li>)}</ul>
                                                </div>
                                            )}
                                            {c.callTranscript.concerns.length > 0 && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Concerns</div>
                                                    <ul className="ai-list">{c.callTranscript.concerns.map((cc, i) => <li key={i}>{cc}</li>)}</ul>
                                                </div>
                                            )}
                                            {c.callTranscript.redFlags.length > 0 && (
                                                <div className="ai-section">
                                                    <div className="ai-section-title">Red Flags</div>
                                                    <ul className="ai-list red-flags">{c.callTranscript.redFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Full Transcript */}
                                    {c.callTranscript.transcript && (
                                        <div className="ai-card">
                                            <div className="ai-card-header">
                                                <div className="ai-card-icon"><FileText size={14} /></div>
                                                <span className="ai-card-title">Full Transcript</span>
                                            </div>
                                            <div className="ai-card-body">
                                                <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', maxHeight: 500, overflowY: 'auto' }}>
                                                    {c.callTranscript.transcript}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : !analyzingRecording && (
                                <div className="empty-state">
                                    <div className="empty-state-icon"><Calendar size={24} /></div>
                                    <div className="empty-state-title">No Call Records</div>
                                    <div className="empty-state-text">Upload a meeting recording above to get AI-powered transcription, facial expression analysis, and key insights.</div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div>
                            <div className="timeline">
                                {activities.map(act => {
                                    const actUser = getUserById(act.userId);
                                    return (
                                        <div key={act.id} className="timeline-item">
                                            <div className="timeline-item-header">
                                                <span className="timeline-item-user">{actUser?.name}</span>
                                                <span className="timeline-item-time">
                                                    {new Date(act.createdAt).toLocaleDateString('en-IN')}
                                                </span>
                                            </div>
                                            <div className="timeline-item-content">{act.details}</div>
                                        </div>
                                    );
                                })}
                                {activities.length === 0 && (
                                    <div className="empty-state">
                                        <div className="empty-state-title">No activity yet</div>
                                        <div className="empty-state-text">Stage changes and actions will be logged here</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'rejection' && c.terminalStatus === 'Rejected' && (() => {
                        const record = rejectionRecords.find(r => r.companyId === c.id);
                        const rejectedAtStage = record ? getStageById(record.rejectionStageId) : null;

                        // Group reasons by category
                        const reasonsByCategory: { categoryName: string; subReasons: string[] }[] = [];
                        if (record?.reasons) {
                            for (const r of record.reasons) {
                                const cat = rejectionReasonCategories.find(rc => rc.id === r.categoryId);
                                if (cat) {
                                    const subNames = r.subReasonIds
                                        .map(sid => cat.subReasons.find(sr => sr.id === sid)?.name)
                                        .filter(Boolean) as string[];
                                    if (subNames.length > 0) {
                                        reasonsByCategory.push({ categoryName: cat.name, subReasons: subNames });
                                    }
                                }
                            }
                        }

                        return (
                            <div>
                                {/* Rejection metadata */}
                                <div style={{
                                    display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap',
                                }}>
                                    {rejectedAtStage && (
                                        <div style={{
                                            padding: '8px 14px', background: 'rgba(239,68,68,0.06)',
                                            border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8,
                                            fontSize: 12,
                                        }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Rejected at: </span>
                                            <span style={{ fontWeight: 600, color: '#ef4444' }}>{rejectedAtStage.name}</span>
                                        </div>
                                    )}
                                    {record && (
                                        <div style={{
                                            padding: '8px 14px', background: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border)', borderRadius: 8,
                                            fontSize: 12,
                                        }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Communication: </span>
                                            <span style={{ fontWeight: 600 }}>{record.communicationMethod}</span>
                                        </div>
                                    )}
                                    {record && (
                                        <div style={{
                                            padding: '8px 14px', background: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border)', borderRadius: 8,
                                            fontSize: 12,
                                        }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Date: </span>
                                            <span style={{ fontWeight: 600 }}>{new Date(record.createdAt).toLocaleDateString('en-IN')}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Reasons by category */}
                                {reasonsByCategory.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {reasonsByCategory.map((group, i) => (
                                            <div key={i} style={{
                                                padding: '14px 16px',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 10,
                                            }}>
                                                <div style={{
                                                    fontWeight: 700, fontSize: 13, marginBottom: 10,
                                                    color: 'var(--text-primary)',
                                                    paddingBottom: 8,
                                                    borderBottom: '2px solid var(--primary)',
                                                }}>
                                                    {group.categoryName}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {group.subReasons.map((reason, j) => (
                                                        <div key={j} style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '6px 10px',
                                                            background: 'rgba(239,68,68,0.06)',
                                                            borderRadius: 6,
                                                            fontSize: 13,
                                                            color: 'var(--text-secondary)',
                                                        }}>
                                                            <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                                                            {reason}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <div className="empty-state-title">No rejection reasons recorded</div>
                                        <div className="empty-state-text">Rejection reasons were not captured for this company</div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>

                {/* Sticky Action Bar */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                }}>
                    {/* Analyze Deck */}
                    <button
                        className="btn btn-sm"
                        onClick={() => handleAnalyzeDeck()}
                        disabled={analyzingDeck}
                        style={{
                            background: 'var(--primary)', color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 6,
                            opacity: analyzingDeck ? 0.7 : 1,
                        }}
                    >
                        {analyzingDeck ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                        {analyzingDeck ? 'Analyzing...' : 'Analyze Deck'}
                    </button>

                    {/* Schedule Call */}
                    <button
                        className="btn btn-sm"
                        onClick={() => setShowCalendarInvite(true)}
                        style={{
                            background: '#06b6d4', color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <Phone size={14} /> Schedule Call
                    </button>

                    {/* Send Email */}
                    <button
                        className="btn btn-sm"
                        onClick={() => setShowEmailCompose(true)}
                        style={{
                            background: '#10b981', color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <Mail size={14} /> Send Email
                    </button>

                    {/* Reject */}
                    <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setShowRejectionFlow(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <XCircle size={14} /> Reject
                    </button>

                    {/* Move Stage Dropdown */}
                    <div style={{ position: 'relative', marginLeft: 'auto' }}>
                        <button
                            className="btn btn-sm"
                            onClick={() => setShowMoveStageDropdown(!showMoveStageDropdown)}
                            style={{
                                background: nextStage?.color || 'var(--primary)', color: '#fff',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <ArrowRight size={14} /> Move Stage <ChevronDown size={12} />
                        </button>
                        {showMoveStageDropdown && (
                            <div style={{
                                position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                minWidth: 220, padding: '6px 0', zIndex: 10,
                            }}>
                                <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Move to stage
                                </div>
                                {availableStages.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => handleMoveStage(s.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                            padding: '9px 14px', background: 'none', border: 'none',
                                            cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                    >
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                        <span style={{ flex: 1 }}>{s.name}</span>
                                        {s.order === (stage?.order || 0) + 1 && (
                                            <span style={{ fontSize: 10, color: s.color, fontWeight: 600, background: `${s.color}15`, padding: '2px 6px', borderRadius: 4 }}>Next</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Resolve Terminal Status Modal */}
            {showResolveModal && (
                <div className="modal-overlay" onClick={() => setShowResolveModal(false)} style={{ zIndex: 1000 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <div className="modal-title">Resolve Terminal Status</div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowResolveModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                This will clear the &quot;{c.terminalStatus}&quot; status and return the company to the pipeline. Select which stage to place it in:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {pipelineStages.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => setResolveTargetStageId(s.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            background: resolveTargetStageId === s.id ? `${s.color}15` : 'transparent',
                                            border: resolveTargetStageId === s.id ? `1px solid ${s.color}` : '1px solid transparent',
                                        }}
                                    >
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 13, fontWeight: resolveTargetStageId === s.id ? 600 : 400 }}>{s.name}</span>
                                        {s.id === c.pipelineStageId && (
                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>current</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowResolveModal(false)}>Cancel</button>
                            <div style={{ flex: 1 }} />
                            <button
                                className="btn btn-primary"
                                disabled={!resolveTargetStageId}
                                onClick={handleResolveTerminal}
                            >
                                <RotateCcw size={14} /> Resolve &amp; Return to Pipeline
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
