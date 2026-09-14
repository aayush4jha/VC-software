'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Calendar, Layers, Coins, Wallet, PieChart,
    ShieldCheck, ArrowDownRight, ArrowUpRight, MinusCircle,
    Building2, MapPin, User as UserIcon, Briefcase, BarChart3, Activity, Target,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import InvestmentEntitySelect from '@/components/common/InvestmentEntitySelect';
import { formatLocation } from '@/lib/india-locations';
import { getCompanyFinancials } from '@/lib/company-financials';
import {
    type LegalRecord,
    type InvestorTier,
    RIGHT_DEFINITIONS,
    INVESTOR_TIERS,
    presenceForVersion,
    inferPresenceFromText,
} from '@/lib/legal-data';
import {
    formatPortfolioCurrency, formatMOIC, formatXIRR, PORTFOLIO_STAGE_COLORS,
} from '@/lib/portfolio-utils';
import type { Company, FollowOnRound } from '@/types/database';

interface Props {
    company: Company;
    record: LegalRecord;
    onUpdate: (mutator: (r: LegalRecord) => LegalRecord) => void;
}

const AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatarColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function fmtNumber(n: number): string {
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LegalDashboard({ company, record }: Props) {
    const { fetchFollowOns, followOnsVersion, getIndustryById, getDealSourceNameById, getUserById, updateCompany } = useAppContext();
    const [followOns, setFollowOns] = useState<FollowOnRound[]>([]);
    const [loading, setLoading] = useState(true);
    // The entity is a property of the investment, so it is stored on the
    // company and edited here directly. It used to be kept in this page's own
    // record, which meant Legal and Portfolio could never agree on it —
    // changing it in one place left the other showing something else.
    const [entityError, setEntityError] = useState<string | null>(null);
    const setInvestmentEntity = async (value: string) => {
        const { error } = await updateCompany(company.id, { investmentVehicle: value || null });
        setEntityError(error ? `Could not save investment entity: ${error}` : null);
    };

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
        // followOnsVersion re-reads the cap table after a round is edited
        // elsewhere, so MOIC / IRR here never lag behind the portfolio panel.
    }, [company.id, fetchFollowOns, followOnsVersion]);

    // ─── Every figure comes from the shared derivation ───────────────────────
    // Nothing on this page works a number out for itself. It used to, and it
    // disagreed with the portfolio panel about the same company: the investment
    // was dated from created_at rather than entry_date, the pre-money was read
    // out of the legacy entry_valuation column (which holds the POST-money), a
    // post-money was invented by adding the cheque to that, and shares and
    // price showed as "—" because they were only ever looked for in this page's
    // own localStorage record, which no screen can write to.
    const fin = getCompanyFinancials(company, followOns);

    const {
        entryDateISO: investmentDate, initialInvestment, totalInvested,
        entryPreMoney, entryPostMoney, latestValuation,
        entryOwnership, currentOwnership, dilutionDelta,
        sharesBought, pricePerShare, moic, irr,
    } = fin;

    const stage = fin.portfolioStage;
    const stageColor = PORTFOLIO_STAGE_COLORS[stage] || '#94a3b8';
    const status = fin.status;
    const industry = getIndustryById(company.industryId || '')?.name || '';
    const sourcer = getDealSourceNameById(company.dealSourceNameId || '')?.name || '';
    const analyst = company.analystId ? getUserById(company.analystId)?.name || '' : '';

    // ─── Rights we have ───────────────────────────────
    // A right counts as "we have it" if the current-SHA remark resolves to
    // "present" OR if any investor-tier cell is marked "Yes" (since users
    // often fill the tier column to indicate the right was secured for
    // their position rather than typing into the SHA column).
    const rightsWeHave = useMemo(() => {
        const items: { id: string; name: string; remark: string }[] = [];
        record.rights.forEach(row => {
            const def = RIGHT_DEFINITIONS.find(d => d.id === row.rightId);
            if (!def) return;

            const shaRemark = (row.shaRemarks[record.currentSHAVersion] || '').trim();
            const shaPresent = presenceForVersion(row, record.currentSHAVersion) === 'present';

            const tierYes: { tier: InvestorTier; value: string } | null = (() => {
                for (const t of INVESTOR_TIERS) {
                    const v = (row.requiredByText?.[t.id] || '').trim();
                    if (inferPresenceFromText(v) === 'present') return { tier: t.id, value: v };
                }
                return null;
            })();

            if (shaPresent || tierYes) {
                // Prefer the SHA remark for the subtitle; otherwise note which
                // tier was marked Yes so the user can trace the source.
                const remark = shaRemark
                    || (tierYes ? `${INVESTOR_TIERS.find(t => t.id === tierYes.tier)?.label}: ${tierYes.value}` : '');
                items.push({ id: def.id, name: def.name, remark });
            }
        });
        return items;
    }, [record]);

    return (
        <div className="legal-dashboard">
            {/* ─── Hero Snapshot ─── */}
            <div className="legal-dash-hero">
                <div className="legal-dash-hero-left">
                    <div className="legal-dash-hero-avatar" style={{ backgroundColor: avatarColor(company.companyName) }}>
                        {initials(company.companyName)}
                    </div>
                    <div className="legal-dash-hero-info">
                        <h2>{company.companyName}</h2>
                        <div className="legal-dash-hero-meta">
                            {industry && <span><Building2 size={12} /> {industry}</span>}
                            {formatLocation(company.hqCity, company.hqLocation) && <span><MapPin size={12} /> {formatLocation(company.hqCity, company.hqLocation)}</span>}
                            {company.founderName && <span><UserIcon size={12} /> {company.founderName}</span>}
                        </div>
                        <div className="legal-dash-hero-badges">
                            <span className="legal-dash-badge" style={{ backgroundColor: `${stageColor}1f`, color: stageColor, borderColor: `${stageColor}66` }}>
                                {stage}
                            </span>
                            <span className={`legal-dash-badge status-${status.toLowerCase().replace(/\s+/g, '-')}`}>
                                {status}
                            </span>
                            {sourcer && <span className="legal-dash-badge neutral"><Briefcase size={11} /> {sourcer}</span>}
                            {analyst && <span className="legal-dash-badge neutral">Analyst: {analyst}</span>}
                        </div>
                    </div>
                </div>
                <div className="legal-dash-hero-stats">
                    <HeroStat label="Total Invested" value={totalInvested > 0 ? formatPortfolioCurrency(totalInvested) : '—'} accent="success" />
                    <HeroStat label="Latest Valuation" value={latestValuation ? formatPortfolioCurrency(latestValuation) : '—'} />
                    <HeroStat
                        label="Ownership"
                        value={currentOwnership != null ? `${fmtNumber(currentOwnership)}%` : '—'}
                        sub={dilutionDelta != null ? `${dilutionDelta > 0 ? '+' : ''}${dilutionDelta.toFixed(2)}% from entry` : undefined}
                        subColor={dilutionDelta != null ? (dilutionDelta < 0 ? 'var(--danger)' : 'var(--success)') : undefined}
                    />
                    <HeroStat
                        label="MOIC"
                        value={totalInvested > 0 ? formatMOIC(moic) : '—'}
                        sub={`IRR: ${formatXIRR(irr)}`}
                    />
                </div>
            </div>

            {/* ─── Investment & Cap-Table Snapshot ─── */}
            <div className="legal-dash-section">
                <div className="legal-dash-section-title">
                    <BarChart3 size={14} />
                    <span>Investment Snapshot</span>
                </div>
                <div className="legal-dash-metrics">
                    <EntityPicker
                        value={fin.investmentEntity || ''}
                        onChange={setInvestmentEntity}
                        error={entityError}
                    />
                    <Metric icon={<Calendar size={12} />} label="Investment Date" value={fmtDate(investmentDate)} />
                    <Metric icon={<Wallet size={12} />} label="Amount Invested" value={initialInvestment ? formatPortfolioCurrency(initialInvestment) : '—'} accent="success" />
                    <Metric icon={<Layers size={12} />} label="Shares Bought" value={sharesBought != null ? fmtNumber(sharesBought) : '—'} hint={sharesBought == null ? 'Set in Portfolio → Number of Shares' : undefined} />
                    <Metric icon={<Coins size={12} />} label="Price / Share" value={pricePerShare != null ? `₹${fmtNumber(pricePerShare)}` : '—'} hint={pricePerShare != null && company.sharePrice == null ? 'Computed from amount ÷ shares' : undefined} />
                    <Metric icon={<Target size={12} />} label="Pre-Money" value={entryPreMoney ? formatPortfolioCurrency(entryPreMoney) : '—'} />
                    <Metric icon={<Target size={12} />} label="Post-Money" value={entryPostMoney ? formatPortfolioCurrency(entryPostMoney) : '—'} />
                    <Metric icon={<PieChart size={12} />} label="% Holding (Entry)" value={entryOwnership != null ? `${fmtNumber(entryOwnership)}%` : '—'} hint={entryOwnership != null && company.entryOwnership == null ? 'Computed' : undefined} />
                    <Metric
                        icon={<PieChart size={12} />}
                        label="% Holding (Current)"
                        value={currentOwnership != null ? `${fmtNumber(currentOwnership)}%` : '—'}
                        delta={dilutionDelta}
                    />
                </div>
            </div>

            {/* ─── Follow-on Rounds & Dilution ─── */}
            <div className="legal-dash-card legal-dash-card-wide">
                <div className="legal-dash-card-header">
                    <h3><Activity size={14} /> Follow-on Rounds & Dilution</h3>
                    <span className="legal-dash-card-sub">{loading ? 'Loading…' : `${followOns.length} round${followOns.length === 1 ? '' : 's'}`}</span>
                </div>
                {loading ? (
                    <div className="legal-dash-empty">Loading rounds…</div>
                ) : followOns.length === 0 ? (
                    <div className="legal-dash-empty">
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>No follow-on rounds tracked yet</div>
                        <div style={{ fontSize: 12 }}>Add rounds from <strong>Portfolio → company detail → Add Round</strong> to see dilution and per-round pricing here.</div>
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
                                    <th>Our Cheque</th>
                                    <th>% Holding After</th>
                                    <th>Dilution Δ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    let prev = entryOwnership;
                                    return followOns.map(r => {
                                        const dilution = (prev != null && r.ownershipAfter != null) ? r.ownershipAfter - prev : null;
                                        const tr = (
                                            <tr key={r.id}>
                                                <td>
                                                    <strong>{r.roundName}</strong>
                                                    {!r.didWeInvest && <span className="legal-dash-pill-mini">no participation</span>}
                                                </td>
                                                <td>{fmtDate(r.roundDate)}</td>
                                                <td>{r.roundValuation ? formatPortfolioCurrency(r.roundValuation) : '—'}</td>
                                                <td>{r.totalRaised ? formatPortfolioCurrency(r.totalRaised) : '—'}</td>
                                                <td style={{ color: r.didWeInvest && r.ourInvestment ? 'var(--success)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                                                    {r.didWeInvest && r.ourInvestment ? formatPortfolioCurrency(r.ourInvestment) : '—'}
                                                </td>
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
                                        if (r.ownershipAfter != null) prev = r.ownershipAfter;
                                        return tr;
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── Rights summary + SHA changes side by side ─── */}
            <div className="legal-dash-grid">
                <div className="legal-dash-card legal-dash-card-wide">
                    <div className="legal-dash-card-header">
                        <h3><ShieldCheck size={14} /> Rights We Have</h3>
                        <span className="legal-dash-card-sub">
                            {rightsWeHave.length} of {record.rights.length} · {record.shaVersions.find(v => v.id === record.currentSHAVersion)?.label || 'Current SHA'}
                        </span>
                    </div>
                    {rightsWeHave.length === 0 ? (
                        <div className="legal-dash-empty">
                            No rights marked &ldquo;Yes&rdquo; in the current SHA yet. Mark presence on the <strong>Rights</strong> tab to populate this list.
                        </div>
                    ) : (
                        <ul className="legal-dash-rights-have">
                            {rightsWeHave.map(r => (
                                <li key={r.id}>
                                    <span className="legal-dash-rights-have-name">{r.name}</span>
                                    {r.remark && <span className="legal-dash-rights-have-remark">{r.remark}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────

function HeroStat({ label, value, sub, subColor, accent }: { label: string; value: string; sub?: string; subColor?: string; accent?: 'success' }) {
    return (
        <div className="legal-dash-hero-stat">
            <div className="legal-dash-hero-stat-label">{label}</div>
            <div className="legal-dash-hero-stat-value" style={accent === 'success' ? { color: 'var(--success)' } : undefined}>{value}</div>
            {sub && <div className="legal-dash-hero-stat-sub" style={subColor ? { color: subColor } : undefined}>{sub}</div>}
        </div>
    );
}

// The entity list is the shared registry, so Legal names an entity exactly as
// Portfolio and Fund do — this used to read the Fund page's own list, which is
// how the same entity ended up called DVPL here and DVLLP there.
function EntityPicker({ value, onChange, error }: {
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
}) {
    return (
        <div className="legal-dash-metric">
            <div className="legal-dash-metric-label"><Building2 size={12} /> Investment Entity</div>
            <div style={{ marginTop: 4 }}>
                <InvestmentEntitySelect value={value} onChange={onChange} labelFontSize={13} />
                {error && (
                    <div style={{ fontSize: 11, color: 'var(--danger, #b91c1c)', marginTop: 4 }}>{error}</div>
                )}
            </div>
        </div>
    );
}

function Metric({ icon, label, value, hint, accent, delta }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    accent?: 'success';
    delta?: number | null;
}) {
    return (
        <div className="legal-dash-metric">
            <div className="legal-dash-metric-label">{icon} {label}</div>
            <div className="legal-dash-metric-value" style={accent === 'success' ? { color: 'var(--success)' } : undefined}>
                {value}
                {delta != null && delta !== 0 && (
                    <span className="legal-dash-delta" style={{ color: delta < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {delta < 0 ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
                        {Math.abs(delta).toFixed(2)}%
                    </span>
                )}
            </div>
            {hint && <div className="legal-dash-metric-hint">{hint}</div>}
        </div>
    );
}

