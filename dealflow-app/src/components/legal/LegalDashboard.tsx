'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Calendar, Layers, Coins, Wallet, PieChart, TrendingDown,
    ShieldCheck, AlertTriangle, ArrowRight, ArrowDownRight, ArrowUpRight, MinusCircle,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import {
    type LegalRecord,
    RIGHT_DEFINITIONS,
    detectRightsChanges,
    getMissingMustHaveRights,
} from '@/lib/legal-data';
import { formatPortfolioCurrency } from '@/lib/portfolio-utils';
import type { Company, FollowOnRound } from '@/types/database';

interface Props {
    company: Company;
    record: LegalRecord;
}

function fmtNumber(n: number): string {
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function parseNum(s: string | number | null | undefined): number | null {
    if (s == null || s === '') return null;
    const n = typeof s === 'number' ? s : parseFloat(String(s).replace(/,/g, ''));
    return isFinite(n) ? n : null;
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LegalDashboard({ company, record }: Props) {
    const { fetchFollowOns } = useAppContext();
    const [followOns, setFollowOns] = useState<FollowOnRound[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchFollowOns(company.id)
            .then(rounds => {
                if (cancelled) return;
                const sorted = [...rounds].sort(
                    (a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime(),
                );
                setFollowOns(sorted);
            })
            .catch(() => { if (!cancelled) setFollowOns([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [company.id, fetchFollowOns]);

    // ─── Investment summary ──────────────────────────
    const post = record.postInvestment;
    const investmentDate = post.investmentDate || company.exitDate || '';
    const sharesBought = parseNum(post.sharesBought);
    const pricePerShare = parseNum(post.pricePerShare);
    const percentHolding = parseNum(post.percentHolding) ?? company.entryOwnership ?? null;
    const preMoney = parseNum(post.preMoneyValuation) ?? company.entryValuation ?? null;
    const postMoney = parseNum(post.postMoneyValuation) ?? null;

    const computedAmount = sharesBought != null && pricePerShare != null
        ? sharesBought * pricePerShare
        : null;
    const totalInvested = computedAmount ?? company.initialInvestment ?? null;

    // ─── Rights summary ──────────────────────────────
    const rightsSummary = useMemo(() => {
        const present: string[] = [];
        const absent: string[] = [];
        const modified: string[] = [];
        let mustHaveCount = 0;
        let situationalCount = 0;
        let optionalCount = 0;

        record.rights.forEach(row => {
            const def = RIGHT_DEFINITIONS.find(d => d.id === row.rightId);
            if (!def) return;
            const status = row.shaStatus[record.currentSHAVersion];
            if (status === 'present') present.push(def.name);
            else if (status === 'modified') modified.push(def.name);
            else if (status === 'absent') absent.push(def.name);

            const tiers = Object.values(row.requiredBy);
            if (tiers.includes('must_have')) mustHaveCount++;
            else if (tiers.includes('situational')) situationalCount++;
            else optionalCount++;
        });

        return {
            present, absent, modified,
            mustHaveCount, situationalCount, optionalCount,
            totalRights: record.rights.length,
        };
    }, [record]);

    const missingMustHave = useMemo(() => getMissingMustHaveRights(record), [record]);

    // ─── SHA-version changes (current vs previous) ───
    const versionChange = useMemo(() => {
        const versions = record.shaVersions;
        if (versions.length < 2) return null;
        const currentIdx = versions.findIndex(v => v.id === record.currentSHAVersion);
        if (currentIdx <= 0) return null;
        const prev = versions[currentIdx - 1];
        const curr = versions[currentIdx];
        const diff = detectRightsChanges(record, prev.id, curr.id);
        const added = diff.filter(d => d.change === 'ADDED');
        const removed = diff.filter(d => d.change === 'REMOVED');
        const modified = diff.filter(d => d.change === 'MODIFIED');
        return { prev, curr, added, removed, modified };
    }, [record]);

    // ─── Dilution projection (last follow-on dilution) ───
    const initialOwnership = company.entryOwnership ?? percentHolding;
    const latestRound = followOns[followOns.length - 1] || null;
    const ownershipAfterLatest = latestRound?.ownershipAfter ?? null;
    const dilutionDelta = (initialOwnership != null && ownershipAfterLatest != null)
        ? (ownershipAfterLatest - initialOwnership)
        : null;

    return (
        <div className="legal-dashboard">
            {/* Investment summary metric cards */}
            <div className="legal-dash-metrics">
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><Calendar size={12} /> Investment Date</div>
                    <div className="legal-dash-metric-value">{fmtDate(investmentDate)}</div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><Layers size={12} /> Shares Bought</div>
                    <div className="legal-dash-metric-value">{sharesBought != null ? fmtNumber(sharesBought) : '—'}</div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><Coins size={12} /> Price / Share</div>
                    <div className="legal-dash-metric-value">{pricePerShare != null ? `₹${fmtNumber(pricePerShare)}` : '—'}</div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><Wallet size={12} /> Amount Invested</div>
                    <div className="legal-dash-metric-value" style={{ color: 'var(--success)' }}>
                        {totalInvested ? formatPortfolioCurrency(totalInvested) : '—'}
                    </div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><PieChart size={12} /> % Holding (Entry)</div>
                    <div className="legal-dash-metric-value">{percentHolding != null ? `${fmtNumber(percentHolding)}%` : '—'}</div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label"><PieChart size={12} /> % Holding (Current)</div>
                    <div className="legal-dash-metric-value" style={{
                        color: dilutionDelta != null && dilutionDelta < 0 ? 'var(--warning)' : 'var(--text-primary)',
                    }}>
                        {ownershipAfterLatest != null ? `${fmtNumber(ownershipAfterLatest)}%` : (percentHolding != null ? `${fmtNumber(percentHolding)}%` : '—')}
                        {dilutionDelta != null && dilutionDelta !== 0 && (
                            <span className="legal-dash-delta" style={{
                                color: dilutionDelta < 0 ? 'var(--danger)' : 'var(--success)',
                            }}>
                                {dilutionDelta < 0 ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
                                {Math.abs(dilutionDelta).toFixed(2)}%
                            </span>
                        )}
                    </div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label">Pre-money</div>
                    <div className="legal-dash-metric-value">{preMoney ? formatPortfolioCurrency(preMoney) : '—'}</div>
                </div>
                <div className="legal-dash-metric">
                    <div className="legal-dash-metric-label">Post-money</div>
                    <div className="legal-dash-metric-value">{postMoney ? formatPortfolioCurrency(postMoney) : '—'}</div>
                </div>
            </div>

            <div className="legal-dash-grid">
                {/* Follow-on rounds + dilution */}
                <div className="legal-dash-card legal-dash-card-wide">
                    <div className="legal-dash-card-header">
                        <h3>Follow-on Rounds & Dilution</h3>
                        <span className="legal-dash-card-sub">{loading ? 'Loading…' : `${followOns.length} round${followOns.length === 1 ? '' : 's'}`}</span>
                    </div>
                    {loading ? (
                        <div className="legal-dash-empty">Loading rounds…</div>
                    ) : followOns.length === 0 ? (
                        <div className="legal-dash-empty">
                            No follow-on rounds yet. Add rounds from Portfolio &rarr; company detail to see dilution and pricing per round.
                        </div>
                    ) : (
                        <div className="rights-table-wrapper">
                            <table className="rights-table legal-dash-rounds-table">
                                <thead>
                                    <tr>
                                        <th>Round</th>
                                        <th>Date</th>
                                        <th>Round Valuation</th>
                                        <th>Total Raised</th>
                                        <th>Our Investment</th>
                                        <th>Implied Price</th>
                                        <th>% Holding After</th>
                                        <th>Dilution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        let prevOwnership = initialOwnership;
                                        return followOns.map(r => {
                                            const impliedPrice = pricePerShare != null && preMoney != null && r.roundValuation
                                                ? pricePerShare * (r.roundValuation / preMoney)
                                                : null;
                                            const dilution = (prevOwnership != null && r.ownershipAfter != null)
                                                ? r.ownershipAfter - prevOwnership
                                                : null;
                                            const row = (
                                                <tr key={r.id}>
                                                    <td><strong>{r.roundName}</strong>{!r.didWeInvest && <span className="legal-dash-pill-mini">no participation</span>}</td>
                                                    <td>{fmtDate(r.roundDate)}</td>
                                                    <td>{r.roundValuation ? formatPortfolioCurrency(r.roundValuation) : '—'}</td>
                                                    <td>{r.totalRaised ? formatPortfolioCurrency(r.totalRaised) : '—'}</td>
                                                    <td style={{ color: r.didWeInvest && r.ourInvestment ? 'var(--success)' : 'var(--text-tertiary)' }}>
                                                        {r.didWeInvest && r.ourInvestment ? formatPortfolioCurrency(r.ourInvestment) : '—'}
                                                    </td>
                                                    <td>{impliedPrice ? `₹${fmtNumber(impliedPrice)}` : '—'}</td>
                                                    <td>{r.ownershipAfter != null ? `${fmtNumber(r.ownershipAfter)}%` : '—'}</td>
                                                    <td>
                                                        {dilution != null ? (
                                                            <span style={{
                                                                color: dilution < 0 ? 'var(--danger)' : dilution > 0 ? 'var(--success)' : 'var(--text-tertiary)',
                                                                fontWeight: 600,
                                                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                                            }}>
                                                                {dilution < 0 ? <ArrowDownRight size={11} /> : dilution > 0 ? <ArrowUpRight size={11} /> : <MinusCircle size={11} />}
                                                                {Math.abs(dilution).toFixed(2)}%
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                            if (r.ownershipAfter != null) prevOwnership = r.ownershipAfter;
                                            return row;
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Rights summary */}
                <div className="legal-dash-card">
                    <div className="legal-dash-card-header">
                        <h3><ShieldCheck size={14} /> Rights Summary</h3>
                        <span className="legal-dash-card-sub">{record.shaVersions.find(v => v.id === record.currentSHAVersion)?.label || 'Current SHA'}</span>
                    </div>
                    <div className="legal-dash-rights-stats">
                        <div className="legal-dash-stat green">
                            <div className="legal-dash-stat-num">{rightsSummary.present.length}</div>
                            <div className="legal-dash-stat-label">Present</div>
                        </div>
                        <div className="legal-dash-stat amber">
                            <div className="legal-dash-stat-num">{rightsSummary.modified.length}</div>
                            <div className="legal-dash-stat-label">Modified</div>
                        </div>
                        <div className="legal-dash-stat red">
                            <div className="legal-dash-stat-num">{missingMustHave.length}</div>
                            <div className="legal-dash-stat-label">Critical Missing</div>
                        </div>
                    </div>

                    {missingMustHave.length > 0 && (
                        <div className="legal-dash-callout danger">
                            <AlertTriangle size={13} />
                            <div>
                                <strong>Must-have rights missing</strong>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {missingMustHave.map(r => r.rightName).join(', ')}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="legal-dash-rights-list">
                        <div className="legal-dash-rights-list-label">Present in current SHA</div>
                        <div className="legal-dash-chips">
                            {rightsSummary.present.length > 0 ? (
                                rightsSummary.present.map(name => (
                                    <span key={name} className="legal-dash-chip green">{name}</span>
                                ))
                            ) : (
                                <span className="legal-dash-empty-mini">None marked present yet</span>
                            )}
                        </div>
                        {rightsSummary.modified.length > 0 && (
                            <>
                                <div className="legal-dash-rights-list-label" style={{ marginTop: 12 }}>Modified</div>
                                <div className="legal-dash-chips">
                                    {rightsSummary.modified.map(name => (
                                        <span key={name} className="legal-dash-chip amber">{name}</span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* SHA changes between rounds */}
                <div className="legal-dash-card legal-dash-card-wide">
                    <div className="legal-dash-card-header">
                        <h3><TrendingDown size={14} /> SHA Rights Changes (current vs previous)</h3>
                        <span className="legal-dash-card-sub">
                            {versionChange ? `${versionChange.prev.label}  →  ${versionChange.curr.label}` : 'Need ≥ 2 SHA versions'}
                        </span>
                    </div>
                    {!versionChange ? (
                        <div className="legal-dash-empty">
                            Add another SHA version on the Rights tab to see what changed between rounds.
                        </div>
                    ) : (
                        <div className="legal-dash-changes">
                            <div className="legal-dash-change-col">
                                <div className="legal-dash-change-header green"><ArrowUpRight size={13} /> Added ({versionChange.added.length})</div>
                                {versionChange.added.length === 0 && <div className="legal-dash-empty-mini">None</div>}
                                {versionChange.added.map(c => (
                                    <div key={c.rightId} className="legal-dash-change-item">
                                        <span>{c.rightName}</span>
                                        {c.remark && <em>{c.remark}</em>}
                                    </div>
                                ))}
                            </div>
                            <div className="legal-dash-change-col">
                                <div className="legal-dash-change-header red"><ArrowDownRight size={13} /> Removed ({versionChange.removed.length})</div>
                                {versionChange.removed.length === 0 && <div className="legal-dash-empty-mini">None</div>}
                                {versionChange.removed.map(c => (
                                    <div key={c.rightId} className="legal-dash-change-item">
                                        <span>{c.rightName}</span>
                                        {c.remark && <em>{c.remark}</em>}
                                    </div>
                                ))}
                            </div>
                            <div className="legal-dash-change-col">
                                <div className="legal-dash-change-header amber"><ArrowRight size={13} /> Modified ({versionChange.modified.length})</div>
                                {versionChange.modified.length === 0 && <div className="legal-dash-empty-mini">None</div>}
                                {versionChange.modified.map(c => (
                                    <div key={c.rightId} className="legal-dash-change-item">
                                        <span>{c.rightName}</span>
                                        {c.remark && <em>{c.remark}</em>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
