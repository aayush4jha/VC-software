'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo } from 'react';
import {
    Briefcase, Search, TrendingUp, DollarSign, Building2, Award,
    BarChart3, PieChart, MapPin, Calendar, Users, ArrowUpRight,
    ArrowDownRight, ChevronDown, LayoutGrid, List, Filter, X,
    Target, Clock, AlertTriangle, Shield, Plus,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, Legend,
    AreaChart, Area,
} from 'recharts';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import { useAppContext } from '@/lib/context';
import { formatCurrency, getDaysInPipeline } from '@/lib/context';

// ─── Color palette ─────────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];
const STAGE_COLORS: Record<string, string> = {
    'Pre-Seed': '#94a3b8', 'Seed': '#6366f1', 'Pre-Series A': '#8b5cf6',
    'Series A': '#3b82f6', 'Pre-Series B': '#06b6d4', 'Series B': '#10b981',
    'Growth Stage': '#f59e0b', 'Pre-IPO': '#f97316', 'IPO': '#ef4444',
};

type PortfolioTab = 'dashboard' | 'companies' | 'analytics';
type CompanyView = 'table' | 'board';
type AnalyticsSection = 'returns' | 'vintage' | 'industry' | 'geography' | 'timeline' | 'top-investments' | 'unrealized' | 'team';

// ─── Helpers ───────────────────────────────────────
function calcMOIC(invested: number, currentValue: number): number {
    if (!invested || invested === 0) return 0;
    return currentValue / invested;
}

function calcXIRR(invested: number, currentValue: number, daysHeld: number): number {
    if (!invested || invested === 0 || daysHeld <= 0) return 0;
    const years = daysHeld / 365;
    if (years === 0) return 0;
    return (Math.pow(currentValue / invested, 1 / years) - 1) * 100;
}

function formatPercent(val: number): string {
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function formatMOIC(val: number): string {
    return `${val.toFixed(2)}x`;
}

function formatLargeCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
}

function getVintageYear(dateStr: string): number {
    return new Date(dateStr).getFullYear();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fmtCurrency = (v: any) => formatLargeCurrency(Number(v));
const fmtMOIC = (v: any) => formatMOIC(Number(v));
const fmtCurrencyOrMOIC = (v: any, name: any) =>
    String(name) === 'MOIC' ? formatMOIC(Number(v)) : formatLargeCurrency(Number(v));

// ─── Portfolio Content ─────────────────────────────
function PortfolioContent() {
    const {
        companies, industries, users,
        getIndustryById, setSelectedCompany,
        searchQuery, setSearchQuery,
        setShowCompanyForm, setCompanyFormPortfolioMode,
    } = useAppContext();

    const handleAddPortfolioCompany = () => {
        setCompanyFormPortfolioMode(true);
        setShowCompanyForm(true);
    };

    const [activeTab, setActiveTab] = useState<PortfolioTab>('dashboard');
    const [companyView, setCompanyView] = useState<CompanyView>('table');
    const [analyticsSection, setAnalyticsSection] = useState<AnalyticsSection>('returns');
    const [filterIndustry, setFilterIndustry] = useState<string>('all');
    const [filterRound, setFilterRound] = useState<string>('all');
    const [filterAnalyst, setFilterAnalyst] = useState<string>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [groupBy, setGroupBy] = useState<string>('none');

    // Portfolio companies = terminalStatus === 'Portfolio'
    const portfolioCompanies = useMemo(
        () => companies.filter(c => c.terminalStatus === 'Portfolio'),
        [companies]
    );

    // Apply filters
    const filtered = useMemo(() => {
        return portfolioCompanies.filter(c => {
            if (filterIndustry !== 'all' && c.industryId !== filterIndustry) return false;
            if (filterRound !== 'all' && c.companyRound !== filterRound) return false;
            if (filterAnalyst !== 'all' && c.analystId !== filterAnalyst) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!c.companyName.toLowerCase().includes(q) &&
                    !c.founderName.toLowerCase().includes(q) &&
                    !c.founderEmail.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [portfolioCompanies, filterIndustry, filterRound, filterAnalyst, searchQuery]);

    // ─── Portfolio Metrics ─────────────────────────
    const metrics = useMemo(() => {
        const totalInvested = portfolioCompanies.reduce((sum, c) => sum + (c.totalFundRaise || 0), 0);
        const totalCurrentValue = portfolioCompanies.reduce((sum, c) => sum + (c.valuation || 0), 0);
        const totalCompanies = portfolioCompanies.length;

        const withBothValues = portfolioCompanies.filter(c => c.totalFundRaise && c.valuation);
        const avgMOIC = withBothValues.length > 0
            ? withBothValues.reduce((sum, c) => sum + calcMOIC(c.totalFundRaise!, c.valuation!), 0) / withBothValues.length
            : 0;

        const avgDaysHeld = portfolioCompanies.length > 0
            ? portfolioCompanies.reduce((sum, c) => sum + getDaysInPipeline(c.createdAt), 0) / portfolioCompanies.length
            : 0;

        const avgXIRR = withBothValues.length > 0
            ? withBothValues.reduce((sum, c) => sum + calcXIRR(c.totalFundRaise!, c.valuation!, getDaysInPipeline(c.createdAt)), 0) / withBothValues.length
            : 0;

        // DPI = distributions / invested (using valuation as proxy for realized)
        const dpi = totalInvested > 0 ? totalCurrentValue / totalInvested : 0;
        // TVPI = (distributions + unrealized) / invested
        const tvpi = dpi;

        const unrealizedGain = totalCurrentValue - totalInvested;

        return {
            totalInvested, totalCurrentValue, totalCompanies,
            avgMOIC, avgXIRR, avgDaysHeld, dpi, tvpi, unrealizedGain,
        };
    }, [portfolioCompanies]);

    // ─── Industry breakdown ────────────────────────
    const industryData = useMemo(() => {
        const map = new Map<string, { name: string; count: number; invested: number; value: number }>();
        portfolioCompanies.forEach(c => {
            const ind = getIndustryById(c.industryId);
            const name = ind?.name || 'Other';
            const existing = map.get(name) || { name, count: 0, invested: 0, value: 0 };
            existing.count += 1;
            existing.invested += c.totalFundRaise || 0;
            existing.value += c.valuation || 0;
            map.set(name, existing);
        });
        return Array.from(map.values()).sort((a, b) => b.value - a.value);
    }, [portfolioCompanies, getIndustryById]);

    // ─── Round/Stage breakdown ─────────────────────
    const stageData = useMemo(() => {
        const map = new Map<string, { name: string; count: number; invested: number; value: number }>();
        portfolioCompanies.forEach(c => {
            const name = c.companyRound;
            const existing = map.get(name) || { name, count: 0, invested: 0, value: 0 };
            existing.count += 1;
            existing.invested += c.totalFundRaise || 0;
            existing.value += c.valuation || 0;
            map.set(name, existing);
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [portfolioCompanies]);

    // ─── Vintage year data ─────────────────────────
    const vintageData = useMemo(() => {
        const map = new Map<number, { year: number; deals: number; invested: number; value: number }>();
        portfolioCompanies.forEach(c => {
            const year = getVintageYear(c.createdAt);
            const existing = map.get(year) || { year, deals: 0, invested: 0, value: 0 };
            existing.deals += 1;
            existing.invested += c.totalFundRaise || 0;
            existing.value += c.valuation || 0;
            map.set(year, existing);
        });
        return Array.from(map.values())
            .sort((a, b) => a.year - b.year)
            .map(v => ({ ...v, moic: v.invested > 0 ? v.value / v.invested : 0 }));
    }, [portfolioCompanies]);

    // ─── MOIC by stage ─────────────────────────────
    const moicByStage = useMemo(() => {
        const map = new Map<string, { invested: number; value: number }>();
        portfolioCompanies.forEach(c => {
            if (!c.totalFundRaise || !c.valuation) return;
            const existing = map.get(c.companyRound) || { invested: 0, value: 0 };
            existing.invested += c.totalFundRaise;
            existing.value += c.valuation;
            map.set(c.companyRound, existing);
        });
        return Array.from(map.entries()).map(([name, v]) => ({
            name,
            moic: v.invested > 0 ? v.value / v.invested : 0,
        }));
    }, [portfolioCompanies]);

    // ─── Timeline data (investments per year) ──────
    const timelineData = useMemo(() => {
        const map = new Map<number, number>();
        portfolioCompanies.forEach(c => {
            const year = getVintageYear(c.createdAt);
            map.set(year, (map.get(year) || 0) + (c.totalFundRaise || 0));
        });
        return Array.from(map.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([year, amount]) => ({ year: String(year), amount }));
    }, [portfolioCompanies]);

    // ─── Portfolio value over time ─────────────────
    const portfolioValueOverTime = useMemo(() => {
        const sorted = [...portfolioCompanies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        let cumInvested = 0;
        let cumValue = 0;
        return sorted.map(c => {
            cumInvested += c.totalFundRaise || 0;
            cumValue += c.valuation || 0;
            return {
                date: new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
                invested: cumInvested,
                value: cumValue,
            };
        });
    }, [portfolioCompanies]);

    // ─── Top investments ───────────────────────────
    const topInvestments = useMemo(() => {
        return [...portfolioCompanies]
            .filter(c => c.totalFundRaise)
            .sort((a, b) => (b.totalFundRaise || 0) - (a.totalFundRaise || 0))
            .slice(0, 10);
    }, [portfolioCompanies]);

    // ─── Unrealized gains ──────────────────────────
    const unrealizedGains = useMemo(() => {
        return [...portfolioCompanies]
            .filter(c => c.totalFundRaise && c.valuation)
            .map(c => ({
                ...c,
                gain: (c.valuation || 0) - (c.totalFundRaise || 0),
                moic: calcMOIC(c.totalFundRaise!, c.valuation!),
            }))
            .sort((a, b) => b.gain - a.gain)
            .slice(0, 10);
    }, [portfolioCompanies]);

    // ─── Team performance (by analyst) ─────────────
    const teamPerformance = useMemo(() => {
        const map = new Map<string, { name: string; deals: number; invested: number; value: number }>();
        portfolioCompanies.forEach(c => {
            const analyst = users.find(u => u.id === c.analystId);
            const name = analyst?.name || 'Unassigned';
            const id = c.analystId || 'unassigned';
            const existing = map.get(id) || { name, deals: 0, invested: 0, value: 0 };
            existing.deals += 1;
            existing.invested += c.totalFundRaise || 0;
            existing.value += c.valuation || 0;
            map.set(id, existing);
        });
        return Array.from(map.values())
            .map(v => ({ ...v, moic: v.invested > 0 ? v.value / v.invested : 0 }))
            .sort((a, b) => b.deals - a.deals);
    }, [portfolioCompanies, users]);

    // ─── Recent investments ────────────────────────
    const recentInvestments = useMemo(() => {
        return [...portfolioCompanies]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [portfolioCompanies]);

    // ─── Top performers by valuation growth ────────
    const topPerformers = useMemo(() => {
        return [...portfolioCompanies]
            .filter(c => c.totalFundRaise && c.valuation)
            .sort((a, b) => calcMOIC(b.totalFundRaise!, b.valuation!) - calcMOIC(a.totalFundRaise!, a.valuation!))
            .slice(0, 5);
    }, [portfolioCompanies]);

    // ─── Unique values for filters ─────────────────
    const uniqueRounds = useMemo(() => [...new Set(portfolioCompanies.map(c => c.companyRound))], [portfolioCompanies]);
    const uniqueIndustries = useMemo(() => {
        const ids = [...new Set(portfolioCompanies.map(c => c.industryId).filter(Boolean))];
        return ids.map(id => ({ id, name: getIndustryById(id)?.name || 'Unknown' }));
    }, [portfolioCompanies, getIndustryById]);
    const uniqueAnalysts = useMemo(() => {
        const ids = [...new Set(portfolioCompanies.map(c => c.analystId).filter(Boolean))] as string[];
        return ids.map(id => ({ id, name: users.find(u => u.id === id)?.name || 'Unknown' }));
    }, [portfolioCompanies, users]);

    // Grouped companies for board view
    const groupedCompanies = useMemo(() => {
        if (groupBy === 'none') return { 'All Companies': filtered };
        const map = new Map<string, typeof filtered>();
        filtered.forEach(c => {
            let key = 'Other';
            if (groupBy === 'round') key = c.companyRound;
            else if (groupBy === 'industry') key = getIndustryById(c.industryId)?.name || 'Other';
            else if (groupBy === 'analyst') key = users.find(u => u.id === c.analystId)?.name || 'Unassigned';
            const arr = map.get(key) || [];
            arr.push(c);
            map.set(key, arr);
        });
        return Object.fromEntries(map);
    }, [filtered, groupBy, getIndustryById, users]);

    // ─── Health Indicators ─────────────────────────
    const healthIndicators = useMemo(() => {
        const avgHolding = metrics.avgDaysHeld / 365;
        const highOwnership = portfolioCompanies.filter(c => c.shareType === 'Primary').length;
        const needAttention = portfolioCompanies.filter(c => c.needsReview || c.isOverdue).length;
        const capitalAtRisk = portfolioCompanies
            .filter(c => c.totalFundRaise && c.valuation && c.valuation < c.totalFundRaise)
            .reduce((sum, c) => sum + (c.totalFundRaise || 0), 0);
        return { avgHolding, highOwnership, needAttention, capitalAtRisk };
    }, [portfolioCompanies, metrics.avgDaysHeld]);

    // ─── Render tab content ────────────────────────

    const renderDashboard = () => (
        <div className="portfolio-dashboard">
            {/* KPI Cards */}
            <div className="portfolio-kpi-grid">
                <div className="portfolio-kpi-card">
                    <div className="portfolio-kpi-icon" style={{ background: 'var(--primary-bg)' }}>
                        <DollarSign size={20} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div className="portfolio-kpi-content">
                        <span className="portfolio-kpi-label">Total AUM</span>
                        <span className="portfolio-kpi-value">{formatLargeCurrency(metrics.totalCurrentValue)}</span>
                        <span className="portfolio-kpi-sub">Invested: {formatLargeCurrency(metrics.totalInvested)}</span>
                    </div>
                </div>
                <div className="portfolio-kpi-card">
                    <div className="portfolio-kpi-icon" style={{ background: 'var(--success-bg)' }}>
                        <Building2 size={20} style={{ color: 'var(--success)' }} />
                    </div>
                    <div className="portfolio-kpi-content">
                        <span className="portfolio-kpi-label">Active Companies</span>
                        <span className="portfolio-kpi-value">{metrics.totalCompanies}</span>
                        <span className="portfolio-kpi-sub">{uniqueIndustries.length} industries</span>
                    </div>
                </div>
                <div className="portfolio-kpi-card">
                    <div className="portfolio-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                        <TrendingUp size={20} style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="portfolio-kpi-content">
                        <span className="portfolio-kpi-label">Portfolio XIRR</span>
                        <span className="portfolio-kpi-value">{formatPercent(metrics.avgXIRR)}</span>
                        <span className="portfolio-kpi-sub">Blended MOIC: {formatMOIC(metrics.avgMOIC)}</span>
                    </div>
                </div>
                <div className="portfolio-kpi-card">
                    <div className="portfolio-kpi-icon" style={{ background: 'var(--info-bg)' }}>
                        <Award size={20} style={{ color: 'var(--info)' }} />
                    </div>
                    <div className="portfolio-kpi-content">
                        <span className="portfolio-kpi-label">Unrealized Gain</span>
                        <span className="portfolio-kpi-value" style={{ color: metrics.unrealizedGain >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {metrics.unrealizedGain >= 0 ? '+' : ''}{formatLargeCurrency(Math.abs(metrics.unrealizedGain))}
                        </span>
                        <span className="portfolio-kpi-sub">TVPI: {formatMOIC(metrics.tvpi)}</span>
                    </div>
                </div>
            </div>

            {/* Portfolio Value Chart */}
            <div className="portfolio-section-card" style={{ marginTop: 24 }}>
                <h3 className="portfolio-section-title">
                    <TrendingUp size={16} /> Portfolio Value Over Time
                </h3>
                {portfolioValueOverTime.length > 1 ? (
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={portfolioValueOverTime}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={v => formatCurrency(v)} />
                                <Tooltip
                                    formatter={fmtCurrency}
                                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="value" name="Current Value" stroke="#6366f1" fill="rgba(99,102,241,0.15)" />
                                <Area type="monotone" dataKey="invested" name="Total Invested" stroke="#10b981" fill="rgba(16,185,129,0.1)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="portfolio-empty-chart">Add more portfolio companies to see trends</div>
                )}
            </div>

            {/* Two column layout: Recent Investments + Top Performers */}
            <div className="portfolio-two-col" style={{ marginTop: 24 }}>
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <Calendar size={16} /> Recent Investments
                    </h3>
                    <div className="portfolio-list">
                        {recentInvestments.length === 0 ? (
                            <div className="portfolio-empty-chart">No investments yet</div>
                        ) : recentInvestments.map(c => (
                            <div key={c.id} className="portfolio-list-item" onClick={() => setSelectedCompany(c)}>
                                <div className="portfolio-list-avatar">
                                    {c.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="portfolio-list-info">
                                    <span className="portfolio-list-name">{c.companyName}</span>
                                    <span className="portfolio-list-meta">
                                        {c.companyRound} &middot; {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="portfolio-list-amount">
                                    {c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '--'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <TrendingUp size={16} /> Top Performers by MOIC
                    </h3>
                    <div className="portfolio-list">
                        {topPerformers.length === 0 ? (
                            <div className="portfolio-empty-chart">Add companies with fund raise and valuation data</div>
                        ) : topPerformers.map(c => {
                            const moic = calcMOIC(c.totalFundRaise!, c.valuation!);
                            return (
                                <div key={c.id} className="portfolio-list-item" onClick={() => setSelectedCompany(c)}>
                                    <div className="portfolio-list-avatar" style={{ background: moic >= 2 ? 'var(--success-bg)' : 'var(--primary-bg)' }}>
                                        {c.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="portfolio-list-info">
                                        <span className="portfolio-list-name">{c.companyName}</span>
                                        <span className="portfolio-list-meta">{getIndustryById(c.industryId)?.name || '--'}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="portfolio-list-moic" style={{ color: moic >= 1 ? 'var(--success)' : 'var(--danger)' }}>
                                            {formatMOIC(moic)}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            {moic >= 1 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                            {formatPercent((moic - 1) * 100)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Industry + Stage Breakdown */}
            <div className="portfolio-two-col" style={{ marginTop: 24 }}>
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <PieChart size={16} /> Investment by Industry
                    </h3>
                    {industryData.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <div style={{ width: 200, height: 200 }}>
                                <ResponsiveContainer>
                                    <RechartsPieChart>
                                        <Pie data={industryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                                            {industryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={fmtCurrency} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="portfolio-legend">
                                {industryData.map((d, i) => (
                                    <div key={d.name} className="portfolio-legend-item">
                                        <div className="portfolio-legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                        <span className="portfolio-legend-label">{d.name}</span>
                                        <span className="portfolio-legend-value">{d.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="portfolio-empty-chart">No industry data available</div>
                    )}
                </div>

                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <BarChart3 size={16} /> Portfolio by Stage
                    </h3>
                    {stageData.length > 0 ? (
                        <div style={{ width: '100%', height: 220 }}>
                            <ResponsiveContainer>
                                <BarChart data={stageData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                    <Bar dataKey="count" name="Companies" radius={[4, 4, 0, 0]}>
                                        {stageData.map((d, i) => (
                                            <Cell key={i} fill={STAGE_COLORS[d.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="portfolio-empty-chart">No stage data available</div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderCompanies = () => (
        <div className="portfolio-companies">
            {/* Toolbar */}
            <div className="portfolio-toolbar">
                <div className="portfolio-toolbar-left">
                    <div className="portfolio-view-toggle">
                        <button
                            className={`portfolio-view-btn ${companyView === 'table' ? 'active' : ''}`}
                            onClick={() => setCompanyView('table')}
                        >
                            <List size={14} /> Table
                        </button>
                        <button
                            className={`portfolio-view-btn ${companyView === 'board' ? 'active' : ''}`}
                            onClick={() => setCompanyView('board')}
                        >
                            <LayoutGrid size={14} /> Board
                        </button>
                    </div>
                    <button
                        className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setShowFilters(!showFilters)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Filter size={13} /> Filters
                        {(filterIndustry !== 'all' || filterRound !== 'all' || filterAnalyst !== 'all') && (
                            <span className="portfolio-filter-badge">
                                {[filterIndustry !== 'all', filterRound !== 'all', filterAnalyst !== 'all'].filter(Boolean).length}
                            </span>
                        )}
                    </button>
                    {companyView === 'board' && (
                        <select
                            className="portfolio-select"
                            value={groupBy}
                            onChange={e => setGroupBy(e.target.value)}
                        >
                            <option value="none">No Grouping</option>
                            <option value="round">Group by Round</option>
                            <option value="industry">Group by Industry</option>
                            <option value="analyst">Group by Analyst</option>
                        </select>
                    )}
                </div>
                <div className="portfolio-toolbar-right">
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
                    </span>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="search-input"
                            style={{ paddingLeft: 32, width: 200 }}
                        />
                    </div>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleAddPortfolioCompany}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Plus size={14} /> Add Company
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            {showFilters && (
                <div className="portfolio-filter-bar">
                    <select className="portfolio-select" value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)}>
                        <option value="all">All Industries</option>
                        {uniqueIndustries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <select className="portfolio-select" value={filterRound} onChange={e => setFilterRound(e.target.value)}>
                        <option value="all">All Rounds</option>
                        {uniqueRounds.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select className="portfolio-select" value={filterAnalyst} onChange={e => setFilterAnalyst(e.target.value)}>
                        <option value="all">All Analysts</option>
                        {uniqueAnalysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {(filterIndustry !== 'all' || filterRound !== 'all' || filterAnalyst !== 'all') && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setFilterIndustry('all'); setFilterRound('all'); setFilterAnalyst('all'); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--danger)' }}
                        >
                            <X size={13} /> Clear
                        </button>
                    )}
                </div>
            )}

            {/* Company content */}
            {filtered.length === 0 ? (
                <div className="empty-state" style={{ height: '50vh' }}>
                    <div className="empty-state-icon"><Briefcase size={28} /></div>
                    <div className="empty-state-title">No Portfolio Companies</div>
                    <div className="empty-state-text">
                        {portfolioCompanies.length === 0
                            ? 'Companies marked as "Portfolio" will appear here.'
                            : 'Try adjusting your filters.'}
                    </div>
                </div>
            ) : companyView === 'table' ? (
                <div className="table-container" style={{ marginTop: 16 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Founder</th>
                                <th>Industry</th>
                                <th>Round</th>
                                <th>Invested</th>
                                <th>Valuation</th>
                                <th>MOIC</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(company => {
                                const industry = getIndustryById(company.industryId);
                                const moic = company.totalFundRaise && company.valuation
                                    ? calcMOIC(company.totalFundRaise, company.valuation)
                                    : null;
                                return (
                                    <tr key={company.id} onClick={() => setSelectedCompany(company)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className="kanban-card-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                                                    {company.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="table-company-name">{company.companyName}</span>
                                            </div>
                                        </td>
                                        <td>{company.founderName}</td>
                                        <td>{industry?.name || '--'}</td>
                                        <td><span className="badge badge-info">{company.companyRound}</span></td>
                                        <td>{company.totalFundRaise ? formatCurrency(company.totalFundRaise) : '--'}</td>
                                        <td>{company.valuation ? formatCurrency(company.valuation) : '--'}</td>
                                        <td>
                                            {moic !== null ? (
                                                <span style={{ color: moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                    {formatMOIC(moic)}
                                                </span>
                                            ) : '--'}
                                        </td>
                                        <td>
                                            {new Date(company.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="portfolio-board" style={{ marginTop: 16 }}>
                    {Object.entries(groupedCompanies).map(([groupName, groupCompanies]) => (
                        <div key={groupName} className="portfolio-board-group">
                            {groupBy !== 'none' && (
                                <div className="portfolio-board-group-header">
                                    <span>{groupName}</span>
                                    <span className="portfolio-board-group-count">{groupCompanies.length}</span>
                                </div>
                            )}
                            <div className="portfolio-board-cards">
                                {groupCompanies.map(c => {
                                    const moic = c.totalFundRaise && c.valuation ? calcMOIC(c.totalFundRaise, c.valuation) : null;
                                    return (
                                        <div key={c.id} className="portfolio-board-card" onClick={() => setSelectedCompany(c)}>
                                            <div className="portfolio-board-card-header">
                                                <div className="portfolio-list-avatar">
                                                    {c.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="portfolio-board-card-name">{c.companyName}</div>
                                                    <div className="portfolio-board-card-meta">{c.founderName} &middot; {c.companyRound}</div>
                                                </div>
                                            </div>
                                            <div className="portfolio-board-card-body">
                                                <div className="portfolio-board-card-stat">
                                                    <span>Invested</span>
                                                    <span>{c.totalFundRaise ? formatCurrency(c.totalFundRaise) : '--'}</span>
                                                </div>
                                                <div className="portfolio-board-card-stat">
                                                    <span>Valuation</span>
                                                    <span>{c.valuation ? formatCurrency(c.valuation) : '--'}</span>
                                                </div>
                                                {moic !== null && (
                                                    <div className="portfolio-board-card-stat">
                                                        <span>MOIC</span>
                                                        <span style={{ color: moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                            {formatMOIC(moic)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="portfolio-board-card-footer">
                                                <span className="badge badge-info" style={{ fontSize: 10 }}>
                                                    {getIndustryById(c.industryId)?.name || '--'}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                    {new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderAnalytics = () => (
        <div className="portfolio-analytics">
            {/* Analytics navigation */}
            <div className="portfolio-analytics-nav">
                {([
                    { key: 'returns', label: 'Returns Dashboard', icon: <TrendingUp size={14} /> },
                    { key: 'vintage', label: 'Vintage Analysis', icon: <BarChart3 size={14} /> },
                    { key: 'industry', label: 'Industry & Stage', icon: <PieChart size={14} /> },
                    { key: 'geography', label: 'Geographic', icon: <MapPin size={14} /> },
                    { key: 'timeline', label: 'Timeline', icon: <Calendar size={14} /> },
                    { key: 'top-investments', label: 'Top Investments', icon: <DollarSign size={14} /> },
                    { key: 'unrealized', label: 'Unrealized Gains', icon: <TrendingUp size={14} /> },
                    { key: 'team', label: 'Team Performance', icon: <Users size={14} /> },
                ] as { key: AnalyticsSection; label: string; icon: React.ReactNode }[]).map(item => (
                    <button
                        key={item.key}
                        className={`portfolio-analytics-nav-btn ${analyticsSection === item.key ? 'active' : ''}`}
                        onClick={() => setAnalyticsSection(item.key)}
                    >
                        {item.icon} {item.label}
                    </button>
                ))}
            </div>

            {/* Returns Dashboard */}
            {analyticsSection === 'returns' && (
                <div>
                    <div className="portfolio-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Portfolio XIRR</span>
                                <span className="portfolio-kpi-value" style={{ color: metrics.avgXIRR >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    {formatPercent(metrics.avgXIRR)}
                                </span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Blended MOIC</span>
                                <span className="portfolio-kpi-value">{formatMOIC(metrics.avgMOIC)}</span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">DPI</span>
                                <span className="portfolio-kpi-value">{formatMOIC(metrics.dpi)}</span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">TVPI</span>
                                <span className="portfolio-kpi-value">{formatMOIC(metrics.tvpi)}</span>
                            </div>
                        </div>
                    </div>

                    {/* MOIC by Vintage Year */}
                    <div className="portfolio-section-card" style={{ marginTop: 24 }}>
                        <h3 className="portfolio-section-title">MOIC by Vintage Year</h3>
                        {vintageData.length > 0 ? (
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <BarChart data={vintageData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <Tooltip
                                            formatter={fmtCurrencyOrMOIC}
                                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        />
                                        <Bar dataKey="moic" name="MOIC" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="portfolio-empty-chart">No vintage data available</div>
                        )}
                    </div>

                    {/* MOIC by Stage */}
                    <div className="portfolio-section-card" style={{ marginTop: 24 }}>
                        <h3 className="portfolio-section-title">MOIC by Stage</h3>
                        {moicByStage.length > 0 ? (
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <BarChart data={moicByStage}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <Tooltip formatter={fmtMOIC} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Bar dataKey="moic" name="MOIC" radius={[4, 4, 0, 0]}>
                                            {moicByStage.map((d, i) => (
                                                <Cell key={i} fill={STAGE_COLORS[d.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="portfolio-empty-chart">No stage MOIC data available</div>
                        )}
                    </div>

                    {/* Health Indicators */}
                    <div className="portfolio-kpi-grid" style={{ marginTop: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-icon" style={{ background: 'var(--info-bg)' }}>
                                <Clock size={18} style={{ color: 'var(--info)' }} />
                            </div>
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Avg Holding Period</span>
                                <span className="portfolio-kpi-value">{healthIndicators.avgHolding.toFixed(1)} yrs</span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-icon" style={{ background: 'var(--success-bg)' }}>
                                <Shield size={18} style={{ color: 'var(--success)' }} />
                            </div>
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Primary Investments</span>
                                <span className="portfolio-kpi-value">{healthIndicators.highOwnership}</span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-icon" style={{ background: 'var(--warning-bg)' }}>
                                <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
                            </div>
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Need Attention</span>
                                <span className="portfolio-kpi-value">{healthIndicators.needAttention}</span>
                            </div>
                        </div>
                        <div className="portfolio-kpi-card">
                            <div className="portfolio-kpi-icon" style={{ background: 'var(--danger-bg)' }}>
                                <Target size={18} style={{ color: 'var(--danger)' }} />
                            </div>
                            <div className="portfolio-kpi-content">
                                <span className="portfolio-kpi-label">Capital at Risk</span>
                                <span className="portfolio-kpi-value">{formatLargeCurrency(healthIndicators.capitalAtRisk)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Vintage Analysis */}
            {analyticsSection === 'vintage' && (
                <div>
                    <div className="portfolio-section-card">
                        <h3 className="portfolio-section-title">Vintage Year Analysis</h3>
                        {vintageData.length > 0 ? (
                            <>
                                <div style={{ width: '100%', height: 300 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={vintageData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={v => formatCurrency(v)} />
                                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                            <Tooltip
                                                formatter={fmtCurrencyOrMOIC}
                                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                            />
                                            <Legend />
                                            <Bar yAxisId="left" dataKey="invested" name="Invested" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                            <Bar yAxisId="left" dataKey="value" name="Current Value" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            <Line yAxisId="right" type="monotone" dataKey="moic" name="MOIC" stroke="#f59e0b" strokeWidth={2} dot />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Vintage table */}
                                <div className="table-container" style={{ marginTop: 20 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Vintage Year</th>
                                                <th>Deals</th>
                                                <th>Total Invested</th>
                                                <th>Current Value</th>
                                                <th>MOIC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vintageData.map(v => (
                                                <tr key={v.year}>
                                                    <td style={{ fontWeight: 600 }}>{v.year}</td>
                                                    <td>{v.deals}</td>
                                                    <td>{formatLargeCurrency(v.invested)}</td>
                                                    <td>{formatLargeCurrency(v.value)}</td>
                                                    <td>
                                                        <span style={{ color: v.moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                            {formatMOIC(v.moic)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className="portfolio-empty-chart">No vintage data available</div>
                        )}
                    </div>
                </div>
            )}

            {/* Industry & Stage */}
            {analyticsSection === 'industry' && (
                <div className="portfolio-two-col">
                    <div className="portfolio-section-card">
                        <h3 className="portfolio-section-title">Investment by Industry</h3>
                        {industryData.length > 0 ? (
                            <>
                                <div style={{ width: '100%', height: 280 }}>
                                    <ResponsiveContainer>
                                        <RechartsPieChart>
                                            <Pie data={industryData} dataKey="invested" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                                                {industryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip formatter={fmtCurrency} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="table-container" style={{ marginTop: 16 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Industry</th>
                                                <th>Companies</th>
                                                <th>Invested</th>
                                                <th>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {industryData.map((d, i) => (
                                                <tr key={d.name}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div className="portfolio-legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                            {d.name}
                                                        </div>
                                                    </td>
                                                    <td>{d.count}</td>
                                                    <td>{formatLargeCurrency(d.invested)}</td>
                                                    <td>{formatLargeCurrency(d.value)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className="portfolio-empty-chart">No industry data</div>
                        )}
                    </div>

                    <div className="portfolio-section-card">
                        <h3 className="portfolio-section-title">Portfolio by Stage</h3>
                        {stageData.length > 0 ? (
                            <>
                                <div style={{ width: '100%', height: 280 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={stageData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={v => formatCurrency(v)} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={90} />
                                            <Tooltip formatter={fmtCurrency} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                            <Legend />
                                            <Bar dataKey="invested" name="Invested" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                            <Bar dataKey="value" name="Value" fill="#10b981" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="table-container" style={{ marginTop: 16 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Stage</th>
                                                <th>Companies</th>
                                                <th>Invested</th>
                                                <th>Value</th>
                                                <th>MOIC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stageData.map(d => (
                                                <tr key={d.name}>
                                                    <td><span className="badge badge-info">{d.name}</span></td>
                                                    <td>{d.count}</td>
                                                    <td>{formatLargeCurrency(d.invested)}</td>
                                                    <td>{formatLargeCurrency(d.value)}</td>
                                                    <td>
                                                        <span style={{ fontWeight: 600, color: d.invested > 0 && d.value / d.invested >= 1 ? 'var(--success)' : 'var(--danger)' }}>
                                                            {d.invested > 0 ? formatMOIC(d.value / d.invested) : '--'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className="portfolio-empty-chart">No stage data</div>
                        )}
                    </div>
                </div>
            )}

            {/* Geographic Distribution */}
            {analyticsSection === 'geography' && (
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <MapPin size={16} /> Geographic Distribution
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                        Distribution based on deal source and industry concentration
                    </p>
                    <div className="portfolio-two-col">
                        <div>
                            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>By Deal Source</h4>
                            {(() => {
                                const sourceMap = new Map<string, { count: number; invested: number }>();
                                portfolioCompanies.forEach(c => {
                                    const src = c.dealSourceType;
                                    const existing = sourceMap.get(src) || { count: 0, invested: 0 };
                                    existing.count += 1;
                                    existing.invested += c.totalFundRaise || 0;
                                    sourceMap.set(src, existing);
                                });
                                const data = Array.from(sourceMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
                                return (
                                    <div style={{ width: '100%', height: 250 }}>
                                        <ResponsiveContainer>
                                            <RechartsPieChart>
                                                <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                                                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                            </RechartsPieChart>
                                        </ResponsiveContainer>
                                    </div>
                                );
                            })()}
                        </div>
                        <div>
                            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>By Share Type</h4>
                            {(() => {
                                const typeMap = new Map<string, number>();
                                portfolioCompanies.forEach(c => {
                                    typeMap.set(c.shareType, (typeMap.get(c.shareType) || 0) + 1);
                                });
                                const data = Array.from(typeMap.entries()).map(([name, count]) => ({ name, count }));
                                return (
                                    <div style={{ width: '100%', height: 250 }}>
                                        <ResponsiveContainer>
                                            <RechartsPieChart>
                                                <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                                                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i + 3 % CHART_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                            </RechartsPieChart>
                                        </ResponsiveContainer>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Investment Timeline */}
            {analyticsSection === 'timeline' && (
                <div>
                    <div className="portfolio-section-card">
                        <h3 className="portfolio-section-title">
                            <Calendar size={16} /> Portfolio Value Over Time
                        </h3>
                        {portfolioValueOverTime.length > 1 ? (
                            <div style={{ width: '100%', height: 350 }}>
                                <ResponsiveContainer>
                                    <AreaChart data={portfolioValueOverTime}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={v => formatCurrency(v)} />
                                        <Tooltip formatter={fmtCurrency} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Legend />
                                        <Area type="monotone" dataKey="value" name="Portfolio Value" stroke="#6366f1" fill="rgba(99,102,241,0.15)" />
                                        <Area type="monotone" dataKey="invested" name="Total Invested" stroke="#10b981" fill="rgba(16,185,129,0.1)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="portfolio-empty-chart">Need more data points to show trends</div>
                        )}
                    </div>

                    <div className="portfolio-section-card" style={{ marginTop: 24 }}>
                        <h3 className="portfolio-section-title">
                            <BarChart3 size={16} /> Investment Timeline by Year
                        </h3>
                        {timelineData.length > 0 ? (
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart data={timelineData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={v => formatCurrency(v)} />
                                        <Tooltip formatter={fmtCurrency} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Bar dataKey="amount" name="Amount Invested" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="portfolio-empty-chart">No timeline data available</div>
                        )}
                    </div>
                </div>
            )}

            {/* Top Investments */}
            {analyticsSection === 'top-investments' && (
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <DollarSign size={16} /> Top Investments by Amount
                    </h3>
                    {topInvestments.length > 0 ? (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Company</th>
                                        <th>Round</th>
                                        <th>Industry</th>
                                        <th>Amount Invested</th>
                                        <th>Current Valuation</th>
                                        <th>MOIC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topInvestments.map((c, idx) => {
                                        const moic = c.totalFundRaise && c.valuation ? calcMOIC(c.totalFundRaise, c.valuation) : null;
                                        return (
                                            <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                                <td style={{ fontWeight: 700, color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                                            {c.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="table-company-name">{c.companyName}</span>
                                                    </div>
                                                </td>
                                                <td><span className="badge badge-info">{c.companyRound}</span></td>
                                                <td>{getIndustryById(c.industryId)?.name || '--'}</td>
                                                <td style={{ fontWeight: 600 }}>{formatLargeCurrency(c.totalFundRaise!)}</td>
                                                <td>{c.valuation ? formatLargeCurrency(c.valuation) : '--'}</td>
                                                <td>
                                                    {moic !== null ? (
                                                        <span style={{ color: moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                            {formatMOIC(moic)}
                                                        </span>
                                                    ) : '--'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="portfolio-empty-chart">No investment data available</div>
                    )}
                </div>
            )}

            {/* Unrealized Gains */}
            {analyticsSection === 'unrealized' && (
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <TrendingUp size={16} /> Unrealized Gains
                    </h3>
                    {unrealizedGains.length > 0 ? (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Company</th>
                                        <th>Invested</th>
                                        <th>Current Value</th>
                                        <th>Unrealized Gain</th>
                                        <th>MOIC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unrealizedGains.map((c, idx) => (
                                        <tr key={c.id} onClick={() => setSelectedCompany(c)} style={{ cursor: 'pointer' }}>
                                            <td style={{ fontWeight: 700, color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                                        {c.companyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="table-company-name">{c.companyName}</span>
                                                </div>
                                            </td>
                                            <td>{formatLargeCurrency(c.totalFundRaise!)}</td>
                                            <td>{formatLargeCurrency(c.valuation!)}</td>
                                            <td>
                                                <span style={{ color: c.gain >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                    {c.gain >= 0 ? '+' : ''}{formatLargeCurrency(Math.abs(c.gain))}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ color: c.moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                    {formatMOIC(c.moic)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="portfolio-empty-chart">No data available for unrealized gains</div>
                    )}
                </div>
            )}

            {/* Team Performance */}
            {analyticsSection === 'team' && (
                <div className="portfolio-section-card">
                    <h3 className="portfolio-section-title">
                        <Users size={16} /> Team Performance by Deal Sourcer
                    </h3>
                    {teamPerformance.length > 0 ? (
                        <>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart data={teamPerformance}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Legend />
                                        <Bar dataKey="deals" name="Deals" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="table-container" style={{ marginTop: 20 }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Team Member</th>
                                            <th>Deals</th>
                                            <th>Total Invested</th>
                                            <th>Current Value</th>
                                            <th>MOIC</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teamPerformance.map(tp => (
                                            <tr key={tp.name}>
                                                <td style={{ fontWeight: 600 }}>{tp.name}</td>
                                                <td>{tp.deals}</td>
                                                <td>{formatLargeCurrency(tp.invested)}</td>
                                                <td>{formatLargeCurrency(tp.value)}</td>
                                                <td>
                                                    <span style={{ color: tp.moic >= 1 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                        {formatMOIC(tp.moic)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="portfolio-empty-chart">No team performance data available</div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <>
            <TopHeader title="Portfolio" subtitle={`${portfolioCompanies.length} invested companies`} />
            <div className="page-content page-enter">
                {/* Tab Navigation */}
                <div className="portfolio-tabs">
                    <button
                        className={`portfolio-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <BarChart3 size={15} /> Dashboard
                    </button>
                    <button
                        className={`portfolio-tab ${activeTab === 'companies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('companies')}
                    >
                        <Building2 size={15} /> Companies
                    </button>
                    <button
                        className={`portfolio-tab ${activeTab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <TrendingUp size={15} /> Analytics
                    </button>
                </div>

                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'companies' && renderCompanies()}
                {activeTab === 'analytics' && renderAnalytics()}
            </div>
        </>
    );
}

export default function PortfolioPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <PortfolioContent />
            </main>
            <CompanyDetail />
            <RejectionFlow />
            <EmailCompose />
            <CalendarInvite />
            <CompanyForm />
        </div>
    );
}
