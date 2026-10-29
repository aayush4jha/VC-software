// Live share prices for the listed companies in the portfolio, read from the
// Google Finance quote page the team links to.
//
// Google Finance has no API. Its quote page ships the quote as data embedded
// in the HTML — ticker, name, currency, then [price, change, change %], the
// previous close, and the time of the last trade in seconds — and that is
// what is read here. Pure, so it can be tested on a saved page.

export interface StockQuote {
    /** "SWIGGY:NSE" — the ticker and exchange, as Google writes them. */
    symbol: string;
    name: string;
    currency: string;
    price: number;
    change: number;
    changePct: number;
    previousClose: number | null;
    dayLow: number | null;
    dayHigh: number | null;
    /** When the last trade happened, ISO. */
    tradedAt: string | null;
    /** The page it was read from, to open it. */
    url: string;
}

/** "https://www.google.com/finance/quote/SWIGGY:NSE?hl=en" → "SWIGGY:NSE". Also takes the symbol itself. */
export function symbolFromQuoteUrl(input: string | null | undefined): string | null {
    const raw = (input || '').trim();
    if (!raw) return null;
    const fromUrl = raw.match(/\/finance\/quote\/([A-Za-z0-9.&_-]+:[A-Za-z0-9_]+)/);
    const symbol = fromUrl ? fromUrl[1] : /^[A-Za-z0-9.&_-]+:[A-Za-z0-9_]+$/.test(raw) ? raw : null;
    return symbol ? symbol.toUpperCase() : null;
}

export const quoteUrl = (symbol: string) => `https://www.google.com/finance/quote/${symbol}`;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM = '(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)';

export function parseGoogleFinanceQuote(html: string, symbol: string): StockQuote | null {
    const [ticker, exchange] = symbol.split(':');
    if (!ticker || !exchange) return null;
    const id = `\\["${esc(ticker)}","${esc(exchange)}"\\]`;

    // ["SWIGGY","NSE"],"Swiggy Ltd",0,"INR",[185.25,1.75,0.95,2,2,2],null,183.5,"#e94900","IN","/g/…",[1793269771]
    const quote = html.match(new RegExp(
        `${id},"((?:[^"\\\\]|\\\\.)*)",\\d+,"([A-Z]{3})",\\[${NUM},${NUM},${NUM}[^\\]]*\\],(?:null|${NUM}),${NUM}`
        + `(?:,"[^"]*","[^"]*","[^"]*",\\[(\\d+)\\])?`,
    ));
    if (!quote) return null;
    const [, name, currency, price, change, changePct, , previousClose, tradedAt] = quote;

    // [null,["SWIGGY","NSE"]],null,184,"/g/…",181,185.85,185.25 — open, low, high, price.
    const range = html.match(new RegExp(`\\[null,${id}\\],null,${NUM},"[^"]*",${NUM},${NUM}`));

    const n = (v: string | undefined) => (v === undefined ? null : Number(v));
    const p = Number(price);
    if (!isFinite(p)) return null;
    return {
        symbol,
        name: JSON.parse(`"${name}"`),
        currency,
        price: p,
        change: Number(change),
        changePct: Number(changePct),
        previousClose: n(previousClose),
        dayLow: range ? Number(range[2]) : null,
        dayHigh: range ? Number(range[3]) : null,
        tradedAt: tradedAt ? new Date(Number(tradedAt) * 1000).toISOString() : null,
        url: quoteUrl(symbol),
    };
}
