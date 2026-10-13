// Bringing the manual tracker up to date from an imported ledger.
//
// The tracker holds two kinds of number, and only one of them is in the bank
// statement. A balance, an expense and the record of a statement all come from
// the file. Payment dues and pending capital are commitments somebody typed in
// because they have not happened yet — no statement can know them, and an
// import that zeroed them would destroy the only copy.
//
// So this merges. It writes what the ledger can prove, leaves what it cannot,
// and replaces its OWN previous contribution rather than piling up duplicates
// each time the same file is uploaded again.
//
// Pure, pinned by scripts/verify-fund-tracker-sync.mjs.

import type { FundRecord, FundEntity, FundExpense, BankStatement, Currency } from './fund-data';

/** One entity's position, as the imported ledger has it. */
export interface LedgerEntity {
    name: string;
    currency: string;
    closingBalance: number;
    transactionCount: number;
    /** The latest transaction date seen for this entity. */
    asOfDate: string | null;
    /**
     * Only when the file states it. A bank statement cannot know a payment
     * that has not happened, but the firm's own balance grid does — and when
     * it is in the file, it is better than what somebody typed last month.
     */
    paymentDue?: number;
}

/** A cost the ledger recognised, for the tracker's expense list. */
export interface LedgerExpense {
    date: string | null;
    entity: string;
    /** The head it was filed under — the tracker calls this the project. */
    head: string;
    amount: number;
    description: string;
}

export interface LedgerSummary {
    entities: LedgerEntity[];
    expenses: LedgerExpense[];
    fileName: string;
    importedAt: string;
}

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

const asCurrency = (c: string): Currency =>
    c === 'AED' || c === 'USD' ? c : 'INR';

/** An id for an entity the ledger found and the tracker has never seen. */
export function entityIdFor(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug ? `ledger-${slug}` : `ledger-${Date.now()}`;
}

/**
 * The tracker, updated from the ledger.
 *
 * What is written: each entity's bank balance, the expenses the ledger
 * recognised, a statement record per entity, and the as-of date.
 *
 * What is left exactly as it was: payment dues, pending capital, notes, any
 * entity the file said nothing about, and every expense somebody entered by
 * hand. Those are the parts of the tracker that exist precisely because they
 * are not in a bank statement yet.
 */
export function syncTrackerFromLedger(record: FundRecord, summary: LedgerSummary): FundRecord {
    const byKey = new Map(record.entities.map(e => [key(e.name), e]));
    const entities: FundEntity[] = record.entities.map(e => ({ ...e }));

    const touched = new Map<string, FundEntity>();
    for (const led of summary.entities) {
        if (!led.name.trim()) continue;
        const existing = byKey.get(key(led.name));
        if (existing) {
            const updated = entities.find(e => e.id === existing.id)!;
            updated.bankBalance = led.closingBalance;
            // A due is written only when the file actually states one;
            // otherwise it stays as typed. pendingFund and notes always do.
            if (led.paymentDue !== undefined) updated.paymentDue = led.paymentDue;
            touched.set(key(led.name), updated);
        } else {
            const created: FundEntity = {
                id: entityIdFor(led.name),
                name: led.name.trim(),
                currency: asCurrency(led.currency),
                bankBalance: led.closingBalance,
                // Zero because nobody has said, unless the file said.
                paymentDue: led.paymentDue ?? 0,
                pendingFund: 0,
            };
            entities.push(created);
            touched.set(key(led.name), created);
        }
    }

    // An expense this module wrote before is replaced; one a person typed is
    // kept. Without the marker, re-uploading a file would double every cost.
    const manualExpenses = record.expenses.filter(e => (e as FundExpense & { source?: string }).source !== 'import');
    const importedExpenses: FundExpense[] = summary.expenses
        .filter(x => x.amount !== 0)
        .map((x, i) => ({
            id: `import-${summary.importedAt}-${i}`,
            date: x.date || summary.importedAt.slice(0, 10),
            project: x.head || 'Uncategorised',
            amount: Math.abs(x.amount),
            entityId: touched.get(key(x.entity))?.id ?? entities[0]?.id ?? '',
            description: x.description,
            source: 'import',
        } as FundExpense & { source: string }));

    // One statement row per entity the file covered, replacing any earlier
    // record of the same file so a re-upload does not stack up.
    const statements: BankStatement[] = record.statements
        .filter(s => s.fileName !== summary.fileName)
        .concat(summary.entities
            .filter(led => led.transactionCount > 0 && touched.has(key(led.name)))
            .map(led => ({
                id: `import-${summary.importedAt}-${key(led.name)}`,
                entityId: touched.get(key(led.name))!.id,
                fileName: summary.fileName,
                uploadedAt: summary.importedAt,
                asOfDate: led.asOfDate || summary.importedAt.slice(0, 10),
                closingBalance: led.closingBalance,
                transactionCount: led.transactionCount,
            })));

    const latest = summary.entities
        .map(e => e.asOfDate)
        .filter((d): d is string => !!d)
        .sort()
        .pop();

    return {
        ...record,
        entities,
        expenses: [...manualExpenses, ...importedExpenses],
        statements,
        asOfDate: latest || record.asOfDate,
        updatedAt: summary.importedAt,
    };
}

/** A one-line account of what the sync changed, for the import message. */
export function describeSync(before: FundRecord, after: FundRecord): string {
    const added = after.entities.length - before.entities.length;
    const expenses = after.expenses.length - before.expenses.length;
    const parts = [`${after.entities.length} entit${after.entities.length === 1 ? 'y' : 'ies'} updated in the manual tracker`];
    if (added > 0) parts.push(`${added} new`);
    if (expenses > 0) parts.push(`${expenses} expense${expenses === 1 ? '' : 's'} carried over`);
    return `${parts.join(', ')}.`;
}
