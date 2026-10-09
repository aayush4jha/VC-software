// Turning a table on screen into a file.
//
// P1 on 04_Developer Summary: "add alerts, ageing, filters, export and
// company-level drill-down." Export means the rows AS FILTERED — a download
// that quietly gives you the whole ledger when the screen shows one financial
// year is worse than no download, because the difference is invisible until
// someone totals it.
//
// Pure, pinned by scripts/verify-csv-export.mjs.

/**
 * One CSV cell.
 *
 * Quoted whenever it contains a comma, a quote or a newline, with inner quotes
 * doubled — the RFC 4180 rules. A leading =, +, - or @ is prefixed with a
 * single quote: spreadsheets treat those as formulas, so a description reading
 * "=cmd|..." would otherwise execute on open.
 */
export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const isNumber = typeof value === 'number' && isFinite(value);
    let text = String(value);
    // Only text is defused. A negative amount starts with "-" too, and
    // prefixing it would make every outflow a string — which silently breaks
    // the one thing a finance export exists to do.
    if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export interface CsvColumn<T> {
    header: string;
    value: (row: T) => unknown;
}

/** A CSV document: a header row, then one row per record. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
    const lines = [columns.map(c => csvCell(c.header)).join(',')];
    for (const row of rows) {
        lines.push(columns.map(c => csvCell(c.value(row))).join(','));
    }
    // CRLF, because Excel on Windows treats a bare LF as one long line.
    return lines.join('\r\n');
}

/** A filename that says what is in it and when it was taken. */
export function exportFilename(base: string, now: Date = new Date()): string {
    const stamp = now.toISOString().slice(0, 10);
    const safe = base.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `${safe || 'export'}-${stamp}.csv`;
}
