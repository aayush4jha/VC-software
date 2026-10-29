'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, Search } from 'lucide-react';

interface Fund {
    id: string;
    fund: string;
    house: string;
    fundManager: string;
    stage: string;
    size: string;
    commitment: string;
}

type Draft = Omit<Fund, 'id'>;

const COLUMNS: { key: keyof Draft; label: string; placeholder: string }[] = [
    { key: 'fund', label: 'Fund', placeholder: 'Fund name' },
    { key: 'house', label: 'House', placeholder: 'Fund house' },
    { key: 'fundManager', label: 'Fund Manager', placeholder: 'Name' },
    { key: 'stage', label: 'Stage', placeholder: 'e.g. Evaluating' },
    { key: 'size', label: 'Size', placeholder: 'e.g. ₹500 Cr' },
    { key: 'commitment', label: 'Commitment', placeholder: 'e.g. ₹5 Cr' },
];

const EMPTY: Draft = { fund: '', house: '', fundManager: '', stage: '', size: '', commitment: '' };

/** The Fund House table: one row per fund, added, edited and deleted in place. */
export default function FundHouseTable() {
    const [funds, setFunds] = useState<Fund[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [editing, setEditing] = useState<string | null>(null); // a fund's id, or 'new'
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');

    useEffect(() => {
        fetch('/api/fund-houses')
            .then(r => r.json())
            .then(j => {
                if (j.needsMigration) setNeedsMigration(true);
                else if (j.funds) setFunds(j.funds);
                else setError(j.error || 'Could not load the funds');
            })
            .catch(e => setError((e as Error).message));
    }, []);

    // What has been typed under Stage before, offered again so it stays consistent.
    const stages = useMemo(() => [...new Set((funds || []).map(f => f.stage).filter(Boolean))].sort(), [funds]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!funds || !q) return funds || [];
        return funds.filter(f => COLUMNS.some(c => f[c.key].toLowerCase().includes(q)));
    }, [funds, query]);

    const startNew = () => { setEditing('new'); setDraft(EMPTY); setError(null); };
    const startEdit = (f: Fund) => { setEditing(f.id); setDraft({ ...f }); setError(null); };
    const cancel = () => { setEditing(null); setDraft(EMPTY); };

    const save = async () => {
        if (!draft.fund.trim() && !draft.house.trim()) { setError('Give the fund or the house a name.'); return; }
        setBusy(true); setError(null);
        const isNew = editing === 'new';
        const res = await fetch('/api/fund-houses', {
            method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isNew ? draft : { id: editing, ...draft }),
        });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok || !j.fund) { setError(j.error || 'Could not save'); return; }
        setFunds(fs => isNew ? [...(fs || []), j.fund] : (fs || []).map(f => f.id === j.fund.id ? j.fund : f));
        cancel();
    };

    const remove = async (f: Fund) => {
        if (!window.confirm(`Delete ${f.fund || f.house}?`)) return;
        const res = await fetch(`/api/fund-houses?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'Could not delete'); return; }
        setFunds(fs => (fs || []).filter(x => x.id !== f.id));
    };

    if (needsMigration) {
        return (
            <div className="fund-house-message">
                The Fund House page needs <code>supabase/fund-houses.sql</code> run in the Supabase SQL editor.
                It is one small table and is safe to run more than once.
            </div>
        );
    }
    if (!funds) {
        return <div className="fund-house-message">{error || <><Loader2 size={15} className="spin" /> Loading…</>}</div>;
    }

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
                            <th style={{ width: 150 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(f => editing === f.id ? editRow(f.id) : (
                            <tr key={f.id}>
                                {COLUMNS.map(c => (
                                    <td key={c.key} className={c.key === 'fund' ? 'fund-house-name' : undefined}>{f[c.key] || '—'}</td>
                                ))}
                                <td>
                                    <div className="fund-house-actions">
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(f)} disabled={busy}>
                                            <Pencil size={13} /> Edit
                                        </button>
                                        <button type="button" className="btn btn-ghost btn-sm fund-house-delete" onClick={() => remove(f)}
                                            disabled={busy} aria-label={`Delete ${f.fund || f.house}`} title="Delete">
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
