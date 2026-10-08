// Reading deal terms out of a spreadsheet.
//
// A term sheet or closing summary arrives as an Excel file with the numbers
// already in it, and retyping them into the platform is both slow and how
// they end up disagreeing with the document. This maps the cells onto the
// company fields that Legal and Portfolio both read.
//
// Pure: it takes the cell matrix a spreadsheet reader produces and returns
// what it found. Pinned by scripts/verify-legal-import.mjs, because the
// interesting part is the awkward input — "₹1,20,00,000", "2.5 Cr", a date as
// an Excel serial number, a label that is two words off the one we expect.

import { normalizeCompanyRound, normalizeShareType } from './company-enums';

/** A spreadsheet as a reader hands it over: rows of cells, any type. */
export type CellMatrix = unknown[][];

export type FieldKind = 'money' | 'number' | 'percent' | 'date' | 'text' | 'round' | 'shareType';

export interface ImportField {
    /** The key `updateCompany` expects. */
    key: string;
    /** What to call it in the review list. */
    label: string;
    kind: FieldKind;
    /**
     * Labels that mean this field, lowercased and stripped of punctuation.
     * The first one is what the field is usually called.
     */
    aliases: string[];
}

/**
 * The fields worth lifting out of a deal document, in the order they are
 * reviewed. Amounts are rupees, because that is what the columns hold — a
 * valuation of ₹900 Cr is stored as 9000000000.
 */
export const IMPORT_FIELDS: ImportField[] = [
    { key: 'entryDate', label: 'Investment date', kind: 'date', aliases: [
        'date of investment', 'investment date', 'date of allotment', 'allotment date',
        'closing date', 'date of closing', 'entry date', 'date of subscription', 'transaction date',
    ] },
    { key: 'initialInvestment', label: 'Amount invested', kind: 'money', aliases: [
        'investment amount', 'amount invested', 'amount of investment', 'total investment',
        'cheque size', 'consideration', 'subscription amount', 'total consideration',
        'investment', 'amount',
    ] },
    { key: 'entryPreMoneyValuation', label: 'Pre-money valuation', kind: 'money', aliases: [
        'pre money valuation', 'pre money', 'premoney valuation', 'pre money val',
        'valuation pre money', 'pre money valuation inr',
    ] },
    { key: 'entryPostMoneyValuation', label: 'Post-money valuation', kind: 'money', aliases: [
        'post money valuation', 'post money', 'postmoney valuation', 'post money val',
        'valuation post money', 'valuation',
    ] },
    { key: 'entryTotalRaised', label: 'Total round size', kind: 'money', aliases: [
        'total round size', 'round size', 'total raised', 'total round', 'total raise',
        'size of round', 'total fund raise', 'aggregate investment',
    ] },
    { key: 'numShares', label: 'Shares bought', kind: 'number', aliases: [
        'shares bought', 'no of shares', 'number of shares', 'shares allotted',
        'no of shares allotted', 'shares subscribed', 'securities subscribed',
        'no of securities', 'shares issued to dv', 'shares',
    ] },
    { key: 'totalShares', label: 'Company total shares', kind: 'number', aliases: [
        'total outstanding shares', 'total shares', 'fully diluted shares',
        'total paid up shares', 'outstanding shares', 'total share capital',
        'shares outstanding', 'total number of shares',
    ] },
    { key: 'sharePrice', label: 'Price per share', kind: 'money', aliases: [
        'price per share', 'price share', 'issue price', 'subscription price',
        'per share price', 'share price', 'price per security', 'issue price per share',
    ] },
    { key: 'entryOwnership', label: 'Ownership at entry', kind: 'percent', aliases: [
        'ownership at entry', 'entry ownership', 'holding', 'shareholding',
        'percentage holding', 'percent holding', 'stake', 'equity stake',
        'ownership', 'dv holding', 'our stake', 'holding at entry',
    ] },
    { key: 'currentOwnership', label: 'Current ownership', kind: 'percent', aliases: [
        'current ownership', 'current holding', 'current shareholding',
        'ownership today', 'present holding',
    ] },
    { key: 'latestValuation', label: 'Latest valuation', kind: 'money', aliases: [
        'latest valuation', 'current valuation', 'fair value', 'fair market value',
        'valuation today', 'present valuation', 'marked value',
    ] },
    { key: 'investmentVehicle', label: 'Investment entity', kind: 'text', aliases: [
        'investment entity', 'investing entity', 'investment vehicle', 'vehicle',
        'entity', 'investor name', 'investor', 'fund name', 'invested through',
    ] },
    { key: 'investmentInstrument', label: 'Instrument', kind: 'text', aliases: [
        'instrument', 'investment instrument', 'security type', 'type of security',
        'type of instrument', 'class of shares', 'security', 'nature of security',
    ] },
    { key: 'companyRound', label: 'Round', kind: 'round', aliases: [
        'round', 'series', 'funding round', 'round of investment', 'investment round', 'stage',
    ] },
    { key: 'shareType', label: 'Primary / Secondary', kind: 'shareType', aliases: [
        'primary secondary', 'primary or secondary', 'transaction type', 'nature of transaction',
        'share type', 'type of transaction',
    ] },
];

// ─── Labels ───────────────────────────────────────────────────────────────

/**
 * A label reduced to its comparable form: lowercase, no punctuation, no
 * currency or unit notes, single spaces. "Pre-Money Valuation (INR)" and
 * "pre money valuation" have to come out the same, or a sheet is read as
 * having none of the fields it plainly has.
 */
export function normalizeLabel(raw: unknown): string {
    return String(raw ?? '')
        .toLowerCase()
        // A parenthesised unit is a note about the value, not part of the name.
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[₹$€£]/g, ' ')
        // "% Holding" has to reach the same place as "percent holding".
        .replace(/%/g, ' percent ')
        .replace(/\b(?:inr|usd|rs|rupees?|crores?|cr|lakhs?|lacs?|mn|million|amount in|figures in)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\b(?:the|of|a|an|for|to|in|at|on|is|as|per)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Which field a label names, or null.
 *
 * Exact match on the normalised alias first, then containment — a sheet will
 * say "Pre money valuation as on date" and mean the pre-money. Containment is
 * tried longest-alias-first so "post money valuation" is never mistaken for
 * the plain "valuation" that also appears in its alias list.
 */
export function fieldForLabel(label: string): ImportField | null {
    const norm = normalizeLabel(label);
    if (!norm) return null;

    for (const f of IMPORT_FIELDS) {
        if (f.aliases.some(a => normalizeLabel(a) === norm)) return f;
    }

    const byLength = IMPORT_FIELDS
        .flatMap(f => f.aliases.map(a => ({ f, a: normalizeLabel(a) })))
        .sort((x, y) => y.a.length - x.a.length);
    for (const { f, a } of byLength) {
        // Only multi-word aliases may match loosely. A one-word alias like
        // "amount" inside a longer phrase means almost anything.
        if (a.includes(' ') && norm.includes(a)) return f;
    }
    return null;
}

// ─── Values ───────────────────────────────────────────────────────────────

const CRORE = 10_000_000;
const LAKH = 100_000;

/**
 * A number out of a cell, in rupees where a unit is written.
 *
 * Handles the Indian grouping ("1,20,00,000"), the shorthands a term sheet
 * actually uses ("2.5 Cr", "50 lakhs", "₹12 mn"), and a negative in brackets.
 * A bare number is taken at face value, because that is what the columns hold.
 */
export function parseMoney(value: unknown): number | null {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
    const text = raw.toLowerCase().replace(/[()]/g, '');

    const digits = text.replace(/[^0-9.]/g, '');
    if (!digits || !/[0-9]/.test(digits)) return null;
    const n = parseFloat(digits);
    if (!isFinite(n)) return null;

    let multiplier = 1;
    if (/\b(?:cr|crores?)\b/.test(text)) multiplier = CRORE;
    else if (/\b(?:lakhs?|lacs?|lk)\b/.test(text)) multiplier = LAKH;
    else if (/\b(?:mn|million|m)\b/.test(text)) multiplier = 1_000_000;
    else if (/\b(?:bn|billion)\b/.test(text)) multiplier = 1_000_000_000;
    else if (/\b(?:k|thousand)\b/.test(text)) multiplier = 1_000;

    const magnitude = n * multiplier;
    return negative ? -magnitude : magnitude;
}

/** A plain count — shares, not money, so no unit shorthand is applied. */
export function parseCount(value: unknown): number | null {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    const raw = String(value ?? '').replace(/[^0-9.\-]/g, '');
    if (!raw || !/[0-9]/.test(raw)) return null;
    const n = parseFloat(raw);
    return isFinite(n) ? n : null;
}

/**
 * A percentage as the platform stores it: 1.34 means 1.34%.
 *
 * A spreadsheet percent cell comes through as a fraction (0.0134), and a
 * typed one as "1.34%". Both have to land on 1.34, so a value below 1 with no
 * percent sign is read as a fraction — the alternative is a 100× error in the
 * ownership column, which then moves MOIC and IRR.
 */
export function parsePercent(value: unknown): number | null {
    if (typeof value === 'number') {
        if (!isFinite(value)) return null;
        return value > 0 && value < 1 ? value * 100 : value;
    }
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const hadSign = raw.includes('%');
    const n = parseCount(raw.replace('%', ''));
    if (n === null) return null;
    if (hadSign) return n;
    return n > 0 && n < 1 ? n * 100 : n;
}

/** Days from the Excel 1900 epoch to the Unix epoch, counting Excel's fake 29 Feb 1900. */
const EXCEL_EPOCH_OFFSET = 25_569;

/**
 * An ISO date (YYYY-MM-DD) out of a cell.
 *
 * A date in a spreadsheet is usually a serial number, so a bare number in the
 * plausible range is read as one. Typed dates are day-first, as they are
 * written in India — 4/10/2025 is 4 October, not 10 April.
 */
export function parseSheetDate(value: unknown): string | null {
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : toISO(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    if (typeof value === 'number') {
        // Serials outside 1990–2040. A bare number beyond that is a count
        // that happens to look like a date — a share count, usually.
        if (value < 32_874 || value > 51_499) return null;
        const ms = (value - EXCEL_EPOCH_OFFSET) * 86_400_000;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return null;
        return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }

    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return toISO(+iso[1], +iso[2], +iso[3]);

    const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (dmy) {
        let year = +dmy[3];
        if (year < 100) year += year < 70 ? 2000 : 1900;
        return toISO(year, +dmy[2], +dmy[1]);
    }

    // "12 April 2025", "April 12, 2025", "12-Apr-25"
    const named = raw.match(/^(\d{1,2})[\s-]+([a-z]{3,})[\s-,]+(\d{2,4})$/i)
        || raw.match(/^([a-z]{3,})[\s-]+(\d{1,2})[\s-,]+(\d{2,4})$/i);
    if (named) {
        const dayFirst = /^\d/.test(named[1]);
        const day = +(dayFirst ? named[1] : named[2]);
        const monthName = (dayFirst ? named[2] : named[1]).toLowerCase().slice(0, 3);
        const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
            .indexOf(monthName) + 1;
        let year = +named[3];
        if (year < 100) year += year < 70 ? 2000 : 1900;
        if (month > 0) return toISO(year, month, day);
    }
    return null;
}

function toISO(y: number, m: number, d: number): string | null {
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
    return `${y.toString().padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseFieldValue(field: ImportField, value: unknown): string | number | null {
    switch (field.kind) {
        case 'money': return parseMoney(value);
        case 'number': return parseCount(value);
        case 'percent': return parsePercent(value);
        case 'date': return parseSheetDate(value);
        case 'round': return normalizeCompanyRound(String(value ?? '')) || null;
        case 'shareType': return normalizeShareType(String(value ?? '')) || null;
        case 'text': {
            const s = String(value ?? '').trim();
            return s ? s.slice(0, 120) : null;
        }
    }
}

// ─── Finding the pairs ────────────────────────────────────────────────────

export interface Extracted {
    key: string;
    label: string;
    /** The heading as the sheet wrote it, so a wrong guess is obvious. */
    sheetLabel: string;
    /** The cell before parsing, for the same reason. */
    rawValue: string;
    value: string | number;
}

export interface ImportResult {
    fields: Extracted[];
    /** Labels that looked like headings but matched nothing — worth showing. */
    unmatched: string[];
    rowsScanned: number;
}

const isBlank = (c: unknown) => c === null || c === undefined || String(c).trim() === '';

/**
 * Everything the sheet says, in whichever of the two shapes it is written.
 *
 * Down the page — a label in one column and its value in the next — is how a
 * term sheet summary is laid out. Across the top — one header row and a row of
 * values under it — is how an export from another system looks. Both are read,
 * and the first value found for a field wins, so a sheet that repeats a label
 * does not end up with the last mention overwriting the first.
 */
export function extractFromMatrix(matrix: CellMatrix): ImportResult {
    const found = new Map<string, Extracted>();
    const unmatched = new Set<string>();

    const take = (field: ImportField, sheetLabel: unknown, raw: unknown) => {
        if (found.has(field.key)) return;
        const parsed = parseFieldValue(field, raw);
        if (parsed === null || parsed === '') return;
        found.set(field.key, {
            key: field.key,
            label: field.label,
            sheetLabel: String(sheetLabel ?? '').trim(),
            rawValue: raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '').trim(),
            value: parsed,
        });
    };

    // Label on the left, value to its right.
    for (const row of matrix) {
        if (!Array.isArray(row)) continue;
        for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (isBlank(cell) || typeof cell === 'number') continue;
            const field = fieldForLabel(cell as string);
            if (!field) {
                const n = normalizeLabel(cell);
                // Only plausible headings are worth reporting as unmatched.
                if (n && n.length >= 3 && n.split(' ').length <= 6 && !/^\d+$/.test(n)) unmatched.add(String(cell).trim());
                continue;
            }
            const next = row.slice(col + 1).find(c => !isBlank(c));
            if (next !== undefined) take(field, cell, next);
        }
    }

    // Header row with its values underneath. Only consulted for fields the
    // first pass did not find, which is why `take` ignores repeats.
    for (let r = 0; r < matrix.length; r++) {
        const header = matrix[r];
        if (!Array.isArray(header)) continue;
        const cols = header
            .map((cell, idx) => ({ idx, cell, field: isBlank(cell) ? null : fieldForLabel(cell as string) }))
            .filter(c => c.field);
        if (cols.length < 2) continue;      // one match is a label/value row, not a header

        for (let below = r + 1; below < matrix.length; below++) {
            const dataRow = matrix[below];
            if (!Array.isArray(dataRow)) continue;
            if (dataRow.every(isBlank)) continue;
            for (const { idx, cell, field } of cols) {
                if (!isBlank(dataRow[idx])) take(field!, cell, dataRow[idx]);
            }
            break;   // the first non-empty row under the header is the record
        }
    }

    for (const f of found.values()) unmatched.delete(f.sheetLabel);

    return {
        fields: IMPORT_FIELDS.map(f => found.get(f.key)).filter((x): x is Extracted => !!x),
        unmatched: [...unmatched].slice(0, 12),
        rowsScanned: matrix.length,
    };
}

/** Which of these the company already has a different value for. */
export function describeChange(
    current: unknown,
    next: string | number,
    kind: FieldKind,
): 'new' | 'same' | 'changed' {
    if (current === null || current === undefined || current === '') return 'new';
    if (kind === 'date') {
        const a = String(current).slice(0, 10);
        return a === String(next).slice(0, 10) ? 'same' : 'changed';
    }
    if (typeof next === 'number') {
        const a = Number(current);
        if (!isFinite(a)) return 'changed';
        // A tenth of a rupee, or a hundredth of a percentage point, is the same.
        return Math.abs(a - next) < 0.01 ? 'same' : 'changed';
    }
    return String(current).trim().toLowerCase() === String(next).trim().toLowerCase() ? 'same' : 'changed';
}
