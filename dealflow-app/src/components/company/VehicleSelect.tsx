'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { INVESTMENT_VEHICLES } from '@/types/database';

/**
 * Investment-vehicle picker with an inline "add new" — the same control on the
 * entry round, every follow-on, and the add-round form, so a vehicle added in
 * one place is immediately offered in the others.
 *
 * The vehicle is stored on the investment as a name, so a vehicle that is not
 * in the registry (added before this list existed, or written while the
 * registry insert failed) still shows as the current value rather than
 * silently reading as blank.
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
    const { investmentVehicles, addInvestmentVehicle } = useAppContext();
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);

    // Falls back to the built-in names when the registry table has not been
    // created yet, so the dropdown is never empty.
    const names = investmentVehicles.length > 0
        ? investmentVehicles.map(v => v.name)
        : [...INVESTMENT_VEHICLES];

    // Keep a value that predates the registry visible in the list.
    const options = value && !names.includes(value) ? [value, ...names] : names;

    const commit = async () => {
        const trimmed = draft.trim();
        if (!trimmed) { setAdding(false); setDraft(''); return; }
        setSaving(true);
        const saved = await addInvestmentVehicle(trimmed);
        setSaving(false);
        if (saved) onChange(saved);
        setAdding(false);
        setDraft('');
    };

    if (adding) {
        return (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                    className="form-input"
                    placeholder="Vehicle name"
                    value={draft}
                    autoFocus
                    disabled={saving}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        if (e.key === 'Escape') { setAdding(false); setDraft(''); }
                    }}
                    style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={commit} disabled={saving}>
                    <Check size={13} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setDraft(''); }}>
                    <X size={13} />
                </button>
            </div>
        );
    }

    return (
        <select
            className="form-select"
            style={labelFontSize ? { fontSize: labelFontSize } : undefined}
            value={value}
            onChange={e => {
                if (e.target.value === '__new__') { setDraft(''); setAdding(true); }
                else onChange(e.target.value);
            }}
        >
            <option value="">Select vehicle</option>
            {options.map(v => <option key={v} value={v}>{v}</option>)}
            <option value="__new__">+ Add new vehicle…</option>
        </select>
    );
}
