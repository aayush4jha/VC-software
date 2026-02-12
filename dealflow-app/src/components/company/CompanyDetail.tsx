'use client';

import React, { useState } from 'react';
import { X, ChevronRight, Calendar, Mail, ExternalLink, Clock, AlertTriangle, MessageSquare, Sparkles, Send } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import {
    getUserById, getIndustryById, getStageById, getDealSourceNameById,
    formatCurrency, getDaysInPipeline, getCommentsByCompany, getActivityByCompany,
    pipelineStages, currentUser
} from '@/lib/mock-data';

export default function CompanyDetail() {
    const {
        selectedCompany, setSelectedCompany,
        setShowRejectionFlow, setShowEmailCompose, setShowCalendarInvite
    } = useAppContext();
    const [activeTab, setActiveTab] = useState('overview');

    if (!selectedCompany) return null;

    const c = selectedCompany;
    const analyst = c.analystId ? getUserById(c.analystId) : null;
    const industry = getIndustryById(c.industryId);
    const stage = getStageById(c.pipelineStageId);
    const source = getDealSourceNameById(c.dealSourceNameId);
    const days = getDaysInPipeline(c.createdAt);
    const comments = getCommentsByCompany(c.id);
    const activities = getActivityByCompany(c.id);

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'ai', label: 'AI Analysis' },
        { id: 'calls', label: 'Calls' },
        { id: 'activity', label: 'Activity' },
    ];

    return (
        <>
            <div className="detail-overlay" onClick={() => setSelectedCompany(null)} />
            <div className="detail-panel">
                <div className="detail-panel-header">
                    <div>
                        <div className="detail-panel-title">{c.companyName}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
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
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCalendarInvite(true)}>
                            <Calendar size={14} /> Schedule
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowEmailCompose(true)}>
                            <Mail size={14} /> Email
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setShowRejectionFlow(true)}>
                            Reject
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCompany(null)}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Stage advancement */}
                <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>MOVE TO:</span>
                    {pipelineStages.filter(s => s.order > (stage?.order || 0)).slice(0, 1).map(s => (
                        <button key={s.id} className="btn btn-success btn-sm">
                            <ChevronRight size={14} /> {s.name}
                        </button>
                    ))}
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}>
                        <Clock size={14} /> Awaiting Response
                    </button>
                </div>

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
                            {/* Quick Summary */}
                            {c.quickSummary && (
                                <div className="ai-card" style={{ marginBottom: 20 }}>
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">AI Quick Summary</span>
                                    </div>
                                    <div className="ai-card-body">{c.quickSummary}</div>
                                </div>
                            )}

                            {/* Core Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Founder Name</label>
                                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.founderName}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Founder Email</label>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary)' }}>{c.founderEmail}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Analyst</label>
                                    <div style={{ fontSize: 14, fontWeight: 500 }}>{analyst?.name || 'Unassigned'}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Company Round</label>
                                    <span className="badge badge-primary">{c.companyRound}</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Industry</label>
                                    <span className="badge badge-primary">{industry?.name}</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Sub-Industry</label>
                                    <div style={{ fontSize: 14 }}>{c.subIndustry}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deal Source Type</label>
                                    <div style={{ fontSize: 14 }}>{c.dealSourceType}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deal Source Name</label>
                                    <div style={{ fontSize: 14 }}>{source?.name}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Total Fund Raise</label>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '—'}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Valuation</label>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{c.valuation ? formatCurrency(c.valuation) : '—'}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Share Type</label>
                                    <div style={{ fontSize: 14 }}>{c.shareType}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Google Drive</label>
                                    {c.googleDriveLink ? (
                                        <a href={c.googleDriveLink} target="_blank" rel="noopener" style={{ fontSize: 14, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            Open Data Room <ExternalLink size={12} />
                                        </a>
                                    ) : (
                                        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Not linked</span>
                                    )}
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="form-group" style={{ marginTop: 16 }}>
                                <label className="form-label">Tags</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {c.customTags.map(tag => (
                                        <span key={tag} className="badge badge-neutral">{tag}</span>
                                    ))}
                                </div>
                            </div>

                            {/* SLA */}
                            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>SLA Deadline</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                                            {c.slaDeadline ? new Date(c.slaDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                                        </div>
                                    </div>
                                    <div className={`sla-indicator ${c.isOverdue ? 'overdue' : days > 20 ? 'at-risk' : 'on-track'}`}>
                                        {c.isOverdue ? <><AlertTriangle size={14} /> Overdue</> : days > 20 ? '⚠ At Risk' : '✓ On Track'}
                                    </div>
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
                                    <input className="form-input" placeholder="Add a comment..." style={{ flex: 1 }} />
                                    <button className="btn btn-primary btn-sm"><Send size={14} /></button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div>
                            {/* Deck Analysis */}
                            {c.deckAnalysis ? (
                                <div className="ai-card">
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">Full Deck Analysis</span>
                                    </div>
                                    <div className="ai-card-body">
                                        <div className="ai-section">
                                            <div className="ai-section-title">Summary</div>
                                            <p>{c.deckAnalysis.summary}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Problem</div>
                                            <p>{c.deckAnalysis.problem}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Solution</div>
                                            <p>{c.deckAnalysis.solution}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Market</div>
                                            <p>{c.deckAnalysis.market}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Business Model</div>
                                            <p>{c.deckAnalysis.businessModel}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Traction</div>
                                            <p>{c.deckAnalysis.traction}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Team</div>
                                            <p>{c.deckAnalysis.team}</p>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Strengths</div>
                                            <ul className="ai-list">
                                                {c.deckAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                            </ul>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Red Flags</div>
                                            <ul className="ai-list red-flags">
                                                {c.deckAnalysis.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                                            </ul>
                                        </div>
                                        <div className="ai-section">
                                            <div className="ai-section-title">Suggested Call Questions</div>
                                            <ul className="ai-list">
                                                {c.deckAnalysis.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <div className="empty-state-icon"><Sparkles size={24} /></div>
                                    <div className="empty-state-title">No AI Analysis Yet</div>
                                    <div className="empty-state-text">AI deck analysis will be generated at the Initial Screening stage</div>
                                    <button className="btn btn-primary" style={{ marginTop: 16 }}>
                                        <Sparkles size={14} /> Generate Analysis
                                    </button>
                                </div>
                            )}

                            {/* KPI Benchmarks */}
                            {c.kpiData && (
                                <div className="ai-card" style={{ marginTop: 16 }}>
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">KPI Benchmarking — {c.kpiData.businessModel}</span>
                                    </div>
                                    <table className="kpi-table">
                                        <thead>
                                            <tr>
                                                <th>KPI</th>
                                                <th>Value</th>
                                                <th>Benchmark</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {c.kpiData.kpis.map((kpi, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 600 }}>{kpi.name}</td>
                                                    <td>{kpi.value}</td>
                                                    <td style={{ color: 'var(--text-tertiary)' }}>{kpi.benchmark}</td>
                                                    <td>
                                                        <span className={`kpi-status ${kpi.status}`}>
                                                            {kpi.status === 'above' ? '↑ Above' : kpi.status === 'below' ? '↓ Below' : '— On Par'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Filter Brief */}
                            {c.filterBrief && (
                                <div className="ai-card" style={{ marginTop: 16 }}>
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">Filter Discussion Brief</span>
                                    </div>
                                    <div className="ai-card-body">{c.filterBrief}</div>
                                </div>
                            )}

                            {/* IC Memo */}
                            {c.icMemo && (
                                <div className="ai-card" style={{ marginTop: 16 }}>
                                    <div className="ai-card-header">
                                        <div className="ai-card-icon"><Sparkles size={14} /></div>
                                        <span className="ai-card-title">IC Memo</span>
                                    </div>
                                    <div className="ai-card-body" style={{ whiteSpace: 'pre-wrap' }}>{c.icMemo}</div>
                                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>Export PDF</button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'calls' && (
                        <div>
                            {c.callTranscript ? (
                                <div>
                                    <div className="card" style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 700 }}>Intro Call Recording</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                    {c.callTranscript.date} • {c.callTranscript.duration} • {c.callTranscript.platform}
                                                </div>
                                            </div>
                                            <button className="btn btn-secondary btn-sm">Play Recording</button>
                                        </div>
                                    </div>

                                    <div className="ai-card">
                                        <div className="ai-card-header">
                                            <div className="ai-card-icon"><Sparkles size={14} /></div>
                                            <span className="ai-card-title">Call Transcript Analysis</span>
                                        </div>
                                        <div className="ai-card-body">
                                            <div className="ai-section">
                                                <div className="ai-section-title">Key Points</div>
                                                <ul className="ai-list">
                                                    {c.callTranscript.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                                                </ul>
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Action Items</div>
                                                <ul className="ai-list">
                                                    {c.callTranscript.actionItems.map((a, i) => <li key={i}>{a}</li>)}
                                                </ul>
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Concerns</div>
                                                <ul className="ai-list">
                                                    {c.callTranscript.concerns.map((cc, i) => <li key={i}>{cc}</li>)}
                                                </ul>
                                            </div>
                                            <div className="ai-section">
                                                <div className="ai-section-title">Red Flags</div>
                                                <ul className="ai-list red-flags">
                                                    {c.callTranscript.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <div className="empty-state-icon"><Calendar size={24} /></div>
                                    <div className="empty-state-title">No Call Records</div>
                                    <div className="empty-state-text">Call recordings and transcripts will appear here after the Intro Call stage</div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div>
                            <div className="timeline">
                                {activities.map(act => {
                                    const user = getUserById(act.userId);
                                    return (
                                        <div key={act.id} className="timeline-item">
                                            <div className="timeline-item-header">
                                                <span className="timeline-item-user">{user?.name}</span>
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
                </div>
            </div>
        </>
    );
}
