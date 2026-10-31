'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, Search, NotebookPen } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useOpenNotes } from '@/lib/use-notes-nav';
import type { Company } from '@/types/database';

interface Draft {
    fund: string;
    house: string;
    fundManager: string;
    stage: string;
    size: string;
    commitment: string;
}

interface Fund extends Draft { id: string }

const COLUMNS: { key: keyof Draft; label: string; placeholder: string }[] = [
    { key: 'fund', label: 'Fund', placeholder: 'Fund name' },
    { key: 'house', label: 'House', placeholder: 'Fund house' },
    { key: 'fundManager', label: 'Fund Manager', placeholder: 'Name' },
    { key: 'stage', label: 'Stage', placeholder: 'e.g. Evaluating' },
    { key: 'size', label: 'Size', placeholder: 'e.g. ₹500 Cr' },
    { key: 'commitment', label: 'Commitment', placeholder: 'e.g. ₹5 Cr' },
];

const EMPTY: Draft = { fund: '', house: '', fundManager: '', stage: '', size: '', commitment: '' };

/** A fund is kept as a company: Fund is its name, Fund Manager its founder. */
const toFund = (c: Company): Fund => ({
    id: c.id, fund: c.companyName, house: c.fundHouseName || '', fundManager: c.founderName,
    stage: c.fundStage || '', size: c.fundSize || '', commitment: c.fundCommitment || '',
});

const toFields = (d: Draft) => ({
    companyName: d.fund.trim(), fundHouseName: d.house.trim(), founderName: d.fundManager.trim(),
    fundStage: d.stage.trim(), fundSize: d.size.trim(), fundCommitment: d.commitment.trim(),
});

/**
 * The Fund House table: one row per fund, added, edited and deleted in place.
 * Clicking a fund opens its Notes, the same as a Deal Flow company's.
 */
export default function FundHouseTable() {
    const { companies, fundHouseCompanies, fundHouseReady, isLoading, createCompany, updateCompany, deleteCompany } = useAppContext();
    const notes = useOpenNotes();
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null); // a fund's id, or 'new'
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');

    // Oldest first, so a new fund joins the bottom.
    const funds = useMemo(() => [...fundHouseCompanies]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(toFund), [fundHouseCompanies]);

    // What has been typed under Stage before, offered again so it stays consistent.
    const stages = useMemo(() => [...new Set(funds.map(f => f.stage).filter(Boolean))].sort(), [funds]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return funds;
        return funds.filter(f => COLUMNS.some(c => f[c.key].toLowerCase().includes(q)));
    }, [funds, query]);

    const startNew = () => { setEditing('new'); setDraft(EMPTY); setError(null); };
    const startEdit = (f: Fund) => { setEditing(f.id); setDraft({ ...f }); setError(null); };
    const cancel = () => { setEditing(null); setDraft(EMPTY); };

    const save = async () => {
        if (!draft.fund.trim()) { setError('Give the fund a name.'); return; }
        setBusy(true); setError(null);
        if (editing === 'new') {
            const created = await createCompany({ ...toFields(draft), board: 'fund_house' });
            setBusy(false);
            if (!created) { setError('Could not save the fund'); return; }
        } else if (editing) {
            const { error: failed } = await updateCompany(editing, toFields(draft));
            setBusy(false);
            if (failed) { setError(failed); return; }
        }
        cancel();
    };

    const remove = async (f: Fund) => {
        if (!window.confirm(`Delete ${f.fund}? Its notes are deleted with it.`)) return;
        await deleteCompany(f.id);
    };

    if (!fundHouseReady) {
        return (
            <div className="fund-house-message">
                The Fund House page needs <code>supabase/fund-house-fields.sql</code> run in the Supabase SQL editor.
                It adds four columns to companies and is safe to run more than once.
            </div>
        );
    }
    // Companies arrive after sign-in; until some have, "no funds yet" would be a lie.
    if (isLoading || companies.length === 0) {
        return <div className="fund-house-message"><Loader2 size={15} className="spin" /> Loading…</div>;
    }

    // Buttons in a row act on their own, rather than also opening the fund's notes.
    const act = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const editRow = (key: string) => (
        <tr key={key} className="fund-house-editing">
            {COLUMNS.map((c, i) => (
                <td key={c.key}>
                    <input
                        className="form-input"
                        autoFocus={i === 0}
                        value={draft[c.key]}
                        placeholder={c.placeholder}
                        list={c.key === 'stage' ? 'fund-house-stages' : undefined}
                        onChange={e => setDraft(d => ({ ...d, [c.key]: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); save(); }
                            if (e.key === 'Escape') cancel();
                        }}
                    />
                </td>
            ))}
            <td>
                <div className="fund-house-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                        {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy} aria-label="Cancel"><X size={14} /></button>
                </div>
            </td>
        </tr>
    );

    return (
        <div className="fund-house">
            <div className="fund-house-toolbar">
                <div className="fund-house-search">
                    <Search size={14} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search funds, houses, managers…" />
                </div>
                <span className="fund-house-count">{funds.length} fund{funds.length === 1 ? '' : 's'}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={startNew} disabled={editing === 'new'}>
                    <Plus size={14} /> Add fund
                </button>
            </div>
            {error && <div className="fund-house-error">{error}</div>}

            <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="data-table fund-house-table">
                    <thead>
                        <tr>
                            {COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
                            <th style={{ width: 230 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(f => editing === f.id ? editRow(f.id) : (
                            <tr key={f.id} className="fund-house-row" onClick={() => notes.open(f.id)} title={`Open ${f.fund}'s notes`}>
                                {COLUMNS.map(c => (
                                    <td key={c.key} className={c.key === 'fund' ? 'fund-house-name' : undefined}>{f[c.key] || '—'}</td>
                                ))}
                                <td>
                                    <div className="fund-house-actions">
                                        <button type="button" className="btn btn-secondary btn-sm fund-house-notes" onClick={act(() => notes.open(f.id))}>
                                            <NotebookPen size={13} /> Notes
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={act(() => startEdit(f))} disabled={busy}>
                                            <Pencil size={13} /> Edit
                                        </button>
                                        <button type="button" className="btn btn-ghost btn-sm fund-house-delete" onClick={act(() => remove(f))}
                                            disabled={busy} aria-label={`Delete ${f.fund}`} title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {editing === 'new' && editRow('new')}
                        {shown.length === 0 && editing !== 'new' && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="fund-house-empty">
                                    {funds.length === 0 ? <>No funds yet. <button type="button" onClick={startNew}>Add the first one</button></> : 'No fund matches that search.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <datalist id="fund-house-stages">
                {stages.map(s => <option key={s} value={s} />)}
            </datalist>
        </div>
    );
}
