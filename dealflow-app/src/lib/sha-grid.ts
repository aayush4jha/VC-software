// Reading a SHA rights grid back out of the spreadsheet it lives in.
//
// The firm maintains one of these per company — rights down the side, our
// position across the top, a colour saying how badly each right is wanted, and
// below it the SHA sections, the annexures and the cap-table arithmetic. The
// point of importing it is that the spreadsheet stays the record: nothing here
// should have to be retyped into the platform, and nothing should be dropped
// because this parser did not recognise it.
//
// So the shape is not assumed. The rights block is found by its headings, and
// everything after it is carried across as it is laid out — banner, rows,
// columns and fills — rather than squeezed into fields chosen in advance. A
// column nobody anticipated (a fourth addendum, a new investor tier) arrives
// intact because no list says which columns are allowed.
//
// Pure, pinned by scripts/verify-sha-grid.mjs.

import { normalizeLabel, type CellMatrix } from './legal-import';

/** A fill colour per cell, as "RRGGBB", aligned with the value matrix. */
export type FillMatrix = (string | null)[][];

export interface GridCell {
    /** What Excel shows in the cell: "577,206,845", "6.028%", "Sep 2022". */
    value: string;
    /** The underlying value, kept so a figure can be totalled or compared. */
    raw: string | number | null;
    fill: string | null;
    link: string | null;
}

/**
 * The display text and links a spreadsheet reader can give alongside values.
 *
 * Passing the formatted text is what makes the dashboard match the sheet
 * exactly: Excel has already decided that 0.06028 reads as "6.028%" and
 * 577206845 as "577,206,845", and re-deciding it here would produce a page
 * that disagrees with the file it claims to mirror.
 */
export interface CellMeta {
    display?: (string | null)[][];
    links?: (string | null)[][];
}

export interface GridColumn {
    /** Stable key for storage and lookup. */
    key: string;
    label: string;
    /** A heading written in the row above, such as a date over "4th addendum". */
    subLabel: string;
    index: number;
    /** Our position (Lead/Large/Angel/Investor) or a dated SHA version. */
    kind: 'tier' | 'version';
}

export interface GridRight {
    sNo: string;
    name: string;
    remarks: string;
    cells: Record<string, GridCell>;
}

export interface LegendEntry {
    fill: string;
    label: string;
}

export interface GridBlockRow {
    /** A serial or a date written to the left of the label, kept separate. */
    prefix: string;
    label: string;
    cells: GridCell[];
}

export interface GridBlock {
    title: string;
    rows: GridBlockRow[];
}

export interface ShaGrid {
    title: string;
    columns: GridColumn[];
    rights: GridRight[];
    legend: LegendEntry[];
    /** Everything below the rights grid, in the order the sheet lays it out. */
    blocks: GridBlock[];
    /** What could not be read, so a gap is visible rather than silent. */
    warnings: string[];
    headerRow: number;
}

const text = (c: unknown): string => {
    if (c === null || c === undefined) return '';
    if (c instanceof Date) return c.toISOString().slice(0, 10);
    return String(c).trim();
};

const isBlank = (c: unknown) => text(c) === '';

/** "FFC6E0B4" and "C6E0B4" are the same colour; white and black are not fills. */
export function normalizeFill(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const hex = String(raw).replace(/^#/, '').toUpperCase();
    const rgb = hex.length === 8 ? hex.slice(2) : hex;
    if (!/^[0-9A-F]{6}$/.test(rgb)) return null;
    // A plain white or black cell is the absence of a fill, not a meaning.
    if (rgb === 'FFFFFF' || rgb === '000000') return null;
    return rgb;
}

const fillAt = (fills: FillMatrix, r: number, c: number): string | null =>
    normalizeFill(fills?.[r]?.[c] ?? null);

function cellAt(
    matrix: CellMatrix, fills: FillMatrix, meta: CellMeta | undefined, r: number, c: number,
): GridCell {
    const cell: unknown = matrix[r]?.[c] ?? null;
    const shown = meta?.display?.[r]?.[c];
    return {
        value: shown !== null && shown !== undefined && shown !== '' ? String(shown).trim() : text(cell),
        raw: cell instanceof Date
            ? cell.toISOString().slice(0, 10)
            : (typeof cell === 'number' || typeof cell === 'string' ? cell : null),
        fill: fillAt(fills, r, c),
        link: meta?.links?.[r]?.[c] ?? null,
    };
}

// ─── The rights grid ──────────────────────────────────────────────────────

const TIER_WORDS = /\b(?:lead|large|angel|investor|founder|strategic)\b/;

/**
 * The row holding "Rights" and the column headings beside it.
 *
 * Searched for rather than assumed: these sheets open with a logo, a title
 * band and a merged heading, and the grid starts wherever that happens to end.
 */
export function findRightsHeader(matrix: CellMatrix): { row: number; nameCol: number; remarksCol: number } | null {
    for (let r = 0; r < Math.min(matrix.length, 40); r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        const labels = row.map(c => normalizeLabel(c));
        const nameCol = labels.findIndex(l => l === 'rights' || l === 'right');
        if (nameCol === -1) continue;
        const remarksCol = labels.findIndex((l, i) => i > nameCol && (l === 'remarks' || l === 'remark' || l === 'notes'));
        return { row: r, nameCol, remarksCol: remarksCol === -1 ? nameCol : remarksCol };
    }
    return null;
}

/**
 * Every column to the right of Remarks, whatever it is called.
 *
 * A heading left blank on the header row is taken from the row above, which is
 * where these sheets put a date over an addendum name. Nothing is filtered by
 * a list of expected columns: the firm adds one per amendment, and a column
 * that is dropped for not being recognised is exactly the data the upload is
 * supposed to preserve.
 */
export function readColumns(matrix: CellMatrix, headerRow: number, afterCol: number): GridColumn[] {
    const header = matrix[headerRow] || [];
    const above = headerRow > 0 ? (matrix[headerRow - 1] || []) : [];
    const width = Math.max(header.length, above.length);
    const columns: GridColumn[] = [];

    for (let c = afterCol + 1; c < width; c++) {
        const label = text(header[c]);
        const sub = text(above[c]);
        if (!label && !sub) continue;

        const primary = label || sub;
        const secondary = label && sub ? sub : '';
        const kind: GridColumn['kind'] = TIER_WORDS.test(normalizeLabel(primary)) ? 'tier' : 'version';
        columns.push({
            key: `c${c}`,
            label: primary,
            subLabel: secondary,
            index: c,
            kind,
        });
    }
    return columns;
}

/**
 * The rights themselves, with every column's value and fill.
 *
 * Reading stops at the first row with no name AND nothing in any column — a
 * right whose row is blank in our own tiers but filled in under an addendum is
 * still a right, and stopping on the name alone would truncate the grid.
 */
export function readRights(
    matrix: CellMatrix,
    fills: FillMatrix,
    header: { row: number; nameCol: number; remarksCol: number },
    columns: GridColumn[],
    meta?: CellMeta,
): GridRight[] {
    const rights: GridRight[] = [];
    const sNoCol = header.nameCol > 0 ? header.nameCol - 1 : -1;

    for (let r = header.row + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) break;

        const name = text(row[header.nameCol]);
        const anyValue = columns.some(col => !isBlank(row[col.index]));
        if (!name && !anyValue) break;
        // A continuation line with values but no name belongs to the right above.
        if (!name && rights.length > 0) {
            const previous = rights[rights.length - 1];
            for (const col of columns) {
                const value = text(row[col.index]);
                if (!value) continue;
                const existing = previous.cells[col.key];
                const cell = cellAt(matrix, fills, meta, r, col.index);
                previous.cells[col.key] = {
                    ...cell,
                    value: existing?.value ? `${existing.value} ${cell.value}` : cell.value,
                    fill: existing?.fill ?? cell.fill,
                    link: existing?.link ?? cell.link,
                };
            }
            continue;
        }
        if (!name) break;

        const cells: Record<string, GridCell> = {};
        for (const col of columns) {
            const cell = cellAt(matrix, fills, meta, r, col.index);
            // A cell with only a colour still says something: the colour IS
            // the requirement level, and dropping it loses the whole legend.
            if (!cell.value && !cell.fill) continue;
            cells[col.key] = cell;
        }

        rights.push({
            sNo: sNoCol >= 0 ? text(row[sNoCol]) : String(rights.length + 1),
            name,
            remarks: header.remarksCol !== header.nameCol ? text(row[header.remarksCol]) : '',
            cells,
        });
    }
    return rights;
}

// ─── The legend ───────────────────────────────────────────────────────────

/**
 * What each colour means, read from the sheet's own key.
 *
 * Taken from the file rather than hard-coded, because the colours are the
 * firm's choice and a second company's grid may use different ones. A legend
 * row is a filled cell with a label beside it.
 */
export function readLegend(matrix: CellMatrix, fills: FillMatrix, fromRow: number): LegendEntry[] {
    const seen = new Map<string, string>();

    for (let r = fromRow; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        // The key sits directly under the grid. Past the first banner we are
        // into the sections and annexures, where a coloured heading is a
        // heading and not a colour being explained.
        if (isBannerRow(row, fills, r)) break;

        let fill: string | null = null;
        let label = '';
        for (let c = 0; c < row.length; c++) {
            const cellFill = fillAt(fills, r, c);
            const value = text(row[c]);
            if (cellFill && !fill) fill = cellFill;
            if (value && !label) label = value;
            // The label sits beside the swatch, not pages away from it.
            if (fill && label && c < 8) break;
        }
        if (!fill || !label) continue;
        if (label.length > 60) continue;
        if (!seen.has(fill)) seen.set(fill, label);
    }

    return [...seen.entries()].map(([fill, label]) => ({ fill, label }));
}

/** A banner: one filled cell of short text on an otherwise empty row. */
function isBannerRow(row: unknown[], fills: FillMatrix, r: number): boolean {
    const filled = row
        .map((c, i) => ({ value: text(c), fill: fillAt(fills, r, i) }))
        .filter(c => c.value !== '');
    return filled.length === 1 && !!filled[0].fill && filled[0].value.length <= 60;
}

// ─── Everything else on the sheet ─────────────────────────────────────────

/**
 * The blocks below the grid, kept in the order the sheet lays them out.
 *
 * A banner — one filled cell of text on an otherwise empty row — starts a
 * block, and every row under it belongs to that block until the next banner.
 * No block is named in advance, so SHA Sections, Annexures, the round
 * arithmetic and anything added next quarter all arrive the same way.
 */
export function readBlocks(matrix: CellMatrix, fills: FillMatrix, fromRow: number, meta?: CellMeta): GridBlock[] {
    const blocks: GridBlock[] = [];
    let current: GridBlock | null = null;
    let labelColumn = 1;

    for (let r = fromRow; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row) || row.every(isBlank)) continue;

        if (isBannerRow(row, fills, r)) {
            const title = row.map(text).find(v => v !== '') || '';
            current = { title, rows: [] };
            blocks.push(current);
            // A banner's own column is where its rows name themselves.
            labelColumn = row.findIndex(c => text(c) !== '');
            continue;
        }

        if (!current) {
            current = { title: '', rows: [] };
            blocks.push(current);
        }

        // The label is the banner's column when that cell has text; otherwise
        // the first text cell from there on. A serial or a date sitting to the
        // left is kept as a prefix rather than mistaken for the label — these
        // sheets write "1" or "Jan'23" in column A and the name in column B.
        let labelIndex = labelColumn >= 0 && text(row[labelColumn]) !== ''
            ? labelColumn
            : row.findIndex((c, i) => i >= Math.max(0, labelColumn) && text(c) !== '');
        if (labelIndex === -1) labelIndex = row.findIndex(c => text(c) !== '');

        const prefix = row.slice(0, Math.max(0, labelIndex)).map(text).filter(Boolean).join(' ');
        const label = labelIndex >= 0 ? text(row[labelIndex]) : '';

        const cells: GridCell[] = [];
        for (let c = labelIndex + 1; c < row.length; c++) {
            const cell = cellAt(matrix, fills, meta, r, c);
            if (!cell.value && !cell.fill) continue;
            cells.push(cell);
        }
        current.rows.push({ prefix, label, cells });
    }

    return blocks.filter(b => b.title || b.rows.length > 0);
}

// ─── The whole sheet ──────────────────────────────────────────────────────

/** The title band above the grid, if there is one. */
function readTitle(matrix: CellMatrix, beforeRow: number): string {
    // "SHA GRID of WhiteInc" beats "Our Needed Rights Based On our Position",
    // which is a column heading that happens to contain the word rights.
    let strong = '';
    let weak = '';
    for (let r = 0; r < beforeRow; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
            const value = text(cell);
            if (!value || value.length > 80) continue;
            if (/\bsha\b|\bgrid\b/i.test(value)) {
                if (value.length > strong.length) strong = value;
            } else if (/\brights?\b/i.test(value) && value.length > weak.length) {
                weak = value;
            }
        }
    }
    return strong || weak;
}

export function parseShaGrid(matrix: CellMatrix, fills: FillMatrix, meta?: CellMeta): ShaGrid | null {
    const header = findRightsHeader(matrix);
    if (!header) return null;

    const columns = readColumns(matrix, header.row, header.remarksCol);
    const rights = readRights(matrix, fills, header, columns, meta);
    const afterRights = header.row + 1 + rights.length;

    const warnings: string[] = [];
    if (columns.length === 0) warnings.push('No columns were found to the right of Remarks.');
    if (rights.length === 0) warnings.push('The Rights heading was found but no rights were listed under it.');

    const legend = readLegend(matrix, fills, afterRights);
    const blocks = readBlocks(matrix, fills, afterRights, meta);

    // Colours used in the grid that the legend does not explain.
    const legendFills = new Set(legend.map(l => l.fill));
    const unexplained = new Set<string>();
    for (const right of rights) {
        for (const cell of Object.values(right.cells)) {
            if (cell.fill && !legendFills.has(cell.fill)) unexplained.add(cell.fill);
        }
    }
    if (unexplained.size > 0 && legend.length > 0) {
        warnings.push(`${unexplained.size} colour${unexplained.size === 1 ? '' : 's'} in the grid are not in the legend.`);
    }

    return {
        title: readTitle(matrix, header.row),
        columns,
        rights,
        legend,
        blocks,
        warnings,
        headerRow: header.row,
    };
}

// ─── Mapping onto the tracker ─────────────────────────────────────────────

/**
 * A grid row matched to one of the tracker's rights, so the counts and alerts
 * on the Legal page keep working.
 *
 * Matched on the name as written. Nothing is invented: a right in the sheet
 * that the tracker has no slot for is reported, not quietly discarded, and the
 * grid keeps it either way.
 */
const TRACKER_SYNONYMS: Record<string, string[]> = {
    board_seat: ['board seat'],
    board_observer: ['board observer', 'observer'],
    information_rights: ['information rights', 'information right'],
    anti_dilution: ['anti dilution', 'antidilution'],
    pre_emptive: ['pre emptive rights', 'pre emptive', 'preemptive', 'pro rata rights', 'pro rata'],
    tag_along: ['tag along'],
    drag_along: ['drag along'],
    liquidation_preference: ['liquidation preference'],
    exit_rights: ['exit rights', 'minimum exit irr exit', 'minimum exit irr', 'exit right'],
    reserved_matters: ['reserved matters', 'consent rights', 'reserved matter'],
};

export function trackerKeyFor(rightName: string): string | null {
    const norm = normalizeLabel(rightName);
    if (!norm) return null;
    for (const [key, names] of Object.entries(TRACKER_SYNONYMS)) {
        if (names.some(n => norm === n)) return key;
    }
    for (const [key, names] of Object.entries(TRACKER_SYNONYMS)) {
        if (names.some(n => norm.includes(n))) return key;
    }
    return null;
}

export type GridStatus = 'available' | 'not_available' | 'triggered' | 'lost' | 'unknown';

/**
 * What a cell says about whether we hold the right.
 *
 * These grids say "YES", "Yes", "yes", "Require", "Yes-wa" and whole sentences
 * explaining a condition. Anything affirmative counts as held; an explicit
 * negative counts as not held; a sentence that is neither is left unknown
 * rather than guessed, because the sentence usually IS the caveat.
 */
export function statusFromCell(value: string): GridStatus {
    const v = normalizeLabel(value);
    if (!v) return 'unknown';
    if (/^(?:yes|y|require|required|available|have|part [ab])\b/.test(v)) return 'available';
    if (/^(?:no|not available|na|n a|nil|none)\b/.test(v)) return 'not_available';
    if (/\blost\b|\bfallen away\b|\bfall away\b/.test(v)) return 'lost';
    if (/\btriggered\b/.test(v)) return 'triggered';
    if (/\bnot (?:now|in this round|applicable)\b/.test(v)) return 'not_available';
    // normalizeLabel strips "in", "this" and the like, so "Not in this round"
    // arrives as "not this round". A cell that opens with "not" is a negative
    // whatever follows it.
    if (/^not\b/.test(v)) return 'not_available';
    if (/\byes\b/.test(v)) return 'available';
    return 'unknown';
}

/** A percentage threshold mentioned in a remark, such as "below 5% equity". */
export function thresholdFromText(remark: string): number | null {
    if (!remark) return null;
    const match = remark.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match) return null;
    const n = parseFloat(match[1]);
    return isFinite(n) && n > 0 && n <= 100 ? n : null;
}

export interface TrackerUpdate {
    rightKey: string;
    rightName: string;
    status: GridStatus;
    thresholdPct: number | null;
    conditionText: string;
    documentRef: string;
}

/**
 * The tracker rows a grid implies.
 *
 * The newest column that says anything is the one that counts — these sheets
 * append a column per amendment, so the rightmost non-empty value is the
 * current position and the earlier ones are history.
 */
export function trackerUpdatesFrom(grid: ShaGrid): { updates: TrackerUpdate[]; unmatched: string[] } {
    const updates: TrackerUpdate[] = [];
    const unmatched: string[] = [];
    const versionColumns = grid.columns.filter(c => c.kind === 'version');
    const tierColumns = grid.columns.filter(c => c.kind === 'tier');

    for (const right of grid.rights) {
        const key = trackerKeyFor(right.name);
        if (!key) { unmatched.push(right.name); continue; }

        let current = '';
        let source = '';
        for (const col of [...versionColumns].reverse()) {
            const cell = right.cells[col.key];
            if (cell?.value) { current = cell.value; source = col.subLabel || col.label; break; }
        }
        if (!current) {
            for (const col of tierColumns) {
                const cell = right.cells[col.key];
                if (cell?.value) { current = cell.value; source = col.label; break; }
            }
        }

        updates.push({
            rightKey: key,
            rightName: right.name,
            status: statusFromCell(current),
            thresholdPct: thresholdFromText(right.remarks) ?? thresholdFromText(current),
            // The sentence in the cell is the condition, and it is worth more
            // than the word "yes" that precedes it.
            conditionText: [right.remarks, current].filter(Boolean).join(' — ').slice(0, 500),
            documentRef: source,
        });
    }

    return { updates, unmatched };
}

// ─── What the dashboard leads with ────────────────────────────────────────

export interface HeadlineFigure {
    key: string;
    label: string;
    /** As the sheet displays it, so the page and the file agree exactly. */
    value: string;
    /** Which block it came from, so a figure can be traced back. */
    source: string;
}

/**
 * The figures worth putting at the top of a company's legal page.
 *
 * Recognised by what the sheet calls them rather than by position, because
 * these blocks are written by hand and the same number appears two rows apart
 * in two different companies' files. The FIRST match wins: these sheets put
 * the current round on the left and the next round beside it, and the current
 * one is what a dashboard should lead with.
 *
 * Anything not recognised is not lost — it is still shown in its own block
 * further down the page.
 */
const HEADLINE_LABELS: { key: string; label: string; match: RegExp }[] = [
    { key: 'investment', label: 'Our investment', match: /^our investment$|^amount investment$|^investment amount$/ },
    { key: 'valuation', label: 'Valuation', match: /^valuation$|^valuation when invested$/ },
    { key: 'holding', label: 'Our holding', match: /^percent holding amt$|^percent holding$|^percent holding no shares$|^holding$|^our holding rights$/ },
    { key: 'shares', label: 'Shares held', match: /^no shares$|^number shares$|^no of shares$/ },
    { key: 'price', label: 'Issue price', match: /^issue price$|^price acquisition$|^per share value$/ },
    { key: 'round', label: 'Round size', match: /^round size$|^new round size$/ },
    { key: 'date', label: 'Invested', match: /^date investment$|^investment date$/ },
    { key: 'dilution', label: 'Dilution', match: /^dilution$/ },
];

export function headlineFigures(grid: ShaGrid): HeadlineFigure[] {
    const found = new Map<string, HeadlineFigure>();

    for (const block of grid.blocks) {
        for (const row of block.rows) {
            const label = normalizeLabel(row.label);
            if (!label) continue;
            const match = HEADLINE_LABELS.find(h => h.match.test(label));
            if (!match || found.has(match.key)) continue;
            // The leftmost cell with something in it: the current column.
            const cell = row.cells.find(c => c.value !== '');
            if (!cell) continue;
            found.set(match.key, {
                key: match.key,
                label: match.label,
                value: cell.value,
                source: block.title || 'Sheet',
            });
        }
    }

    // Kept in the order they are declared, not the order the sheet happens to
    // list them, so two companies' pages read the same way.
    return HEADLINE_LABELS.map(h => found.get(h.key)).filter((f): f is HeadlineFigure => !!f);
}

/**
 * How many rights sit in each legend colour, for the summary row.
 * Counted on the newest column that has any colour at all, which is the
 * firm's current position rather than what it wanted at the first round.
 */
export function rightsByLegend(grid: ShaGrid): { label: string; fill: string; count: number }[] {
    const counts = new Map<string, number>();

    for (const right of grid.rights) {
        let fill: string | null = null;
        for (const col of grid.columns) {
            const cell = right.cells[col.key];
            if (cell?.fill) fill = cell.fill;
        }
        if (!fill) continue;
        counts.set(fill, (counts.get(fill) ?? 0) + 1);
    }

    return grid.legend
        .map(l => ({ label: l.label, fill: l.fill, count: counts.get(l.fill) ?? 0 }))
        .filter(l => l.count > 0);
}

/** The amendment columns, newest last — the SHA versions the grid tracks. */
export function versionColumns(grid: ShaGrid): GridColumn[] {
    return grid.columns.filter(c => c.kind === 'version');
}
