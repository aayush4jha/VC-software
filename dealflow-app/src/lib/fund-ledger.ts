// The fund ledger: one bank line in, one dashboard number out.
//
// 03_Data Mapping defines eight categories every transaction must fall into,
// and 01_Fund Page builds every figure on the page from them. Both live here,
// pure, so the classification that produces a number and the arithmetic that
// totals it can be checked without a database.
//
// The rule that matters most is the one about internal transfers. Moving ₹5 Cr
// from the India account to the UAE account is two bank lines, one negative and
// one positive. Counted naively that is ₹5 Cr of "funds received" and ₹5 Cr of
// "investment" in the same week, and the fund looks like it raised and spent
// money that never existed. They are categorised apart and excluded from every
// total but the account balances they genuinely move.
//
// Pinned by scripts/verify-fund-ledger.mjs.

export const LEDGER_CATEGORIES = [
    'funds_received', 'exit_proceeds', 'other_income',
    'investment', 'investment_expense', 'office_expense',
    'internal_transfer', 'adjustment', 'unclassified',
] as const;

export type LedgerCategory = typeof LEDGER_CATEGORIES[number];

export interface CategoryDefinition {
    key: LedgerCategory;
    label: string;
    direction: 'inflow' | 'outflow' | 'neither';
    /** What belongs in it, from the sheet. */
    includes: string;
    /** What must not, from the sheet. */
    excludes: string;
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
    {
        key: 'funds_received', label: 'Funds Received', direction: 'inflow',
        includes: 'External, family or promoter funding actually received',
        excludes: 'Internal transfers between DV entities',
    },
    {
        key: 'exit_proceeds', label: 'Exit Proceeds', direction: 'inflow',
        includes: 'Cash received from investment exits',
        excludes: 'Unrealised valuation',
    },
    {
        key: 'other_income', label: 'Other Income', direction: 'inflow',
        includes: 'Interest, refunds and other income',
        excludes: 'Capital receipts',
    },
    {
        key: 'investment', label: 'Investment', direction: 'outflow',
        includes: 'Direct, fund and syndicate investments',
        excludes: 'Internal transfers',
    },
    {
        key: 'investment_expense', label: 'Investment Expenses', direction: 'outflow',
        includes: 'Due diligence, legal, transaction and investment-specific expenses',
        excludes: 'General office costs',
    },
    {
        key: 'office_expense', label: 'Office Expenses', direction: 'outflow',
        includes: 'Family-office, admin and general operating expenses',
        excludes: 'Investment-specific expenses',
    },
    {
        key: 'internal_transfer', label: 'Internal Transfer', direction: 'neither',
        includes: 'Movement between DV bank accounts or entities',
        excludes: 'Never counted in net investment cash flow',
    },
    {
        key: 'adjustment', label: 'Adjustment', direction: 'neither',
        includes: 'Approved manual correction or reclassification',
        excludes: 'Must carry a reason, an approver and an audit trail',
    },
    {
        key: 'unclassified', label: 'Unclassified', direction: 'neither',
        includes: 'Nothing matched — shown, never silently dropped',
        excludes: '',
    },
];

export const CATEGORY_LABELS: Record<LedgerCategory, string> =
    Object.fromEntries(CATEGORY_DEFINITIONS.map(c => [c.key, c.label])) as Record<LedgerCategory, string>;

// ─── Classification ───────────────────────────────────────────────────────

export interface ClassifyInput {
    description: string;
    /** Signed: negative is money leaving the account. */
    amount: number;
    /** The "Major Head" or "Dashboard Head" column, when the sheet has one. */
    majorHead?: string;
    /** The account this line sits on. */
    entity?: string;
    /** Every entity we own, so a transfer to one of them is recognisable. */
    knownEntities?: string[];
    /** Portfolio company names, so an investment can be matched by name. */
    knownCompanies?: string[];
}

export interface Classification {
    category: LedgerCategory;
    /** Why — shown on the drill-down so a total is never a mystery. */
    reason: string;
    /** The company this line is about, when one was recognised. */
    companyName?: string;
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// "Use Major Head / Dashboard Head / entity / bank / account mapping to
// classify transactions" — an explicit head in the file always wins.
const HEAD_MAP: { pattern: RegExp; category: LedgerCategory }[] = [
    { pattern: /\b(?:funds?|capital|contribution)s? received\b|\bcapital introduced\b|\bpromoter (?:contribution|funding)\b/, category: 'funds_received' },
    { pattern: /\bexit proceeds?\b|\bexit realisation\b|\bsale proceeds?\b|\bredemption\b/, category: 'exit_proceeds' },
    { pattern: /\bother income\b|\binterest\b|\brefund\b|\bdividend\b/, category: 'other_income' },
    { pattern: /\binvestment expenses?\b|\bdue diligence\b|\blegal fees?\b|\btransaction (?:cost|expense)/, category: 'investment_expense' },
    { pattern: /\boffice expenses?\b|\badmin(?:istrative)? expenses?\b|\bfamily office\b|\bsalary\b|\brent\b/, category: 'office_expense' },
    { pattern: /\binternal transfer\b|\binter[- ]?(?:entity|company|account) transfer\b|\bown account\b|\bself transfer\b/, category: 'internal_transfer' },
    { pattern: /\badjustment\b|\breclassification\b/, category: 'adjustment' },
    { pattern: /\binvestments?\b|\bsubscription\b|\bshare purchase\b|\bdrawdown\b/, category: 'investment' },
];

// Read only when there is no head to go on. Deliberately narrower.
const DESCRIPTION_RULES: { pattern: RegExp; category: LedgerCategory; reason: string }[] = [
    { pattern: /\b(?:neft|imps|rtgs|ft)\b[^]*\b(?:own account|self|own a\/c)\b/, category: 'internal_transfer', reason: 'Transfer to our own account' },
    { pattern: /\binterest credit(?:ed)?\b|\bint\.? cr\b|\bfd interest\b|\bsavings interest\b/, category: 'other_income', reason: 'Interest credited' },
    { pattern: /\bdividend\b/, category: 'other_income', reason: 'Dividend received' },
    { pattern: /\brefund\b|\breversal\b/, category: 'other_income', reason: 'Refund or reversal' },
    { pattern: /\bccps\b|\bccd\b|\bsafe\b|\bshare subscription\b|\bequity (?:investment|infusion)\b|\bseries [a-d]\b/, category: 'investment', reason: 'Securities subscribed' },
    { pattern: /\bdue diligence\b|\bdd fee\b|\blegal fee\b|\badvocate\b|\bvaluation (?:fee|report)\b|\bcs fee\b/, category: 'investment_expense', reason: 'Transaction cost' },
    { pattern: /\bsalary\b|\bpayroll\b|\brent\b|\belectricity\b|\binternet\b|\bgst\b|\btds\b|\bbank charges?\b|\bsubscription fee\b/, category: 'office_expense', reason: 'Operating cost' },
];

/**
 * Which category a bank line belongs to.
 *
 * In order: an explicit head in the file, then a transfer to an entity we own,
 * then a portfolio company by name, then the description, and finally the
 * direction of the money — an unexplained credit is more likely funding than
 * anything else, and an unexplained debit is an office cost. Nothing returns
 * silently: a line that matches nothing is 'unclassified' and is shown as such.
 */
export function classifyTransaction(input: ClassifyInput): Classification {
    const head = norm(input.majorHead || '');
    if (head) {
        for (const { pattern, category } of HEAD_MAP) {
            if (pattern.test(head)) {
                return { category, reason: `Major head: ${input.majorHead}` };
            }
        }
    }

    const text = norm(input.description);

    // A transfer naming another entity we own is money that never left the firm.
    for (const entity of input.knownEntities || []) {
        const e = norm(entity);
        if (!e || e === norm(input.entity || '')) continue;
        if (e.length >= 4 && text.includes(e)) {
            return { category: 'internal_transfer', reason: `Moved to ${entity}` };
        }
    }

    // A named portfolio company: out is an investment, in is exit proceeds.
    for (const company of input.knownCompanies || []) {
        const c = norm(company);
        if (c.length < 4 || !text.includes(c)) continue;
        return input.amount < 0
            ? { category: 'investment', reason: `Investment in ${company}`, companyName: company }
            : { category: 'exit_proceeds', reason: `Proceeds from ${company}`, companyName: company };
    }

    for (const { pattern, category, reason } of DESCRIPTION_RULES) {
        if (pattern.test(text)) return { category, reason };
    }

    if (input.amount > 0) return { category: 'funds_received', reason: 'Unexplained credit — please confirm' };
    if (input.amount < 0) return { category: 'office_expense', reason: 'Unexplained debit — please confirm' };
    return { category: 'unclassified', reason: 'Zero amount' };
}

// ─── Data quality ─────────────────────────────────────────────────────────

export interface LedgerRow {
    entity: string;
    bank: string;
    date: string | null;
    description: string;
    amount: number;
    currency: string;
    amountInr: number | null;
    category: LedgerCategory;
}

/**
 * What is wrong with a row, as a list of plain phrases.
 *
 * "Flag missing entity, bank, account, date, currency, category or amount
 * instead of silently excluding the transaction." A row with problems is still
 * imported and still counted; it is shown with its problems attached, because
 * a number that is quietly missing a transaction is worse than one that says
 * which of its transactions are doubtful.
 */
export function rowIssues(row: Partial<LedgerRow>): string[] {
    const issues: string[] = [];
    if (!row.entity?.trim()) issues.push('no entity');
    if (!row.bank?.trim()) issues.push('no bank');
    if (!row.date) issues.push('no date');
    if (!row.currency?.trim()) issues.push('no currency');
    if (row.amount === undefined || row.amount === null || !isFinite(row.amount)) issues.push('no amount');
    else if (row.amount === 0) issues.push('zero amount');
    if (!row.category || row.category === 'unclassified') issues.push('not classified');
    if (row.currency && row.currency !== 'INR' && (row.amountInr === null || row.amountInr === undefined)) {
        issues.push('no INR conversion');
    }
    return issues;
}

// ─── Totals ───────────────────────────────────────────────────────────────

export interface FundTotals {
    fundsReceived: number;
    exitProceeds: number;
    otherIncome: number;
    investment: number;
    investmentExpense: number;
    officeExpense: number;
    internalTransfer: number;
    adjustment: number;
    unclassified: number;
    totalInflow: number;
    totalOutflow: number;
    /** Funds received + other income + exit proceeds − investments
     *  − investment expenses − office expenses ± adjustments. */
    netFundPosition: number;
}

const ZERO: FundTotals = {
    fundsReceived: 0, exitProceeds: 0, otherIncome: 0,
    investment: 0, investmentExpense: 0, officeExpense: 0,
    internalTransfer: 0, adjustment: 0, unclassified: 0,
    totalInflow: 0, totalOutflow: 0, netFundPosition: 0,
};

/**
 * Every figure in sections A, C and D of the Fund Page.
 *
 * Amounts are taken as absolute values per category — an investment is an
 * outflow whether the sheet wrote it as -50,00,000 or as a debit column — and
 * the sign is reapplied by the formula. Internal transfers are summed so the
 * page can show that they happened, and left out of everything else.
 *
 * `includeAdjustments` is the Actual / Adjusted switch: the same transactions
 * either way, with the approved corrections added or not.
 */
export function totalsFor(
    rows: { category: LedgerCategory; amountInr: number | null; amount: number }[],
    options: { includeAdjustments?: boolean } = {},
): FundTotals {
    const t: FundTotals = { ...ZERO };
    const value = (r: { amountInr: number | null; amount: number }) =>
        Math.abs(r.amountInr ?? r.amount ?? 0);
    const signed = (r: { amountInr: number | null; amount: number }) => r.amountInr ?? r.amount ?? 0;

    for (const r of rows) {
        switch (r.category) {
            case 'funds_received':     t.fundsReceived += value(r); break;
            case 'exit_proceeds':      t.exitProceeds += value(r); break;
            case 'other_income':       t.otherIncome += value(r); break;
            case 'investment':         t.investment += value(r); break;
            case 'investment_expense': t.investmentExpense += value(r); break;
            case 'office_expense':     t.officeExpense += value(r); break;
            // Signed, because the two halves of a transfer must cancel.
            case 'internal_transfer':  t.internalTransfer += signed(r); break;
            // Signed, because an adjustment can go either way.
            case 'adjustment':         t.adjustment += signed(r); break;
            case 'unclassified':       t.unclassified += value(r); break;
        }
    }

    const adjustments = options.includeAdjustments === false ? 0 : t.adjustment;
    t.totalInflow = t.fundsReceived + t.exitProceeds + t.otherIncome;
    t.totalOutflow = t.investment + t.investmentExpense + t.officeExpense;
    t.netFundPosition = t.totalInflow - t.totalOutflow + adjustments;
    return t;
}

/** Each category as a share of its side of the ledger, for section C. */
export function composition(totals: FundTotals): {
    section: 'Inflow' | 'Outflow';
    category: LedgerCategory;
    label: string;
    amount: number;
    percent: number;
}[] {
    const rows: ReturnType<typeof composition> = [];
    const push = (section: 'Inflow' | 'Outflow', category: LedgerCategory, amount: number, of: number) => {
        rows.push({
            section, category, label: CATEGORY_LABELS[category], amount,
            percent: of > 0 ? (amount / of) * 100 : 0,
        });
    };
    push('Inflow', 'funds_received', totals.fundsReceived, totals.totalInflow);
    push('Inflow', 'exit_proceeds', totals.exitProceeds, totals.totalInflow);
    push('Inflow', 'other_income', totals.otherIncome, totals.totalInflow);
    push('Outflow', 'investment', totals.investment, totals.totalOutflow);
    push('Outflow', 'investment_expense', totals.investmentExpense, totals.totalOutflow);
    push('Outflow', 'office_expense', totals.officeExpense, totals.totalOutflow);
    return rows;
}

// ─── Financial years ──────────────────────────────────────────────────────

export type FinancialYearStart = 'april' | 'november';

/**
 * The financial year a date falls in, labelled as the sheet writes it.
 *
 * Both conventions are offered because the firm uses both: April–March for the
 * Indian entity and November–October for the other. "Both views must use the
 * same underlying data" — so this is a function of the date, never a column.
 */
export function financialYearOf(date: string | Date | null, start: FinancialYearStart = 'april'): string | null {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
    if (isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;      // 1-12
    const startMonth = start === 'april' ? 4 : 11;
    const first = month >= startMonth ? year : year - 1;
    return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}

/** Every financial year between two dates, oldest first, with no gaps. */
export function financialYearsBetween(
    from: string | null, to: string | null, start: FinancialYearStart = 'april',
): string[] {
    const a = financialYearOf(from, start);
    const b = financialYearOf(to, start);
    if (!a || !b) return [];
    const firstYear = parseInt(a.slice(0, 4), 10);
    const lastYear = parseInt(b.slice(0, 4), 10);
    if (lastYear < firstYear) return [];
    const out: string[] = [];
    for (let y = firstYear; y <= lastYear; y++) {
        out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
    }
    return out;
}

// ─── Balances ─────────────────────────────────────────────────────────────

export interface AccountBalance {
    entity: string;
    bank: string;
    currency: string;
    openingBalance: number;
    totalInflows: number;
    totalOutflows: number;
    adjustments: number;
    closingBalance: number;
    /** What the bank itself last said, when we were told. */
    statedBalance: number | null;
    statedAsOf: string | null;
    /** Our closing balance minus the bank's. Non-zero means a missing line. */
    discrepancy: number | null;
}

/**
 * One account's position, for section B.
 *
 * Closing is opening plus everything that moved — including internal transfers,
 * which really do move money between accounts even though they move none into
 * or out of the firm. The discrepancy against the bank's own stated balance is
 * carried rather than hidden: it is the only signal that an import dropped a
 * row.
 */
export function accountBalance(
    account: { entity: string; bank: string; currency: string; openingBalance: number; statedBalance?: number | null; statedAsOf?: string | null },
    rows: { amount: number; category: LedgerCategory }[],
): AccountBalance {
    let inflow = 0, outflow = 0, adjustments = 0;
    for (const r of rows) {
        if (r.category === 'adjustment') { adjustments += r.amount; continue; }
        if (r.amount > 0) inflow += r.amount;
        else outflow += Math.abs(r.amount);
    }
    const closing = account.openingBalance + inflow - outflow + adjustments;
    const stated = account.statedBalance ?? null;
    return {
        entity: account.entity,
        bank: account.bank,
        currency: account.currency,
        openingBalance: account.openingBalance,
        totalInflows: inflow,
        totalOutflows: outflow,
        adjustments,
        closingBalance: closing,
        statedBalance: stated,
        statedAsOf: account.statedAsOf ?? null,
        // Rounded to the paisa: floating point should not invent a mismatch.
        discrepancy: stated === null ? null : Math.round((closing - stated) * 100) / 100,
    };
}
