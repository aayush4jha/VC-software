// Legal Management — data layer, types, constants, storage helpers.
// Uses localStorage keyed by company ID for zero-setup persistence.

// ─── Types ────────────────────────────────────────

export type LegalStageId =
    | 'term_sheet_reviewed'
    | 'terms_negotiation'
    | 'final_sha_review'
    | 'approved'
    | 'signed'
    | 'payment_received'
    | 'share_certificate_done';

export interface LegalStage {
    id: LegalStageId;
    name: string;
    color: string;
    description: string;
}

export type RightStatus = 'must_have' | 'situational' | 'optional';

export type RightPresence = 'present' | 'absent' | 'modified';

export type InvestorTier = 'lead' | 'large' | 'angel' | 'investor';

export interface RightDefinition {
    id: string;
    name: string;
    category: string;
    description: string;
    triggersWhen: string;
    whoBenefits: string;
    negotiationNote: string;
}

export interface RightRow {
    rightId: string;
    requiredBy: Record<InvestorTier, RightStatus>;
    requiredByText: Record<InvestorTier, string>;
    remarks: string;
    shaStatus: Record<string, RightPresence | null>; // keyed by SHA version id (derived from shaRemarks)
    shaRemarks: Record<string, string>; // free text per SHA version
    extra?: Record<string, string>;
}

export interface SHAVersion {
    id: string;
    label: string;
    date: string;
}

export type AgreementType = 'SAFE' | 'SHA' | 'CCPS' | 'Convertible Note' | 'Debt';

export type SectionStatus = 'pending' | 'reviewed' | 'approved';

export interface SHASection {
    id: string;
    name: string;
    status: SectionStatus;
    comments: string;
    linkedClauses: string;
}

export type DocumentStatus = 'missing' | 'uploaded' | 'verified';

export interface LegalDocument {
    id: string;
    name: string;
    category: 'pre' | 'post';
    required: boolean;
    status: DocumentStatus;
    notes: string;
    links: string[];          // Drive (or any) URLs; multiple supported per document.
    uploadedAt?: string;
}

export interface SOPData {
    investmentEntity: string;
    date: string;
    termsheetReviewed: boolean;
    agreementType: AgreementType | '';
    lawyerAssigned: string;
    icApproval: boolean;
    followOnRightsChanged: boolean;
    whatChanged: string;
    agreementSigned: boolean;
}

export interface PostInvestmentData {
    paymentStatus: 'pending' | 'partial' | 'complete' | '';
    investmentDate: string;
    sharesBought: string;
    pricePerShare: string;
    percentHolding: string;
    preMoneyValuation: string;
    postMoneyValuation: string;
    refundApplicable: boolean;
    refundReceived: boolean;
    refundReason: 'fx_difference' | 'over_remittance' | 'other' | '';
    refundNotes: string;
}

export interface LegalRecord {
    companyId: string;
    stageId: LegalStageId;
    stageUpdatedAt: string;
    legalOwner: string;
    currentSHAVersion: string;
    shaVersions: SHAVersion[];
    rights: RightRow[];
    sopData: SOPData;
    postInvestment: PostInvestmentData;
    shaSections: SHASection[];
    documents: LegalDocument[];
    createdAt: string;
    updatedAt: string;
}

// ─── Constants ────────────────────────────────────

export const LEGAL_STAGES: LegalStage[] = [
    {
        id: 'term_sheet_reviewed',
        name: 'Term Sheet Reviewed',
        color: '#8b5cf6',
        description: 'Initial term sheet received and reviewed by legal',
    },
    {
        id: 'terms_negotiation',
        name: 'Terms Negotiation',
        color: '#f59e0b',
        description: 'Active negotiation with founder / counsel',
    },
    {
        id: 'final_sha_review',
        name: 'Final SHA Review',
        color: '#3b82f6',
        description: 'Final SHA draft under legal review',
    },
    {
        id: 'approved',
        name: 'Approved',
        color: '#06b6d4',
        description: 'IC / partner approved, ready for signing',
    },
    {
        id: 'signed',
        name: 'Signed',
        color: '#10b981',
        description: 'SHA executed by all parties',
    },
    {
        id: 'payment_received',
        name: 'Payment Received',
        color: '#14b8a6',
        description: 'Investment funds received from the investor',
    },
    {
        id: 'share_certificate_done',
        name: 'Share Certificate / Demat Done',
        color: '#0ea5e9',
        description: 'Share certificate issued and / or demat credited',
    },
];

export const INVESTOR_TIERS: { id: InvestorTier; label: string }[] = [
    { id: 'lead', label: 'Lead Investor' },
    { id: 'large', label: 'Large Investor' },
    { id: 'angel', label: 'Angel Investor' },
    { id: 'investor', label: 'Investor' },
];

// Colors match the spreadsheet legend: solid green = Needed, pale green
// = Needed in some situations, soft orange = Optional.
export const RIGHT_STATUS_COLORS: Record<RightStatus, { bg: string; text: string; label: string; dot: string }> = {
    must_have: { bg: 'rgba(34, 197, 94, 0.42)', text: '#14532d', dot: '#15803d', label: 'Needed' },
    situational: { bg: 'rgba(34, 197, 94, 0.16)', text: '#166534', dot: '#86efac', label: 'Needed in some situations' },
    optional: { bg: 'rgba(251, 146, 60, 0.30)', text: '#9a3412', dot: '#fb923c', label: 'Optional' },
};

export const RIGHT_DEFINITIONS: RightDefinition[] = [
    {
        id: 'board_seat',
        name: 'Board Seat',
        category: 'Governance',
        description: 'Right to appoint a director on the company board.',
        triggersWhen: 'Immediately on closing; held through the investment horizon.',
        whoBenefits: 'Lead investor and large investors who require oversight.',
        negotiationNote: 'Usually linked to a minimum ownership threshold (e.g., 10%).',
    },
    {
        id: 'board_observer',
        name: 'Board Observer',
        category: 'Governance',
        description: 'Right to attend board meetings without voting rights.',
        triggersWhen: 'On closing; may fall away below an ownership threshold.',
        whoBenefits: 'Investors who want visibility without director liability.',
        negotiationNote: 'Should include access to all board materials.',
    },
    {
        id: 'reserved_matters',
        name: 'Reserved Matters',
        category: 'Governance',
        description: 'Matters requiring investor consent before the company can act.',
        triggersWhen: 'Applies to all enumerated matters during the investment period.',
        whoBenefits: 'All preferred shareholders; usually gated by thresholds.',
        negotiationNote: 'Key lever — negotiate scope carefully. Must cover major capital, hiring, debt.',
    },
    {
        id: 'anti_dilution',
        name: 'Anti-Dilution',
        category: 'Economic',
        description: 'Protection against dilution in down-rounds.',
        triggersWhen: 'New round at a lower price per share than your entry.',
        whoBenefits: 'All preferred shareholders.',
        negotiationNote: 'Broad-based weighted average is standard; full-ratchet is rare/aggressive.',
    },
    {
        id: 'pre_emptive',
        name: 'Pre-emptive Rights',
        category: 'Economic',
        description: 'Right to participate pro-rata in future issuances.',
        triggersWhen: 'Any new primary equity issuance by the company.',
        whoBenefits: 'All existing investors.',
        negotiationNote: 'Preserve pro-rata for follow-on rounds. Protect from dilution.',
    },
    {
        id: 'founder_exit_rofr',
        name: 'Founder Exit ROFR',
        category: 'Transfer',
        description: 'Right of first refusal on founder share sales.',
        triggersWhen: 'Founder proposes to sell or transfer shares.',
        whoBenefits: 'Investors; preserves cap-table integrity.',
        negotiationNote: 'Should include tag-along rights alongside ROFR.',
    },
    {
        id: 'founder_vesting',
        name: 'Founder Vesting',
        category: 'Alignment',
        description: 'Founder equity vests over time to ensure commitment.',
        triggersWhen: 'On closing; typically 4-year vesting with 1-year cliff.',
        whoBenefits: 'All investors.',
        negotiationNote: 'Include reverse-vesting for existing founder equity.',
    },
    {
        id: 'tag_along',
        name: 'Tag Along',
        category: 'Transfer',
        description: 'Right to sell alongside founder/majority at same terms.',
        triggersWhen: 'Founder sells > threshold of their holdings.',
        whoBenefits: 'Minority investors.',
        negotiationNote: 'Ensure full tag — not just pro-rata tag — for large secondary sales.',
    },
    {
        id: 'drag_along',
        name: 'Drag Along',
        category: 'Transfer',
        description: 'Ability to compel minority holders to join a sale.',
        triggersWhen: 'Qualifying exit event approved by required majority.',
        whoBenefits: 'Lead investor / controlling block.',
        negotiationNote: 'Set threshold carefully. Include minimum price protection.',
    },
    {
        id: 'liquidation_preference',
        name: 'Liquidation Preference',
        category: 'Economic',
        description: 'Priority payout on liquidation or exit event.',
        triggersWhen: 'Sale, merger, dissolution, or qualifying liquidity event.',
        whoBenefits: 'Preferred shareholders.',
        negotiationNote: '1x non-participating is standard. Participating / 2x+ is aggressive.',
    },
    {
        id: 'esop_safeguard',
        name: 'ESOP Dilution Safeguard',
        category: 'Economic',
        description: 'ESOP expansion comes out of pre-money, not post-money.',
        triggersWhen: 'ESOP pool top-ups at the next financing.',
        whoBenefits: 'All existing investors.',
        negotiationNote: 'Critical in growth rounds — ESOP from pre-money preserves ownership.',
    },
    {
        id: 'mfn',
        name: 'MFN Clause',
        category: 'Economic',
        description: 'Most-Favored-Nation — automatic benefit of better terms given to later investors.',
        triggersWhen: 'Future financing with better economic or control terms.',
        whoBenefits: 'Early-stage investors, especially angels.',
        negotiationNote: 'Scope to economic terms only; exclude process/governance.',
    },
    {
        id: 'minimum_exit_irr',
        name: 'Minimum Exit IRR',
        category: 'Economic',
        description: 'Floor IRR guaranteed at exit event.',
        triggersWhen: 'Exit event if IRR below threshold.',
        whoBenefits: 'Investors, via preference top-ups.',
        negotiationNote: 'Aggressive — usually in debt-like instruments (CCPS, OCDs).',
    },
    {
        id: 'information_rights',
        name: 'Information Rights',
        category: 'Governance',
        description: 'Right to regular financial and operating information.',
        triggersWhen: 'Continuous — monthly/quarterly MIS, annual audited financials.',
        whoBenefits: 'All investors.',
        negotiationNote: 'Must-have. Spec cadence (monthly MIS, quarterly board pack).',
    },
];

export const DEFAULT_SHA_VERSIONS: SHAVersion[] = [
    { id: 'sha_2024', label: 'SHA 2024', date: '2024-01-01' },
    { id: 'sha_2024_sep', label: 'SHA Sep 2024', date: '2024-09-01' },
    { id: 'sha_2025', label: 'SHA 2025', date: '2025-01-01' },
];

export const DEFAULT_SHA_SECTIONS: Omit<SHASection, 'comments' | 'linkedClauses'>[] = [
    { id: 'definitions', name: 'Definitions', status: 'pending' },
    { id: 'reps_warranties', name: 'Representations & Warranties', status: 'pending' },
    { id: 'conditions_precedent', name: 'Conditions Precedent', status: 'pending' },
    { id: 'subscription', name: 'Subscription', status: 'pending' },
    { id: 'completion', name: 'Completion', status: 'pending' },
    { id: 'board_governance', name: 'Board & Governance', status: 'pending' },
    { id: 'voting_rights', name: 'Voting Rights', status: 'pending' },
    { id: 'indemnity', name: 'Indemnity', status: 'pending' },
    { id: 'non_compete', name: 'Non-compete', status: 'pending' },
    { id: 'default', name: 'Default', status: 'pending' },
    { id: 'arbitration', name: 'Arbitration', status: 'pending' },
    { id: 'esop_structuring', name: 'ESOP Structuring', status: 'pending' },
    { id: 'confidentiality', name: 'Confidentiality', status: 'pending' },
    { id: 'expenses', name: 'Expenses', status: 'pending' },
];

export const PRE_INVESTMENT_DOCS: Omit<LegalDocument, 'status' | 'notes' | 'links'>[] = [
    { id: 'pitch_deck', name: 'Pitch Deck', category: 'pre', required: true },
    { id: 'mis', name: 'MIS', category: 'pre', required: true },
    { id: 'audited_financials', name: 'Audited Financials', category: 'pre', required: true },
    { id: 'kyc_docs', name: 'KYC Documents', category: 'pre', required: true },
    { id: 'pan_card', name: 'PAN Card', category: 'pre', required: true },
    { id: 'address_proof', name: 'Address Proof', category: 'pre', required: true },
    { id: 'cap_table', name: 'Cap Table', category: 'pre', required: true },
    { id: 'valuation_report', name: 'Valuation Report', category: 'pre', required: true },
    { id: 'due_diligence', name: 'Due Diligence Report', category: 'pre', required: true },
    { id: 'previous_sha', name: 'Previous SHA', category: 'pre', required: false },
    { id: 'current_agreement', name: 'Current Agreement', category: 'pre', required: true },
];

export const POST_INVESTMENT_DOCS: Omit<LegalDocument, 'status' | 'notes' | 'links'>[] = [
    { id: 'payment_proof', name: 'Payment Proof', category: 'post', required: true },
    { id: 'share_certificate', name: 'Share Certificate / Demat Proof', category: 'post', required: true },
    { id: 'company_assets', name: 'Company Assets (logo, team, description)', category: 'post', required: false },
];

// ─── Defaults ─────────────────────────────────────

export function createDefaultRightRow(rightId: string): RightRow {
    const shaStatus: Record<string, RightPresence | null> = {};
    const shaRemarks: Record<string, string> = {};
    DEFAULT_SHA_VERSIONS.forEach(v => {
        shaStatus[v.id] = null;
        shaRemarks[v.id] = '';
    });

    const requiredBy: Record<InvestorTier, RightStatus> = {
        lead: 'must_have',
        large: 'must_have',
        angel: 'situational',
        investor: 'situational',
    };

    // Tune defaults per right to give sensible starting colors.
    const lookup: Record<string, Partial<Record<InvestorTier, RightStatus>>> = {
        board_seat: { lead: 'must_have', large: 'must_have', angel: 'optional', investor: 'optional' },
        board_observer: { lead: 'situational', large: 'must_have', angel: 'situational', investor: 'situational' },
        reserved_matters: { lead: 'must_have', large: 'must_have', angel: 'situational', investor: 'situational' },
        anti_dilution: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
        pre_emptive: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
        founder_exit_rofr: { lead: 'must_have', large: 'must_have', angel: 'situational', investor: 'situational' },
        founder_vesting: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
        tag_along: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
        drag_along: { lead: 'must_have', large: 'situational', angel: 'optional', investor: 'optional' },
        liquidation_preference: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
        esop_safeguard: { lead: 'must_have', large: 'must_have', angel: 'situational', investor: 'situational' },
        mfn: { lead: 'situational', large: 'situational', angel: 'must_have', investor: 'must_have' },
        minimum_exit_irr: { lead: 'situational', large: 'situational', angel: 'optional', investor: 'optional' },
        information_rights: { lead: 'must_have', large: 'must_have', angel: 'must_have', investor: 'must_have' },
    };

    const override = lookup[rightId] || {};
    Object.keys(override).forEach(k => {
        requiredBy[k as InvestorTier] = override[k as InvestorTier]!;
    });

    const extra: Record<string, string> = {};
    if (rightId === 'liquidation_preference') {
        extra.multiple = '1x';
        extra.participating = 'Non-participating';
        extra.cap = 'No cap';
    }
    if (rightId === 'founder_exit_rofr') {
        extra.exitType = 'Strategic / Secondary / IPO';
        extra.waterfallLogic = '';
    }

    return {
        rightId,
        requiredBy,
        requiredByText: { lead: '', large: '', angel: '', investor: '' },
        remarks: '',
        shaStatus,
        shaRemarks,
        extra,
    };
}

export function createDefaultLegalRecord(companyId: string): LegalRecord {
    const now = new Date().toISOString();
    return {
        companyId,
        stageId: 'term_sheet_reviewed',
        stageUpdatedAt: now,
        legalOwner: '',
        currentSHAVersion: DEFAULT_SHA_VERSIONS[DEFAULT_SHA_VERSIONS.length - 1].id,
        shaVersions: [...DEFAULT_SHA_VERSIONS],
        rights: RIGHT_DEFINITIONS.map(r => createDefaultRightRow(r.id)),
        sopData: {
            investmentEntity: '',
            date: '',
            termsheetReviewed: false,
            agreementType: '',
            lawyerAssigned: '',
            icApproval: false,
            followOnRightsChanged: false,
            whatChanged: '',
            agreementSigned: false,
        },
        postInvestment: {
            paymentStatus: '',
            investmentDate: '',
            sharesBought: '',
            pricePerShare: '',
            percentHolding: '',
            preMoneyValuation: '',
            postMoneyValuation: '',
            refundApplicable: false,
            refundReceived: false,
            refundReason: '',
            refundNotes: '',
        },
        shaSections: DEFAULT_SHA_SECTIONS.map(s => ({ ...s, comments: '', linkedClauses: '' })),
        documents: [
            ...PRE_INVESTMENT_DOCS.map(d => ({ ...d, status: 'missing' as DocumentStatus, notes: '', links: [] })),
            ...POST_INVESTMENT_DOCS.map(d => ({ ...d, status: 'missing' as DocumentStatus, notes: '', links: [] })),
        ],
        createdAt: now,
        updatedAt: now,
    };
}

// ─── Storage ──────────────────────────────────────

const STORAGE_KEY = 'dholakia.legal.v1';

function isBrowser() {
    return typeof window !== 'undefined';
}

function loadAll(): Record<string, LegalRecord> {
    if (!isBrowser()) return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function saveAll(records: Record<string, LegalRecord>) {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        window.dispatchEvent(new CustomEvent('legal-records-updated'));
    } catch {
        // Swallow — localStorage may be full or unavailable.
    }
}

export function getLegalRecord(companyId: string): LegalRecord {
    const all = loadAll();
    let record = all[companyId];
    if (!record) {
        record = createDefaultLegalRecord(companyId);
        all[companyId] = record;
        saveAll(all);
        return record;
    }
    // Migrate: ensure any newly introduced rights are present.
    const existingRightIds = new Set(record.rights.map(r => r.rightId));
    RIGHT_DEFINITIONS.forEach(def => {
        if (!existingRightIds.has(def.id)) {
            record.rights.push(createDefaultRightRow(def.id));
        }
    });
    record.rights.forEach(r => {
        // Backfill requiredByText for records created before the field existed.
        if (!r.requiredByText) {
            r.requiredByText = { lead: '', large: '', angel: '', investor: '' };
        } else {
            (['lead', 'large', 'angel', 'investor'] as InvestorTier[]).forEach(t => {
                if (typeof r.requiredByText[t] !== 'string') r.requiredByText[t] = '';
            });
        }
    });
    // Migrate: backfill `links` on documents created before the field existed.
    record.documents.forEach(d => {
        if (!Array.isArray(d.links)) d.links = [];
    });
    // Migrate: ensure all known SHA versions have keys in each right row.
    record.shaVersions.forEach(v => {
        record.rights.forEach(r => {
            if (!(v.id in r.shaStatus)) r.shaStatus[v.id] = null;
            if (!(v.id in r.shaRemarks)) r.shaRemarks[v.id] = '';
            // Re-derive shaStatus from text so legacy records work with the new
            // free-text editor.
            const inferred = inferPresenceFromText(r.shaRemarks[v.id]);
            if (inferred !== null) r.shaStatus[v.id] = inferred;
            else if (!r.shaStatus[v.id]) r.shaStatus[v.id] = null;
        });
    });
    return record;
}

// Infer presence from free-text user input ("Yes" / "Given" → present,
// "Removed" / "No" / "Absent" → absent, etc.).
export function inferPresenceFromText(text: string | null | undefined): RightPresence | null {
    if (!text) return null;
    const t = text.trim().toLowerCase();
    if (!t) return null;
    if (/^(no|n)\b/.test(t) || /\b(removed|absent|not\s+given|not\s+present|n\/a|none)\b/.test(t)) return 'absent';
    if (/\b(modified|amended|changed|partial|reduced|capped|altered)\b/.test(t)) return 'modified';
    if (/^(yes|y|✓|✔|done)\b/.test(t) || /\b(given|granted|present|included|provided|in\s+place)\b/.test(t)) return 'present';
    return null;
}

export function saveLegalRecord(record: LegalRecord): LegalRecord {
    const all = loadAll();
    const next = { ...record, updatedAt: new Date().toISOString() };
    all[record.companyId] = next;
    saveAll(all);
    return next;
}

export function getAllLegalRecords(): Record<string, LegalRecord> {
    return loadAll();
}

export function updateLegalRecord(
    companyId: string,
    mutator: (record: LegalRecord) => LegalRecord,
): LegalRecord {
    const current = getLegalRecord(companyId);
    const next = mutator(current);
    return saveLegalRecord(next);
}

// ─── Alerts & Analysis ────────────────────────────

export interface CriticalAlert {
    companyId: string;
    type: 'missing_must_have' | 'payment_without_sha' | 'docs_incomplete' | 'rights_unreviewed';
    message: string;
    severity: 'high' | 'medium';
    details?: string;
}

export function presenceForVersion(row: RightRow, versionId: string): RightPresence | null {
    return inferPresenceFromText(row.shaRemarks[versionId]) ?? row.shaStatus[versionId] ?? null;
}

export function getMissingMustHaveRights(record: LegalRecord): { rightId: string; rightName: string }[] {
    const current = record.currentSHAVersion;
    const missing: { rightId: string; rightName: string }[] = [];

    record.rights.forEach(row => {
        const isMustHaveForAnyTier = Object.values(row.requiredBy).some(s => s === 'must_have');
        if (!isMustHaveForAnyTier) return;
        const status = presenceForVersion(row, current);
        if (status !== 'present') {
            const def = RIGHT_DEFINITIONS.find(d => d.id === row.rightId);
            if (def) missing.push({ rightId: row.rightId, rightName: def.name });
        }
    });

    return missing;
}

export function getCompanyAlerts(record: LegalRecord, companyName: string): CriticalAlert[] {
    const alerts: CriticalAlert[] = [];

    const missing = getMissingMustHaveRights(record);
    if (missing.length > 0) {
        alerts.push({
            companyId: record.companyId,
            type: 'missing_must_have',
            severity: 'high',
            message: `${companyName}: ${missing.length} must-have right${missing.length === 1 ? '' : 's'} missing`,
            details: missing.map(m => m.rightName).join(', '),
        });
    }

    if (record.postInvestment.paymentStatus === 'complete' && !record.sopData.agreementSigned) {
        alerts.push({
            companyId: record.companyId,
            type: 'payment_without_sha',
            severity: 'high',
            message: `${companyName}: Payment complete but SHA not signed`,
        });
    }

    const requiredDocs = record.documents.filter(d => d.required);
    const missingDocs = requiredDocs.filter(d => d.status === 'missing');
    if (missingDocs.length > 0) {
        alerts.push({
            companyId: record.companyId,
            type: 'docs_incomplete',
            severity: 'medium',
            message: `${companyName}: ${missingDocs.length} required document${missingDocs.length === 1 ? '' : 's'} missing`,
            details: missingDocs.slice(0, 3).map(d => d.name).join(', '),
        });
    }

    if (record.sopData.followOnRightsChanged && !record.sopData.whatChanged) {
        alerts.push({
            companyId: record.companyId,
            type: 'rights_unreviewed',
            severity: 'medium',
            message: `${companyName}: Follow-on rights changed but not documented`,
        });
    }

    return alerts;
}

export function detectRightsChanges(
    record: LegalRecord,
    fromVersionId: string,
    toVersionId: string,
): { rightId: string; rightName: string; from: RightPresence | null; to: RightPresence | null; change: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED'; remark: string }[] {
    return record.rights.map(row => {
        const from = presenceForVersion(row, fromVersionId);
        const to = presenceForVersion(row, toVersionId);
        const def = RIGHT_DEFINITIONS.find(d => d.id === row.rightId);
        let change: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED' = 'UNCHANGED';
        if (from !== 'present' && to === 'present') change = 'ADDED';
        else if (from === 'present' && to !== 'present') change = 'REMOVED';
        else if (from !== to) change = 'MODIFIED';
        return {
            rightId: row.rightId,
            rightName: def?.name || row.rightId,
            from,
            to,
            change,
            remark: row.shaRemarks[toVersionId] || '',
        };
    });
}

// ─── Subscribe to storage updates ─────────────────

export function subscribeLegalUpdates(cb: () => void): () => void {
    if (!isBrowser()) return () => {};
    const handler = () => cb();
    window.addEventListener('legal-records-updated', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('legal-records-updated', handler);
        window.removeEventListener('storage', handler);
    };
}
