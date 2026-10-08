'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Search, UserCircle, ChevronDown, Briefcase } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import LegalTracker from '@/components/legal/LegalTracker';
import { useAppContext } from '@/lib/context';
import {
    LEGAL_STAGES,
    type LegalStageId,
    type LegalRecord,
    getLegalRecord,
    updateLegalRecord,
    subscribeLegalUpdates,
    getMissingMustHaveRights,
} from '@/lib/legal-data';
import type { Company, User, FollowOnRound } from '@/types/database';
import { formatPortfolioCurrency, getTotalInvested } from '@/lib/portfolio-utils';

interface CardData {
    company: Company;
    record: LegalRecord;
    missingCount: number;
    followOns: FollowOnRound[];
}

function daysSince(iso: string): number {
    const d = new Date(iso).getTime();
    return Math.max(0, Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24)));
}

function LegalViewTabs({ view, setView }: {
    view: 'tracker' | 'stages';
    setView: (v: 'tracker' | 'stages') => void;
}) {
    const tabs: { key: 'tracker' | 'stages'; label: string }[] = [
        { key: 'tracker', label: 'Legal Tracker' },
        { key: 'stages', label: 'Closing Stages' },
    ];
    return (
        <div style={{
            display: 'flex', gap: 4, padding: '10px 24px 0',
            borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
        }}>
            {tabs.map(t => (
                <button
                    key={t.key}
                    onClick={() => setView(t.key)}
                    style={{
                        padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                        background: 'none', fontFamily: 'var(--font-sans)',
                        fontWeight: view === t.key ? 600 : 500,
                        color: view === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: `2px solid ${view === t.key ? 'var(--primary)' : 'transparent'}`,
                        marginBottom: -1,
                    }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function LegalContent() {
    const router = useRouter();
    const { companies, users, setSelectedCompany, fetchAllFollowOns, followOnsVersion } = useAppContext();

    // Total invested has to include follow-on cheques, or this board shows a
    // smaller number than the portfolio does for the same company. One request
    // for every round, the way the portfolio list does it — not one per card.
    const [followOnsByCompany, setFollowOnsByCompany] = useState<Record<string, FollowOnRound[]>>({});
    useEffect(() => {
        let cancelled = false;
        fetchAllFollowOns().then(rows => {
            if (cancelled) return;
            const grouped: Record<string, FollowOnRound[]> = {};
            rows.forEach(r => {
                if (!grouped[r.companyId]) grouped[r.companyId] = [];
                grouped[r.companyId].push(r);
            });
            setFollowOnsByCompany(grouped);
        }).catch(() => { if (!cancelled) setFollowOnsByCompany({}); });
        return () => { cancelled = true; };
        // followOnsVersion changes when a round is added, edited or deleted.
    }, [fetchAllFollowOns, followOnsVersion]);

    const [search, setSearch] = useState('');
    const [view, setView] = useState<'tracker' | 'stages'>('tracker');
    const [stageFilter, setStageFilter] = useState<LegalStageId | 'all'>('all');
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [tick, setTick] = useState(0);

    // Keep only portfolio companies (those that reached investment).
    const portfolioCompanies = useMemo(
        () => companies.filter(c => c.terminalStatus === 'Portfolio'),
        [companies],
    );

    // Records are derived from localStorage on each render; `tick` forces refresh.
    const records: Record<string, LegalRecord> = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        tick; // depend on tick so external storage updates refresh the view
        const next: Record<string, LegalRecord> = {};
        portfolioCompanies.forEach(c => {
            next[c.id] = getLegalRecord(c.id);
        });
        return next;
    }, [portfolioCompanies, tick]);

    useEffect(() => {
        const unsub = subscribeLegalUpdates(() => setTick(t => t + 1));
        return unsub;
    }, []);

    const cards: CardData[] = useMemo(() => {
        return portfolioCompanies
            .map(company => {
                const record = records[company.id];
                if (!record) return null;
                const missing = getMissingMustHaveRights(record);
                return { company, record, missingCount: missing.length, followOns: followOnsByCompany[company.id] || [] };
            })
            .filter((c): c is CardData => c !== null);
    }, [portfolioCompanies, records, followOnsByCompany]);

    const filteredCards = useMemo(() => {
        const q = search.trim().toLowerCase();
        return cards.filter(c => {
            if (ownerFilter !== 'all' && c.record.legalOwner !== ownerFilter) return false;
            if (q && !c.company.companyName.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [cards, search, ownerFilter]);

    const cardsByStage = useMemo(() => {
        const byStage: Record<LegalStageId, CardData[]> = {
            term_sheet_reviewed: [], terms_negotiation: [], final_sha_review: [], approved: [], signed: [],
            payment_received: [], share_certificate_done: [],
        };
        filteredCards.forEach(c => {
            byStage[c.record.stageId].push(c);
        });
        return byStage;
    }, [filteredCards]);

    const uniqueOwners = useMemo(() => {
        const set = new Set<string>();
        cards.forEach(c => { if (c.record.legalOwner) set.add(c.record.legalOwner); });
        return Array.from(set).sort();
    }, [cards]);

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.droppableId === result.source.droppableId) return;
        const companyId = result.draggableId;
        const newStage = result.destination.droppableId as LegalStageId;
        updateLegalRecord(companyId, r => ({
            ...r,
            stageId: newStage,
            stageUpdatedAt: new Date().toISOString(),
        }));
    };

    const handleStageDropdown = (companyId: string, newStage: LegalStageId) => {
        updateLegalRecord(companyId, r => ({
            ...r,
            stageId: newStage,
            stageUpdatedAt: new Date().toISOString(),
        }));
    };

    const handleSetOwner = (companyId: string, name: string) => {
        updateLegalRecord(companyId, r => ({ ...r, legalOwner: name }));
    };

    // Stage counts for the header summary.
    const stageCounts = LEGAL_STAGES.reduce<Record<string, number>>((acc, s) => {
        acc[s.id] = cardsByStage[s.id].length;
        return acc;
    }, {});

    // The tracker is the whole portfolio at once — counts, documents, rights
    // and deadlines. The stage board is one company moving through the closing
    // process. Both are wanted, so neither replaces the other.
    if (view === 'tracker') {
        return (
            <>
                <TopHeader title="Legal Management" subtitle="Documents, rights and deadlines" />
                <div className="page-content" style={{ padding: 0 }}>
                    <LegalViewTabs view={view} setView={setView} />
                    <LegalTracker />
                </div>
            </>
        );
    }

    return (
        <>
            <TopHeader title="Legal Management" subtitle={`${filteredCards.length} companies`} />
            <div className="page-content">
                <LegalViewTabs view={view} setView={setView} />
                {/* Toolbar */}
                <div className="toolbar">
                    <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <select
                            className="portfolio-select"
                            value={stageFilter}
                            onChange={e => setStageFilter(e.target.value as LegalStageId | 'all')}
                        >
                            <option value="all">All Stages</option>
                            {LEGAL_STAGES.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>

                        <select
                            className="portfolio-select"
                            value={ownerFilter}
                            onChange={e => setOwnerFilter(e.target.value)}
                        >
                            <option value="all">All Owners</option>
                            {uniqueOwners.map(o => <option key={o} value={o}>{o}</option>)}
                            <option value="">Unassigned</option>
                        </select>

                        {LEGAL_STAGES.map(s => (
                            <span key={s.id} className="legal-stage-chip" title={s.description}>
                                <span className="col-dot" style={{ backgroundColor: s.color }} />
                                {s.name}: <strong>{stageCounts[s.id]}</strong>
                            </span>
                        ))}
                    </div>
                    <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{
                                position: 'absolute', left: 10, top: '50%',
                                transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
                            }} />
                            <input
                                className="search-input"
                                type="text"
                                placeholder="Search companies..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ paddingLeft: 32, width: 200 }}
                            />
                        </div>
                    </div>
                </div>

                {portfolioCompanies.length === 0 ? (
                    <div className="empty-state">
                        <Plus size={32} />
                        <div style={{ fontWeight: 600, marginTop: 12 }}>No portfolio companies yet</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Move a deal to Portfolio to track its legal lifecycle.</div>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <div className="legal-kanban">
                            {LEGAL_STAGES.filter(s => stageFilter === 'all' || s.id === stageFilter).map(stage => {
                                const stageCards = cardsByStage[stage.id] || [];
                                return (
                                    <div key={stage.id} className="legal-kanban-column">
                                        <div className="legal-kanban-column-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="col-dot" style={{ backgroundColor: stage.color }} />
                                                <span>{stage.name}</span>
                                            </div>
                                            <span className="legal-kanban-column-count">{stageCards.length}</span>
                                        </div>
                                        <Droppable droppableId={stage.id}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                    className={`legal-kanban-column-body ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                                                >
                                                    {stageCards.length === 0 && (
                                                        <div className="legal-kanban-empty">Drop here</div>
                                                    )}
                                                    {stageCards.map((card, index) => (
                                                        <Draggable key={card.company.id} draggableId={card.company.id} index={index}>
                                                            {(p, snap) => (
                                                                <div
                                                                    ref={p.innerRef}
                                                                    {...p.draggableProps}
                                                                    {...p.dragHandleProps}
                                                                    className={`legal-card ${snap.isDragging ? 'dragging' : ''} ${card.missingCount > 0 ? 'has-alert' : ''}`}
                                                                >
                                                                    <LegalCardInner
                                                                        card={card}
                                                                        users={users}
                                                                        onStageChange={handleStageDropdown}
                                                                        onOwnerChange={handleSetOwner}
                                                                        onOpenPortfolio={() => {
                                                                            setSelectedCompany(card.company);
                                                                            router.push('/portfolio');
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </div>
                                );
                            })}
                        </div>
                    </DragDropContext>
                )}
            </div>
        </>
    );
}

interface LegalCardInnerProps {
    card: CardData;
    users: User[];
    onStageChange: (companyId: string, stage: LegalStageId) => void;
    onOwnerChange: (companyId: string, name: string) => void;
    onOpenPortfolio: () => void;
}

function LegalCardInner({ card, users, onStageChange, onOwnerChange, onOpenPortfolio }: LegalCardInnerProps) {
    const { company, record, missingCount } = card;
    const [showStageMenu, setShowStageMenu] = useState(false);
    const [showOwnerMenu, setShowOwnerMenu] = useState(false);
    const stage = LEGAL_STAGES.find(s => s.id === record.stageId)!;
    const days = daysSince(record.stageUpdatedAt);
    const investment = getTotalInvested(company, card.followOns);

    return (
        <>
            <div className="legal-card-header">
                <Link href={`/legal/${company.id}`} className="legal-card-name">
                    {company.companyName}
                </Link>
                {missingCount > 0 && (
                    <span className="legal-card-alert" title={`${missingCount} must-have right${missingCount === 1 ? '' : 's'} missing`}>
                        <AlertTriangle size={12} /> {missingCount}
                    </span>
                )}
            </div>

            <div className="legal-card-meta">
                <span className="legal-card-amount">
                    {investment > 0 ? formatPortfolioCurrency(investment) : '—'}
                </span>
                <span className="legal-card-days">· {days}d in stage</span>
            </div>

            <div className="legal-card-actions">
                <div className="legal-card-dropdown">
                    <button className="legal-card-mini-btn" onClick={e => { e.stopPropagation(); setShowStageMenu(v => !v); setShowOwnerMenu(false); }}>
                        <span className="col-dot" style={{ backgroundColor: stage.color }} />
                        Move <ChevronDown size={11} />
                    </button>
                    {showStageMenu && (
                        <>
                            <div className="legal-menu-overlay" onClick={() => setShowStageMenu(false)} />
                            <div className="legal-mini-menu" onClick={e => e.stopPropagation()}>
                                {LEGAL_STAGES.filter(s => s.id !== record.stageId).map(s => (
                                    <button
                                        key={s.id}
                                        className="legal-mini-menu-item"
                                        onClick={() => { onStageChange(company.id, s.id); setShowStageMenu(false); }}
                                    >
                                        <span className="col-dot" style={{ backgroundColor: s.color }} />
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="legal-card-dropdown">
                    <button className="legal-card-mini-btn" onClick={e => { e.stopPropagation(); setShowOwnerMenu(v => !v); setShowStageMenu(false); }}>
                        <UserCircle size={11} />
                        {record.legalOwner || 'Unassigned'} <ChevronDown size={11} />
                    </button>
                    {showOwnerMenu && (
                        <>
                            <div className="legal-menu-overlay" onClick={() => setShowOwnerMenu(false)} />
                            <div className="legal-mini-menu" onClick={e => e.stopPropagation()}>
                                <button className="legal-mini-menu-item" onClick={() => { onOwnerChange(company.id, ''); setShowOwnerMenu(false); }}>
                                    Unassigned
                                </button>
                                {users.map(u => (
                                    <button
                                        key={u.id}
                                        className="legal-mini-menu-item"
                                        onClick={() => { onOwnerChange(company.id, u.name); setShowOwnerMenu(false); }}
                                    >
                                        {u.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="legal-card-footer">
                <Link href={`/legal/${company.id}`} className="legal-card-footer-btn open">
                    Open Legal
                </Link>
                <button
                    className="legal-card-footer-btn portfolio"
                    onClick={e => { e.stopPropagation(); onOpenPortfolio(); }}
                    title={`View ${company.companyName} in Portfolio`}
                >
                    <Briefcase size={11} /> Go to Portfolio
                </button>
            </div>
        </>
    );
}

export default function LegalPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <LegalContent />
            </main>
        </div>
    );
}
