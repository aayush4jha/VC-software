import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { parseGoogleFinanceQuote, quoteUrl, symbolFromQuoteUrl, type StockQuote } from '@/lib/stock-quote';

// Everyone with Portfolio open polls this. Asking Google once per symbol
// every few seconds, rather than once per open tab, keeps the page from being
// throttled — and a price a few seconds old is still the live price.
const FRESH_MS = 20_000;
const cache = new Map<string, { at: number; quote: StockQuote | null; error?: string }>();

async function fetchQuote(symbol: string): Promise<{ quote: StockQuote | null; error?: string }> {
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit;
    try {
        const res = await fetch(`${quoteUrl(symbol)}?hl=en`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Google Finance answered ${res.status}`);
        const quote = parseGoogleFinanceQuote(await res.text(), symbol);
        const entry = { at: Date.now(), quote, error: quote ? undefined : 'No price on that page — check the link' };
        cache.set(symbol, entry);
        return entry;
    } catch (e) {
        // Keep showing the last price we had rather than nothing.
        if (hit?.quote) return { quote: hit.quote, error: `Could not refresh: ${(e as Error).message}` };
        return { quote: null, error: (e as Error).message };
    }
}

/** GET ?symbols=SWIGGY:NSE,JARO:NSE (links work too) — the latest price for each. */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    const raw = new URL(request.url).searchParams.get('symbols') || '';
    const symbols = [...new Set(raw.split(',').map(s => symbolFromQuoteUrl(s)).filter((s): s is string => !!s))].slice(0, 50);
    if (!symbols.length) return NextResponse.json({ quotes: {} });

    const results = await Promise.all(symbols.map(async s => [s, await fetchQuote(s)] as const));
    return NextResponse.json({
        quotes: Object.fromEntries(results.map(([s, r]) => [s, r.quote])),
        errors: Object.fromEntries(results.filter(([, r]) => r.error).map(([s, r]) => [s, r.error])),
        fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
}
