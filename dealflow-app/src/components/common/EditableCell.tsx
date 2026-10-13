'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';

type Kind = 'text' | 'number' | 'money' | 'date' | 'select';

/**
 * A value that can be corrected in place.
 *
 * It commits on blur and on Enter, and abandons on Escape — the three things
 * anyone expects of a cell in a spreadsheet, which is what these pages are.
 *
 * `edited` marks a value that no longer matches the file it came from. That
 * mark is the whole contract of editing an imported page: without it there is
 * no way to tell a figure the firm corrected from one the import produced, and
 * no way to put it back. `onRevert` is offered whenever there is something to
 * go back to.
 */
export default function EditableCell({
    value, kind = 'text', options, display, edited, title, align = 'left',
    onSave, onRevert, disabled,
}: {
    value: string | number | null;
    kind?: Kind;
    options?: { value: string; label: string }[];
    /** How it reads when not being edited. Defaults to the value itself. */
    display?: React.ReactNode;
    edited?: boolean;
    title?: string;
    align?: 'left' | 'right';
    onSave: (next: string) => void | Promise<void>;
    onRevert?: () => void | Promise<void>;
    disabled?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);

    const start = () => {
        if (disabled) return;
        setDraft(value === null || value === undefined ? '' : String(value));
        setEditing(true);
    };

    const commit = async (next: string) => {
        setEditing(false);
        if (next === String(value ?? '')) return;
        setSaving(true);
        try { await onSave(next); } finally { setSaving(false); }
    };

    if (editing) {
        const common = {
            autoFocus: true,
            className: 'form-input',
            style: {
                fontSize: 11.5, padding: '2px 6px', width: '100%',
                textAlign: align, fontFamily: 'var(--font-sans)',
            } as React.CSSProperties,
            onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => commit(e.target.value),
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(false);
            },
        };
        if (kind === 'select') {
            return (
                <select {...common} value={draft} onChange={e => { setDraft(e.target.value); commit(e.target.value); }}>
                    {(options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }
        return (
            <input
                {...common}
                type={kind === 'date' ? 'date' : kind === 'number' || kind === 'money' ? 'number' : 'text'}
                step={kind === 'money' ? '0.01' : undefined}
                value={draft}
                onChange={e => setDraft(e.target.value)}
            />
        );
    }

    return (
        <span
            onClick={start}
            title={title || (disabled ? undefined : 'Click to edit')}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                cursor: disabled ? 'default' : 'text',
                opacity: saving ? 0.5 : 1,
                borderBottom: disabled ? 'none' : '1px dotted var(--border)',
                minWidth: 24,
            }}
        >
            {display ?? (value === null || value === undefined || value === '' ? '—' : String(value))}
            {edited && (
                <>
                    <span
                        title="Edited by hand — the next upload will leave this alone"
                        style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: 'var(--primary)', flexShrink: 0,
                        }}
                    />
                    {onRevert && (
                        <button
                            type="button"
                            title="Put the file's value back"
                            onClick={e => { e.stopPropagation(); onRevert(); }}
                            style={{
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--text-tertiary)', display: 'inline-flex',
                            }}
                        >
                            <RotateCcw size={10} />
                        </button>
                    )}
                </>
            )}
        </span>
    );
}
