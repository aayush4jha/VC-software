'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, Briefcase, AlertTriangle, Info, LayoutDashboard,
    ShieldCheck, GitCompareArrows, ClipboardList, BadgeDollarSign, FileText, FolderOpen,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';
import {
    LEGAL_STAGES, type LegalStageId,
    type LegalRecord,
    getLegalRecord, updateLegalRecord, subscribeLegalUpdates,
    getCompanyAlerts,
} from '@/lib/legal-data';
import LegalDashboard from '@/components/legal/LegalDashboard';
import RightsMatrix from '@/components/legal/RightsMatrix';
import RightsChanges from '@/components/legal/RightsChanges';
import SOPTracker from '@/components/legal/SOPTracker';
import PostInvestmentTracker from '@/components/legal/PostInvestmentTracker';
import SHAGrid from '@/components/legal/SHAGrid';
import DocumentManager from '@/components/legal/DocumentManager';

type LegalTabId = 'dashboard' | 'rights' | 'changes' | 'sop' | 'post' | 'sha' | 'documents';

const TABS: { id: LegalTabId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'rights', label: 'Rights', icon: ShieldCheck },
    { id: 'changes', label: 'Changes', icon: GitCompareArrows },
    { id: 'sop', label: 'SOP', icon: ClipboardList },
    { id: 'post', label: 'Post-Investment', icon: BadgeDollarSign },
    { id: 'sha', label: 'SHA Grid', icon: FileText },
    { id: 'documents', label: 'Documents', icon: FolderOpen },
];

function LegalDetailContent({ companyId }: { companyId: string }) {
    const router = useRouter();
    const { companies, getIndustryById, setSelectedCompany } = useAppContext();
    const [activeTab, setActiveTab] = useState<LegalTabId>('dashboard');
    const [tick, setTick] = useState(0);

    const company = useMemo(() => companies.find(c => c.id === companyId), [companies, companyId]);

    // Re-read from storage whenever tick bumps (updates bump via storage event).
    const record: LegalRecord | null = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        tick; // depend on tick so external storage updates refresh the view
        if (!companyId) return null;
        return getLegalRecord(companyId);
    }, [companyId, tick]);

    useEffect(() => {
        const unsub = subscribeLegalUpdates(() => setTick(t => t + 1));
        return unsub;
    }, []);

    const updateRecord = (mutator: (r: LegalRecord) => LegalRecord) => {
        updateLegalRecord(companyId, mutator);
    };

    const handleStageChange = (stage: LegalStageId) => {
        updateRecord(r => ({ ...r, stageId: stage, stageUpdatedAt: new Date().toISOString() }));
    };

    const handleGoToPortfolio = () => {
        if (!company) return;
        setSelectedCompany(company);
        router.push('/portfolio');
    };

    if (!company) {
        return (
            <>
                <TopHeader title="Company not found" />
                <div className="page-content">
                    <div className="empty-state">
                        <Info size={24} />
                        <div style={{ fontWeight: 600, marginTop: 12 }}>Company not found</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
                            The company ID <code>{companyId}</code> is not in the portfolio.
                        </div>
                        <Link href="/legal" className="btn btn-primary">
                            <ArrowLeft size={14} /> Back to Legal
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    if (!record) {
        return (
            <>
                <TopHeader title={company.companyName} />
                <div className="page-content">
                    <div className="empty-state">Loading legal record…</div>
                </div>
            </>
        );
    }

    const stage = LEGAL_STAGES.find(s => s.id === record.stageId)!;
    const industry = getIndustryById(company.industryId || '')?.name || '';
    const alerts = getCompanyAlerts(record, company.companyName);

    return (
        <>
            <TopHeader title={`Legal · ${company.companyName}`} subtitle={industry || 'Legal lifecycle'} />
            <div className="page-content">
                {/* Company context header with cross-tab nav */}
                <div className="legal-detail-header">
                    <Link href="/legal" className="btn-ghost-sm">
                        <ArrowLeft size={14} /> All Legal
                    </Link>
                    <button className="btn btn-outline" onClick={handleGoToPortfolio}>
                        <Briefcase size={14} /> Go to Portfolio
                    </button>
                </div>

                <div className="legal-detail-summary">
                    <div>
                        <div className="legal-detail-summary-label">Stage</div>
                        <select
                            className="legal-stage-select"
                            value={record.stageId}
                            onChange={e => handleStageChange(e.target.value as LegalStageId)}
                            style={{ borderColor: stage.color, color: stage.color }}
                        >
                            {LEGAL_STAGES.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div className="legal-detail-summary-label">Legal Owner</div>
                        <input
                            className="inline-input"
                            placeholder="Assign lawyer…"
                            value={record.legalOwner}
                            onChange={e => updateRecord(r => ({ ...r, legalOwner: e.target.value }))}
                        />
                    </div>
                    <div>
                        <div className="legal-detail-summary-label">Current SHA</div>
                        <select
                            className="inline-input"
                            value={record.currentSHAVersion}
                            onChange={e => updateRecord(r => ({ ...r, currentSHAVersion: e.target.value }))}
                        >
                            {record.shaVersions.map(v => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div className="legal-detail-summary-label">Alerts</div>
                        <div style={{
                            fontSize: 14, fontWeight: 600,
                            color: alerts.length > 0 ? 'var(--danger)' : 'var(--success)',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            {alerts.length > 0 ? <AlertTriangle size={14} /> : null}
                            {alerts.length} open
                        </div>
                    </div>
                </div>

                {alerts.length > 0 && (
                    <div className="legal-detail-alerts">
                        {alerts.map((a, idx) => (
                            <div key={idx} className={`legal-alert-item ${a.severity === 'high' ? 'high' : 'medium'}`}>
                                <AlertTriangle size={14} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>{a.message}</div>
                                    {a.details && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{a.details}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tabs */}
                <div className="legal-tabs">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                className={`legal-tab ${activeTab === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.id)}
                            >
                                <Icon size={14} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                <div className="legal-tab-content">
                    {activeTab === 'dashboard' && (
                        <LegalDashboard company={company} record={record} />
                    )}
                    {activeTab === 'rights' && (
                        <RightsMatrix record={record} onUpdate={updateRecord} />
                    )}
                    {activeTab === 'changes' && (
                        <RightsChanges record={record} onUpdate={updateRecord} />
                    )}
                    {activeTab === 'sop' && (
                        <SOPTracker record={record} onUpdate={updateRecord} />
                    )}
                    {activeTab === 'post' && (
                        <PostInvestmentTracker record={record} onUpdate={updateRecord} />
                    )}
                    {activeTab === 'sha' && (
                        <SHAGrid record={record} onUpdate={updateRecord} />
                    )}
                    {activeTab === 'documents' && (
                        <DocumentManager record={record} onUpdate={updateRecord} />
                    )}
                </div>
            </div>
        </>
    );
}

export default function LegalDetailPage() {
    const params = useParams<{ id: string }>();
    const companyId = params?.id || '';
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <LegalDetailContent companyId={companyId} />
            </main>
        </div>
    );
}
