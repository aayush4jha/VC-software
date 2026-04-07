'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, ExternalLink, Newspaper, RefreshCw, TrendingUp } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';

interface NewsArticle {
    id: string;
    title: string;
    link: string;
    source: string;
    publishedAt: string;
    snippet: string;
    company: string;
    category: string;
    sentiment: 'positive' | 'neutral' | 'negative';
}

const CATEGORIES = ['All', 'Funding', 'Product', 'Leadership', 'M&A', 'Partnership', 'Awards', 'General'];
const CATEGORY_COLORS: Record<string, string> = {
    Funding: '#10b981', Product: '#3b82f6', Leadership: '#8b5cf6',
    'M&A': '#f59e0b', Partnership: '#06b6d4', Awards: '#ec4899', General: '#64748b',
};
const SENTIMENT_COLORS = { positive: '#10b981', neutral: '#64748b', negative: '#ef4444' };

function NewsContent() {
    const { companies } = useAppContext();
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterCompany, setFilterCompany] = useState('');

    // Fetch news for portfolio + active pipeline companies
    const portfolioCompanies = companies.filter(c => c.terminalStatus === 'Portfolio' || !c.terminalStatus);

    const fetchNews = useCallback(async () => {
        if (portfolioCompanies.length === 0) return;
        setLoading(true);
        setError(null);
        try {
            // Limit to top 20 companies (API caps at 20 too)
            const names = portfolioCompanies.slice(0, 20).map(c => c.companyName);
            const res = await fetch('/api/news', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companies: names }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); return; }
            setArticles(data.articles || []);
        } catch { setError('Network error'); }
        setLoading(false);
    }, [portfolioCompanies.length]);

    useEffect(() => {
        if (portfolioCompanies.length > 0 && articles.length === 0 && !loading) {
            fetchNews();
        }
    }, [portfolioCompanies.length, articles.length, loading, fetchNews]);

    const filtered = articles.filter(a => {
        if (filterCategory !== 'All' && a.category !== filterCategory) return false;
        if (filterCompany && a.company !== filterCompany) return false;
        if (search) {
            const q = search.toLowerCase();
            return a.title.toLowerCase().includes(q) || a.snippet.toLowerCase().includes(q) || a.company.toLowerCase().includes(q);
        }
        return true;
    });

    // Compute sentiment counts
    const sentimentCounts = articles.reduce((acc, a) => {
        acc[a.sentiment] = (acc[a.sentiment] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <>
            <TopHeader title="News & Updates" subtitle={`${filtered.length} articles from ${portfolioCompanies.length} companies`} />
            <div className="page-content page-enter" style={{ padding: 24 }}>
                {/* Sentiment overview */}
                {articles.length > 0 && (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', flex: '1 1 180px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Articles</div>
                            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{articles.length}</div>
                        </div>
                        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', flex: '1 1 180px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Positive</div>
                            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#10b981' }}>{sentimentCounts.positive || 0}</div>
                        </div>
                        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', flex: '1 1 180px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Negative</div>
                            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#ef4444' }}>{sentimentCounts.negative || 0}</div>
                        </div>
                        <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', flex: '1 1 180px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Companies Tracked</div>
                            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{new Set(articles.map(a => a.company)).size}</div>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 250px', maxWidth: 350 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input className="search-input" placeholder="Search news..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: '100%' }} />
                    </div>
                    <select className="form-input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 160, fontSize: 13, height: 36 }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="form-input" value={filterCompany} onChange={e => setFilterCompany(e.target.value)} style={{ width: 200, fontSize: 13, height: 36 }}>
                        <option value="">All companies</option>
                        {[...new Set(articles.map(a => a.company))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={fetchNews} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                </div>

                {/* News list */}
                {loading && articles.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 8, color: 'var(--text-tertiary)' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Fetching news from Google News...
                    </div>
                ) : error ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Newspaper size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                        <div style={{ fontWeight: 600 }}>No news found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting filters or refreshing</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filtered.map(article => (
                            <a
                                key={article.id}
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'block', padding: 16,
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 12, textDecoration: 'none', color: 'inherit',
                                    transition: 'all 0.15s', borderLeft: `3px solid ${SENTIMENT_COLORS[article.sentiment]}`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                background: `${CATEGORY_COLORS[article.category] || '#64748b'}15`,
                                                color: CATEGORY_COLORS[article.category] || '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '0.5px',
                                            }}>{article.category}</span>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>{article.company}</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>•</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{article.source}</span>
                                            {article.publishedAt && (
                                                <>
                                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>•</span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                        {new Date(article.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
                                            {article.title}
                                        </div>
                                        {article.snippet && (
                                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                                {article.snippet}
                                            </div>
                                        )}
                                    </div>
                                    <ExternalLink size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

export default function NewsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <NewsContent />
            </main>
        </div>
    );
}
