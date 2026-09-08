'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, X, ChevronDown, Plus } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { INVESTMENT_VEHICLES } from '@/types/database';

/**
 * Investment-vehicle picker with an inline "add new" and a per-row delete —
 * the same control on the entry round, every follow-on and the add-round form,
 * so a vehicle added in one place is immediately offered in the others.
 *
 * A native <select> cannot carry a button per option, so this is a custom
 * listbox. The vehicle is stored on the investment as a name rather than a
 * reference, which means two things worth stating: a name that predates the
 * registry still shows as the current value instead of reading blank, and
 * deleting an entry only removes it from this list — investments already
 * recorded against it keep their value.
 */
export default function VehicleSelect({
    value,
    onChange,
    labelFontSize,
}: {
    value: string;
    onChange: (name: string) => void;
    labelFontSize?: number;
}) {
    const { investmentVehicles, addInvestmentVehicle, deleteInvestmentVehicle } = useAppContext();
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on an outside click, so the list behaves like the native control
    // it replaces.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setAdding(false);
                setConfirmId(null);
                setError(null);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Falls back to the built-in names when the registry table does not exist
    // yet, so the list is never empty. Those have no id and cannot be deleted.
    const registry = investmentVehicles.length > 0
        ? investmentVehicles
        : INVESTMENT_VEHICLES.map(name => ({ id: '', name }));

    const rows = value && !registry.some(v => v.name === value)
        ? [{ id: '', name: value }, ...registry]
        : registry;

    const commitNew = async () => {
        const trimmed = draft.trim();
        if (!trimmed) { setAdding(false); setDraft(''); return; }
        setBusy(true);
        const saved = await addInvestmentVehicle(trimmed);
        setBusy(false);
        if (saved) { onChange(saved); setOpen(false); }
        setAdding(false);
        setDraft('');
    };

    const remove = async (id: string, name: string) => {
        setBusy(true);
        const err = await deleteInvestmentVehicle(id);
        setBusy(false);
        setConfirmId(null);
        if (err) { setError(`Could not remove "${name}": ${err}`); return; }
        setError(null);
        // The selected value is stored as a name, so it stays valid; just stop
        // showing it as a live choice.
        if (value === name) onChange('');
    };

    const fs = labelFontSize ?? 14;

    return (
        <div ref={rootRef} style={{ position: 'relative' }}>
            <button
                type="button"
                className="form-select"
                onClick={() => setOpen(o => !o)}
                style={{
                    fontSize: fs, width: '100%', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {value || 'Select vehicle'}
                </span>
                <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4,
                    background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    maxHeight: 260, overflowY: 'auto', padding: 4,
                }}>
                    {rows.map(v => (
                        <div
                            key={v.id || v.name}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                borderRadius: 6, padding: '2px 4px',
                                background: v.name === value ? 'var(--bg-hover, rgba(99,102,241,0.08))' : 'transparent',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => { onChange(v.name); setOpen(false); setConfirmId(null); }}
                                style={{
                                    flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                                    cursor: 'pointer', padding: '6px 4px', fontSize: fs,
                                    color: 'var(--text-primary)', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                            >
                                {v.name}
                            </button>

                            {confirmId === v.id && v.id ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Remove?</span>
                                    <button type="button" title="Confirm remove" disabled={busy}
                                        onClick={() => remove(v.id, v.name)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                        <Check size={13} style={{ color: 'var(--danger, #b91c1c)' }} />
                                    </button>
                                    <button type="button" title="Keep" onClick={() => setConfirmId(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                        <X size={13} style={{ color: 'var(--text-tertiary)' }} />
                                    </button>
                                </span>
                            ) : v.id ? (
                                <button
                                    type="button"
                                    title={`Remove ${v.name} from the list`}
                                    onClick={e => { e.stopPropagation(); setConfirmId(v.id); }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        padding: 2, flexShrink: 0, opacity: 0.5,
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            ) : null}
                        </div>
                    ))}

                    {error && (
                        <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--danger, #b91c1c)' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 4, paddingTop: 4 }}>
                        {adding ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: 2 }}>
                                <input
                                    className="form-input"
                                    placeholder="Vehicle name"
                                    value={draft}
                                    autoFocus
                                    disabled={busy}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitNew(); }
                                        if (e.key === 'Escape') { setAdding(false); setDraft(''); }
                                    }}
                                    style={{ flex: 1, minWidth: 0, fontSize: fs }}
                                />
                                <button type="button" className="btn btn-primary btn-sm" onClick={commitNew} disabled={busy}>
                                    <Check size={13} />
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setDraft(''); }}>
                                    <X size={13} />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setDraft(''); setAdding(true); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    padding: '6px 8px', fontSize: fs, color: 'var(--primary)',
                                }}
                            >
                                <Plus size={13} /> Add new vehicle
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
