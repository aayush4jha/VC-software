// Pins src/lib/sha-grid.ts — see package.json's test:shagrid.
//
// The fixture is the WhiteInc grid as it is actually laid out: a logo band, a
// merged heading, our four investor tiers, three dated amendment columns, a
// legend of three colours, and the SHA sections, annexures and cap-table
// arithmetic below. The point of the module is that nothing is lost, so most
// of these check that something survived rather than that it was transformed.

import {
    parseShaGrid, findRightsHeader, readColumns, readLegend, readBlocks,
    normalizeFill, trackerKeyFor, statusFromCell, thresholdFromText, trackerUpdatesFrom,
    headlineFigures, rightsByLegend, versionColumns, columnLetter, rightsRowRange,
} from '../.shagrid-test/sha-grid.mjs';

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
}

const GREEN = 'C6E0B4';      // Needed
const LIGHT = 'E2EFDA';      // Needed in some situations
const PEACH = 'FCE4D6';      // Optional
const BANNER = 'F4B183';

// Columns: A S.No | B Rights | C Remarks | D Lead | E Large | F Angel | G Investor | H 19-12-2023 | I 1-3-24 | J 26-8-24 | K | L EMBER
const M = [
    [null, 'DHOLAKIA VENTURES', 'SHA GRID of WhiteInc'],
    [],
    [null, null, null, 'Our Needed Rights Based On our Position', null, null, null, null, null, '4th addendum', null, 'EMBER'],
    ['S No.', 'Rights', 'Remarks', 'Lead Investor', 'Large Investor', 'Angel Investor', 'Investor', '19-12-2023', '1-3-24', '26-8-24', null, 'YES'],
    [1, 'Board Seat', 'Fall away if we go below 5% equity', null, 'YES', null, null, 'not now as threshold limit of 6% and we diluted.', 'Need to ask as rc have right', '4.74%', null, 'YES'],
    [2, 'Board Observer', '', null, 'YES', null, null, 'yes', 'yes', null, null, 'YES'],
    [3, 'Reserved Matters', 'Not required if the lead is a vintage investor', null, 'Require', null, null, 'yes', 'yes', null, null, 'YES- PART A FALL <2.5% PART B FALL <10%. CURRENTLY WE HAVE PART A'],
    [4, 'Anti Dilution', 'Formula based', null, 'Yes-wa', null, null, 'Yes', 'yes', null, null, 'YES'],
    [5, 'Pre-emptive Rights', 'As lead- waterfall to us if others do not use the right', null, 'Yes', null, null, 'Yes', 'yes', null, null, 'YES'],
    [6, "Founder's Exit ROFR", 'On Pro-rata basis', null, 'Yes', null, null, 'Yes', 'yes', null, null, 'YES'],
    [7, 'Founders Vesting', '', null, 'Yes', null, null, 'Yes', 'yes', null, null, 'YES'],
    [8, 'Tag Along', '', null, 'Require', null, null, 'Yes', 'yes', null, null, 'YES'],
    [9, 'Drag Along', '', null, 'Require', null, null, 'Yes', 'yes', null, null, 'YES'],
    [10, 'Liquidation Preference', 'Min 1x, without cap', null, 'Require', null, null, 'Yes', 'yes', null, null, 'YES'],
    [11, 'ESOP  dilution safeguard', 'At par with all investors', null, 'Require', null, null, 'Not in this round as not', null, null, null, 'YES'],
    [12, 'More Favoured Terms Safeguard', '', null, 'Require', null, null, null, null, null, null, null],
    [13, 'Minimum Exit IRR on Exit (if available)', 'Strategic, third party,', null, 'Require', null, null, null, null, null, null, 'YES'],
    [14, 'Information rights', 'Hygine', null, 'Require', null, null, 'Yes', 'yes', null, null, 'YES'],
    [],
    [null, 'Needed'],
    [null, 'Needed in some situations'],
    [null, 'Optional'],
    [],
    [null, 'SHA Sections'],
    [1, 'Definition & Interpretation', null, null, 'Yes'],
    [2, 'Representation & Warranties', null, null, 'Yes'],
    [3, 'ESOP Pool structuring', null, null, 'Yes'],
    [],
    [null, 'Annexures'],
    [null, 'Current Cap table', 'https://drive.google.com/file/d/1Mhnr/view'],
    [null, 'All incoming investors'],
    ['Jan’23', 'ROUND SIZE', 528856570, null, 30132000, 558988570],
    [null, 'OUR INVESTMENT', 34793235, null, 34793235, '6.22%'],
    [null, 'NO OF SHARES', 161829, null, 161829],
    [null, 'ISSUE PRICE', 215, null, 372],
    [null, 'VALUATION', 577206845, null, 1028834076],
    [],
    [null, 'After Ember Captable'],
    [null, 'Date of investment', 'Sep 2022'],
    [null, 'No of shares', 161829],
    [null, 'multiple', 1.32, 1.70],
];

// Fills: the legend swatches sit in column A; the tier cells carry the colour.
const F = M.map(() => []);
const setFill = (r, c, colour) => { F[r][c] = colour; };
setFill(3, 3, GREEN); setFill(3, 4, GREEN); setFill(3, 5, GREEN); setFill(3, 6, GREEN);
setFill(4, 4, LIGHT);                       // Board Seat / Large Investor
setFill(5, 4, LIGHT); setFill(5, 5, PEACH); // Board Observer
setFill(6, 4, GREEN);                       // Reserved Matters
setFill(7, 4, GREEN); setFill(7, 6, GREEN);
setFill(19, 0, GREEN);                      // legend
setFill(20, 0, LIGHT);
setFill(21, 0, PEACH);
setFill(23, 1, BANNER);                     // SHA Sections banner
setFill(28, 1, BANNER);                     // Annexures banner
setFill(37, 1, BANNER);                     // After Ember banner

console.log('— colours —');
check('a plain hex', normalizeFill('C6E0B4'), 'C6E0B4');
check('an alpha prefix is dropped', normalizeFill('FFC6E0B4'), 'C6E0B4');
check('a leading hash', normalizeFill('#c6e0b4'), 'C6E0B4');
check('white is not a fill', normalizeFill('FFFFFF'), null);
check('black is not a fill', normalizeFill('FF000000'), null);
check('nothing', normalizeFill(null), null);
check('junk', normalizeFill('not a colour'), null);

console.log('— finding the grid in a sheet that does not start at A1 —');
const header = findRightsHeader(M);
check('the header row', header.row, 3);
check('the name column', header.nameCol, 1);
check('the remarks column', header.remarksCol, 2);
check('a sheet with no Rights heading', findRightsHeader([['a', 'b']]), null);

console.log('— every column survives, including ones nobody listed —');
const cols = readColumns(M, 3, 2);
check('eight columns', cols.length, 8);
check('the four tiers', cols.filter(c => c.kind === 'tier').map(c => c.label),
      ['Lead Investor', 'Large Investor', 'Angel Investor', 'Investor']);
check('the amendment columns', cols.filter(c => c.kind === 'version').map(c => c.label),
      ['19-12-2023', '1-3-24', '26-8-24', 'EMBER']);
// The EMBER column's header cell holds "YES" — the amendment's answer, not
// its name. The name written above it is the name.
check('a header cell holding a value is not the column name',
      cols.find(c => c.index === 11).subLabel, 'YES');
check('a heading from the row above is kept', cols.find(c => c.label === '26-8-24').subLabel, '4th addendum');
check('and so is EMBER', cols.find(c => c.index === 11).label, 'EMBER');

const grid = parseShaGrid(M, F);

console.log('— the rights —');
check('all fourteen', grid.rights.length, 14);
check('the first', grid.rights[0].name, 'Board Seat');
check('the last', grid.rights[13].name, 'Information rights');
check('its serial number', grid.rights[0].sNo, '1');
check('its remark', grid.rights[0].remarks, 'Fall away if we go below 5% equity');
check('a tier value', grid.rights[0].cells.c4.value, 'YES');
check('and its colour', grid.rights[0].cells.c4.fill, LIGHT);
check('a long amendment sentence is kept whole', grid.rights[0].cells.c7.value,
      'not now as threshold limit of 6% and we diluted.');
check('a cell coloured but empty is still kept', grid.rights[3].cells.c6?.fill ?? null, GREEN);
check('and it has no value', grid.rights[3].cells.c6?.value, '');
check('a blank cell with no colour is absent', grid.rights[1].cells.c3, undefined);
check('the EMBER sentence survives in full', grid.rights[2].cells.c11.value,
      'YES- PART A FALL <2.5% PART B FALL <10%. CURRENTLY WE HAVE PART A');
check('the title band', grid.title, 'SHA GRID of WhiteInc');

console.log('— the legend is read from the sheet, not assumed —');
check('three entries', grid.legend.length, 3);
check('needed', grid.legend.find(l => l.fill === GREEN).label, 'Needed');
check('situational', grid.legend.find(l => l.fill === LIGHT).label, 'Needed in some situations');
check('optional', grid.legend.find(l => l.fill === PEACH).label, 'Optional');

console.log('— everything below the grid comes across —');
const titles = grid.blocks.map(b => b.title);
check('the banners become blocks', titles.includes('SHA Sections') && titles.includes('Annexures') && titles.includes('After Ember Captable'), true);
const sections = grid.blocks.find(b => b.title === 'SHA Sections');
check('three sections', sections.rows.length, 3);
check('a section name', sections.rows[0].label, 'Definition & Interpretation');
check('its serial is kept, apart from the name', sections.rows[0].prefix, '1');
check('and its value', sections.rows[0].cells[sections.rows[0].cells.length - 1].value, 'Yes');
const annex = grid.blocks.find(b => b.title === 'Annexures');
check('the cap table link survives', annex.rows[0].cells[0].value, 'https://drive.google.com/file/d/1Mhnr/view');
check('the round arithmetic lands in the same block', annex.rows.some(r => r.label === 'ROUND SIZE'), true);
check('and the date note beside it survives', annex.rows.find(r => r.label === 'ROUND SIZE').prefix, "Jan\u201923");
check('a number keeps its value', annex.rows.find(r => r.label === 'VALUATION').cells[0].value, '577206845');
check('a second figure on the same row', annex.rows.find(r => r.label === 'ISSUE PRICE').cells.length, 2);
const ember = grid.blocks.find(b => b.title === 'After Ember Captable');
check('the later block too', ember.rows.length, 3);
check('a decimal', ember.rows[2].cells[0].value, '1.32');

console.log('— nothing silently wrong —');
check('no warnings on a clean grid', grid.warnings, []);
check('a sheet with no grid at all', parseShaGrid([['nothing', 'here']], [[]]), null);

console.log('— matching a right to the tracker —');
check('exact', trackerKeyFor('Board Seat'), 'board_seat');
check('punctuated', trackerKeyFor('Pre-emptive Rights'), 'pre_emptive');
check('a longer name containing one', trackerKeyFor('Minimum Exit IRR on Exit (if available)'), 'exit_rights');
check('information rights', trackerKeyFor('Information rights'), 'information_rights');
check('one the tracker has no slot for', trackerKeyFor('More Favoured Terms Safeguard'), null);
check('nothing', trackerKeyFor(''), null);

console.log('— what a cell says about holding the right —');
check('YES', statusFromCell('YES'), 'available');
check('lowercase yes', statusFromCell('yes'), 'available');
check('Require', statusFromCell('Require'), 'available');
check('Yes-wa', statusFromCell('Yes-wa'), 'available');
check('a sentence beginning YES', statusFromCell('YES- PART A FALL <2.5%'), 'available');
check('not in this round', statusFromCell('Not in this round as not'), 'not_available');
check('not now', statusFromCell('not now as threshold limit of 6% and we diluted.'), 'not_available');
check('a question is not an answer', statusFromCell('Need to ask as rc have right'), 'unknown');
check('blank', statusFromCell(''), 'unknown');
check('a fall-away note', statusFromCell('Fall away below 5%'), 'lost');

console.log('— a threshold written in a remark —');
check('below 5% equity', thresholdFromText('Fall away if we go below 5% equity'), 5);
check('a decimal', thresholdFromText('PART B FALL <10.5%'), 10.5);
check('no percentage', thresholdFromText('Formula based'), null);
check('nothing', thresholdFromText(''), null);

console.log('— the tracker rows a grid implies —');
const { updates, unmatched } = trackerUpdatesFrom(grid);
check('one per matched right', updates.length, 10);
check('matched plus unmatched is every right', updates.length + unmatched.length, grid.rights.length);
check('the unmatched are named, not dropped', unmatched,
      ["Founder's Exit ROFR", 'Founders Vesting', 'ESOP  dilution safeguard', 'More Favoured Terms Safeguard']);
const seat = updates.find(u => u.rightKey === 'board_seat');
check('the newest column wins', seat.status, 'available');
check('and is cited', seat.documentRef, 'YES');
check('the threshold comes from the remark', seat.thresholdPct, 5);
check('the condition keeps the sentence', seat.conditionText.includes('Fall away if we go below 5% equity'), true);

console.log('— a column is never lost for having an awkward heading —');
// What went wrong on the real file: only the two columns with plain headings
// survived, so two investor tiers and every amendment column disappeared.
const SPARSE = [
    [null, null, null, null, null, null, null, null, '4th addendum', null, 'EMBER'],
    ['S No.', 'Rights', 'Remarks', 'Lead Investor', 'Large Investor', null, null, null, null, null, null],
    [1, 'Board Seat', 'Fall away below 5%', null, 'YES', 'YES', 'Require', 'yes', '4.74%', null, 'YES'],
    [2, 'Board Observer', '', null, 'YES', null, null, 'yes', null, null, 'YES'],
];
const SPARSE_F = SPARSE.map(() => []);
SPARSE_F[2][3] = GREEN;
const sparse = parseShaGrid(SPARSE, SPARSE_F);
check('every column with data is kept', sparse.columns.length, 7);
check('a blank heading falls back to its spreadsheet letter',
      sparse.columns.map(c => c.label),
      ['Lead Investor', 'Large Investor', 'F', 'G', 'H', '4th addendum', 'EMBER']);
check('the values under them survive', sparse.rights[0].cells.c6.value, 'Require');
check('and the amendment figure', sparse.rights[0].cells.c8.value, '4.74%');
check('a heading only in the row above is used', sparse.columns.find(c => c.index === 10).label, 'EMBER');
check('a column that is empty everywhere is not invented',
      sparse.columns.some(c => c.index === 9), false);
check('a column used only by a colour is kept',
      parseShaGrid(SPARSE, SPARSE_F).columns.some(c => c.index === 3), true);

console.log('— spreadsheet column letters —');
check('the first', columnLetter(0), 'A');
check('the twenty-sixth', columnLetter(25), 'Z');
check('and the one after', columnLetter(26), 'AA');
check('deep into the sheet', columnLetter(27), 'AB');

console.log('— where the rights block ends —');
check('it stops before the legend', rightsRowRange(M, 3, 1), [4, 18]);
check('a wrapped row stays inside it', rightsRowRange([
    ['Rights'], ['Board Seat', 'yes'], [null, 'continued'], [], ['Needed'],
], 0, 0), [1, 3]);

console.log('— the page shows what Excel shows —');
// 0.06028 reads as "6.028%" in the sheet; re-deciding that here would produce
// a page that disagrees with the file it claims to mirror.
const DISPLAY = M.map(() => []);
DISPLAY[31] = [];
DISPLAY[31][2] = '528,856,570';
const LINKS = M.map(() => []);
LINKS[29] = [];
LINKS[29][2] = 'https://drive.google.com/file/d/1Mhnr/view';
const rich = parseShaGrid(M, F, { display: DISPLAY, links: LINKS });
const richAnnex = rich.blocks.find(b => b.title === 'Annexures');
check('the formatted text is used', richAnnex.rows.find(r => r.label === 'ROUND SIZE').cells[0].value, '528,856,570');
check('the number underneath is kept', richAnnex.rows.find(r => r.label === 'ROUND SIZE').cells[0].raw, 528856570);
check('a hyperlink survives', richAnnex.rows[0].cells[0].link, 'https://drive.google.com/file/d/1Mhnr/view');
check('a row with nothing beside its label has no cells', richAnnex.rows[1].cells.length, 0);
check('without display text the raw value is shown', grid.blocks.find(b => b.title === 'Annexures')
      .rows.find(r => r.label === 'ROUND SIZE').cells[0].value, '528856570');

console.log('— the figures the dashboard leads with —');
const heads = headlineFigures(grid);
check('they are recognised by name wherever they sit', heads.map(h => h.key),
      ['investment', 'valuation', 'shares', 'price', 'round', 'date']);
check('one found in a later block still counts', heads.find(h => h.key === 'date').source, 'After Ember Captable');
check('our investment', heads.find(h => h.key === 'investment').value, '34793235');
check('the leftmost column wins, not the next round', heads.find(h => h.key === 'round').value, '528856570');
check('each says where it came from', heads[0].source, 'Annexures');
check('an empty grid has no headlines', headlineFigures({ ...grid, blocks: [] }), []);

console.log('— the summary of colours —');
const byLegend = rightsByLegend(grid);
check('every counted colour is in the legend', byLegend.every(b => grid.legend.some(l => l.fill === b.fill)), true);
check('and none is counted zero', byLegend.every(b => b.count > 0), true);
check('a grid with no colours counts nothing', rightsByLegend({ ...grid, rights: [] }), []);

console.log('— the amendment columns —');
check('four of them', versionColumns(grid).length, 4);
check('the newest is last', versionColumns(grid)[3].label, 'EMBER');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
