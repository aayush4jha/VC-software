// Shows what the SHA grid parser sees in a real workbook.
//
// Reading a sheet from a screenshot is guesswork; this reads the file. Run it
// against the spreadsheet itself and it prints the sheets it found, the
// heading row it settled on, every column it detected, and the first rows as
// the platform will store them — values, colours and all.
//
//   node scripts/inspect-sheet.mjs "/path/to/WhiteINC SHA Rights Grid.xlsx"

import { readFileSync } from 'node:fs';
import XLSXpkg from 'xlsx';
const XLSX = XLSXpkg.default ?? XLSXpkg;
import { parseShaGrid, normalizeFill } from '../.shagrid-test/sha-grid.mjs';

const path = process.argv[2];
if (!path) { console.error('Usage: node scripts/inspect-sheet.mjs <file.xlsx>'); process.exit(1); }

function readSheet(ws) {
    const ref = ws['!ref'];
    if (!ref) return { matrix: [], fills: [], meta: {} };
    const range = XLSX.utils.decode_range(ref);
    const matrix = [], fills = [], display = [], links = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
        const v = [], f = [], d = [], l = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            v.push(cell?.v ?? null);
            f.push(normalizeFill(cell?.s?.fgColor?.rgb ?? null));
            d.push(cell?.w ?? null);
            l.push(cell?.l?.Target ?? null);
        }
        matrix.push(v); fills.push(f); display.push(d); links.push(l);
    }
    return { matrix, fills, meta: { display, links } };
}

const book = XLSX.read(readFileSync(path), { type: 'buffer', cellStyles: true, cellDates: true, cellNF: true });
console.log(`\nFile: ${path}`);
console.log(`Sheets: ${book.SheetNames.join(', ')}\n`);

for (const name of book.SheetNames) {
    const { matrix, fills, meta } = readSheet(book.Sheets[name]);
    const grid = parseShaGrid(matrix, fills, meta);
    console.log('─'.repeat(72));
    console.log(`SHEET "${name}" — ${matrix.length} rows × ${Math.max(0, ...matrix.map(r => r.length))} cols`);
    if (!grid) {
        console.log('  No rights grid found (no heading row containing "Rights").');
        // Show the first rows so the real shape is visible anyway.
        matrix.slice(0, 12).forEach((row, i) => {
            const cells = row.map(c => (c === null ? '' : String(c))).slice(0, 14);
            if (cells.some(c => c)) console.log(`  r${i}: ${cells.map(c => c.slice(0, 18)).join(' | ')}`);
        });
        continue;
    }

    console.log(`  title        : ${grid.title || '(none)'}`);
    console.log(`  heading row  : ${grid.headerRow} (spreadsheet row ${grid.headerRow + 1})`);
    console.log(`  rights       : ${grid.rights.length}`);
    console.log(`  columns      : ${grid.columns.length}`);
    for (const c of grid.columns) {
        console.log(`     [${c.index}] ${c.kind.padEnd(7)} "${c.label}"${c.subLabel ? ` (above: "${c.subLabel}")` : ''}`);
    }
    console.log(`  legend       : ${grid.legend.map(l => `${l.fill}=${l.label}`).join(', ') || '(none)'}`);
    console.log(`  blocks       : ${grid.blocks.map(b => `${b.title || '(untitled)'}×${b.rows.length}`).join(', ') || '(none)'}`);
    if (grid.warnings.length) console.log(`  warnings     : ${grid.warnings.join(' ')}`);

    console.log('\n  First rights, as they will be stored:');
    for (const right of grid.rights.slice(0, 6)) {
        console.log(`   ${right.sNo}. ${right.name}  [${right.remarks}]`);
        for (const c of grid.columns) {
            const cell = right.cells[c.key];
            if (!cell) continue;
            const colour = cell.fill ? ` {${cell.fill}}` : '';
            console.log(`        ${c.label.padEnd(16)} = "${cell.value}"${colour}`);
        }
    }
    console.log();
}
