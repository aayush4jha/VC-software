'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Loader2, Search, AlertTriangle, FileWarning, Clock, Building2,
    ShieldAlert, FileCheck2, Plus, ExternalLink, X,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { getCompanyFinancials } from '@/lib/company-financials';
import {
    LEGAL_DOCUMENT_TYPES, INVESTOR_RIGHTS,
    legalKpis, missingKeyDocuments, rightsNeedingAttention, rightEligibility,
    actionAlert, ageingDays, matchesSearch,
    type DocStatus, type RightStatus, type ActionPriority, type ActionStatus, type ActionCategory,
} from '@/lib/legal-tracker';
import type { Company } from '@/types/database';

interface DocRow {
    id: string; company_id: string; doc_type: string; status: DocStatus;
    doc_date: string | null; version: string; link: string; remarks: string; updated_at: string | null;
}
interface RightRowDb {
    id: string; company_id: string; right_key: string; status: RightStatus;
    threshold_pct: number | null; condition_text: string; document_ref: string; next_action: string;
}
interface ActionRow {
    id: string; company_id: string | null; action: string; category: ActionCategory;
    owner: string; priority: ActionPriority; due_date: string | null; status: ActionStatus; notes: string;
}

const DEADLINE_WINDOWS = [30, 60, 90];

const money = (n: number | null) => n === null || !isFinite(n) ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (n: number | null) => n === null || !isFinite(n) ? '—' : `${n.toFixed(2)}%`;
const date = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * The Legal page as 02_Legal Page specifies it: six counts across the whole
 * portfolio, the master table, and the three trackers beneath it.
 *
 * Section B is read from `companies` rather than stored here. Every column it
 * asks for — entity, instrument, date, amount, status, ownership, round —
 * already exists on the company, and the Portfolio page derives its figures
 * from the same place. Copying them into a legal table is exactly how one
 * company came to show two different valuations on two screens.
 */
export default function LegalTracker() {
    const router = useRouter();
    const { companies, getIndustryById } = useAppContext();

    const [docs, setDocs] = useState<DocRow[]>([]);
    const [rights, setRights] = useState<RightRowDb[]>([]);
    const [actions, setActions] = useState<ActionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState('');
    const [window, setWindow] = useState(30);
    const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
    const [kpiFilter, setKpiFilter] = useState<null | 'missing_docs' | 'rights' | 'overdue'>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/legal/tracker');
            const j = await res.json();
            if (j.needsMigration) { setNeedsMigration(true); return; }
            if (!res.ok) throw new Error(j.error || 'Could not load the legal tracker');
            setNeedsMigration(false);
            setDocs(j.documents || []);
            setRights(j.rights || []);
            setActions(j.actions || []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Only companies we actually hold belong on a legal tracker.
    const portfolio = useMemo(
        () => companies.filter(c => c.terminalStatus === 'Portfolio'),
        [companies],
    );

    const docsByCompany = useMemo(() => {
        const m = new Map<string, DocRow[]>();
        for (const d of docs) {
            if (!m.has(d.company_id)) m.set(d.company_id, []);
            m.get(d.company_id)!.push(d);
        }
        return m;
    }, [docs]);

    const rightsByCompany = useMemo(() => {
        const m = new Map<string, { rightKey: string; status: RightStatus; thresholdPct: number | null; documentRef: string }[]>();
        for (const r of rights) {
            if (!m.has(r.company_id)) m.set(r.company_id, []);
            m.get(r.company_id)!.push({
                rightKey: r.right_key, status: r.status,
                thresholdPct: r.threshold_pct, documentRef: r.document_ref,
            });
        }
        return m;
    }, [rights]);

    // Section B, derived once and reused by the table, the search and the KPIs.
    const master = useMemo(() => portfolio.map(c => {
        const fin = getCompanyFinancials(c, []);
        const companyDocs = docsByCompany.get(c.id) || [];
        return {
            company: c,
            financials: fin,
            industry: getIndustryById(c.industryId || '')?.name || '',
            missingDocs: missingKeyDocuments(companyDocs.map(d => ({
                companyId: d.company_id, docType: d.doc_type, status: d.status,
                docDate: d.doc_date, updatedAt: d.updated_at,
            }))),
            rightsIssues: rightsNeedingAttention(rightsByCompany.get(c.id) || [], fin.currentOwnership),
            docCount: companyDocs.filter(d => d.status === 'received').length,
        };
    }), [portfolio, docsByCompany, rightsByCompany, getIndustryById]);

    const kpis = useMemo(() => legalKpis(
        portfolio.map(c => ({
            id: c.id, companyName: c.companyName,
            currentOwnership: getCompanyFinancials(c, []).currentOwnership,
        })),
        docs.map(d => ({
            companyId: d.company_id, docType: d.doc_type, status: d.status,
            docDate: d.doc_date, updatedAt: d.updated_at,
        })),
        actions.map(a => ({
            id: a.id, companyId: a.company_id, priority: a.priority,
            status: a.status, dueDate: a.due_date,
        })),
        rightsByCompany,
        { withinDays: window },
    ), [portfolio, docs, actions, rightsByCompany, window]);

    const visible = useMemo(() => master.filter(m => {
        if (kpiFilter === 'missing_docs' && m.missingDocs.length === 0) return false;
        if (kpiFilter === 'rights' && m.rightsIssues.length === 0) return false;
        if (kpiFilter === 'overdue') {
            const theirs = actions.filter(a => a.company_id === m.company.id
                && actionAlert({ status: a.status, dueDate: a.due_date }).urgency === 'overdue');
            if (theirs.length === 0) return false;
        }
        return matchesSearch({
            companyName: m.company.companyName,
            investmentEntity: m.financials.investmentEntity || '',
            investmentType: m.financials.investmentInstrument || m.company.shareType || '',
            round: m.company.companyRound || '',
            status: m.company.portfolioStatus || '',
            documentTypes: (docsByCompany.get(m.company.id) || [])
                .filter(d => d.status === 'received')
                .map(d => LEGAL_DOCUMENT_TYPES.find(t => t.key === d.doc_type)?.label || d.doc_type),
        }, query);
    }), [master, query, kpiFilter, actions, docsByCompany]);

    if (needsMigration) {
        return (
            <div style={{ padding: 24 }}>
                <div style={{
                    display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 10, maxWidth: 720,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
                    fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)',
                }}>
                    <AlertTriangle size={18} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <strong style={{ color: 'var(--text-primary)' }}>One migration to run first.</strong>
                        <div style={{ marginTop: 6 }}>
                            Paste <code>supabase/legal-fund-master.sql</code> into the Supabase SQL editor and
                            run it. It creates the document, rights and action trackers, and is safe to run
                            more than once. This page fills itself in as soon as the tables exist.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const cards = [
        { key: null, label: 'Portfolio Companies', value: kpis.totalCompanies, icon: Building2, tone: 'plain' as const },
        { key: null, label: 'Documents Pending', value: kpis.documentsPending, icon: FileWarning, tone: kpis.documentsPending > 0 ? 'warn' as const : 'plain' as const },
        { key: 'overdue' as const, label: 'Critical Legal Actions', value: kpis.criticalActions, icon: AlertTriangle, tone: kpis.criticalActions > 0 ? 'bad' as const : 'plain' as const },
        { key: null, label: `Deadlines in ${window}d`, value: kpis.upcomingDeadlines, icon: Clock, tone: kpis.upcomingDeadlines > 0 ? 'warn' as const : 'plain' as const },
        { key: 'missing_docs' as const, label: 'Missing Key Docs', value: kpis.companiesMissingKeyDocs, icon: FileCheck2, tone: kpis.companiesMissingKeyDocs > 0 ? 'warn' as const : 'plain' as const },
        { key: 'rights' as const, label: 'Rights Need Attention', value: kpis.rightsRequiringAttention, icon: ShieldAlert, tone: kpis.rightsRequiringAttention > 0 ? 'bad' as const : 'plain' as const },
    ];
    const toneColor = { plain: 'var(--text-primary)', warn: '#b45309', bad: '#b91c1c' };

    return (
        <div style={{ padding: '18px 24px 40px' }}>
            {/* ─── A. KPI cards ─────────────────────────────────────────── */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10, marginBottom: 16,
            }}>
                {cards.map(c => {
                    const Icon = c.icon;
                    const active = c.key !== null && kpiFilter === c.key;
                    return (
                        <button
                            key={c.label}
                            type="button"
                            onClick={() => c.key && setKpiFilter(active ? null : c.key)}
                            style={{
                                textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                                border: `1px solid ${active ? 'var(--primary)' : 'var(--border-light)'}`,
                                background: active ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                                cursor: c.key ? 'pointer' : 'default', fontFamily: 'var(--font-sans)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>
                                <Icon size={12} /> {c.label}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: toneColor[c.tone], marginTop: 2 }}>
                                {c.value}
                            </div>
                            {c.key && (
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                    {active ? 'showing these — click to clear' : 'click to filter'}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Overdue banner — "show overdue and upcoming prominently" */}
            {kpis.overdueActions > 0 && (
                <button
                    type="button"
                    onClick={() => setKpiFilter(kpiFilter === 'overdue' ? null : 'overdue')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                        padding: '10px 14px', borderRadius: 10, marginBottom: 14, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
                        color: '#b91c1c', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                    }}
                >
                    <AlertTriangle size={15} />
                    {kpis.overdueActions} legal action{kpis.overdueActions === 1 ? ' is' : 's are'} past the due date.
                </button>
            )}

            {/* ─── Controls ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-tertiary)' }} />
                    <input
                        className="form-input"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Company, entity, instrument, round, status or document…"
                        style={{ paddingLeft: 30, width: '100%', fontSize: 13 }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
                    {DEADLINE_WINDOWS.map(d => (
                        <button
                            key={d}
                            onClick={() => setWindow(d)}
                            style={{
                                padding: '5px 11px', fontSize: 12, border: 'none', cursor: 'pointer', borderRadius: 4,
                                fontFamily: 'var(--font-sans)',
                                background: window === d ? 'var(--bg-secondary)' : 'transparent',
                                color: window === d ? 'var(--primary)' : 'var(--text-secondary)',
                                fontWeight: window === d ? 600 : 500,
                            }}
                        >
                            {d} days
                        </button>
                    ))}
                </div>
                {(kpiFilter || query) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setKpiFilter(null); setQuery(''); }}>
                        <X size={13} /> Clear filters
                    </button>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {visible.length} of {master.length} companies
                </span>
            </div>

            {error && (
                <div style={{ fontSize: 13, color: 'var(--danger, #b91c1c)', marginBottom: 12 }}>{error}</div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading the legal tracker…
                </div>
            ) : (
                <>
                    {/* ─── B. Portfolio Legal Master ─────────────────────── */}
                    <div className="table-container" style={{ marginBottom: 20 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Company</th>
                                    <th>Investment Entity</th>
                                    <th>Instrument</th>
                                    <th>Investment Date</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ownership</th>
                                    <th>Lead Investor</th>
                                    <th>Round</th>
                                    <th>Docs</th>
                                    <th>Rights</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(m => (
                                    <tr
                                        key={m.company.id}
                                        onClick={() => setOpenCompanyId(m.company.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td style={{ fontWeight: 600 }}>{m.company.companyName}</td>
                                        <td style={{ fontSize: 12 }}>{m.financials.investmentEntity || '—'}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {m.financials.investmentInstrument || m.company.shareType || '—'}
                                        </td>
                                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{date(m.financials.entryDateISO)}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {money(m.financials.initialInvestment)}
                                        </td>
                                        <td style={{ fontSize: 12 }}>{m.company.portfolioStatus || '—'}</td>
                                        <td style={{ fontSize: 12, textAlign: 'right' }}>{pct(m.financials.currentOwnership)}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {(m.company as Company & { leadInvestor?: string }).leadInvestor || '—'}
                                        </td>
                                        <td style={{ fontSize: 12 }}>{m.company.companyRound || '—'}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {m.missingDocs.length === 0
                                                ? <span style={{ color: '#047857' }}>complete</span>
                                                : <span style={{ color: '#b45309' }}>{m.missingDocs.length} missing</span>}
                                        </td>
                                        <td style={{ fontSize: 12 }}>
                                            {m.rightsIssues.length === 0
                                                ? <span style={{ color: '#047857' }}>ok</span>
                                                : <span style={{ color: '#b91c1c' }}>{m.rightsIssues.length}</span>}
                                        </td>
                                    </tr>
                                ))}
                                {visible.length === 0 && (
                                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>
                                        No company matches that.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ─── E. Legal action / deadline tracker ────────────── */}
                    <ActionTracker
                        actions={actions}
                        companies={portfolio}
                        onChanged={load}
                        soonDays={window}
                    />
                </>
            )}

            {openCompanyId && (
                <CompanyLegalDrawer
                    company={portfolio.find(c => c.id === openCompanyId)!}
                    documents={docsByCompany.get(openCompanyId) || []}
                    rights={rights.filter(r => r.company_id === openCompanyId)}
                    actions={actions.filter(a => a.company_id === openCompanyId)}
                    onClose={() => setOpenCompanyId(null)}
                    onSaved={load}
                    onOpenPortfolio={() => router.push('/portfolio')}
                />
            )}
        </div>
    );
}

// ─── E. Legal action / deadline tracker ───────────────────────────────────

function ActionTracker({ actions, companies, onChanged, soonDays }: {
    actions: ActionRow[];
    companies: Company[];
    onChanged: () => void;
    soonDays: number;
}) {
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState({
        companyId: '', action: '', category: 'documentation' as ActionCategory,
        owner: '', priority: 'medium' as ActionPriority, dueDate: '',
    });

    const save = async () => {
        if (!draft.action.trim()) return;
        setSaving(true);
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'legal_actions', operation: 'insert',
                data: {
                    organization_id: '00000000-0000-0000-0000-000000000001',
                    company_id: draft.companyId || null,
                    action: draft.action.trim(),
                    category: draft.category,
                    owner: draft.owner.trim(),
                    priority: draft.priority,
                    due_date: draft.dueDate || null,
                    status: 'open',
                },
            }),
        });
        setSaving(false);
        setAdding(false);
        setDraft({ companyId: '', action: '', category: 'documentation', owner: '', priority: 'medium', dueDate: '' });
        onChanged();
    };

    const setStatus = async (id: string, status: ActionStatus) => {
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'legal_actions', operation: 'update',
                data: { status, updated_at: new Date().toISOString() }, match: { id },
            }),
        });
        onChanged();
    };

    const nameOf = (id: string | null) => companies.find(c => c.id === id)?.companyName || 'Firm-wide';

    // Overdue first, then nearest deadline. Closed sinks to the bottom.
    const sorted = [...actions].sort((a, b) => {
        const rank = (x: ActionRow) => x.status === 'closed' ? 2 : 0;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
    });

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Legal actions & deadlines</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setAdding(v => !v)}>
                    <Plus size={13} /> Add an action
                </button>
            </div>

            {adding && (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8,
                    padding: 12, borderRadius: 10, marginBottom: 10,
                    border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
                }}>
                    <select className="form-input" value={draft.companyId}
                        onChange={e => setDraft({ ...draft, companyId: e.target.value })}>
                        <option value="">Firm-wide (no company)</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                    </select>
                    <input className="form-input" placeholder="What needs doing" value={draft.action}
                        onChange={e => setDraft({ ...draft, action: e.target.value })} />
                    <select className="form-input" value={draft.category}
                        onChange={e => setDraft({ ...draft, category: e.target.value as ActionCategory })}>
                        <option value="documentation">Documentation</option>
                        <option value="compliance">Compliance</option>
                        <option value="transaction">Transaction</option>
                        <option value="dispute">Dispute</option>
                    </select>
                    <input className="form-input" placeholder="Owner" value={draft.owner}
                        onChange={e => setDraft({ ...draft, owner: e.target.value })} />
                    <select className="form-input" value={draft.priority}
                        onChange={e => setDraft({ ...draft, priority: e.target.value as ActionPriority })}>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    <input className="form-input" type="date" value={draft.dueDate}
                        onChange={e => setDraft({ ...draft, dueDate: e.target.value })} />
                    <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !draft.action.trim()}>
                        {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Save'}
                    </button>
                </div>
            )}

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Company</th><th>Action / Issue</th><th>Category</th><th>Owner</th>
                            <th>Priority</th><th>Due</th><th>Status</th><th />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(a => {
                            const alert = actionAlert({ status: a.status, dueDate: a.due_date }, { soonDays });
                            return (
                                <tr key={a.id} style={{ opacity: a.status === 'closed' ? 0.55 : 1 }}>
                                    <td style={{ fontSize: 12 }}>{nameOf(a.company_id)}</td>
                                    <td style={{ fontSize: 12, fontWeight: 600 }}>{a.action}</td>
                                    <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{a.category}</td>
                                    <td style={{ fontSize: 12 }}>{a.owner || '—'}</td>
                                    <td style={{ fontSize: 12, textTransform: 'capitalize', fontWeight: a.priority === 'critical' ? 700 : 500, color: a.priority === 'critical' ? '#b91c1c' : 'inherit' }}>
                                        {a.priority}
                                    </td>
                                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: alert.color, fontWeight: 600 }}>
                                        {date(a.due_date)}
                                        <div style={{ fontSize: 10, fontWeight: 500 }}>{alert.label}</div>
                                    </td>
                                    <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</td>
                                    <td>
                                        <select
                                            className="form-input"
                                            value={a.status}
                                            onChange={e => setStatus(a.id, e.target.value as ActionStatus)}
                                            style={{ fontSize: 11, padding: '2px 6px' }}
                                        >
                                            <option value="open">Open</option>
                                            <option value="on_hold">On hold</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </td>
                                </tr>
                            );
                        })}
                        {sorted.length === 0 && (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 18, color: 'var(--text-tertiary)', fontSize: 13 }}>
                                No open legal actions.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── F. Company drill-down ────────────────────────────────────────────────

function CompanyLegalDrawer({ company, documents, rights, actions, onClose, onSaved, onOpenPortfolio }: {
    company: Company;
    documents: DocRow[];
    rights: RightRowDb[];
    actions: ActionRow[];
    onClose: () => void;
    onSaved: () => void;
    onOpenPortfolio: () => void;
}) {
    const [saving, setSaving] = useState<string | null>(null);
    const fin = getCompanyFinancials(company, []);
    const docByType = new Map(documents.map(d => [d.doc_type, d]));
    const rightByKey = new Map(rights.map(r => [r.right_key, r]));

    const saveDoc = async (docType: string, patch: Record<string, unknown>) => {
        setSaving(docType);
        const current = docByType.get(docType);
        await fetch('/api/legal/tracker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kind: 'document', companyId: company.id, docType,
                status: current?.status ?? 'pending',
                docDate: current?.doc_date ?? null,
                version: current?.version ?? '',
                link: current?.link ?? '',
                remarks: current?.remarks ?? '',
                ...patch,
            }),
        });
        setSaving(null);
        onSaved();
    };

    const saveRight = async (rightKey: string, patch: Record<string, unknown>) => {
        setSaving(rightKey);
        const current = rightByKey.get(rightKey);
        await fetch('/api/legal/tracker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kind: 'right', companyId: company.id, rightKey,
                status: current?.status ?? 'unknown',
                thresholdPct: current?.threshold_pct ?? null,
                conditionText: current?.condition_text ?? '',
                documentRef: current?.document_ref ?? '',
                nextAction: current?.next_action ?? '',
                ...patch,
            }),
        });
        setSaving(null);
        onSaved();
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 320,
                display: 'flex', justifyContent: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(880px, 94vw)', background: 'var(--bg-primary)', height: '100%',
                    overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,0.2)',
                }}
            >
                <div style={{
                    position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1,
                    padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{company.companyName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {fin.investmentEntity || 'No entity'} · {fin.investmentInstrument || company.shareType || '—'} ·{' '}
                            {money(fin.initialInvestment)} · {pct(fin.currentOwnership)} · {company.portfolioStatus}
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onOpenPortfolio}>
                        <ExternalLink size={13} /> Portfolio
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
                </div>

                <div style={{ padding: 20 }}>
                    {/* C. Document tracker */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Documents</h4>
                    <div className="table-container" style={{ marginBottom: 22 }}>
                        <table className="data-table">
                            <thead>
                                <tr><th>Document</th><th>Status</th><th>Date</th><th>Version</th><th>Link</th><th>Ageing</th></tr>
                            </thead>
                            <tbody>
                                {LEGAL_DOCUMENT_TYPES.map(t => {
                                    const row = docByType.get(t.key);
                                    const age = ageingDays(row?.updated_at ?? null);
                                    return (
                                        <tr key={t.key}>
                                            <td style={{ fontSize: 12, fontWeight: t.key_document ? 700 : 500 }}>
                                                {t.label}
                                                {t.key_document && <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}> · key</span>}
                                            </td>
                                            <td>
                                                <select
                                                    className="form-input"
                                                    style={{ fontSize: 11, padding: '2px 6px' }}
                                                    value={row?.status || 'pending'}
                                                    disabled={saving === t.key}
                                                    onChange={e => saveDoc(t.key, { status: e.target.value })}
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="received">Received</option>
                                                    <option value="na">NA</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input" type="date"
                                                    style={{ fontSize: 11, padding: '2px 6px' }}
                                                    defaultValue={row?.doc_date || ''}
                                                    onBlur={e => e.target.value !== (row?.doc_date || '') && saveDoc(t.key, { docDate: e.target.value || null })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input" placeholder="v1"
                                                    style={{ fontSize: 11, padding: '2px 6px', width: 70 }}
                                                    defaultValue={row?.version || ''}
                                                    onBlur={e => e.target.value !== (row?.version || '') && saveDoc(t.key, { version: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input" placeholder="https://…"
                                                    style={{ fontSize: 11, padding: '2px 6px', width: 160 }}
                                                    defaultValue={row?.link || ''}
                                                    onBlur={e => e.target.value !== (row?.link || '') && saveDoc(t.key, { link: e.target.value })}
                                                />
                                            </td>
                                            <td style={{ fontSize: 11, color: row?.status === 'pending' && age !== null && age > 30 ? '#b45309' : 'var(--text-tertiary)' }}>
                                                {row?.status === 'pending' && age !== null ? `${age}d` : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* D. Rights tracker */}
                    <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
                        Investor rights
                        <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {' '}· eligibility checked against {pct(fin.currentOwnership)} current holding
                        </span>
                    </h4>
                    <div className="table-container" style={{ marginBottom: 22 }}>
                        <table className="data-table">
                            <thead>
                                <tr><th>Right</th><th>Status</th><th>Threshold</th><th>Document ref</th><th>Eligibility</th></tr>
                            </thead>
                            <tbody>
                                {INVESTOR_RIGHTS.map(r => {
                                    const row = rightByKey.get(r.key);
                                    const elig = rightEligibility(row?.threshold_pct ?? null, fin.currentOwnership);
                                    return (
                                        <tr key={r.key}>
                                            <td style={{ fontSize: 12, fontWeight: r.critical ? 700 : 500 }}>{r.label}</td>
                                            <td>
                                                <select
                                                    className="form-input"
                                                    style={{ fontSize: 11, padding: '2px 6px' }}
                                                    value={row?.status || 'unknown'}
                                                    disabled={saving === r.key}
                                                    onChange={e => saveRight(r.key, { status: e.target.value })}
                                                >
                                                    <option value="unknown">Not recorded</option>
                                                    <option value="available">Available</option>
                                                    <option value="not_available">Not available</option>
                                                    <option value="triggered">Triggered</option>
                                                    <option value="lost">Lost</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input" placeholder="%" type="number" step="0.01"
                                                    style={{ fontSize: 11, padding: '2px 6px', width: 70 }}
                                                    defaultValue={row?.threshold_pct ?? ''}
                                                    onBlur={e => saveRight(r.key, { thresholdPct: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input" placeholder={r.conditionHint || 'SHA clause'}
                                                    style={{ fontSize: 11, padding: '2px 6px', width: 180 }}
                                                    defaultValue={row?.document_ref || ''}
                                                    onBlur={e => e.target.value !== (row?.document_ref || '') && saveRight(r.key, { documentRef: e.target.value })}
                                                />
                                            </td>
                                            <td style={{ fontSize: 11, fontWeight: 600, color: elig === 'below_threshold' ? '#b91c1c' : elig === 'eligible' ? '#047857' : 'var(--text-tertiary)' }}>
                                                {elig === 'below_threshold' ? 'below threshold' : elig === 'eligible' ? 'eligible' : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Open actions</h4>
                    {actions.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nothing open for this company.</div>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                            {actions.map(a => {
                                const alert = actionAlert({ status: a.status, dueDate: a.due_date });
                                return (
                                    <li key={a.id}>
                                        {a.action} — <span style={{ color: alert.color, fontWeight: 600 }}>{alert.label}</span>
                                        {a.owner && <span style={{ color: 'var(--text-tertiary)' }}> · {a.owner}</span>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
