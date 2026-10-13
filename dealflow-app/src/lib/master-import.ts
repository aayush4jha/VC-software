// The single master upload.
//
// "User should upload one master Excel file; system should automatically
// identify and map bank statements, investment data, exit/write-off data and
// adjustment entries." So the file is not described by the person uploading it
// — each sheet is identified by its own headings, and a sheet nobody
// recognises is reported rather than silently skipped.
//
// The value parsers are the ones the Legal import already uses. A date or an
// amount must mean the same thing on both paths, and two implementations of
// "₹1,20,00,000" would eventually disagree.
//
// Pure, pinned by scripts/verify-master-import.mjs.

import { parseMoney, parseCount, parsePercent, parseSheetDate, normalizeLabel, type CellMatrix } from './legal-import';
import { classifyTransaction, rowIssues, type LedgerCategory, type MappingRule } from './fund-ledger';

export type SheetKind =
    | 'bank_statement'
    | 'investment_master'
    | 'exit_master'
    | 'adjustments'
    | 'legal_documents'
    | 'investor_rights';

export interface SheetSignature {
    kind: SheetKind;
    label: string;
    /** Headings that, taken together, identify the sheet. */
    required: string[][];
    /** Headings that make the match more certain but are not needed. */
    helpful: string[];
    /**
     * Headings that belong to this sheet and to no other.
     *
     * A bank statement is the loosest shape there is — a date, a description
     * and an amount — so almost any finance sheet satisfies it, and the exits
     * sheet did: its company column is headed "Investment", so nothing in the
     * exit signature matched while the bank one matched easily. "Date of Sale"
     * and "Consideration" appear on no bank statement ever written, and one of
     * them settles the question outright.
     */
    decisive?: string[];
}

// Each `required` entry is a set of synonyms; one of each set must be present.
const SIGNATURES: SheetSignature[] = [
    {
        kind: 'bank_statement', label: 'Bank statement',
        required: [
            ['date', 'txn date', 'transaction date', 'value date'],
            ['description', 'narration', 'particulars', 'remarks', 'details'],
            ['debit', 'credit', 'amount', 'withdrawal', 'deposit'],
        ],
        helpful: ['balance', 'bank', 'entity', 'currency', 'account'],
    },
    {
        kind: 'investment_master', label: 'Investment master',
        required: [
            ['company', 'company name', 'investee', 'portfolio company'],
            ['amount', 'investment amount', 'invested amount'],
            ['date', 'investment date', 'date investment'],
        ],
        helpful: ['round', 'ownership', 'type', 'entity', 'status', 'instrument'],
        decisive: ['type of fund', 'current value of investment', 'our reporting period', 'writeoff year'],
    },
    {
        kind: 'exit_master', label: 'Exit / write-off master',
        required: [
            // "Investment" because that is what this sheet heads its company
            // column with — the name of the thing invested in.
            ['company', 'company name', 'investee', 'investment'],
            ['exit amount', 'exit value', 'proceeds', 'realisation', 'consideration', 'amount'],
            ['exit date', 'date sale', 'date exit', 'date'],
        ],
        helpful: ['exit type', 'status', 'write off', 'entity', 'multiple'],
        decisive: ['date of sale', 'consideration', 'valuation on exit', 'no of share sold'],
    },
    {
        kind: 'adjustments', label: 'Adjustments',
        required: [
            ['date', 'adjustment date'],
            ['amount'],
            ['reason', 'remarks', 'narration'],
        ],
        helpful: ['approved by', 'category', 'entity'],
    },
    {
        kind: 'legal_documents', label: 'Legal documents',
        required: [
            ['company', 'company name'],
            ['document', 'document type', 'doc type'],
            ['status'],
        ],
        helpful: ['version', 'link', 'date', 'remarks'],
    },
    {
        kind: 'investor_rights', label: 'Investor rights',
        required: [
            ['company', 'company name'],
            ['right', 'right name', 'investor right'],
            ['status'],
        ],
        helpful: ['threshold', 'document reference', 'document ref', 'next action'],
    },
];

const isBlank = (c: unknown) => c === null || c === undefined || String(c).trim() === '';

/**
 * Which row holds the headings, and what they are.
 *
 * A bank export rarely starts at A1 — there is a logo, an account summary and
 * a blank line first — so the first twenty rows are examined and the one that
 * looks most like a header wins.
 */
export function findHeaderRow(matrix: CellMatrix): { index: number; headers: string[] } | null {
    let best: { index: number; headers: string[]; score: number } | null = null;

    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
        const row = matrix[i];
        if (!Array.isArray(row)) continue;
        const labels = row.map(c => normalizeLabel(c));
        const filled = labels.filter(l => l.length > 0);
        if (filled.length < 3) continue;

        // A header row is words. A row of figures normalises to "1", "2", "3",
        // which is filled but is plainly the first row of data.
        const wordy = row.filter((c, i) => typeof c !== 'number' && /[a-z]/.test(labels[i])).length;
        if (wordy < 3) continue;

        const numeric = row.filter(c => typeof c === 'number').length;
        const score = wordy - numeric * 2;
        if (score <= 0) continue;
        if (!best || score > best.score) {
            best = { index: i, headers: labels, score };
        }
    }
    return best ? { index: best.index, headers: best.headers } : null;
}

export interface SheetMatch {
    kind: SheetKind | null;
    label: string;
    confidence: number;
    headerRow: number;
    headers: string[];
}

/**
 * What a sheet is, from its headings alone.
 *
 * Every signature is scored rather than the first match taken: an exit master
 * and an investment master share most of their columns, and "exit date" is the
 * only thing that tells them apart.
 */
export function detectSheetKind(matrix: CellMatrix): SheetMatch {
    const header = findHeaderRow(matrix);
    if (!header) return { kind: null, label: 'Not recognised', confidence: 0, headerRow: -1, headers: [] };

    const has = (names: string[]) =>
        names.some(n => header.headers.some(h => h === n || h.includes(n)));

    let best: SheetMatch = { kind: null, label: 'Not recognised', confidence: 0, headerRow: header.index, headers: header.headers };
    for (const sig of SIGNATURES) {
        const met = sig.required.filter(has).length;
        if (met < sig.required.length) continue;
        const bonus = sig.helpful.filter(h => has([h])).length;
        // A heading that belongs to this sheet and no other outranks every
        // loose match, however many helpful columns the loose one has.
        const decisive = (sig.decisive || []).filter(h => has([h])).length;
        const confidence = met + bonus / (sig.helpful.length + 1) + decisive * 10;
        if (confidence > best.confidence) {
            best = { kind: sig.kind, label: sig.label, confidence, headerRow: header.index, headers: header.headers };
        }
    }
    return best;
}

/** The column holding a heading, or -1. Longest synonym first, so "exit date" beats "date". */
export function columnFor(headers: string[], names: string[]): number {
    const wanted = [...names].sort((a, b) => b.length - a.length);
    for (const n of wanted) {
        const exact = headers.indexOf(n);
        if (exact !== -1) return exact;
    }
    for (const n of wanted) {
        const loose = headers.findIndex(h => h.includes(n));
        if (loose !== -1) return loose;
    }
    return -1;
}

// ─── Which way round the dates are ────────────────────────────────────────

export type DateOrder = 'day_first' | 'month_first';

/**
 * Whether a column of dates is written day-first or month-first.
 *
 * "9/11/20" is the 9th of November to an Indian bookkeeper and the 11th of
 * September to Excel's US locale, and no amount of staring at one value will
 * say which. A whole column will: the moment any row has a first number above
 * twelve the column must be day-first, and a second number above twelve makes
 * it month-first. Guessing per cell is how a statement ends up with a third of
 * its dates missing and the rest silently wrong.
 */
export function detectDateOrder(values: unknown[]): DateOrder {
    let dayFirst = 0;
    let monthFirst = 0;
    for (const v of values) {
        const m = String(v ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (!m) continue;
        const a = +m[1], b = +m[2];
        if (a > 12 && b <= 12) dayFirst++;
        else if (b > 12 && a <= 12) monthFirst++;
    }
    // Indian bookkeeping is day-first, so that is the tie-break.
    return monthFirst > dayFirst ? 'month_first' : 'day_first';
}

/** A date read with the column's convention applied. */
export function parseDateWith(value: unknown, order: DateOrder): string | null {
    if (order === 'day_first') return parseSheetDate(value);
    const m = String(value ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!m) return parseSheetDate(value);
    // Hand it back day-first so one parser does the validation.
    return parseSheetDate(`${m[2]}/${m[1]}/${m[3]}`);
}

// ─── Bank statements ──────────────────────────────────────────────────────

export interface ParsedLedgerRow {
    entity: string;
    bank: string;
    /** The bookkeeper's own heads, kept verbatim — they are how she files. */
    dashboardHead: string;
    acName: string;
    financialYear: string;
    /** The account number or nickname. Two accounts at one bank are two balances. */
    accountLabel: string;
    date: string | null;
    description: string;
    /** Signed: negative is money leaving. */
    amount: number;
    currency: string;
    amountInr: number | null;
    balanceAfter: number | null;
    category: LedgerCategory;
    categoryReason: string;
    companyName?: string;
    majorHead: string;
    issues: string[];
    sourceRow: number;
}

export interface BankParseContext {
    /** Used when the sheet itself does not name one. */
    defaultEntity?: string;
    defaultBank?: string;
    /** Used when the sheet has no account column — a statement is one account. */
    defaultAccount?: string;
    defaultCurrency?: string;
    /** AED to INR, when the sheet gives no conversion of its own. */
    fxRate?: number;
    knownEntities?: string[];
    knownCompanies?: string[];
    /** Rules from the Mapping page, which outrank every built-in pattern. */
    rules?: MappingRule[];
}

/**
 * Bank rows, normalised and classified.
 *
 * Debit and credit arrive as separate columns in most Indian exports and as
 * one signed column elsewhere; both become one signed amount, because a total
 * cannot be built from a layout. A row whose amount cannot be read at all is
 * dropped — there is nothing to count — but a row merely missing its entity or
 * currency is kept and flagged, since the sheet is explicit that transactions
 * must not be silently excluded.
 */
export function parseBankRows(
    matrix: CellMatrix,
    headerRow: number,
    headers: string[],
    context: BankParseContext = {},
): ParsedLedgerRow[] {
    const col = {
        date: columnFor(headers, ['transaction date', 'value date', 'txn date', 'date']),
        description: columnFor(headers, ['description', 'narration', 'particulars', 'details', 'remarks']),
        debit: columnFor(headers, ['debit', 'withdrawal', 'withdrawal amount', 'dr']),
        credit: columnFor(headers, ['credit', 'deposit', 'deposit amount', 'cr']),
        amount: columnFor(headers, ['amount']),
        balance: columnFor(headers, ['balance', 'closing balance', 'running balance']),
        // "To" is what the firm's own fund sheet heads its entity column with.
        // Matched exactly and never loosely: "to" appears inside "total".
        entity: columnFor(headers, ['entity', 'firm']) !== -1
            ? columnFor(headers, ['entity', 'firm'])
            : headers.indexOf('to'),
        bank: columnFor(headers, ['bank', 'bank name']),
        account: columnFor(headers, ['account', 'account number', 'account no']),
        acName: columnFor(headers, ['ac name', 'account name', 'party', 'counterparty']),
        dashboardHead: columnFor(headers, ['dashboard head', 'dashboard']),
        financialYear: columnFor(headers, ['financial year', 'hisab yr', 'hisab year', 'year']),
        currency: columnFor(headers, ['currency', 'ccy']),
        inr: columnFor(headers, ['inr equivalent', 'inr value', 'amount inr', 'inr conversion', 'inr']),
        head: columnFor(headers, ['major head', 'category', 'head']),
    };

    // A sheet with no currency column often says it in the amount heading
    // instead — "Net Amount AED". Without this every UAE row reads as rupees
    // and the UAE balance is wrong by a factor of twenty-three.
    const amountHeading = [col.amount, col.debit, col.credit]
        .filter(i => i >= 0).map(i => headers[i] || '').join(' ');
    const sheetCurrency = context.defaultCurrency
        ?? (/\baed\b/.test(amountHeading) ? 'AED'
            : /\busd\b/.test(amountHeading) ? 'USD'
                : undefined);

    // Settled once for the whole column, not guessed per row.
    const dateOrder = detectDateOrder(
        matrix.slice(headerRow + 1).map(r => (Array.isArray(r) && col.date >= 0 ? r[col.date] : null)),
    );

    const out: ParsedLedgerRow[] = [];
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;

        const debit = parseMoney(at(row, col.debit));
        const credit = parseMoney(at(row, col.credit));
        const plain = parseMoney(at(row, col.amount));

        let amount: number | null = null;
        if (debit !== null && debit !== 0) amount = -Math.abs(debit);
        else if (credit !== null && credit !== 0) amount = Math.abs(credit);
        else if (plain !== null && plain !== 0) amount = plain;
        // A row with no readable amount is a subtotal or a page break.
        if (amount === null) continue;

        const description = String(at(row, col.description) ?? '').trim();
        const entity = String(at(row, col.entity) ?? context.defaultEntity ?? '').trim();
        const bank = String(at(row, col.bank) ?? context.defaultBank ?? '').trim();
        const accountLabel = String(at(row, col.account) ?? context.defaultAccount ?? '').trim();
        const currency = (String(at(row, col.currency) ?? sheetCurrency ?? 'INR').trim() || 'INR').toUpperCase();
        const majorHead = String(at(row, col.head) ?? '').trim();

        const classification = classifyTransaction({
            description, amount, majorHead, entity, bank,
            dashboardHead: String(at(row, col.dashboardHead) ?? '').trim(),
            knownEntities: context.knownEntities,
            knownCompanies: context.knownCompanies,
            rules: context.rules,
        });

        // "Retain AED and INR values" — the sheet's own conversion first.
        const statedInr = parseMoney(at(row, col.inr));
        let amountInr: number | null;
        if (currency === 'INR') amountInr = amount;
        else if (statedInr !== null) amountInr = amount < 0 ? -Math.abs(statedInr) : Math.abs(statedInr);
        else if (context.fxRate && isFinite(context.fxRate)) amountInr = amount * context.fxRate;
        else amountInr = null;

        const parsed: ParsedLedgerRow = {
            entity, bank, accountLabel,
            dashboardHead: String(at(row, col.dashboardHead) ?? '').trim(),
            acName: String(at(row, col.acName) ?? '').trim(),
            financialYear: String(at(row, col.financialYear) ?? '').trim(),
            date: parseDateWith(at(row, col.date), dateOrder),
            description,
            amount,
            currency,
            amountInr,
            balanceAfter: parseMoney(at(row, col.balance)),
            category: classification.category,
            categoryReason: classification.reason,
            companyName: classification.companyName,
            majorHead,
            issues: [],
            sourceRow: r + 1,
        };
        parsed.issues = rowIssues(parsed, {
            // A column the sheet does not have at all is reported once, in the
            // summary, rather than against every line in it.
            entity: col.entity === -1 && !context.defaultEntity,
            bank: col.bank === -1 && !context.defaultBank,
        });
        out.push(parsed);
    }
    return out;
}

// ─── Adjustments ──────────────────────────────────────────────────────────

export interface ParsedAdjustment {
    date: string | null;
    entity: string;
    category: string;
    amount: number;
    currency: string;
    reason: string;
    approvedBy: string;
    remarks: string;
    sourceRow: number;
}

/**
 * Adjustment rows. "Must have reason + approval + audit trail", so a row with
 * no reason is not an adjustment and is left out — an unexplained correction
 * to a fund position is the thing the approval column exists to prevent.
 */
export function parseAdjustmentRows(
    matrix: CellMatrix, headerRow: number, headers: string[],
): { rows: ParsedAdjustment[]; rejected: { sourceRow: number; why: string }[] } {
    const col = {
        date: columnFor(headers, ['adjustment date', 'date']),
        entity: columnFor(headers, ['entity']),
        category: columnFor(headers, ['category', 'head']),
        amount: columnFor(headers, ['amount']),
        currency: columnFor(headers, ['currency', 'ccy']),
        reason: columnFor(headers, ['reason', 'narration', 'description']),
        approved: columnFor(headers, ['approved by', 'approver', 'approved']),
        remarks: columnFor(headers, ['remarks', 'notes', 'comment']),
    };
    const rows: ParsedAdjustment[] = [];
    const rejected: { sourceRow: number; why: string }[] = [];
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;

        const amount = parseMoney(at(row, col.amount));
        if (amount === null || amount === 0) continue;

        const reason = String(at(row, col.reason) ?? '').trim();
        const approvedBy = String(at(row, col.approved) ?? '').trim();
        if (!reason) { rejected.push({ sourceRow: r + 1, why: 'no reason given' }); continue; }
        if (!approvedBy) { rejected.push({ sourceRow: r + 1, why: 'nobody approved it' }); continue; }

        rows.push({
            date: parseSheetDate(at(row, col.date)),
            entity: String(at(row, col.entity) ?? '').trim(),
            category: String(at(row, col.category) ?? 'adjustment').trim() || 'adjustment',
            amount,
            currency: (String(at(row, col.currency) ?? 'INR').trim() || 'INR').toUpperCase(),
            reason,
            approvedBy,
            remarks: String(at(row, col.remarks) ?? '').trim(),
            sourceRow: r + 1,
        });
    }
    return { rows, rejected };
}

// ─── Investment and exit masters ──────────────────────────────────────────

export interface ParsedInvestment {
    companyName: string;
    entity: string;
    date: string | null;
    instrument: string;
    amount: number;
    round: string;
    status: string;
    ownershipPct: number | null;
    sourceRow: number;
}

export function parseInvestmentRows(
    matrix: CellMatrix, headerRow: number, headers: string[],
): ParsedInvestment[] {
    const col = {
        company: columnFor(headers, ['company name', 'portfolio company', 'investee', 'company']),
        entity: columnFor(headers, ['investment entity', 'entity']),
        date: columnFor(headers, ['investment date', 'date investment', 'date']),
        instrument: columnFor(headers, ['instrument', 'type security', 'security', 'type']),
        amount: columnFor(headers, ['investment amount', 'invested amount', 'amount']),
        round: columnFor(headers, ['round', 'series', 'stage']),
        status: columnFor(headers, ['status', 'current status']),
        ownership: columnFor(headers, ['ownership', 'holding', 'stake', 'percent holding']),
    };
    const out: ParsedInvestment[] = [];
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;
        const companyName = String(at(row, col.company) ?? '').trim();
        const amount = parseMoney(at(row, col.amount));
        if (!companyName || amount === null) continue;

        out.push({
            companyName,
            entity: String(at(row, col.entity) ?? '').trim(),
            date: parseSheetDate(at(row, col.date)),
            instrument: String(at(row, col.instrument) ?? '').trim(),
            amount: Math.abs(amount),
            round: String(at(row, col.round) ?? '').trim(),
            status: String(at(row, col.status) ?? '').trim(),
            ownershipPct: parsePercent(at(row, col.ownership)),
            sourceRow: r + 1,
        });
    }
    return out;
}

export interface ParsedExit {
    companyName: string;
    entity: string;
    date: string | null;
    amount: number;
    exitType: string;
    status: string;
    sourceRow: number;
}

/**
 * Exit rows.
 *
 * The date is the column that matters most here: portfolio XIRR cannot place a
 * cash flow without one, so an exit imported with no date contributes its
 * outflows and none of its proceeds. It is carried through and flagged rather
 * than defaulted to anything.
 */
export function parseExitRows(
    matrix: CellMatrix, headerRow: number, headers: string[],
): ParsedExit[] {
    const col = {
        company: columnFor(headers, ['company name', 'investee', 'company']),
        entity: columnFor(headers, ['entity']),
        date: columnFor(headers, ['exit date', 'date exit', 'realisation date', 'date']),
        amount: columnFor(headers, ['exit amount', 'exit value', 'proceeds', 'realisation', 'amount']),
        type: columnFor(headers, ['exit type', 'type']),
        status: columnFor(headers, ['status']),
    };
    const out: ParsedExit[] = [];
    const at = (row: unknown[], i: number) => i >= 0 ? row[i] : undefined;

    for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;
        const companyName = String(at(row, col.company) ?? '').trim();
        if (!companyName) continue;
        const amount = parseMoney(at(row, col.amount));

        out.push({
            companyName,
            entity: String(at(row, col.entity) ?? '').trim(),
            date: parseSheetDate(at(row, col.date)),
            amount: amount === null ? 0 : Math.abs(amount),
            exitType: String(at(row, col.type) ?? '').trim(),
            status: String(at(row, col.status) ?? '').trim(),
            sourceRow: r + 1,
        });
    }
    return out;
}

// ─── Deduplication ────────────────────────────────────────────────────────

/**
 * A fingerprint for one imported row.
 *
 * Two identical ₹500 charges on the same day are both real, so the row's
 * position in the file is part of the key. The same file uploaded twice
 * produces the same keys and is rejected by the unique index — which is the
 * point: a fund position that doubles because someone clicked upload twice is
 * the worst failure this page can have.
 */
export function importKey(fileName: string, sheetName: string, sourceRow: number, values: unknown[]): string {
    const shape = values.map(v => String(v ?? '').trim()).join('|');
    let hash = 0;
    for (let i = 0; i < shape.length; i++) {
        hash = ((hash << 5) - hash + shape.charCodeAt(i)) | 0;
    }
    return `${fileName}::${sheetName}::${sourceRow}::${(hash >>> 0).toString(36)}`;
}

/** A plain-language summary of one sheet, for the review screen. */
export function describeSheet(
    match: SheetMatch, rowCount: number, flagged: number, notes: string[] = [],
): string {
    if (!match.kind) {
        return `Not recognised — no heading row that looks like a bank statement, an investment master, exits, adjustments, documents or rights.`;
    }
    const flaggedNote = flagged > 0 ? `, ${flagged} needing attention` : '';
    const extra = notes.length > 0 ? ` ${notes.join(' ')}` : '';
    return `${match.label}: ${rowCount} row${rowCount === 1 ? '' : 's'}${flaggedNote}.${extra}`;
}

export { parseMoney, parseCount, parseSheetDate };
