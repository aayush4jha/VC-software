'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, Settings2, X, Loader2, Trash2, Plus } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { symbolFromQuoteUrl, quoteUrl, type StockQuote } from '@/lib/stock-quote';
import type { Company } from '@/types/database';

/** How often an open page asks for new prices. */
const REFRESH_MS = 30_000;

/** A trade this recent means the market is open and the price is moving. */
const LIVE_WINDOW_MS = 5 * 60_000;

const price = (n: number, currency = 'INR') =>
    n.toLocaleString('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(n: number): string {
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
    return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Latest prices for these symbols, refreshed while the page is in view. */
function useStockQuotes(symbols: string[]) {
    const [quotes, setQuotes] = useState<Record<string, StockQuote | null>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    // When the prices were last asked for, to tell a live price from a close.
    const [checkedAt, setCheckedAt] = useState(0);
    const key = symbols.join(',');

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        const load = async () => {
            if (document.visibilityState === 'hidden') return;
            setLoading(true);
            try {
                const j = await fetch(`/api/stock-quotes?symbols=${encodeURIComponent(key)}`).then(r => r.json());
                if (cancelled) return;
                const fresh = Object.entries((j.quotes || {}) as Record<string, StockQuote | null>).filter(([, q]) => q);
                setQuotes(prev => ({ ...prev, ...Object.fromEntries(fresh) }));
                setErrors(j.errors || {});
                setCheckedAt(Date.now());
            } catch { /* keep the last prices; the next tick tries again */ }
            finally { if (!cancelled) setLoading(false); }
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        const onShow = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onShow);
        return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
    }, [key]);

    return { quotes, errors, loading, checkedAt };
}

/** What we hold of a company, and what we paid for it. */
function holding(c: Company) {
    const shares = c.numShares || c.noOfShares || 0;
    const invested = c.initialInvestment || (shares && c.sharePrice ? shares * c.sharePrice : 0);
    return { shares, invested };
}

/**
 * The listed companies in the portfolio, at their live share price: the
 * price and today's move, and our holding at that price against what we put
 * in. A company appears here once it has a Google Finance link.
 */
export default function ListedHoldings() {
    const { companies } = useAppContext();
    const [managing, setManaging] = useState(false);

    const portfolio = useMemo(() => companies.filter(c => c.terminalStatus === 'Portfolio'), [companies]);
    const listed = useMemo(() => portfolio
        .map(c => ({ company: c, symbol: symbolFromQuoteUrl(c.stockQuoteUrl) }))
        .filter((l): l is { company: Company; symbol: string } => !!l.symbol), [portfolio]);
    const { quotes, errors, loading, checkedAt } = useStockQuotes(listed.map(l => l.symbol));

    const totals = listed.reduce((t, l) => {
        const q = quotes[l.symbol];
        const { shares, invested } = holding(l.company);
        if (!q || !shares) return t;
        return { value: t.value + shares * q.price, invested: t.invested + invested, today: t.today + shares * q.change };
    }, { value: 0, invested: 0, today: 0 });

    return (
        <section className="listed-holdings">
            <div className="listed-holdings-head">
                <div>
                    <h3>Listed holdings <span className="listed-live-dot" title={`Refreshes every ${REFRESH_MS / 1000} seconds`} /></h3>
                    <p>Live share prices from Google Finance, refreshed every {REFRESH_MS / 1000} seconds.</p>
                </div>
                {totals.value > 0 && (
                    <div className="listed-holdings-totals">
                        <div><span>Holding value</span><strong>{money(totals.value)}</strong></div>
                        <div><span>Invested</span><strong>{money(totals.invested)}</strong></div>
                        <div><span>Today</span><strong className={totals.today >= 0 ? 'up' : 'down'}>{totals.today >= 0 ? '+' : ''}{money(totals.today)}</strong></div>
                    </div>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManaging(true)}>
                    <Settings2 size={14} /> Manage
                </button>
            </div>

            {listed.length === 0 ? (
                <div className="listed-holdings-empty">
                    No listed companies yet. <button type="button" onClick={() => setManaging(true)}>Add a Google Finance link</button> to a portfolio company to see its live price here.
                </div>
            ) : (
                <div className="listed-holdings-grid">
                    {listed.map(({ company, symbol }) => (
                        <StockCard key={company.id} company={company} symbol={symbol}
                            quote={quotes[symbol] ?? null} error={errors[symbol]} loading={loading} checkedAt={checkedAt} />
                    ))}
                </div>
            )}

            {managing && <ManageListed portfolio={portfolio} onClose={() => setManaging(false)} />}
        </section>
    );
}

function StockCard({ company, symbol, quote, error, loading, checkedAt }: {
    company: Company; symbol: string; quote: StockQuote | null; error?: string; loading: boolean; checkedAt: number;
}) {
    const { shares, invested } = holding(company);
    if (!quote) {
        return (
            <div className="stock-card">
                <div className="stock-card-head"><strong>{company.companyName}</strong><span className="stock-card-symbol">{symbol}</span></div>
                <div className="stock-card-wait">
                    {error ? <span style={{ color: 'var(--danger)' }}>{error}</span> : loading ? <><Loader2 size={14} className="spin" /> Fetching price…</> : 'No price yet'}
                </div>
            </div>
        );
    }
    const up = quote.change >= 0;
    const live = !!quote.tradedAt && checkedAt - new Date(quote.tradedAt).getTime() < LIVE_WINDOW_MS;
    const value = shares * quote.price;
    const gain = invested ? value - invested : null;

    return (
        <div className="stock-card">
            <div className="stock-card-head">
                <strong>{company.companyName}</strong>
                <a className="stock-card-symbol" href={quote.url} target="_blank" rel="noreferrer" title="Open on Google Finance">
                    {symbol} <ExternalLink size={11} />
                </a>
            </div>
            <div className="stock-card-price">
                <span>{price(quote.price, quote.currency)}</span>
                <span className={`stock-card-change ${up ? 'up' : 'down'}`}>
                    {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {up ? '+' : ''}{quote.change.toFixed(2)} ({up ? '+' : ''}{quote.changePct.toFixed(2)}%)
                </span>
            </div>
            <div className="stock-card-status">
                <span className={`stock-card-market ${live ? 'live' : ''}`}>{live ? 'Live' : 'Market closed'}</span>
                {quote.tradedAt && <span>Last trade {time(quote.tradedAt)}</span>}
                {error && <span title={error} style={{ color: 'var(--warning)' }}>· not refreshed</span>}
            </div>
            {(quote.dayLow != null || quote.previousClose != null) && (
                <div className="stock-card-range">
                    {quote.dayLow != null && quote.dayHigh != null && <span>Day {price(quote.dayLow, quote.currency)} – {price(quote.dayHigh, quote.currency)}</span>}
                    {quote.previousClose != null && <span>Prev close {price(quote.previousClose, quote.currency)}</span>}
                </div>
            )}
            {shares > 0 && (
                <div className="stock-card-holding">
                    <div><span>Our {shares.toLocaleString('en-IN')} shares</span><strong>{money(value)}</strong></div>
                    {invested > 0 && <div><span>Invested{company.sharePrice ? ` @ ${price(company.sharePrice)}` : ''}</span><strong>{money(invested)}</strong></div>}
                    {gain != null && (
                        <div>
                            <span>Gain / loss</span>
                            <strong className={gain >= 0 ? 'up' : 'down'}>
                                {gain >= 0 ? '+' : ''}{money(gain)} · {(value / invested).toFixed(2)}x
                            </strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Which portfolio companies are listed, and the Google Finance link for each. */
function ManageListed({ portfolio, onClose }: { portfolio: Company[]; onClose: () => void }) {
    const { updateCompany } = useAppContext();
    const [companyId, setCompanyId] = useState('');
    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const listed = portfolio.filter(c => symbolFromQuoteUrl(c.stockQuoteUrl));
    const unlisted = portfolio.filter(c => !symbolFromQuoteUrl(c.stockQuoteUrl)).sort((a, b) => a.companyName.localeCompare(b.companyName));

    const save = async (id: string, url: string | null) => {
        setBusy(true); setProblem(null);
        const { error, dropped } = await updateCompany(id, { stockQuoteUrl: url });
        setBusy(false);
        if (dropped.includes('stock_quote_url')) { setProblem('Run supabase/stock-quote-url.sql in the Supabase SQL editor first.'); return false; }
        if (error) { setProblem(error); return false; }
        return true;
    };

    const add = async () => {
        const symbol = symbolFromQuoteUrl(link);
        if (!companyId) { setProblem('Pick the company.'); return; }
        if (!symbol) { setProblem('Paste a Google Finance quote link, like https://www.google.com/finance/quote/SWIGGY:NSE'); return; }
        if (await save(companyId, quoteUrl(symbol))) { setCompanyId(''); setLink(''); }
    };

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
                <div className="modal-header">
                    <div className="modal-title">Listed companies</div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <div className="listed-manage-add">
                        <select className="form-input" value={companyId} onChange={e => setCompanyId(e.target.value)}>
                            <option value="">Portfolio company…</option>
                            {unlisted.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                        </select>
                        <input className="form-input" value={link} onChange={e => setLink(e.target.value)}
                            placeholder="https://www.google.com/finance/quote/TICKER:NSE"
                            onKeyDown={e => { if (e.key === 'Enter') add(); }} />
                        <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={busy}>
                            {busy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Add
                        </button>
                    </div>
                    {problem && <div className="listed-manage-problem">{problem}</div>}

                    {listed.length === 0 ? (
                        <div className="listed-holdings-empty" style={{ padding: '16px 0' }}>No company has a link yet.</div>
                    ) : (
                        <div className="listed-manage-list">
                            {listed.map(c => (
                                <div key={c.id} className="listed-manage-row">
                                    <strong>{c.companyName}</strong>
                                    <a href={c.stockQuoteUrl!} target="_blank" rel="noreferrer">{symbolFromQuoteUrl(c.stockQuoteUrl)} <ExternalLink size={11} /></a>
                                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} title="Stop tracking"
                                        aria-label={`Remove ${c.companyName}`} onClick={() => save(c.id, null)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
