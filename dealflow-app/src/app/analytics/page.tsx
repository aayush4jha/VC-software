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
    formatPortfolioCurrency,
    formatXIRR,
    formatMOIC,
    PORTFOLIO_STAGE_COLORS,
} from '@/lib/portfolio-utils';
import type { FollowOnRound } from '@/types/database';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPieChart, Pie, Cell, Legend,
    AreaChart, Area,
} from 'recharts';

// ─── Color Palette ───────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];

// ─── Analytics Content ───────────────────────────
function AnalyticsContent() {
    const {
        companies, industries, users, dealSourceNames,
        getIndustryById, getDealSourceNameById, getUserById,
        fetchFollowOns,
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

    useEffect(() => {
        if (portfolioCompanies.length > 0) {
            loadFollowOns();
        }
    }, [portfolioCompanies.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Filter State ────────────────────────────
    const [filterStage, setFilterStage] = useState('all');
    const [filterSector, setFilterSector] = useState('all');
    const [filterGeography, setFilterGeography] = useState('all');
    const [filterEntryYear, setFilterEntryYear] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterMinInvestment, setFilterMinInvestment] = useState('');
    const [filterMaxInvestment, setFilterMaxInvestment] = useState('');

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
    const uniqueEntryYears = useMemo(() => [...new Set(portfolioCompanies.map(c => new Date(c.createdAt).getFullYear()))].sort((a, b) => b - a), [portfolioCompanies]);

    // Apply filters
    const filtered = useMemo(() => {
        return portfolioCompanies.filter(c => {
            if (filterStage !== 'all' && c.companyRound !== filterStage) return false;
            if (filterSector !== 'all' && c.industryId !== filterSector) return false;
            if (filterGeography !== 'all' && c.hqLocation !== filterGeography) return false;
            if (filterEntryYear !== 'all' && new Date(c.createdAt).getFullYear() !== Number(filterEntryYear)) return false;
            if (filterStatus !== 'all' && c.portfolioStatus !== filterStatus) return false;
            const invested = getTotalInvested(c, followOnsMap.get(c.id) || []);
            if (filterMinInvestment && invested < Number(filterMinInvestment)) return false;
            if (filterMaxInvestment && invested > Number(filterMaxInvestment)) return false;
            return true;
        });
    }, [portfolioCompanies, filterStage, filterSector, filterGeography, filterEntryYear, filterStatus, filterMinInvestment, filterMaxInvestment, followOnsMap]);

    const resetFilters = () => {
        setFilterStage('all');
        setFilterSector('all');
        setFilterGeography('all');
        setFilterEntryYear('all');
        setFilterStatus('all');
        setFilterMinInvestment('');
        setFilterMaxInvestment('');
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
        const needAttentionCompanies = filtered.filter(c => c.portfolioStatus === 'Active' && getHoldingPeriodMonths(c) >= 18 && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1.5);
        const atRiskCompanies = filtered.filter(c => c.portfolioStatus === 'Active' && getCompanyMOIC(c, followOnsMap.get(c.id) || []) < 1);
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
        const map = new Map<string, number>();
        filtered.forEach(c => {
            const ind = getIndustryById(c.industryId);
            const name = ind?.name || 'Unknown';
            map.set(name, (map.get(name) || 0) + getTotalInvested(c, followOnsMap.get(c.id) || []));
        });
        return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [filtered, followOnsMap, getIndustryById]);

    // ─── Stage Distribution ──────────────────────
    const stageDistribution = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(c => {
            const stage = c.companyRound;
            map.set(stage, (map.get(stage) || 0) + 1);
        });
        return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [filtered]);

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
            const city = c.hqLocation || 'Unknown';
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
                    <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Filter Analytics</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Stage</label>
                            <select className="btn btn-sm" value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ minWidth: 120 }}>
                                <option value="all">All Stages</option>
                                {uniqueStages.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sector</label>
                            <select className="btn btn-sm" value={filterSector} onChange={e => setFilterSector(e.target.value)} style={{ minWidth: 120 }}>
                                <option value="all">All Sectors</option>
                                {uniqueSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Geography (HQ Location)</label>
                            <select className="btn btn-sm" value={filterGeography} onChange={e => setFilterGeography(e.target.value)} style={{ minWidth: 140 }}>
                                <option value="all">All Locations</option>
                                {uniqueGeographies.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Entry Year</label>
                            <select className="btn btn-sm" value={filterEntryYear} onChange={e => setFilterEntryYear(e.target.value)} style={{ minWidth: 100 }}>
                                <option value="all">All Years</option>
                                {uniqueEntryYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Status</label>
                            <select className="btn btn-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: 110 }}>
                                <option value="all">All Status</option>
                                <option value="Active">Active</option>
                                <option value="Exited">Exited</option>
                                <option value="Written Off">Written Off</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Investment Range</label>
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
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                            <button className="btn btn-sm" style={{ fontSize: 12 }}>Save as Default</button>
                            <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={resetFilters}>Reset Filters</button>
                        </div>
                    </div>
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
                                    <Tooltip formatter={(v: any) => formatMOIC(Number(v))} />
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
                                    <Tooltip formatter={(v: any) => formatMOIC(Number(v))} />
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
                        <div className="portfolio-section-card" style={{ background: 'var(--bg-secondary)' }}>
                            <div className="portfolio-section-title" style={{ fontSize: 14, marginBottom: 12 }}>Companies Needing Attention</div>
                            {healthIndicators.needAttentionCompanies.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {healthIndicators.needAttentionCompanies.map(c => (
                                        <li key={c.id} style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                                            {c.companyName} — {getHoldingPeriodMonths(c).toFixed(0)}mo, {formatMOIC(getCompanyMOIC(c, followOnsMap.get(c.id) || []))}
                                        </li>
                                    ))}
                                </ul>
                            ) : <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No companies need attention</div>}
                        </div>
                        <div className="portfolio-section-card" style={{ background: 'var(--bg-secondary)' }}>
                            <div className="portfolio-section-title" style={{ fontSize: 14, marginBottom: 12 }}>Investments at Risk</div>
                            {healthIndicators.atRiskCompanies.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {healthIndicators.atRiskCompanies.map(c => (
                                        <li key={c.id} style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                                            {c.companyName} — {formatMOIC(getCompanyMOIC(c, followOnsMap.get(c.id) || []))} MOIC, {formatPortfolioCurrency(getTotalInvested(c, followOnsMap.get(c.id) || []))} invested
                                        </li>
                                    ))}
                                </ul>
                            ) : <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No investments at risk</div>}
                        </div>
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
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Investment by Industry</div>
                        {industryDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsPieChart>
                                    <Pie data={industryDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} label={({ name, percent, midAngle, outerRadius: or, cx: cxVal, cy: cyVal }: any) => { if (percent < 0.01) return null; const RADIAN = Math.PI / 180; const radius = (or || 110) + 30; const x = cxVal + radius * Math.cos(-midAngle * RADIAN); const y = cyVal + radius * Math.sin(-midAngle * RADIAN); return <text x={x} y={y} textAnchor={x > cxVal ? 'start' : 'end'} dominantBaseline="central" style={{ fontSize: 12, fill: 'var(--text-secondary)' }}>{`${name} ${(percent * 100).toFixed(0)}%`}</text>; }} labelLine={false}>
                                        {industryDistribution.map((_, i) => (
                                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => formatPortfolioCurrency(Number(v))} />
                                    <Legend />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        ) : <div className="portfolio-empty-chart">No industry data</div>}
                    </div>
                    <div className="portfolio-section-card">
                        <div className="portfolio-section-title" style={{ marginBottom: 16 }}>Portfolio by Stage</div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <div style={{ flex: 1 }}>
                                {stageDistribution.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={stageDistribution} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                                            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                                            <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} width={100} />
                                            <Tooltip />
                                            <Bar dataKey="value" name="Companies" radius={[0, 4, 4, 0]}>
                                                {stageDistribution.map((entry, i) => (
                                                    <Cell key={i} fill={PORTFOLIO_STAGE_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <div className="portfolio-empty-chart">No stage data</div>}
                            </div>
                            <div style={{ flex: 1 }}>
                                {stageDistribution.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <RechartsPieChart>
                                            <Pie data={stageDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2}>
                                                {stageDistribution.map((entry, i) => (
                                                    <Cell key={i} fill={PORTFOLIO_STAGE_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                            <Legend />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                ) : null}
                            </div>
                        </div>
                    </div>
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
