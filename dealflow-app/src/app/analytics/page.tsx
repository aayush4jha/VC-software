'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import PortfolioCompanyForm from '@/components/company/PortfolioCompanyForm';
import { useAppContext } from '@/lib/context';
import {
    getPortfolioMetrics,
    getTotalInvested,
    getUnrealizedValue,
    getCompanyMOIC,
    getLatestValuation,
    getCurrentOwnership,
    getHoldingPeriodMonths,
    getPortfolioXIRR,
    getCurrentStage,
    formatPortfolioCurrency,
    formatXIRR,
    formatMOIC,
    PORTFOLIO_STAGE_COLORS,
} from '@/lib/portfolio-utils';
import type { FollowOnRound } from '@/types/database';
import { INVESTMENT_TYPES } from '@/types/database';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPieChart, Pie, Cell, Legend,
    AreaChart, Area, LabelList,
} from 'recharts';

// ─── Color Palette ───────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];

// Magnitude charts (capital by industry / entity / instrument) rank one measure,
// so they use a single hue stepped light → dark: a bar's darkness means "more
// capital", not "which category". Cycling ten hues by position did the opposite
// — it implied the colors meant something and repainted every bar whenever a
// filter changed the ordering.
const SEQ_RAMP = ['#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];
function seqColor(rank: number, total: number): string {
    if (total <= 1) return SEQ_RAMP[3];
    const span = Math.min(total, SEQ_RAMP.length) - 1;
    return SEQ_RAMP[Math.round((rank / Math.max(total - 1, 1)) * span)];
}

// Investment type is an identity, not a rank, so each type keeps its own hue
// wherever it appears — filtering the set must never repaint the survivors.
const INVESTMENT_TYPE_COLORS: Record<string, string> = {
    Primary: '#2a78d6',
    Secondary: '#eb6834',
    Debt: '#1baf7a',
    Unassigned: '#94a3b8',
};
function typeColor(name: string, i: number): string {
    return INVESTMENT_TYPE_COLORS[name] || CHART_COLORS[i % CHART_COLORS.length];
}

// Ranked magnitude lists get long tails, so the tail folds into one "Other" row
// rather than growing the chart without limit. Twelve, not eight: these bars are
// one hue stepped by rank rather than twelve distinct colours to tell apart, so
// the ~7 limit on colour classes does not apply — and with 39 industries in the
// book, folding at eight put a quarter of the capital into "Other", which buries
// exactly what the chart is for. The table underneath still lists every row.
const MAX_RANKED_BARS = 12;
function foldTail<T extends { name: string; value: number }>(rows: T[]): { name: string; value: number; tail?: number }[] {
    if (rows.length <= MAX_RANKED_BARS) return rows;
    const head = rows.slice(0, MAX_RANKED_BARS - 1);
    const tail = rows.slice(MAX_RANKED_BARS - 1);
    return [...head, {
        name: `Other (${tail.length})`,
        value: tail.reduce((sum, r) => sum + r.value, 0),
        tail: tail.length,
    }];
}

// Recharts types a formatter's value loosely (number | string | array). These
// narrow it in one place so each chart does not restate it as `any`.
const asMoney = (v: unknown): string => formatPortfolioCurrency(Number(v));
const asMoic = (v: unknown): string => formatMOIC(Number(v));

// ─── Filter controls ─────────────────────────────
// One label+control pair, so fifteen filters stay on one grid instead of
// fifteen hand-written flex stacks that drift apart as filters are added.
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</label>
            {children}
        </div>
    );
}

function FilterSelect({ label, value, onChange, options, allLabel, width }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    allLabel: string;
    width: number;
}) {
    return (
        <FilterField label={label}>
            <select
                className="btn btn-sm"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{ minWidth: width, fontWeight: value === 'all' ? 400 : 600 }}
            >
                <option value="all">{allLabel}</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </FilterField>
    );
}

// ─── Watch List ──────────────────────────────────
// Both portfolio-health lists used to print every company, so a book with
// thirty companies needing attention pushed the rest of the page off screen and
// buried the ones that mattered most. Five rows are in view — worst first —
// and the tail scrolls inside the card, which keeps the two cards the same
// height however lopsided the two lists are.
const WATCH_ROW_HEIGHT = 38;
const WATCH_ROWS_VISIBLE = 5;

function WatchList({ title, subtitle, tone, items, emptyText }: {
    title: string;
    subtitle: string;
    tone: string;
    emptyText: string;
    items: { id: string; name: string; metrics: { label: string; strong?: boolean }[] }[];
}) {
    const hidden = Math.max(0, items.length - WATCH_ROWS_VISIBLE);
    return (
        <div className="portfolio-section-card" style={{ background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <div className="portfolio-section-title" style={{ fontSize: 14, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flexShrink: 0 }} />
                    {title}
                </div>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: tone, background: `${tone}1a`,
                    borderRadius: 999, padding: '2px 8px', flexShrink: 0,
                }}>
                    {items.length}
                </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{subtitle}</div>

            {items.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '10px 0' }}>{emptyText}</div>
            ) : (
                <>
                    <div style={{
                        maxHeight: WATCH_ROW_HEIGHT * WATCH_ROWS_VISIBLE,
                        overflowY: items.length > WATCH_ROWS_VISIBLE ? 'auto' : 'visible',
                        margin: '0 -4px',
                    }}>
                        {items.map((item, i) => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    height: WATCH_ROW_HEIGHT, padding: '0 4px',
                                    borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border-light)',
                                }}
                            >
                                <span style={{
                                    fontSize: 11, color: 'var(--text-tertiary)', width: 16,
                                    textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {i + 1}
                                </span>
                                <span style={{
                                    flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }} title={item.name}>
                                    {item.name}
                                </span>
                                {item.metrics.map((m, mi) => (
                                    <span
                                        key={mi}
                                        style={{
                                            fontSize: 11, flexShrink: 0, borderRadius: 6, padding: '2px 7px',
                                            fontVariantNumeric: 'tabular-nums',
                                            color: m.strong ? tone : 'var(--text-secondary)',
                                            background: m.strong ? `${tone}14` : 'var(--bg-tertiary, rgba(148,163,184,0.12))',
                                            fontWeight: m.strong ? 600 : 400,
                                        }}
                                    >
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                    {hidden > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', paddingTop: 8 }}>
                            Scroll for {hidden} more
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Analytics Content ───────────────────────────
function AnalyticsContent() {
    const {
        companies, industries, users, dealSourceNames,
        getIndustryById, getDealSourceNameById, getUserById,
        fetchFollowOns, followOnsVersion, investmentVehicles, investmentInstruments,
    } = useAppContext();

    // ─── Follow-on data ──────────────────────────
    const [followOnsMap, setFollowOnsMap] = useState<Map<string, FollowOnRound[]>>(new Map());
    const [followOnsLoaded, setFollowOnsLoaded] = useState(false);

    const portfolioCompanies = useMemo(
        () => companies.filter(c => c.terminalStatus === 'Portfolio'),
        [companies]
    );

    const loadFollowOns = useCallback(async () => {
        const map = new Map<string, FollowOnRound[]>();
        await Promise.all(
            portfolioCompanies.map(async (c) => {
                try {
                    const fos = await fetchFollowOns(c.id);
                    map.set(c.id, fos);
                } catch {
                    map.set(c.id, []);
                }
            })
        );
        setFollowOnsMap(map);
        setFollowOnsLoaded(true);
    }, [portfolioCompanies, fetchFollowOns]);

    // followOnsVersion bumps on any round add / edit / delete, so every metric
    // on this page re-derives from fresh rounds instead of a stale first load.
    useEffect(() => {
        if (portfolioCompanies.length > 0) {
            loadFollowOns();
        }
    }, [portfolioCompanies.length, followOnsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Filter State ────────────────────────────
    const [filterStage, setFilterStage] = useState('all');
    const [filterSector, setFilterSector] = useState('all');
    const [filterGeography, setFilterGeography] = useState('all');
    const [filterEntryYear, setFilterEntryYear] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterMinInvestment, setFilterMinInvestment] = useState('');
    const [filterMaxInvestment, setFilterMaxInvestment] = useState('');
    const [filterInvestmentType, setFilterInvestmentType] = useState('all');
    const [filterVehicle, setFilterVehicle] = useState('all');
    const [filterInstrument, setFilterInstrument] = useState('all');
    const [filterHealth, setFilterHealth] = useState('all');
    const [filterCurrentStage, setFilterCurrentStage] = useState('all');
    const [filterAnalyst, setFilterAnalyst] = useState('all');
    const [filterSourcer, setFilterSourcer] = useState('all');
    const [filterSourceType, setFilterSourceType] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [filterCity, setFilterCity] = useState('all');
    const [filterSearch, setFilterSearch] = useState('');
    const [showAllFilters, setShowAllFilters] = useState(false);

    // Unique values for filter dropdowns
    const uniqueStages = useMemo(() => [...new Set(portfolioCompanies.map(c => c.companyRound))].sort(), [portfolioCompanies]);
    const uniqueSectors = useMemo(() => {
        const ids = [...new Set(portfolioCompanies.map(c => c.industryId).filter(Boolean))];
        return ids.map(id => {
            const ind = getIndustryById(id);
            return ind ? { id, name: ind.name } : null;
        }).filter(Boolean) as { id: string; name: string }[];
    }, [portfolioCompanies, getIndustryById]);
    const uniqueGeographies = useMemo(() => [...new Set(portfolioCompanies.map(c => c.hqLocation).filter(Boolean))].sort(), [portfolioCompanies]);
    const uniqueCities = useMemo(() => [...new Set(portfolioCompanies.map(c => c.hqCity).filter(Boolean))].sort(), [portfolioCompanies]);
    const uniqueEntryYears = useMemo(() => [...new Set(portfolioCompanies.map(c => new Date(c.createdAt).getFullYear()))].sort((a, b) => b - a), [portfolioCompanies]);

    // Vehicle and investment type are recorded per investment, not per company:
    // the entry sits on the company (investmentVehicle / shareType) and every
    // follow-on carries its own. A company therefore matches a vehicle or type
    // filter when *any* of its investments used it. Rounds we passed on moved no
    // money, so they contribute nothing.
    const investmentLegs = useCallback((c: typeof portfolioCompanies[number]) => {
        const fos = followOnsMap.get(c.id) || [];
        const legs = [{
            amount: c.initialInvestment || 0,
            vehicle: c.investmentVehicle || null,
            syndicateName: c.syndicateName || null,
            type: (c.shareType as string) || null,
            instrument: c.investmentInstrument || null,
        }];
        for (const fo of fos) {
            if (!fo.didWeInvest) continue;
            legs.push({
                amount: fo.ourInvestment || 0,
                vehicle: fo.investmentVehicle || null,
                syndicateName: fo.syndicateName || null,
                type: fo.investmentType || null,
                instrument: fo.investmentInstrument || null,
            });
        }
        return legs;
    }, [followOnsMap]);

    // Registry entries first (so the dropdown is stable even before anything is
    // tagged), then any vehicle an investment records that the registry lost.
    const uniqueVehicles = useMemo(() => {
        const inUse = new Set<string>();
        portfolioCompanies.forEach(c => investmentLegs(c).forEach(l => { if (l.vehicle) inUse.add(l.vehicle); }));
        const registry = investmentVehicles.map(v => v.name);
        return [...registry, ...[...inUse].filter(v => !registry.includes(v)).sort()];
    }, [portfolioCompanies, investmentLegs, investmentVehicles]);

    const uniqueInvestmentTypes = useMemo(() => {
        const inUse = new Set<string>();
        portfolioCompanies.forEach(c => investmentLegs(c).forEach(l => { if (l.type) inUse.add(l.type); }));
        return [...INVESTMENT_TYPES, ...[...inUse].filter(t => !INVESTMENT_TYPES.includes(t as never)).sort()];
    }, [portfolioCompanies, investmentLegs]);

    const uniqueInstruments = useMemo(() => {
        const inUse = new Set<string>();
        portfolioCompanies.forEach(c => investmentLegs(c).forEach(l => { if (l.instrument) inUse.add(l.instrument); }));
        const registry = investmentInstruments.map(v => v.name);
        return [...registry, ...[...inUse].filter(v => !registry.includes(v)).sort()];
    }, [portfolioCompanies, investmentLegs, investmentInstruments]);

    // Current stage is the derived one (latest round, or the manual override),
    // which is what the portfolio list shows — the Stage filter above is the
    // round we entered at, and the two answer different questions.
    const uniqueCurrentStages = useMemo(() => {
        const set = new Set<string>();
        portfolioCompanies.forEach(c => set.add(getCurrentStage(c, followOnsMap.get(c.id) || [])));
        return [...set].sort();
    }, [portfolioCompanies, followOnsMap]);

    const uniqueAnalysts = useMemo(() => {
        const ids = [...new Set(portfolioCompanies.map(c => c.analystId).filter(Boolean))] as string[];
        return ids.map(id => ({ id, name: getUserById(id)?.name || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
    }, [portfolioCompanies, getUserById]);

    const uniqueSourcers = useMemo(() => {
        const ids = [...new Set(portfolioCompanies.map(c => c.dealSourceNameId).filter(Boolean))] as string[];
        return ids.map(id => ({ id, name: getDealSourceNameById(id)?.name || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
    }, [portfolioCompanies, getDealSourceNameById]);

    const uniqueSourceTypes = useMemo(
        () => [...new Set(portfolioCompanies.map(c => c.dealSourceType).filter(Boolean))].sort(),
        [portfolioCompanies],
    );

    // Apply filters
    const filtered = useMemo(() => {
        return portfolioCompanies.filter(c => {
            if (filterStage !== 'all' && c.companyRound !== filterStage) return false;
            if (filterSector !== 'all' && c.industryId !== filterSector) return false;
            if (filterGeography !== 'all' && c.hqLocation !== filterGeography) return false;
            if (filterCity !== 'all' && c.hqCity !== filterCity) return false;
            if (filterEntryYear !== 'all' && new Date(c.createdAt).getFullYear() !== Number(filterEntryYear)) return false;
            if (filterStatus !== 'all' && c.portfolioStatus !== filterStatus) return false;
            const invested = getTotalInvested(c, followOnsMap.get(c.id) || []);
            if (filterMinInvestment && invested < Number(filterMinInvestment)) return false;
            if (filterMaxInvestment && invested > Number(filterMaxInvestment)) return false;
            if (filterHealth !== 'all' && (c.portfolioHealth || '') !== filterHealth) return false;
            if (filterCurrentStage !== 'all' && getCurrentStage(c, followOnsMap.get(c.id) || []) !== filterCurrentStage) return false;
            if (filterAnalyst !== 'all' && c.analystId !== filterAnalyst) return false;
            if (filterSourcer !== 'all' && c.dealSourceNameId !== filterSourcer) return false;
            if (filterSourceType !== 'all' && c.dealSourceType !== filterSourceType) return false;
            if (filterPriority !== 'all' && c.priorityLevel !== filterPriority) return false;
            if (filterSearch.trim() && !c.companyName.toLowerCase().includes(filterSearch.trim().toLowerCase())) return false;
            if (filterInvestmentType !== 'all' || filterVehicle !== 'all' || filterInstrument !== 'all') {
                const legs = investmentLegs(c);
                if (filterInvestmentType !== 'all' && !legs.some(l => l.type === filterInvestmentType)) return false;
                if (filterVehicle !== 'all' && !legs.some(l => l.vehicle === filterVehicle)) return false;
                if (filterInstrument !== 'all' && !legs.some(l => l.instrument === filterInstrument)) return false;
            }
            return true;
        });
    }, [portfolioCompanies, filterStage, filterSector, filterGeography, filterEntryYear, filterStatus, filterMinInvestment, filterMaxInvestment, filterInvestmentType, filterVehicle, filterInstrument, filterHealth, filterCurrentStage, filterAnalyst, filterSourcer, filterSourceType, filterPriority, filterCity, filterSearch, followOnsMap, investmentLegs]);

    // Drives the "N active" badge and whether Reset does anything.
    const activeFilterCount = useMemo(() => [
        filterStage, filterSector, filterGeography, filterEntryYear, filterStatus,
        filterInvestmentType, filterVehicle, filterInstrument, filterHealth,
        filterCurrentStage, filterAnalyst, filterSourcer, filterSourceType, filterPriority, filterCity,
    ].filter(v => v !== 'all').length
        + (filterMinInvestment ? 1 : 0)
        + (filterMaxInvestment ? 1 : 0)
        + (filterSearch.trim() ? 1 : 0),
    [filterStage, filterSector, filterGeography, filterEntryYear, filterStatus, filterInvestmentType,
     filterVehicle, filterInstrument, filterHealth, filterCurrentStage, filterAnalyst, filterSourcer,
     filterSourceType, filterPriority, filterCity, filterMinInvestment, filterMaxInvestment, filterSearch]);

    const resetFilters = () => {
        setFilterStage('all');
        setFilterSector('all');
        setFilterGeography('all');
        setFilterEntryYear('all');
        setFilterStatus('all');
        setFilterMinInvestment('');
        setFilterMaxInvestment('');
        setFilterInvestmentType('all');
        setFilterVehicle('all');
        setFilterInstrument('all');
        setFilterHealth('all');
        setFilterCurrentStage('all');
        setFilterAnalyst('all');
        setFilterSourcer('all');
        setFilterSourceType('all');
        setFilterPriority('all');
        setFilterCity('all');
        setFilterSearch('');
    };

    // ─── Metrics ─────────────────────────────────
    const metrics = useMemo(() => getPortfolioMetrics(filtered, followOnsMap), [filtered, followOnsMap]);

    const totalInvestedAll = useMemo(() => {
        return filtered.reduce((sum, c) => sum + getTotalInvested(c, followOnsMap.get(c.id) || []), 0);
    }, [filtered, followOnsMap]);

    const totalUnrealized = useMemo(() => {
        return filtered.reduce((sum, c) => sum + getUnrealizedValue(c, followOnsMap.get(c.id) || []), 0);
    }, [filtered, followOnsMap]);

    const totalRealized = useMemo(() => {
        return filtered.filter(c => c.portfolioStatus === 'Exited').reduce((sum, c) => sum + (c.exitValue || 0), 0);
    }, [filtered]);

    const portfolioXIRR = useMemo(() => getPortfolioXIRR(filtered, followOnsMap), [filtered, followOnsMap]);

    // ─── Follow-on Statistics ────────────────────
    const followOnStats = useMemo(() => {
        let totalRounds = 0;
        let weInvested = 0;
        let wePassed = 0;
        let followOnCapital = 0;

        followOnsMap.forEach((fos) => {
            fos.forEach(fo => {
                totalRounds++;
                if (fo.didWeInvest) {
                    weInvested++;
                    followOnCapital += fo.ourInvestment || 0;
                } else {
                    wePassed++;
                }
            });
        });

        const participationRate = totalRounds > 0 ? (weInvested / totalRounds) * 100 : 0;
        return { totalRounds, weInvested, wePassed, participationRate, followOnCapital };
    }, [followOnsMap]);

    // ─── Portfolio Health ────────────────────────
    const healthIndicators = useMemo(() => {
        const holdingPeriods = filtered.map(c => getHoldingPeriodMonths(c));
        const avgHolding = holdingPeriods.length > 0 ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length : 0;
        const highOwnership = filtered.filter(c => getCurrentOwnership(c, followOnsMap.get(c.id) || []) >= 10).length;
        const needAttention = filtered.filter(c => c.portfolioStatus === 'Active' && getHoldingPeriodMonths(c) >= 18 && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1.5).length;
        const capitalAtRisk = filtered.filter(c => c.portfolioStatus === 'Active' && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1).length;
        // Worst first, so the five rows in view are the five that matter: the
        // weakest multiple among the long-held, and the largest cheque among
        // those marked below cost.
        const needAttentionCompanies = filtered
            .filter(c => c.portfolioStatus === 'Active' && getHoldingPeriodMonths(c) >= 18 && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1.5)
            .sort((a, b) => getCompanyMOIC(a, followOnsMap.get(a.id) || []) - getCompanyMOIC(b, followOnsMap.get(b.id) || []));
        const atRiskCompanies = filtered
            .filter(c => c.portfolioStatus === 'Active' && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1)
            .sort((a, b) => getTotalInvested(b, followOnsMap.get(b.id) || []) - getTotalInvested(a, followOnsMap.get(a.id) || []));
        return { avgHolding, highOwnership, needAttention, capitalAtRisk, needAttentionCompanies, atRiskCompanies };
    }, [filtered, followOnsMap]);

    // ─── Portfolio Value Over Time ───────────────
    const valueOverTime = useMemo(() => {
        const years = [...new Set(filtered.map(c => new Date(c.createdAt).getFullYear()))].sort();
        let cumulativeInvested = 0;
        return years.map(year => {
            const companiesUpToYear = filtered.filter(c => new Date(c.createdAt).getFullYear() <= year);
            cumulativeInvested = companiesUpToYear.reduce((sum, c) => sum + getTotalInvested(c, followOnsMap.get(c.id) || []), 0);
            const portfolioValue = companiesUpToYear.reduce((sum, c) => {
                const fos = followOnsMap.get(c.id) || [];
                if (c.portfolioStatus === 'Exited') return sum + (c.exitValue || 0);
                return sum + getUnrealizedValue(c, fos);
            }, 0);
            return { year: year.toString(), invested: cumulativeInvested, value: portfolioValue };
        });
    }, [filtered, followOnsMap]);

    // ─── Vintage Year Analysis ───────────────────
    const vintageData = useMemo(() => {
        const map = new Map<number, { deals: number; invested: number; value: number }>();
        filtered.forEach(c => {
            const year = new Date(c.createdAt).getFullYear();
            const fos = followOnsMap.get(c.id) || [];
            const invested = getTotalInvested(c, fos);
            const value = c.portfolioStatus === 'Exited' ? (c.exitValue || 0) : getUnrealizedValue(c, fos);
            const existing = map.get(year) || { deals: 0, invested: 0, value: 0 };
            map.set(year, { deals: existing.deals + 1, invested: existing.invested + invested, value: existing.value + value });
        });
        return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, data]) => ({
            vintage: year.toString(),
            deals: data.deals,
            invested: data.invested,
            value: data.value,
            moic: data.invested > 0 ? data.value / data.invested : 0,
        }));
    }, [filtered, followOnsMap]);

    // ─── MOIC by Vintage Year ────────────────────
    const moicByVintage = useMemo(() => {
        return vintageData.map(v => ({ name: v.vintage, moic: v.moic }));
    }, [vintageData]);

    // ─── MOIC by Stage ───────────────────────────
    const moicByStage = useMemo(() => {
        const map = new Map<string, { invested: number; value: number }>();
        filtered.forEach(c => {
            const fos = followOnsMap.get(c.id) || [];
            const invested = getTotalInvested(c, fos);
            const value = c.portfolioStatus === 'Exited' ? (c.exitValue || 0) : getUnrealizedValue(c, fos);
            const stage = c.companyRound;
            const existing = map.get(stage) || { invested: 0, value: 0 };
            map.set(stage, { invested: existing.invested + invested, value: existing.value + value });
        });
        return [...map.entries()].map(([stage, data]) => ({
            name: stage,
            moic: data.invested > 0 ? data.value / data.invested : 0,
        })).sort((a, b) => b.moic - a.moic);
    }, [filtered, followOnsMap]);

    // ─── Industry Distribution ───────────────────
    const industryDistribution = useMemo(() => {
        const map = new Map<string, { value: number; deals: number }>();
        filtered.forEach(c => {
            const ind = getIndustryById(c.industryId);
            const name = ind?.name || 'Unknown';
            const entry = map.get(name) || { value: 0, deals: 0 };
            entry.value += getTotalInvested(c, followOnsMap.get(c.id) || []);
            entry.deals += 1;
            map.set(name, entry);
        });
        return [...map.entries()]
            .map(([name, d]) => ({ name, value: d.value, deals: d.deals }))
            .sort((a, b) => b.value - a.value);
    }, [filtered, followOnsMap, getIndustryById]);

    const industryTotal = useMemo(
        () => industryDistribution.reduce((sum, r) => sum + r.value, 0),
        [industryDistribution],
    );
    const industryRanked = useMemo(() => foldTail(industryDistribution), [industryDistribution]);

    // ─── Stage Distribution ──────────────────────
    const stageDistribution = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(c => {
            const stage = c.companyRound;
            map.set(stage, (map.get(stage) || 0) + 1);
        });
        return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [filtered]);

    // ─── Vehicle / Investment Type Allocation ────
    // Capital is attributed per investment leg, not per company: an entry from
    // DVPL followed by a syndicate follow-on lands in both buckets with the
    // right amount in each. Deal counts are distinct companies per bucket.
    const allocationBy = useCallback((key: 'vehicle' | 'type' | 'instrument') => {
        const map = new Map<string, { invested: number; companies: Set<string> }>();
        filtered.forEach(c => {
            investmentLegs(c).forEach(l => {
                const raw = key === 'vehicle' ? l.vehicle : key === 'type' ? l.type : l.instrument;
                const name = !raw
                    ? 'Unassigned'
                    : key === 'vehicle' && raw === 'Syndicate' && l.syndicateName
                        ? `Syndicate — ${l.syndicateName}`
                        : raw;
                const entry = map.get(name) || { invested: 0, companies: new Set<string>() };
                entry.invested += l.amount;
                entry.companies.add(c.id);
                map.set(name, entry);
            });
        });
        return [...map.entries()]
            .map(([name, d]) => ({ name, invested: d.invested, deals: d.companies.size }))
            .sort((a, b) => b.invested - a.invested);
    }, [filtered, investmentLegs]);

    const vehicleAllocation = useMemo(() => allocationBy('vehicle'), [allocationBy]);
    const investmentTypeAllocation = useMemo(() => allocationBy('type'), [allocationBy]);
    const instrumentAllocation = useMemo(() => allocationBy('instrument'), [allocationBy]);

    // ─── Geographic Distribution ─────────────────
    const geoDistribution = useMemo(() => {
        const india = filtered.filter(c => {
            const loc = (c.hqLocation || '').toLowerCase();
            return !loc.includes('usa') && !loc.includes('us') && !loc.includes('uk') && !loc.includes('singapore') && !loc.includes('dubai') && (loc.length === 0 || true);
        });
        const intl = filtered.filter(c => {
            const loc = (c.hqLocation || '').toLowerCase();
            return loc.includes('usa') || loc.includes('us') || loc.includes('uk') || loc.includes('singapore') || loc.includes('dubai');
        });

        const cityMap = new Map<string, number>();
        filtered.forEach(c => {
            // Falls back to the state when no city is recorded, so a company
            // still appears somewhere rather than piling into "Unknown".
            const city = c.hqCity || c.hqLocation || 'Unknown';
            cityMap.set(city, (cityMap.get(city) || 0) + 1);
        });
        const byCities = [...cityMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

        return { indiaCount: india.length, intlCount: intl.length, byCities };
    }, [filtered]);

    // ─── Investment Timeline ─────────────────────
    const investmentTimeline = useMemo(() => {
        const map = new Map<number, number>();
        filtered.forEach(c => {
            const year = new Date(c.createdAt).getFullYear();
            const invested = getTotalInvested(c, followOnsMap.get(c.id) || []);
            map.set(year, (map.get(year) || 0) + invested);
        });
        return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, amount]) => ({
            year: year.toString(),
            amount,
        }));
    }, [filtered, followOnsMap]);

    // ─── Top Investments by Amount ───────────────
    const topInvestments = useMemo(() => {
        return [...filtered]
            .map(c => {
                const fos = followOnsMap.get(c.id) || [];
                const invested = getTotalInvested(c, fos);
                const ind = getIndustryById(c.industryId);
                return { companyName: c.companyName, industry: ind?.name || 'N/A', invested };
            })
            .sort((a, b) => b.invested - a.invested)
            .slice(0, 10);
    }, [filtered, followOnsMap, getIndustryById]);

    // ─── Top Unrealized Gains ────────────────────
    const topUnrealizedGains = useMemo(() => {
        return filtered
            .filter(c => c.portfolioStatus === 'Active')
            .map(c => {
                const fos = followOnsMap.get(c.id) || [];
                const invested = getTotalInvested(c, fos);
                const unrealized = getUnrealizedValue(c, fos);
                const gain = unrealized - invested;
                const moic = getCompanyMOIC(c, fos);
                return { companyName: c.companyName, gain, moic };
            })
            .sort((a, b) => b.gain - a.gain)
            .slice(0, 10);
    }, [filtered, followOnsMap]);

    // ─── Team Performance ────────────────────────
    const teamPerformance = useMemo(() => {
        const map = new Map<string, { deals: number; invested: number; moicSum: number }>();
        filtered.forEach(c => {
            const sourcerId = c.dealSourceNameId;
            if (!sourcerId) return;
            const source = getDealSourceNameById(sourcerId);
            const name = source?.name || 'Unknown';
            const fos = followOnsMap.get(c.id) || [];
            const invested = getTotalInvested(c, fos);
            const moic = getCompanyMOIC(c, fos);
            const existing = map.get(name) || { deals: 0, invested: 0, moicSum: 0 };
            map.set(name, { deals: existing.deals + 1, invested: existing.invested + invested, moicSum: existing.moicSum + moic });
        });
        return [...map.entries()].map(([name, data]) => ({
            name,
            deals: data.deals,
            invested: data.invested,
            avgMoic: data.deals > 0 ? data.moicSum / data.deals : 0,
        })).sort((a, b) => b.deals - a.deals);
    }, [filtered, followOnsMap, getDealSourceNameById]);

    if (!followOnsLoaded && portfolioCompanies.length > 0) {
        return (
            <>
                <TopHeader title="Analytics & Insights" />
                <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading analytics data...</div>
                </div>
            </>
        );
    }

    if (portfolioCompanies.length === 0) {
        return (
            <>
                <TopHeader title="Analytics & Insights" />
                <div className="page-content page-enter">
                    <div className="empty-state" style={{ height: '60vh' }}>
                        <div className="empty-state-icon"><span style={{ fontSize: 28 }}>📊</span></div>
                        <div className="empty-state-title">No Portfolio Data Yet</div>
                        <div className="empty-state-text">
                            Add companies to your Portfolio to see analytics. Go to the Portfolio page and add companies, or move companies from the Deal Flow pipeline.
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <TopHeader title="Analytics & Insights" />
            <div className="page-content page-enter">

                {/* ═══ Filter Analytics ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                        <div className="portfolio-section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            Filter Analytics
                            {activeFilterCount > 0 && (
                                <span style={{
                                    fontSize: 11, fontWeight: 600, color: '#6366f1',
                                    background: 'rgba(99,102,241,0.12)', borderRadius: 999, padding: '2px 8px',
                                }}>
                                    {activeFilterCount} active
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {filtered.length} of {portfolioCompanies.length} companies
                            </span>
                            <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => setShowAllFilters(v => !v)}>
                                {showAllFilters ? 'Fewer filters' : 'More filters'}
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ fontSize: 12 }}
                                onClick={resetFilters}
                                disabled={activeFilterCount === 0}
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                        <FilterField label="Company">
                            <input
                                className="btn btn-sm"
                                placeholder="Search name"
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                style={{ minWidth: 150 }}
                            />
                        </FilterField>
                        <FilterSelect label="Entry Stage" value={filterStage} onChange={setFilterStage} allLabel="All Stages" width={130}
                            options={uniqueStages.map(x => ({ value: x, label: x }))} />
                        <FilterSelect label="Sector" value={filterSector} onChange={setFilterSector} allLabel="All Sectors" width={130}
                            options={uniqueSectors.map(x => ({ value: x.id, label: x.name }))} />
                        <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} allLabel="All Status" width={120}
                            options={[{ value: 'Active', label: 'Active' }, { value: 'Exited', label: 'Exited' }, { value: 'Written Off', label: 'Written Off' }]} />
                        <FilterSelect label="Investment Type" value={filterInvestmentType} onChange={setFilterInvestmentType} allLabel="All Types" width={130}
                            options={uniqueInvestmentTypes.map(x => ({ value: x, label: x }))} />
                        <FilterSelect label="Investment Entity" value={filterVehicle} onChange={setFilterVehicle} allLabel="All Entities" width={150}
                            options={uniqueVehicles.map(x => ({ value: x, label: x }))} />
                        <FilterSelect label="Instrument" value={filterInstrument} onChange={setFilterInstrument} allLabel="All Instruments" width={140}
                            options={uniqueInstruments.map(x => ({ value: x, label: x }))} />
                    </div>

                    {showAllFilters && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
                            marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-light)',
                        }}>
                            <FilterSelect label="Current Stage" value={filterCurrentStage} onChange={setFilterCurrentStage} allLabel="All Stages" width={140}
                                options={uniqueCurrentStages.map(x => ({ value: x, label: x }))} />
                            <FilterSelect label="Portfolio Health" value={filterHealth} onChange={setFilterHealth} allLabel="All Health" width={120}
                                options={[{ value: 'Bullish', label: 'Bullish' }, { value: 'Base', label: 'Base' }, { value: 'Bearish', label: 'Bearish' }]} />
                            <FilterSelect label="State / UT" value={filterGeography} onChange={setFilterGeography} allLabel="All States" width={150}
                                options={uniqueGeographies.map(x => ({ value: x, label: x }))} />
                            <FilterSelect label="City" value={filterCity} onChange={setFilterCity} allLabel="All Cities" width={140}
                                options={uniqueCities.map(x => ({ value: x, label: x }))} />
                            <FilterSelect label="Entry Year" value={filterEntryYear} onChange={setFilterEntryYear} allLabel="All Years" width={110}
                                options={uniqueEntryYears.map(y => ({ value: String(y), label: String(y) }))} />
                            <FilterSelect label="Analyst" value={filterAnalyst} onChange={setFilterAnalyst} allLabel="All Analysts" width={140}
                                options={uniqueAnalysts.map(x => ({ value: x.id, label: x.name }))} />
                            <FilterSelect label="Deal Sourcer" value={filterSourcer} onChange={setFilterSourcer} allLabel="All Sourcers" width={150}
                                options={uniqueSourcers.map(x => ({ value: x.id, label: x.name }))} />
                            <FilterSelect label="Source Type" value={filterSourceType} onChange={setFilterSourceType} allLabel="All Sources" width={150}
                                options={uniqueSourceTypes.map(x => ({ value: x, label: x }))} />
                            <FilterSelect label="Priority" value={filterPriority} onChange={setFilterPriority} allLabel="All Priorities" width={110}
                                options={[{ value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }]} />
                            <FilterField label="Investment Range">
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={filterMinInvestment}
                                        onChange={e => setFilterMinInvestment(e.target.value)}
                                        className="btn btn-sm"
                                        style={{ width: 90, textAlign: 'center' }}
                                    />
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>to</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={filterMaxInvestment}
                                        onChange={e => setFilterMaxInvestment(e.target.value)}
                                        className="btn btn-sm"
                                        style={{ width: 90, textAlign: 'center' }}
                                    />
                                </div>
                            </FilterField>
                        </div>
                    )}
                </div>

                {/* ═══ Summary Cards ═══ */}
                <div className="portfolio-kpi-grid" style={{ marginBottom: 24 }}>
                    <div className="portfolio-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">Total Invested</div>
                            <div className="portfolio-kpi-value">{formatPortfolioCurrency(metrics.totalInvestedAll)}</div>
                            <div className="portfolio-kpi-sub">{filtered.length} companies</div>
                        </div>
                    </div>
                    <div className="portfolio-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">Unrealized Value</div>
                            <div className="portfolio-kpi-value">{formatPortfolioCurrency(metrics.unrealizedValue)}</div>
                            <div className="portfolio-kpi-sub">{metrics.activeCompanies} active</div>
                        </div>
                    </div>
                    <div className="portfolio-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">Realized Returns</div>
                            <div className="portfolio-kpi-value">{formatPortfolioCurrency(metrics.totalExitValue)}</div>
                            <div className="portfolio-kpi-sub">{metrics.exitedCompanies} exited</div>
                        </div>
                    </div>
                    <div className="portfolio-kpi-card" style={{ borderLeft: '4px solid #1e293b' }}>
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">Blended MOIC</div>
                            <div className="portfolio-kpi-value">{formatMOIC(metrics.blendedMOIC)}</div>
                            <div className="portfolio-kpi-sub">Multiple on Invested Capital</div>
                        </div>
                    </div>
                    <div className="portfolio-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                        <div className="portfolio-kpi-content">
                            <div className="portfolio-kpi-label">Portfolio XIRR</div>
                            <div className="portfolio-kpi-value" style={{ color: (portfolioXIRR ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                                {formatXIRR(metrics.portfolioXIRR)}
                            </div>
                            <div className="portfolio-kpi-sub">Annualized Return</div>
                        </div>
                    </div>
                </div>

                {/* ═══ Returns Dashboard ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Returns Dashboard</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        {/* Portfolio XIRR */}
                        <div style={{
                            background: 'rgba(99,102,241,0.15)',
                            borderRadius: 12, padding: 24, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Portfolio XIRR</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#6366f1' }}>{formatXIRR(metrics.portfolioXIRR)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Annualized Return</div>
                        </div>
                        {/* Blended MOIC */}
                        <div style={{
                            background: 'rgba(16,185,129,0.15)',
                            borderRadius: 12, padding: 24, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Blended MOIC</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#10b981' }}>{formatMOIC(metrics.blendedMOIC)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Multiple on Invested</div>
                        </div>
                        {/* DPI */}
                        <div style={{
                            background: 'rgba(30,41,59,0.9)',
                            borderRadius: 12, padding: 24, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>DPI</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{formatMOIC(metrics.dpi)}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Distributions / Paid-In</div>
                        </div>
                        {/* TVPI */}
                        <div style={{
                            background: 'rgba(245,158,11,0.15)',
                            borderRadius: 12, padding: 24, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>TVPI</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{formatMOIC(metrics.tvpi)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Total Value / Paid-In</div>
                        </div>
                    </div>
                </div>

                {/* ═══ MOIC Charts (Side by Side) ═══ */}
                <div className="portfolio-two-col" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>MOIC by Vintage Year</div>
                        {moicByVintage.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={moicByVintage} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                    <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} width={60} />
                                    <Tooltip formatter={asMoic} />
                                    <Bar dataKey="moic" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="portfolio-empty-chart">No vintage data available</div>}
                    </div>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>MOIC by Stage</div>
                        {moicByStage.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={moicByStage} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                    <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} width={100} />
                                    <Tooltip formatter={asMoic} />
                                    <Bar dataKey="moic" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="portfolio-empty-chart">No stage data available</div>}
                    </div>
                </div>

                {/* ═══ Follow-on Statistics ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Follow-on Statistics</div>
                    <div className="portfolio-kpi-grid">
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Total Follow-on Rounds</div>
                                <div className="portfolio-kpi-value">{followOnStats.totalRounds}</div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Rounds We Invested</div>
                                <div className="portfolio-kpi-value" style={{ color: '#10b981' }}>{followOnStats.weInvested}</div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Rounds We Passed</div>
                                <div className="portfolio-kpi-value" style={{ color: '#ef4444' }}>{followOnStats.wePassed}</div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Participation Rate</div>
                                <div className="portfolio-kpi-value">{followOnStats.participationRate.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                    <div className="portfolio-kpi-card" style={{ marginTop: 16 }}>
                        <div className="portfolio-kpi-content" style={{ textAlign: 'center' }}>
                            <div className="portfolio-kpi-label">Follow-on Capital Deployed</div>
                            <div className="portfolio-kpi-value" style={{ fontSize: 28 }}>{formatPortfolioCurrency(followOnStats.followOnCapital)}</div>
                        </div>
                    </div>
                </div>

                {/* ═══ Portfolio Health Indicators ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Portfolio Health Indicators</div>
                    <div className="portfolio-kpi-grid">
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Avg Holding Period</div>
                                <div className="portfolio-kpi-value">{healthIndicators.avgHolding.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 400 }}>months</span></div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">High Ownership (&ge;10%)</div>
                                <div className="portfolio-kpi-value">{healthIndicators.highOwnership}</div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Need Attention (18mo+)</div>
                                <div className="portfolio-kpi-value" style={{ color: healthIndicators.needAttention > 0 ? '#f59e0b' : '#10b981' }}>{healthIndicators.needAttention}</div>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <div className="portfolio-kpi-label">Capital at Risk (MOIC &lt; 1)</div>
                                <div className="portfolio-kpi-value" style={{ color: healthIndicators.capitalAtRisk > 0 ? '#ef4444' : '#10b981' }}>{healthIndicators.capitalAtRisk}</div>
                            </div>
                        </div>
                    </div>
                    <div className="portfolio-two-col" style={{ marginTop: 16 }}>
                        <WatchList
                            title="Companies Needing Attention"
                            subtitle="Held 18 months or more, still under 1.5x"
                            tone="#f59e0b"
                            emptyText="No companies need attention"
                            items={healthIndicators.needAttentionCompanies.map(c => ({
                                id: c.id,
                                name: c.companyName,
                                metrics: [
                                    { label: `${getHoldingPeriodMonths(c).toFixed(0)}mo held` },
                                    { label: formatMOIC(getCompanyMOIC(c, followOnsMap.get(c.id) || [])), strong: true },
                                ],
                            }))}
                        />
                        <WatchList
                            title="Investments at Risk"
                            subtitle="Marked below cost — largest exposure first"
                            tone="#ef4444"
                            emptyText="No investments at risk"
                            items={healthIndicators.atRiskCompanies.map(c => ({
                                id: c.id,
                                name: c.companyName,
                                metrics: [
                                    { label: formatPortfolioCurrency(getTotalInvested(c, followOnsMap.get(c.id) || [])) },
                                    { label: `${formatMOIC(getCompanyMOIC(c, followOnsMap.get(c.id) || []))} MOIC`, strong: true },
                                ],
                            }))}
                        />
                    </div>
                </div>

                {/* ═══ Portfolio Value Over Time ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Portfolio Value Over Time</div>
                    {valueOverTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height={350}>
                            <AreaChart data={valueOverTime} margin={{ left: 20, right: 20, top: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                <Tooltip formatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                <Area type="monotone" dataKey="invested" stroke="#6366f1" fill="rgba(99,102,241,0.2)" name="Invested Capital" />
                                <Area type="monotone" dataKey="value" stroke="#10b981" fill="rgba(16,185,129,0.2)" name="Portfolio Value" />
                                <Legend />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <div className="portfolio-empty-chart">No timeline data available</div>}
                </div>

                {/* ═══ Vintage Year Analysis ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Vintage Year Analysis</div>
                    <div className="portfolio-two-col">
                        <div>
                            {vintageData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={vintageData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                        <XAxis dataKey="vintage" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                        <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                        <Tooltip formatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                        <Bar dataKey="invested" fill="#6366f1" name="Invested" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="value" fill="#10b981" name="Current Value" radius={[4, 4, 0, 0]} />
                                        <Legend />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <div className="portfolio-empty-chart">No vintage data available</div>}
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Vintage</th>
                                        <th>Deals</th>
                                        <th>Invested</th>
                                        <th>Value</th>
                                        <th>MOIC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vintageData.map(v => (
                                        <tr key={v.vintage}>
                                            <td>{v.vintage}</td>
                                            <td>{v.deals}</td>
                                            <td>{formatPortfolioCurrency(v.invested)}</td>
                                            <td>{formatPortfolioCurrency(v.value)}</td>
                                            <td>{formatMOIC(v.moic)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ═══ Industry + Stage Distribution ═══ */}
                <div className="portfolio-two-col" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 4 }}>Investment by Industry</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                            Capital deployed, largest first{industryRanked.length > 0 && ` · ${industryTotal > 0 ? formatPortfolioCurrency(industryTotal) : '--'} across ${industryDistribution.length} ${industryDistribution.length === 1 ? 'industry' : 'industries'}`}
                        </div>
                        {industryRanked.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={Math.max(180, industryRanked.length * 34 + 30)}>
                                    <BarChart data={industryRanked} layout="vertical" margin={{ left: 4, right: 64, top: 4, bottom: 4 }} barCategoryGap={6}>
                                        <XAxis type="number" hide domain={[0, (max: number) => max * 1.02]} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={132}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                                            formatter={(v: unknown) => [asMoney(v), 'Invested']}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                                            {industryRanked.map((_, i) => (
                                                <Cell key={i} fill={seqColor(i, industryRanked.length)} />
                                            ))}
                                            <LabelList
                                                dataKey="value"
                                                position="right"
                                                style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                                formatter={asMoney}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                {/* Past ~7 categories the bars alone stop answering "how much of
                                    the book is this?", so the exact split lives in a table. */}
                                <div className="table-container" style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr><th>Industry</th><th>Companies</th><th>Invested</th><th>Share</th></tr>
                                        </thead>
                                        <tbody>
                                            {industryDistribution.map(r => (
                                                <tr key={r.name}>
                                                    <td>{r.name}</td>
                                                    <td>{r.deals}</td>
                                                    <td>{formatPortfolioCurrency(r.value)}</td>
                                                    <td>{industryTotal > 0 ? `${((r.value / industryTotal) * 100).toFixed(1)}%` : '--'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : <div className="portfolio-empty-chart">No industry data</div>}
                    </div>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 4 }}>Portfolio by Stage</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                            Companies by entry stage{stageDistribution.length > 0 && ` · ${filtered.length} in total`}
                        </div>
                        {/* One chart, not a bar and a pie of the same numbers. The pie
                            drew nine stage names into half a card, and its legend spilled
                            over the card and off the page. */}
                        {stageDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height={Math.max(180, stageDistribution.length * 34 + 30)}>
                                <BarChart data={stageDistribution} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }} barCategoryGap={6}>
                                    <XAxis type="number" hide domain={[0, (max: number) => max * 1.02]} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={110}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                                    />
                                    <Tooltip cursor={{ fill: 'rgba(99,102,241,0.06)' }} formatter={(v: unknown) => [String(v), 'Companies']} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                                        {stageDistribution.map((entry, i) => (
                                            <Cell key={i} fill={PORTFOLIO_STAGE_COLORS[entry.name] || seqColor(i, stageDistribution.length)} />
                                        ))}
                                        <LabelList
                                            dataKey="value"
                                            position="right"
                                            style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <div className="portfolio-empty-chart">No stage data</div>}
                    </div>
                </div>

                {/* ═══ Vehicle + Investment Type Allocation ═══ */}
                <div className="portfolio-two-col" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Capital by Investment Entity</div>
                        {vehicleAllocation.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={vehicleAllocation} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                        <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={asMoney} />
                                        <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} width={130} />
                                        <Tooltip formatter={asMoney} />
                                        <Bar dataKey="invested" name="Deployed" radius={[0, 4, 4, 0]} barSize={18}>
                                            {vehicleAllocation.map((_, i) => (
                                                <Cell key={i} fill={seqColor(i, vehicleAllocation.length)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                <div className="table-container" style={{ marginTop: 12 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr><th>Entity</th><th>Companies</th><th>Deployed</th><th>Share</th></tr>
                                        </thead>
                                        <tbody>
                                            {vehicleAllocation.map(v => {
                                                const total = vehicleAllocation.reduce((sum, x) => sum + x.invested, 0);
                                                return (
                                                    <tr key={v.name}>
                                                        <td>{v.name}</td>
                                                        <td>{v.deals}</td>
                                                        <td>{formatPortfolioCurrency(v.invested)}</td>
                                                        <td>{total > 0 ? `${((v.invested / total) * 100).toFixed(1)}%` : '--'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : <div className="portfolio-empty-chart">No entity data</div>}
                    </div>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Capital by Investment Type</div>
                        {investmentTypeAllocation.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={260}>
                                    <RechartsPieChart>
                                        <Pie data={investmentTypeAllocation} dataKey="invested" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2}>
                                            {investmentTypeAllocation.map((t, i) => (
                                                <Cell key={i} fill={typeColor(t.name, i)} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={asMoney} />
                                        <Legend />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                                <div className="table-container" style={{ marginTop: 12 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr><th>Type</th><th>Companies</th><th>Deployed</th><th>Share</th></tr>
                                        </thead>
                                        <tbody>
                                            {investmentTypeAllocation.map(t => {
                                                const total = investmentTypeAllocation.reduce((sum, x) => sum + x.invested, 0);
                                                return (
                                                    <tr key={t.name}>
                                                        <td>{t.name}</td>
                                                        <td>{t.deals}</td>
                                                        <td>{formatPortfolioCurrency(t.invested)}</td>
                                                        <td>{total > 0 ? `${((t.invested / total) * 100).toFixed(1)}%` : '--'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : <div className="portfolio-empty-chart">No investment type data</div>}
                    </div>
                </div>

                {/* ═══ Instrument Allocation ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 4 }}>Capital by Instrument</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                        What the money bought — CCPS, CCD, Debt or Common Equity — attributed per investment
                    </div>
                    {instrumentAllocation.length > 0 ? (
                        <div className="portfolio-two-col">
                            <ResponsiveContainer width="100%" height={Math.max(150, instrumentAllocation.length * 34 + 30)}>
                                <BarChart data={instrumentAllocation} layout="vertical" margin={{ left: 4, right: 64, top: 4, bottom: 4 }} barCategoryGap={6}>
                                    <XAxis type="number" hide domain={[0, (max: number) => max * 1.02]} />
                                    <YAxis dataKey="name" type="category" width={120} tickLine={false} axisLine={false}
                                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                    <Tooltip cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                                        formatter={(v: unknown) => [asMoney(v), 'Deployed']} />
                                    <Bar dataKey="invested" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                                        {instrumentAllocation.map((_, i) => (
                                            <Cell key={i} fill={seqColor(i, instrumentAllocation.length)} />
                                        ))}
                                        <LabelList dataKey="invested" position="right"
                                            style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                            formatter={asMoney} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr><th>Instrument</th><th>Companies</th><th>Deployed</th><th>Share</th></tr>
                                    </thead>
                                    <tbody>
                                        {instrumentAllocation.map(r => {
                                            const total = instrumentAllocation.reduce((sum, x) => sum + x.invested, 0);
                                            return (
                                                <tr key={r.name}>
                                                    <td>{r.name}</td>
                                                    <td>{r.deals}</td>
                                                    <td>{formatPortfolioCurrency(r.invested)}</td>
                                                    <td>{total > 0 ? `${((r.invested / total) * 100).toFixed(1)}%` : '--'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : <div className="portfolio-empty-chart">No instrument data</div>}
                </div>

                {/* ═══ Geographic Distribution ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Geographic Distribution</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                        <div style={{
                            flex: 1, background: 'rgba(99,102,241,0.1)', borderRadius: 12,
                            padding: 20, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#6366f1' }}>{geoDistribution.indiaCount}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>India</div>
                        </div>
                        <div style={{
                            flex: 1, background: 'rgba(16,185,129,0.1)', borderRadius: 12,
                            padding: 20, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{geoDistribution.intlCount}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>International</div>
                        </div>
                    </div>
                    {geoDistribution.byCities.length > 0 ? (
                        <ResponsiveContainer width="100%" height={Math.max(200, geoDistribution.byCities.length * 35)}>
                            <BarChart data={geoDistribution.byCities} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} width={120} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3b82f6" name="Companies" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="portfolio-empty-chart">No geographic data available</div>}
                </div>

                {/* ═══ Investment Timeline ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Investment Timeline</div>
                    {investmentTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={investmentTimeline} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                <Tooltip formatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                <Bar dataKey="amount" fill="#8b5cf6" name="Amount Invested" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="portfolio-empty-chart">No timeline data</div>}
                </div>

                {/* ═══ Top Investments + Unrealized Gains (Side by Side) ═══ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div className="portfolio-section-card" style={{ overflow: 'hidden', minWidth: 0 }}>
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Top Investments by Amount</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>#</th>
                                        <th>Company</th>
                                        <th>Industry</th>
                                        <th style={{ textAlign: 'right' }}>Invested</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topInvestments.map((inv, i) => (
                                        <tr key={i}>
                                            <td>{i + 1}</td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.companyName}</td>
                                            <td>{inv.industry}</td>
                                            <td style={{ textAlign: 'right' }}>{formatPortfolioCurrency(inv.invested)}</td>
                                        </tr>
                                    ))}
                                    {topInvestments.length === 0 && (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No data</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="portfolio-section-card" style={{ overflow: 'hidden', minWidth: 0 }}>
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Unrealized Gains</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>#</th>
                                        <th>Company</th>
                                        <th style={{ textAlign: 'right' }}>Gain</th>
                                        <th style={{ textAlign: 'right' }}>MOIC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topUnrealizedGains.map((g, i) => (
                                        <tr key={i}>
                                            <td>{i + 1}</td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.companyName}</td>
                                            <td style={{ textAlign: 'right', color: g.gain >= 0 ? '#10b981' : '#ef4444' }}>{formatPortfolioCurrency(g.gain)}</td>
                                            <td style={{ textAlign: 'right' }}>{formatMOIC(g.moic)}</td>
                                        </tr>
                                    ))}
                                    {topUnrealizedGains.length === 0 && (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No data</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ═══ Team Performance ═══ */}
                <div className="portfolio-section-card" style={{ marginBottom: 24 }}>
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Team Performance</div>
                    {teamPerformance.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                            {teamPerformance.map(member => (
                                <div key={member.name} className="portfolio-kpi-card" style={{ borderLeft: '4px solid #6366f1' }}>
                                    <div className="portfolio-kpi-content">
                                        <div className="portfolio-kpi-label" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>{member.name}</div>
                                        <div style={{ display: 'flex', gap: 20 }}>
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Deals Sourced</div>
                                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{member.deals}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Invested</div>
                                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatPortfolioCurrency(member.invested)}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Avg MOIC</div>
                                                <div style={{ fontSize: 20, fontWeight: 700, color: member.avgMoic >= 1 ? '#10b981' : '#ef4444' }}>{formatMOIC(member.avgMoic)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No team data available</div>}
                </div>

            </div>
        </>
    );
}

// ─── Page ─────────────────────────────────────────
export default function AnalyticsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <AnalyticsContent />
            </main>
            <CompanyDetail />
            <RejectionFlow />
            <EmailCompose />
            <CalendarInvite />
            <CompanyForm />
            <PortfolioCompanyForm />
        </div>
    );
}
