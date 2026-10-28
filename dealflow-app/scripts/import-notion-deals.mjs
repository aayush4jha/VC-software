// One-off import of the Notion deal-flow export into Deal Flow.
//
//   node --env-file=.env.local scripts/import-notion-deals.mjs <file.csv>            dry run: writes nothing
//   node --env-file=.env.local scripts/import-notion-deals.mjs <file.csv> --commit   creates the companies
//
// Every company it creates carries ingestion_source 'notion-import' and the tag
// 'notion-import', so the whole batch can be found or removed in one query.

import { readFileSync } from 'fs';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const SOURCE = 'notion-import';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: import-notion-deals.mjs <file.csv> [--commit]'); process.exit(1); }
const COMMIT = flag === '--commit';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── The file ──────────────────────────────────────────────────────────────
// Parsed by xlsx rather than split on commas: names like "Building A Scalable\nLive Touring IP" span lines.
// Notion starts the file with a byte-order mark, which would otherwise become part of the "Name" heading.
const wb = XLSX.read(readFileSync(file, 'utf8').replace(/^﻿/, ''), { type: 'string', raw: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const col = (r, name) => String(r[name] ?? '').replace(/\s+/g, ' ').trim();

// ── Decisions agreed with the team ───────────────────────────────────────
// Notion "Deal Status" → where the company lands. `terminal` takes it off the active board.
function placement(status) {
    switch (status) {
        case 'Thesis Check': return { stage: 'Thesis Check' };
        case 'Initial Screening': return { stage: 'Initial Screening' };
        case 'Intro Call Analysis': return { stage: 'Intro Call' };
        case 'Filter Discussion': return { stage: 'Filter Discussion' };
        case 'Filter IC': return { stage: 'Filter IC' };
        case 'Filter Due Diligence': return { stage: 'Due Diligence' };
        case 'Rejected': return { stage: 'Thesis Check', terminal: 'Rejected' };
        case 'Awaiting Response/Blocker': return { stage: 'Thesis Check', terminal: 'Awaiting Response' };
        case 'Next Round Evaluation': return { stage: 'Thesis Check', terminal: 'Next Round Analysis' };
        // Columns of their own on the board, named as in Notion.
        case 'To be Rejected': return { stage: 'To be Rejected', tag: 'to-be-rejected' };
        case 'Priority': return { stage: 'Priority', tag: 'priority', priority: 'High' };
        case 'Whatsapp Deals': return { stage: 'Whatsapp Deals', tag: 'whatsapp-deal' };
        case '': return { stage: 'Thesis Check', tag: 'no-status' };
        default: return null;
    }
}

// Notion's free-text "Round Stage" → the platform's fixed rounds. Unknown → null (left at the column default).
function round(value) {
    const f = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!f) return null;
    if (/pre ?ipo/.test(f)) return 'Pre-IPO';
    if (/\bipo\b/.test(f)) return 'IPO';
    if (/pre ?series ?b/.test(f)) return 'Pre-Series B';
    if (/pre ?series ?a|pre a\b/.test(f)) return 'Pre-Series A';
    if (/pre ?seed|angel|ideation/.test(f)) return 'Pre-Seed';
    if (/series ?[cde]\b/.test(f)) return 'Growth Stage';
    if (/series ?b/.test(f)) return 'Series B';
    if (/series ?a/.test(f)) return 'Series A';
    if (/^seed$/.test(f)) return 'Seed';
    return null; // "Bridge", "CCPS", "Secondary Trade", "20 Cr." name no round
}

// The first industry Notion lists, matched to the platform's list. The full text is kept in sub-industry.
const INDUSTRY_ALIASES = {
    'fintech': 'FinTech', 'ed tech': 'Edtech', 'edtech': 'Edtech', 'ed tech for organisations': 'Edtech',
    'healthcare': 'Healthcare', 'healthtech': 'Healthtech', 'medtech': 'Healthtech', 'healthcare ai': 'Healthtech',
    'consumer': 'Consumer', 'consumer tech': 'Consumer', 'consumer internet': 'Consumer',
    'saas': 'SAAS', 'b2b saas': 'SAAS', 'enterprise saas': 'SAAS', 'ai saas': 'SAAS',
    'ai': 'AI', 'ai ml': 'AI', 'generative ai': 'AI', 'artificial intelligence': 'AI', 'computer vision': 'AI',
    'climate tech': 'Climatetech', 'cleantech': 'Cleantech', 'clean tech': 'Cleantech',
    'e commerce': 'Ecommerce', 'b2c ecommerce': 'Ecommerce', 'b2b e commerce': 'Ecommerce',
    'space tech': 'Spaceteach', 'spacetech ancillary': 'Spaceteach',
    'defence': 'Defense', 'defence tech': 'Defense', 'defense': 'Defense',
    'cyber security': 'Cybersecurity', 'gaming': 'Gaming', 'real money gaming': 'Gaming',
    'real estate': 'Real Estate Tech', 'real estate tech': 'Real Estate Tech', 'proptech': 'Real Estate Tech',
    'media entertainment': 'Mediatech', 'media': 'Mediatech', 'digital media': 'Digital Media',
    'pet care': 'Petcare/Healthcare', 'sports tech': 'Sportstech', 'sports': 'Sportstech',
    'ev': 'EV', 'ev mobility': 'EV', 'ev charging solutions': 'EV', 'd2c': 'D2C', 'd2c consumer': 'D2C',
    'foodtech': 'Foodtech', 'manufacturing': 'Manufacturing', 'marketplace': 'Marketplace',
    'logistics': 'Supply Chain', 'logistic tech': 'Supply Chain', 'b2b supply chain': 'Supply Chain',
    'financial services': 'Financial Services', 'solar': 'Renewable Energy', 'solar energy': 'Renewable Energy',
    'renewable energy': 'Renewable Energy', 'marketing': 'Marketing Tech', 'restaurants': 'Restaurant',
    'fashion': 'Fashion Tech', 'fashion and lifestyle': 'Fashion Tech', 'deep tech': 'Hardware',
    'semiconductor': 'Hardware', 'iot': 'Hardware', 'robotics': 'Hardware',
};
const fold = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// One company per name: "Hooliv", "Hooliv " and "HOOLIV Pvt. Ltd." are the same company.
const nameKey = s => s.normalize('NFKC').toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|pte)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '');

// Rows that are not a company at all.
const isJunk = name => !name || /^https?:\/\/app\.notion\.com/i.test(name) || /^no name$/i.test(name);

// ── Platform data ─────────────────────────────────────────────────────────
const [{ data: stages }, { data: profiles }, { data: industries }] = await Promise.all([
    db.from('pipeline_stages').select('id, name').eq('organization_id', ORGANIZATION_ID),
    db.from('profiles').select('id, name'),
    db.from('industries').select('id, name').eq('organization_id', ORGANIZATION_ID),
]);
// A page at a time: Supabase stops at 1,000 rows without saying so, and a
// re-run that saw only the newest 1,000 would import everything older again.
const existing = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('companies').select('company_name')
        .eq('organization_id', ORGANIZATION_ID).order('id').range(from, from + 999);
    if (error) { console.error(error.message); process.exit(1); }
    existing.push(...data);
    if (data.length < 1000) break;
}
const stageId = Object.fromEntries(stages.map(s => [s.name, s.id]));
const industryId = Object.fromEntries(industries.map(i => [i.name, i.id]));
// Analysts by first name; only those who have a platform account can be assigned.
const analystId = {};
for (const p of profiles) {
    const first = (p.name || '').split(/\s+/)[0].toLowerCase();
    if (first && !analystId[first]) analystId[first] = p.id;
}
const existingKeys = new Set(existing.map(c => nameKey(c.company_name)));

// ── Build ────────────────────────────────────────────────────────────────
const report = { rows: rows.length, junk: [], unknownStatus: {}, onPlatform: [], csvRepeats: 0, byPlacement: {},
    unassignedAnalysts: {}, unmatchedIndustries: {}, unknownRounds: {} };

// Later rows win: walk bottom-up and keep the first sighting of each name.
const chosen = new Map();
for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const name = col(r, 'Name');
    if (isJunk(name)) { if (name) report.junk.push(name); continue; }
    const key = nameKey(name);
    if (!key) { report.junk.push(name); continue; }
    if (chosen.has(key)) { report.csvRepeats++; continue; }
    chosen.set(key, r);
}

const inserts = [];
for (const [key, r] of [...chosen].reverse()) {
    const name = col(r, 'Name');
    if (existingKeys.has(key)) { report.onPlatform.push(name); continue; }

    const status = col(r, 'Deal Status');
    const roundText = col(r, 'Round Stage');
    const place = placement(status);
    if (!place) { report.unknownStatus[status] = (report.unknownStatus[status] || 0) + 1; continue; }
    const label = place.terminal ? `${place.terminal} (off board)` : `${place.stage}${place.tag ? ` · ${place.tag}` : ''}`;
    report.byPlacement[label] = (report.byPlacement[label] || 0) + 1;

    const analysts = col(r, 'Analyst').split(',').map(s => s.trim()).filter(Boolean);
    const analyst = analysts.map(a => analystId[a.toLowerCase()]).find(Boolean) || null;
    if (!analyst) for (const a of analysts) report.unassignedAnalysts[a] = (report.unassignedAnalysts[a] || 0) + 1;

    const industryText = col(r, 'Industry');
    const firstIndustry = industryText.split(',')[0].trim();
    const industryName = firstIndustry && (industries.find(i => fold(i.name) === fold(firstIndustry))?.name
        || INDUSTRY_ALIASES[fold(firstIndustry)]);
    if (firstIndustry && !industryId[industryName]) report.unmatchedIndustries[firstIndustry] = (report.unmatchedIndustries[firstIndustry] || 0) + 1;

    const companyRound = round(roundText);
    if (roundText && !companyRound) report.unknownRounds[roundText] = (report.unknownRounds[roundText] || 0) + 1;

    const tags = [SOURCE];
    if (place.tag) tags.push(place.tag);
    if (/^yes$/i.test(col(r, 'Rejection Email'))) tags.push('rejection-email-sent');

    // What the platform has no field for, kept where the team can read it.
    const notes = [
        col(r, 'Deal Source') && `Deal source (Notion): ${col(r, 'Deal Source')}`,
        analysts.length && `Analyst (Notion): ${analysts.join(', ')}`,
        roundText && !companyRound && `Round (Notion): ${roundText}`,
        `Notion status: ${status || '(none)'}`,
    ].filter(Boolean).join('\n');

    const row = {
        organization_id: ORGANIZATION_ID,
        company_name: name,
        founder_name: '',
        analyst_id: analyst,
        pipeline_stage_id: stageId[place.stage],
        terminal_status: place.terminal || null,
        priority_level: place.priority || 'Medium',
        industry_id: industryId[industryName] || null,
        sub_industry: industryText,
        custom_tags: tags,
        notes,
        needs_review: false,
        ingestion_source: SOURCE,
        // Set even when unknown: a batch insert sends null for a key some rows lack, not the column default.
        company_round: companyRound || 'Seed',
    };
    inserts.push(row);
}

// ── Report ───────────────────────────────────────────────────────────────
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
console.log(`\nRows in file:                 ${report.rows}`);
console.log(`Blank / not a company:        ${rows.length - chosen.size - report.csvRepeats}${report.junk.length ? `  (${report.junk.join('; ')})` : ''}`);
console.log(`Repeats within the CSV:       ${report.csvRepeats}`);
console.log(`Already on the platform:      ${report.onPlatform.length}${report.onPlatform.length ? `  (${report.onPlatform.join(', ')})` : ''}`);
console.log(`Unknown Deal Status (skipped): ${JSON.stringify(report.unknownStatus)}`);
console.log(`\nTo create: ${inserts.length}`);
for (const [k, v] of top(report.byPlacement)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`\nAnalysts with no platform account (left unassigned, name kept in notes):`);
for (const [k, v] of top(report.unassignedAnalysts)) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`\nRounds that name no platform round (kept in notes): ${top(report.unknownRounds).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
const unmatched = top(report.unmatchedIndustries);
console.log(`\nIndustries with no platform match (${unmatched.reduce((s, [, v]) => s + v, 0)} companies; text kept in sub-industry), top 25:`);
for (const [k, v] of unmatched.slice(0, 25)) console.log(`  ${String(v).padStart(5)}  ${k}`);

if (!COMMIT) { console.log('\nDry run — nothing written. Re-run with --commit to create these companies.'); process.exit(0); }

let made = 0;
for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await db.from('companies').insert(inserts.slice(i, i + 200));
    if (error) { console.error(`\nStopped at row ${i}: ${error.message}. ${made} created; re-running skips them.`); process.exit(1); }
    made += Math.min(200, inserts.length - i);
}
console.log(`\nCreated ${made} companies, tagged '${SOURCE}'.`);
