// The legal tracker, across the whole portfolio.
//
// 02_Legal Page asks for six counts, a master table, a document tracker, a
// rights tracker and a deadline tracker — all of them portfolio-wide. The
// existing legal record is per-company and lives in one browser's
// localStorage, so none of the counts could be produced from it at all.
//
// This module holds what a document and a right ARE, and the arithmetic behind
// every number on the page. Pure: pinned by scripts/verify-legal-tracker.mjs.

export type DocStatus = 'received' | 'pending' | 'na';
export type RightStatus = 'available' | 'not_available' | 'triggered' | 'lost' | 'unknown';
export type ActionCategory = 'documentation' | 'compliance' | 'transaction' | 'dispute';
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionStatus = 'open' | 'closed' | 'on_hold';

// ─── C. DOCUMENT TRACKER ──────────────────────────────────────────────────

export interface DocumentType {
    key: string;
    label: string;
    /** P0 on the sheet. A company missing one of these is counted and shown. */
    key_document: boolean;
    hint: string;
}

/** The ten rows of section C, in the sheet's order. */
export const LEGAL_DOCUMENT_TYPES: DocumentType[] = [
    { key: 'term_sheet', label: 'Term Sheet', key_document: true, hint: 'Signed term sheet for the round' },
    { key: 'ssa', label: 'SSA / Subscription Agreement', key_document: true, hint: 'Share subscription agreement' },
    { key: 'sha', label: 'SHA', key_document: true, hint: 'Shareholders agreement, current version' },
    { key: 'safe_note', label: 'SAFE / Convertible Note', key_document: true, hint: 'Where the instrument is a SAFE or a note' },
    { key: 'share_certificate', label: 'Share Certificate / Allotment Proof', key_document: true, hint: 'Certificate, or the demat credit' },
    { key: 'cap_table', label: 'Cap Table', key_document: true, hint: 'Post-round, as certified' },
    { key: 'founder_kyc', label: 'Founder / Promoter KYC', key_document: false, hint: 'PAN, address proof, identity' },
    { key: 'financials_mis', label: 'Financials / MIS', key_document: false, hint: 'Latest audited accounts or monthly MIS' },
    { key: 'board_resolutions', label: 'Board / Shareholder Resolutions', key_document: false, hint: 'Allotment and related resolutions' },
    { key: 'other_material', label: 'Other Material Documents', key_document: false, hint: 'Anything else the deal depends on' },
];

export const KEY_DOCUMENT_KEYS = LEGAL_DOCUMENT_TYPES.filter(d => d.key_document).map(d => d.key);

// ─── D. INVESTOR RIGHTS TRACKER ───────────────────────────────────────────

export interface RightType {
    key: string;
    label: string;
    /** P0 on the sheet. */
    critical: boolean;
    /** The statuses this right can take, from the sheet. */
    statuses: RightStatus[];
    /** What the Threshold / Condition column usually holds. */
    conditionHint: string;
}

/** The eleven rows of section D, in the sheet's order. */
export const INVESTOR_RIGHTS: RightType[] = [
    { key: 'board_seat', label: 'Board Seat', critical: true, statuses: ['available', 'not_available', 'triggered', 'lost'], conditionHint: 'Usually held above a shareholding threshold' },
    { key: 'board_observer', label: 'Board Observer', critical: false, statuses: ['available', 'not_available'], conditionHint: '' },
    { key: 'information_rights', label: 'Information Rights', critical: true, statuses: ['available', 'not_available'], conditionHint: 'Quarterly / annual / MIS' },
    { key: 'anti_dilution', label: 'Anti-Dilution', critical: true, statuses: ['available', 'not_available', 'triggered'], conditionHint: 'Broad-based / weighted average' },
    { key: 'pre_emptive', label: 'Pre-emptive / Pro-rata Rights', critical: true, statuses: ['available', 'not_available'], conditionHint: 'Pro-rata on future rounds' },
    { key: 'tag_along', label: 'Tag-Along', critical: true, statuses: ['available', 'not_available'], conditionHint: '' },
    { key: 'drag_along', label: 'Drag-Along', critical: false, statuses: ['available', 'not_available'], conditionHint: '' },
    { key: 'liquidation_preference', label: 'Liquidation Preference', critical: true, statuses: ['available', 'not_available'], conditionHint: '1x / participating / non-participating' },
    { key: 'exit_rights', label: 'Exit Rights', critical: true, statuses: ['available', 'not_available'], conditionHint: 'IPO / strategic / buyback' },
    { key: 'reserved_matters', label: 'Reserved Matters / Consent Rights', critical: false, statuses: ['available', 'not_available'], conditionHint: 'Matters needing our consent' },
];

export const CRITICAL_RIGHT_KEYS = INVESTOR_RIGHTS.filter(r => r.critical).map(r => r.key);

// ─── Rights that depend on the cap table ──────────────────────────────────

export type Eligibility = 'eligible' | 'below_threshold' | 'no_threshold';

/**
 * Whether a threshold-dependent right is still ours.
 *
 * "Where rights depend on ownership thresholds, the system should calculate
 * current eligibility from the cap table." A board seat held at 5% is lost
 * quietly when a later round dilutes us to 3% — nobody sends a letter — so it
 * is derived from the holding every time it is shown, never stored.
 */
export function rightEligibility(thresholdPct: number | null | undefined, currentOwnershipPct: number | null | undefined): Eligibility {
    if (thresholdPct === null || thresholdPct === undefined || !isFinite(thresholdPct) || thresholdPct <= 0) {
        return 'no_threshold';
    }
    const held = currentOwnershipPct ?? 0;
    // A hair under the threshold is under it; rounding here would hand back a
    // right that the agreement says we no longer have.
    return held >= thresholdPct ? 'eligible' : 'below_threshold';
}

export interface RightRow {
    rightKey: string;
    status: RightStatus;
    thresholdPct: number | null;
    documentRef: string;
}

/**
 * Rights needing attention: "not documented, expired or below threshold".
 *
 * Three separate failures with one consequence — a right we believe we have
 * and do not. Each is reported with which of the three it is.
 */
export function rightsNeedingAttention(
    rows: RightRow[],
    currentOwnershipPct: number | null,
): { rightKey: string; label: string; why: 'not documented' | 'lost' | 'below threshold' | 'not recorded' }[] {
    const out: ReturnType<typeof rightsNeedingAttention> = [];
    const byKey = new Map(rows.map(r => [r.rightKey, r]));

    for (const def of INVESTOR_RIGHTS) {
        const row = byKey.get(def.key);

        // A critical right nobody has recorded either way is a gap in itself.
        if (!row || row.status === 'unknown') {
            if (def.critical) out.push({ rightKey: def.key, label: def.label, why: 'not recorded' });
            continue;
        }
        if (row.status === 'lost') {
            out.push({ rightKey: def.key, label: def.label, why: 'lost' });
            continue;
        }
        if (row.status === 'not_available') continue;   // we never had it

        if (!row.documentRef.trim()) {
            out.push({ rightKey: def.key, label: def.label, why: 'not documented' });
            continue;
        }
        if (rightEligibility(row.thresholdPct, currentOwnershipPct) === 'below_threshold') {
            out.push({ rightKey: def.key, label: def.label, why: 'below threshold' });
        }
    }
    return out;
}

// ─── A. KPI CARDS ─────────────────────────────────────────────────────────

export interface TrackerCompany {
    id: string;
    companyName: string;
    currentOwnership: number | null;
}

export interface TrackerDocument {
    companyId: string;
    docType: string;
    status: DocStatus;
    docDate: string | null;
    updatedAt: string | null;
}

export interface TrackerAction {
    id: string;
    companyId: string | null;
    priority: ActionPriority;
    status: ActionStatus;
    dueDate: string | null;
}

export interface LegalKpis {
    totalCompanies: number;
    documentsPending: number;
    criticalActions: number;
    upcomingDeadlines: number;
    companiesMissingKeyDocs: number;
    rightsRequiringAttention: number;
    /** Open actions already past their due date. "Highlight overdue." */
    overdueActions: number;
}

const dayMs = 86_400_000;

/** Whole days from `from` to `iso`; negative when the date has passed. */
export function daysUntil(iso: string | null, from: Date = new Date()): number | null {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) return null;
    const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    return Math.round((d.getTime() - start) / dayMs);
}

/** How long a document has been outstanding. "Show ageing." */
export function ageingDays(updatedAt: string | null, now: Date = new Date()): number | null {
    if (!updatedAt) return null;
    const d = new Date(updatedAt);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((now.getTime() - d.getTime()) / dayMs));
}

/**
 * The six counts of section A, plus the overdue count the sheet asks to
 * highlight. `withinDays` is the 30 / 60 / 90 day view.
 *
 * A company with no document rows at all is missing every key document — the
 * absence of a record is not evidence that the paperwork exists, and reading
 * it the other way would show a clean board for a portfolio nobody has
 * tracked yet.
 */
export function legalKpis(
    companies: TrackerCompany[],
    documents: TrackerDocument[],
    actions: TrackerAction[],
    rightsByCompany: Map<string, RightRow[]>,
    options: { withinDays?: number; now?: Date } = {},
): LegalKpis {
    const { withinDays = 30, now = new Date() } = options;

    const received = new Map<string, Set<string>>();
    let documentsPending = 0;
    for (const d of documents) {
        if (d.status === 'pending') documentsPending++;
        if (d.status !== 'received') continue;
        if (!received.has(d.companyId)) received.set(d.companyId, new Set());
        received.get(d.companyId)!.add(d.docType);
    }

    let companiesMissingKeyDocs = 0;
    let rightsRequiringAttention = 0;
    for (const c of companies) {
        const have = received.get(c.id) || new Set<string>();
        if (KEY_DOCUMENT_KEYS.some(k => !have.has(k))) companiesMissingKeyDocs++;
        rightsRequiringAttention += rightsNeedingAttention(
            rightsByCompany.get(c.id) || [], c.currentOwnership,
        ).length;
    }

    let criticalActions = 0;
    let upcomingDeadlines = 0;
    let overdueActions = 0;
    for (const a of actions) {
        if (a.status !== 'open') continue;
        if (a.priority === 'critical') criticalActions++;
        const days = daysUntil(a.dueDate, now);
        if (days === null) continue;
        if (days < 0) overdueActions++;
        else if (days <= withinDays) upcomingDeadlines++;
    }

    return {
        totalCompanies: companies.length,
        documentsPending,
        criticalActions,
        upcomingDeadlines,
        companiesMissingKeyDocs,
        rightsRequiringAttention,
        overdueActions,
    };
}

/** Which key documents a company does not have. Drives the drill-down. */
export function missingKeyDocuments(documents: TrackerDocument[]): { key: string; label: string }[] {
    const have = new Set(documents.filter(d => d.status === 'received').map(d => d.docType));
    return LEGAL_DOCUMENT_TYPES
        .filter(d => d.key_document && !have.has(d.key))
        .map(d => ({ key: d.key, label: d.label }));
}

// ─── E. ALERTS ────────────────────────────────────────────────────────────

export type ActionUrgency = 'overdue' | 'due_soon' | 'scheduled' | 'no_date' | 'closed';

export interface ActionAlert {
    urgency: ActionUrgency;
    days: number | null;
    label: string;
    color: string;
}

/** How an action reads in the list. "Show overdue and upcoming prominently." */
export function actionAlert(
    action: { status: ActionStatus; dueDate: string | null },
    options: { soonDays?: number; now?: Date } = {},
): ActionAlert {
    const { soonDays = 30, now = new Date() } = options;
    if (action.status === 'closed') {
        return { urgency: 'closed', days: null, label: 'Closed', color: '#6b7280' };
    }
    const days = daysUntil(action.dueDate, now);
    if (days === null) {
        return { urgency: 'no_date', days: null, label: 'No due date', color: '#6b7280' };
    }
    if (days < 0) {
        const n = Math.abs(days);
        return { urgency: 'overdue', days, label: `${n}d overdue`, color: '#b91c1c' };
    }
    if (days === 0) return { urgency: 'due_soon', days, label: 'Due today', color: '#b45309' };
    if (days <= soonDays) return { urgency: 'due_soon', days, label: `Due in ${days}d`, color: '#b45309' };
    return { urgency: 'scheduled', days, label: `Due in ${days}d`, color: '#047857' };
}

// ─── F. SEARCH ────────────────────────────────────────────────────────────

export interface SearchableRow {
    companyName: string;
    investmentEntity: string;
    investmentType: string;
    round: string;
    status: string;
    documentTypes: string[];
}

/**
 * "Search by company, DV entity, document type, investment type, round and
 * status." One box across all six, matching on word beginnings so "ser a"
 * finds "Series A" and a stray letter does not match everything.
 */
export function matchesSearch(row: SearchableRow, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
        row.companyName, row.investmentEntity, row.investmentType,
        row.round, row.status, ...row.documentTypes,
    ].join(' ').toLowerCase();
    // Every term must appear, so adding a word narrows rather than widens.
    return q.split(/\s+/).every(term => haystack.includes(term));
}
