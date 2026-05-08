// Fund tracking data model. Mirrors the spreadsheet the team currently
// maintains: per-entity bank balance + payment dues + pending capital,
// with project-level expense bifurcation.
// Persisted to localStorage so this is a zero-setup feature.

export type Currency = 'INR' | 'AED' | 'USD';

export interface FundEntity {
    id: string;
    name: string;
    currency: Currency;
    bankBalance: number;
    paymentDue: number;
    pendingFund: number;
    notes?: string;
}

export interface FundExpense {
    id: string;
    date: string;            // YYYY-MM-DD
    project: string;         // "Fundamental", "100X.vc", "SPARROW", ...
    amount: number;
    entityId: string;
    description?: string;
}

export interface BankStatement {
    id: string;
    entityId: string;
    fileName: string;
    uploadedAt: string;      // ISO
    asOfDate: string;        // YYYY-MM-DD
    closingBalance: number;
    transactionCount: number;
}

export interface FundRecord {
    entities: FundEntity[];
    expenses: FundExpense[];
    statements: BankStatement[];
    asOfDate: string;        // YYYY-MM-DD; date the snapshot represents
    updatedAt: string;
}

// ─── Defaults (seeded from the spreadsheet) ────────────

export function createDefaultFundRecord(): FundRecord {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    return {
        asOfDate: today,
        updatedAt: now,
        entities: [
            { id: 'dvllp',  name: 'DVLLP',     currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dravya', name: 'DRAVYA',    currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'rak',    name: 'RAK',       currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'nbf',    name: 'NBF',       currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dmcc',   name: 'DMCC',      currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dvfl',   name: 'DVFL',      currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dvfz_aed', name: 'DV FZ LLC', currency: 'AED', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dvfz_usd', name: 'DV FZ LLC', currency: 'USD', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
        ],
        expenses: [],
        statements: [],
    };
}

// ─── Derived metrics ────────────────────────────────────

export function closingBalance(e: FundEntity): number {
    return e.bankBalance - e.paymentDue;
}

export function afterFundReceived(e: FundEntity): number {
    return closingBalance(e) + e.pendingFund;
}

export function totalCommitted(record: FundRecord): Record<Currency, number> {
    const totals: Record<Currency, number> = { INR: 0, AED: 0, USD: 0 };
    record.entities.forEach(e => { totals[e.currency] += e.paymentDue; });
    return totals;
}

// ─── Formatting ─────────────────────────────────────────

export const CURRENCY_SYMBOL: Record<Currency, string> = { INR: '₹', AED: 'dh', USD: '$' };

export function formatMoney(value: number, currency: Currency): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    const formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return `${sign}${CURRENCY_SYMBOL[currency]}${formatted}`;
}

export function yearMonthKey(dateIso: string): string {
    // "2024-10-15" → "2024-Oct"
    const [year, month] = dateIso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(month, 10) - 1;
    if (idx < 0 || idx > 11) return dateIso.slice(0, 7);
    return `${year}-${months[idx]}`;
}

// ─── Storage ────────────────────────────────────────────

const STORAGE_KEY = 'dholakia.fund.v1';

function isBrowser() {
    return typeof window !== 'undefined';
}

export function loadFundRecord(): FundRecord {
    if (!isBrowser()) return createDefaultFundRecord();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const seed = createDefaultFundRecord();
            saveFundRecord(seed);
            return seed;
        }
        const parsed = JSON.parse(raw) as FundRecord;
        // Backfill missing fields for forward-compat.
        if (!parsed.statements) parsed.statements = [];
        if (!parsed.expenses) parsed.expenses = [];
        if (!parsed.entities) parsed.entities = createDefaultFundRecord().entities;
        return parsed;
    } catch {
        return createDefaultFundRecord();
    }
}

export function saveFundRecord(record: FundRecord) {
    if (!isBrowser()) return;
    try {
        const toSave: FundRecord = { ...record, updatedAt: new Date().toISOString() };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        window.dispatchEvent(new CustomEvent('fund-record-updated'));
    } catch {
        // Swallow — localStorage may be full or unavailable.
    }
}

export function genId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
