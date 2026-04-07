import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser } from '@/lib/auth-helpers';

interface NewsArticle {
    id: string;
    title: string;
    link: string;
    source: string;
    publishedAt: string;
    snippet: string;
    company: string;
    category: string;
}

// Categorize news based on title/snippet keywords
function categorize(text: string): string {
    const lower = text.toLowerCase();
    if (/raise|raised|funding|seed|series [a-z]|round|valuation|investor/i.test(lower)) return 'Funding';
    if (/launch|product|release|unveil|introduces?|debut/i.test(lower)) return 'Product';
    if (/ceo|cto|cfo|founder|hire|appoint|join|leadership|leaves/i.test(lower)) return 'Leadership';
    if (/acqui|merger|acquired|buyout/i.test(lower)) return 'M&A';
    if (/partnership|partner|deal|signed|agreement/i.test(lower)) return 'Partnership';
    if (/award|recognized|wins|named|top/i.test(lower)) return 'Awards';
    return 'General';
}

// Sentiment based on simple keyword matching
function detectSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const lower = text.toLowerCase();
    const positive = /raise|raised|launch|win|wins|growth|profit|expansion|success|award|partnership|milestone/i;
    const negative = /lay.?off|fired|fraud|lawsuit|scandal|loss|fail|controversy|investigat|decline|crisis|shutdown/i;
    if (negative.test(lower)) return 'negative';
    if (positive.test(lower)) return 'positive';
    return 'neutral';
}

// Parse Google News RSS XML
function parseRSS(xml: string, companyName: string): NewsArticle[] {
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const tagRegex = (tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);

    let match;
    let i = 0;
    while ((match = itemRegex.exec(xml)) !== null && i < 30) {
        const item = match[1];
        const titleMatch = item.match(tagRegex('title'));
        const linkMatch = item.match(tagRegex('link'));
        const pubMatch = item.match(tagRegex('pubDate'));
        const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
        const descMatch = item.match(tagRegex('description'));

        if (!titleMatch) continue;

        const stripCDATA = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        const decodeEntities = (s: string) => s
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
            .replace(/&[a-z]+;/gi, ' ');
        const stripAll = (s: string) =>
            decodeEntities(stripCDATA(s))
                .replace(/<[^>]+>/g, ' ')      // strip HTML tags
                .replace(/<[^>]*$/, ' ')        // strip dangling open tag
                .replace(/^[^>]*>/, ' ')        // strip dangling close tag
                .replace(/\s+/g, ' ')
                .trim();

        const title = stripAll(titleMatch[1]);
        const link = linkMatch ? linkMatch[1].trim() : '';
        const pubDate = pubMatch ? pubMatch[1].trim() : '';
        const source = sourceMatch ? stripAll(sourceMatch[1]) : 'Google News';

        // Strip HTML from description (Google News uses HTML lists in description)
        const rawDesc = descMatch ? descMatch[1] : '';
        const snippet = stripAll(rawDesc).slice(0, 200);

        articles.push({
            id: `${companyName}-${i}-${pubDate}`,
            title,
            link,
            source,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : '',
            snippet,
            company: companyName,
            category: categorize(title + ' ' + snippet),
        });
        i++;
    }
    return articles;
}

async function fetchNewsForCompany(companyName: string): Promise<NewsArticle[]> {
    try {
        const query = encodeURIComponent(`"${companyName}"`);
        const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DholakiaVC/1.0)' },
            next: { revalidate: 1800 }, // cache for 30 min
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSS(xml, companyName);
    } catch (e) {
        console.error(`[news] Failed for ${companyName}:`, (e as Error).message);
        return [];
    }
}

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { companies } = await request.json();
    if (!Array.isArray(companies) || companies.length === 0) {
        return NextResponse.json({ error: 'companies array required' }, { status: 400 });
    }

    // Fetch news for each company in parallel (capped at 20 to prevent abuse)
    const results = await Promise.all(
        companies.slice(0, 20).map(c => fetchNewsForCompany(c)),
    );

    // Flatten and sort by date
    const allArticles: (NewsArticle & { sentiment: string })[] = [];
    for (const articles of results) {
        for (const a of articles) {
            allArticles.push({ ...a, sentiment: detectSentiment(a.title + ' ' + a.snippet) });
        }
    }
    allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return NextResponse.json({ articles: allArticles });
}
