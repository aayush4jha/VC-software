// The yearly investment picture, as Sheet1 of the requirements lays it out.
//
//   Year | Direct | Fund | Syndicate | Total Investment | Exits | Writeoffs |
//   Net Investment | Cumulative | Profit/Loss | Market Value | NAV
//
// Every column is derived from two sheets the firm already keeps — one of
// investments and one of exits and write-offs — so the table is a view of
// those rows rather than a third place the same figures are typed.
//
// Pure, pinned by scripts/verify-fund-portfolio.mjs.

import { parseMoney, parsePercent, type CellMatrix } from './legal-import';
import { columnFor, detectDateOrder, parseDateWith } from './master-import';

export type FundType = 'Direct' | 'Fund' | 'Syndicate' | 'Other';

export interface PortfolioInvestment {
    status: string;
    fundType: FundType;
    investedFrom: string;
    investedOn: string | null;
    stage: string;
    company: string;
    amount: number;
    postMoney: number | null;
    totalEquityPct: number | null;
    currentValue: number | null;
    multiple: number | null;
    /** The firm's own reporting year for this cheque. */
    financialYear: string;
    writeoffYear: string;
    sourceRow: number;
}

export interface PortfolioExit {
    financialYear: string;
    kind: 'exit' | 'writeoff';
    investedFrom: string;
    company: string;
    investedOn: string | null;
    amount: number;
    soldOn: string | null;
    consideration: number;
    multiple: number | null;
    sourceRow: number;
}

const text = (c: unknown) => (c === null || c === undefined) ? '' : String(c).trim();

/**
 * The first of these headings that exists, in the order given.
 *
 * columnFor prefers the longest synonym, which is right when they are
 * synonyms and wrong when they are a ranking: "Total equity" and "Investment
 * equity" are different columns, and the first is the one wanted.
 */
function firstColumn(headers: string[], names: string[]): number {
    for (const n of names) {
        const i = columnFor(headers, [n]);
        if (i !== -1) return i;
    }
    return -1;
}
const isBlank = (c: unknown) => text(c) === '';

/**
 * Direct, Fund or Syndicate — the three the summary splits by.
 *
 * Anything else is kept as Other rather than forced into one of the three: a
 * new vehicle should show up as a column nobody recognises, not be quietly
 * folded into Direct.
 */
export function normalizeFundType(raw: string): FundType {
    const v = raw.toLowerCase().trim();
    if (/^direct/.test(v)) return 'Direct';
    if (/syndicat/.test(v)) return 'Syndicate';
    if (/^fund|^vc fund|^through fund/.test(v)) return 'Fund';
    return v ? 'Other' : 'Other';
}

/**
 * The financial year a date falls in, April to March.
 *
 * Used only where the sheet does not state the year itself. The firm's own
 * reporting period column wins whenever it is filled in, because a cheque
 * written on 31 March and booked in the next year is their call, not ours.
 */
export function financialYearFor(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const first = d.getUTCMonth() + 1 >= 4 ? y : y - 1;
    return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}

// ─── The investment sheet ─────────────────────────────────────────────────

export function parsePortfolioInvestments(
    matrix: CellMatrix, headerRow: number, headers: string[],
): PortfolioInvestment[] {
    const col = {
        status: columnFor(headers, ['status']),
        fundType: columnFor(headers, ['type fund', 'type of fund', 'fund type', 'vehicle']),
        from: columnFor(headers, ['investment from', 'invested from', 'entity', 'investment entity']),
        date: columnFor(headers, ['date investment', 'investment date', 'date']),
        stage: columnFor(headers, ['investment stage', 'stage', 'round']),
        company: columnFor(headers, ['company', 'company name', 'investee']),
        amount: columnFor(headers, ['amount', 'investment amount']),
        postMoney: columnFor(headers, ['post money valuation', 'post money']),
        equity: firstColumn(headers, ['total equity', 'investment equity', 'equity']),
        current: firstColumn(headers, ['current value investment', 'current value', 'market value']),
        multiple: columnFor(headers, ['expected multiple', 'multiple']),
        period: columnFor(headers, ['our reporting period', 'reporting period', 'financial year', 'year']),
        writeoff: columnFor(headers, ['writeoff year', 'write off year']),
    };

    const order = detectDateOrder(matrix.slice(headerRow + 1).map(r => (Array.isArray(r) && col.date >= 0 ? r[col.date] : null)));
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;
    const out: PortfolioInvestment[] = [];

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;
        const company = text(at(row, col.company));
        const amount = parseMoney(at(row, col.amount));
        // A row with no company or no amount is a spacer or a running total.
        if (!company || amount === null || amount === 0) continue;

        const investedOn = parseDateWith(at(row, col.date), order);
        const stated = text(at(row, col.period));

        out.push({
            status: text(at(row, col.status)),
            fundType: normalizeFundType(text(at(row, col.fundType))),
            investedFrom: text(at(row, col.from)),
            investedOn,
            stage: text(at(row, col.stage)),
            company,
            amount: Math.abs(amount),
            postMoney: parseMoney(at(row, col.postMoney)),
            totalEquityPct: parsePercent(at(row, col.equity)),
            currentValue: parseMoney(at(row, col.current)),
            multiple: parseMoney(at(row, col.multiple)),
            // Their reporting period first; the date only if they left it blank.
            financialYear: stated || financialYearFor(investedOn),
            writeoffYear: text(at(row, col.writeoff)),
            sourceRow: r + 1,
        });
    }
    return out;
}

// ─── The exits and write-offs sheet ───────────────────────────────────────

export function parsePortfolioExits(
    matrix: CellMatrix, headerRow: number, headers: string[],
): PortfolioExit[] {
    const col = {
        year: columnFor(headers, ['year']),
        from: columnFor(headers, ['investment from', 'entity']),
        company: columnFor(headers, ['investment', 'company', 'company name']),
        date: columnFor(headers, ['date investment', 'investment date']),
        amount: columnFor(headers, ['amount']),
        soldOn: columnFor(headers, ['date sale', 'date of sale', 'exit date']),
        consideration: columnFor(headers, ['consideration', 'exit amount', 'proceeds']),
        multiple: columnFor(headers, ['multiple x', 'multiple']),
    };

    const order = detectDateOrder(matrix.slice(headerRow + 1).map(r => (Array.isArray(r) && col.soldOn >= 0 ? r[col.soldOn] : null)));
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;
    const out: PortfolioExit[] = [];

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;

        const company = text(at(row, col.company));
        const consideration = parseMoney(at(row, col.consideration));
        if (!company || consideration === null) continue;

        // "Exited" and "WRITEOFF" sit under a heading that reads "Sr no" in
        // this sheet, so no column name will find them. The word is somewhere
        // in the row; that is enough, and the two must be counted apart or a
        // loss is reported as a realisation.
        const rowText = row.map(text).join(' ').toLowerCase();
        const kind: PortfolioExit['kind'] = /write\s*off|written\s*off/.test(rowText) ? 'writeoff' : 'exit';

        const soldOn = parseDateWith(at(row, col.soldOn), order);
        out.push({
            financialYear: text(at(row, col.year)) || financialYearFor(soldOn),
            kind,
            investedFrom: text(at(row, col.from)),
            company,
            investedOn: parseDateWith(at(row, col.date), order),
            amount: Math.abs(parseMoney(at(row, col.amount)) ?? 0),
            soldOn,
            consideration: Math.abs(consideration),
            multiple: parseMoney(at(row, col.multiple)),
            sourceRow: r + 1,
        });
    }
    return out;
}

// ─── The yearly table ─────────────────────────────────────────────────────

export interface YearRow {
    year: string;
    direct: number;
    fund: number;
    syndicate: number;
    other: number;
    totalInvestment: number;
    exits: number;
    writeoffs: number;
    /** What went in, less what came back out, in that year. */
    netInvestment: number;
    /** Every net investment up to and including this year. */
    cumulative: number;
    /** Realised gain: proceeds less the cost of what was sold. */
    profitLoss: number;
    /**
     * Today's value of what is still held. Only filled on the latest year —
     * the sheets carry one current valuation per holding, not a history of
     * them, so a market value against 2021 would be this year's number wearing
     * an old date.
     */
    marketValue: number | null;
    /** Market value over cumulative investment, where both are known. */
    nav: number | null;
}

/**
 * The table Sheet1 asks for, built from the two sheets.
 *
 * Years come from the rows themselves and are listed in order with no gaps
 * filled in — a year nobody invested in is a year the sheet does not have, and
 * inventing a blank row for it would suggest a figure of zero was recorded
 * rather than that nothing happened.
 *
 * Market value is cumulative, not annual: it answers "what is everything we
 * have bought so far worth now", which is the only reading under which NAV
 * means anything.
 */
export function yearlySummary(
    investments: PortfolioInvestment[],
    exits: PortfolioExit[],
): YearRow[] {
    const years = new Set<string>();
    for (const i of investments) if (i.financialYear) years.add(i.financialYear);
    for (const e of exits) if (e.financialYear) years.add(e.financialYear);
    for (const i of investments) if (i.writeoffYear) years.add(i.writeoffYear);

    const ordered = [...years].sort();
    const exitedCompanies = new Set(exits.map(e => e.company.trim().toLowerCase()));
    // What everything still held is worth now — one figure, belonging to the
    // most recent year and to no other.
    const valueHeldToday = investments
        .filter(i => (!i.writeoffYear || /potential/i.test(i.status))
            && !exitedCompanies.has(i.company.trim().toLowerCase()))
        .reduce((s, i) => s + (i.currentValue ?? 0), 0);

    let cumulative = 0;

    return ordered.map((year, index) => {
        const isLatest = index === ordered.length - 1;
        const mine = investments.filter(i => i.financialYear === year);
        const theirs = exits.filter(e => e.financialYear === year);

        const direct = mine.filter(i => i.fundType === 'Direct').reduce((s, i) => s + i.amount, 0);
        const fund = mine.filter(i => i.fundType === 'Fund').reduce((s, i) => s + i.amount, 0);
        const syndicate = mine.filter(i => i.fundType === 'Syndicate').reduce((s, i) => s + i.amount, 0);
        const other = mine.filter(i => i.fundType === 'Other').reduce((s, i) => s + i.amount, 0);
        const totalInvestment = direct + fund + syndicate + other;

        // At COST, matching the firm's own sheet: these columns say how much
        // invested capital left the portfolio, so that Net Investment is what
        // is still at work and Cumulative adds up year on year. Proceeds are
        // reported separately, as profit.
        const exitRows = theirs.filter(e => e.kind === 'exit');
        const writeoffRows = theirs.filter(e => e.kind === 'writeoff');
        const exitsValue = exitRows.reduce((s, e) => s + e.amount, 0);
        // A position written down without a sale never reaches the exits
        // sheet; it is an investment carrying a WRITEOFF YEAR instead.
        const writtenDown = investments
            // "Potential writeoff" is a worry, not a write-off. It carries a
            // year as a reminder, and counting it would retire capital that is
            // still in the portfolio.
            .filter(i => i.writeoffYear === year && !/potential/i.test(i.status))
            .reduce((s, i) => s + i.amount, 0);
        const writeoffsValue = writeoffRows.reduce((s, e) => s + e.amount, 0) + writtenDown;

        // Realised gain, not proceeds: what came back less what it cost.
        const profitLoss = theirs.reduce((s, e) => s + (e.consideration - e.amount), 0);

        cumulative += totalInvestment - exitsValue - writeoffsValue;

        return {
            year,
            direct, fund, syndicate, other,
            totalInvestment,
            exits: exitsValue,
            writeoffs: writeoffsValue,
            netInvestment: totalInvestment - exitsValue - writeoffsValue,
            cumulative,
            profitLoss,
            marketValue: isLatest ? valueHeldToday : null,
            nav: isLatest && cumulative > 0 ? valueHeldToday / cumulative : null,
        };
    });
}

/** The totals row the sheet puts under the table. */
export function summaryTotals(rows: YearRow[]): Omit<YearRow, 'year' | 'nav' | 'cumulative' | 'marketValue'> & {
    cumulative: number; marketValue: number | null; nav: number | null;
} {
    const last = rows[rows.length - 1];
    const sum = (pick: (r: YearRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return {
        direct: sum(r => r.direct),
        fund: sum(r => r.fund),
        syndicate: sum(r => r.syndicate),
        other: sum(r => r.other),
        totalInvestment: sum(r => r.totalInvestment),
        exits: sum(r => r.exits),
        writeoffs: sum(r => r.writeoffs),
        netInvestment: sum(r => r.netInvestment),
        profitLoss: sum(r => r.profitLoss),
        // Running figures are taken from the last year, not added up.
        cumulative: last?.cumulative ?? 0,
        marketValue: last?.marketValue ?? null,
        nav: last?.nav ?? null,
    };
}
