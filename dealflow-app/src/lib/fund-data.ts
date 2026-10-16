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
    // Where it came from. An import replaces its own rows on the next upload
    // and must never touch one somebody typed, so the two have to be told
    // apart. Absent means typed, which is what every existing row is.
    source?: 'import';
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
        // Named from INVESTMENT_VEHICLES, the same registry Portfolio and Legal
        // pick from, so an entity is called one thing across the whole app.
        // 'Syndicate' is deliberately absent: it is a way to invest, not an
        // entity holding a bank balance. Records saved before this seeded
        // DVLLP / DRAVYA / RAK / NBF and keep those names until renamed from
        // the entity card, which now picks from the registry too.
        entities: [
            { id: 'dravya-personal', name: 'Dravya Personal', currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dvpl',            name: 'DVPL',            currency: 'INR', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dvfz-llc',        name: 'DVFZ LLC',        currency: 'AED', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
            { id: 'dv-dmcc',         name: 'DV DMCC',         currency: 'AED', bankBalance: 0, paymentDue: 0, pendingFund: 0 },
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

// 'dh' rendered as "dh0", which reads as a word rather than a currency.
export const CURRENCY_SYMBOL: Record<Currency, string> = { INR: '₹', AED: 'AED ', USD: '$' };

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
//
// This record used to live only in localStorage, which meant each colleague
// opened the Fund page and saw an empty default: the numbers existed solely in
// the browser that had typed or imported them. It now belongs to the firm,
// held in fund_records and reached through /api/fund/record.
//
// The accessors stay synchronous, because a dozen components call
// loadFundRecord() during render. hydrateFundRecord() fills the cache once on
// mount and fires the same 'fund-record-updated' event the components already
// listen for, so they re-render with the real numbers a moment later.

const STORAGE_KEY = 'dholakia.fund.v1';

function isBrowser() {
    return typeof window !== 'undefined';
}

/** Retired entity ids that must not come back from an old payload. */
const RETIRED_ENTITY_IDS = new Set(['dmcc', 'dvfl', 'dvfz_aed', 'dvfz_usd']);

function normalize(parsed: FundRecord): FundRecord {
    if (!parsed.statements) parsed.statements = [];
    if (!parsed.expenses) parsed.expenses = [];
    if (!parsed.entities) parsed.entities = createDefaultFundRecord().entities;
    parsed.entities = parsed.entities.filter(e => !RETIRED_ENTITY_IDS.has(e.id));
    return parsed;
}

let cache: FundRecord | null = null;
let hydrated = false;

function readLocal(): FundRecord | null {
    if (!isBrowser()) return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? normalize(JSON.parse(raw) as FundRecord) : null;
    } catch {
        return null;
    }
}

function announce() {
    if (isBrowser()) window.dispatchEvent(new CustomEvent('fund-record-updated'));
}

/**
 * Fetch the firm's record. Called once when the Fund page mounts.
 *
 * On the very first run the server has nothing and this browser may hold the
 * only copy — whatever the admin imported before this shipped — so that copy
 * is pushed up rather than discarded. After that the server is the truth and
 * the local copy is never read again.
 */
export async function hydrateFundRecord(): Promise<void> {
    if (hydrated || !isBrowser()) return;
    hydrated = true;
    try {
        const res = await fetch('/api/fund/record');
        if (!res.ok) return;
        const { record } = await res.json() as { record: FundRecord | null };
        if (record) {
            cache = normalize(record);
            announce();
            return;
        }
        // Nothing on the server yet.
        const local = readLocal();
        const seed = local ?? createDefaultFundRecord();
        cache = seed;
        announce();
        if (local) await push(local);
    } catch {
        // Offline or unauthorised — the page keeps working on the default.
    }
}

async function push(record: FundRecord): Promise<void> {
    try {
        await fetch('/api/fund/record', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record }),
        });
    } catch {
        // A failed write leaves the cache ahead of the server; the next save
        // sends the whole record again, so nothing is permanently lost.
    }
}

export function loadFundRecord(): FundRecord {
    // First read in the browser starts the fetch. Components already re-render
    // on 'fund-record-updated', so none of them had to learn to await this.
    if (isBrowser() && !hydrated) void hydrateFundRecord();
    if (cache) return cache;
    if (!isBrowser()) return createDefaultFundRecord();
    // Before hydration completes, show the local copy if there is one so the
    // admin's own page does not flash empty on the way to the real data.
    cache = readLocal() ?? createDefaultFundRecord();
    return cache;
}

export function saveFundRecord(record: FundRecord) {
    const toSave: FundRecord = { ...record, updatedAt: new Date().toISOString() };
    cache = toSave;
    announce();
    void push(toSave);
}

export function genId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
