'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Columns3, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { STATUS_COLUMNS } from '@/lib/status-columns';

/**
 * Which board columns this person has hidden: stage ids and status-column
 * keys. Kept in their own browser — it is how they like the board laid out,
 * not something everyone else should see change. Each board keeps its own,
 * under storageKey.
 */
export function useHiddenColumns(storageKey: string) {
    const [hidden, setHidden] = useState<string[]>([]);
    useEffect(() => {
        try {
            const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
            // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mount, so the server render matches
            if (Array.isArray(saved)) setHidden(saved.filter(x => typeof x === 'string'));
        } catch { /* no saved choice, or storage blocked: everything shows */ }
    }, [storageKey]);
    const save = (next: string[]) => {
        setHidden(next);
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* kept for this visit only */ }
    };
    return { hidden, setHidden: save };
}

/** The "Columns" button: tick a column to show it, untick to hide it. */
export default function ColumnPicker({ hidden, onChange }: { hidden: string[]; onChange: (hidden: string[]) => void }) {
    const { pipelineStages } = useAppContext();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
    }, [open]);

    const columns = [
        ...pipelineStages.map(s => ({ key: s.id, title: s.name, color: s.color })),
        ...STATUS_COLUMNS.map(c => ({ key: c.key, title: c.title, color: c.color })),
    ];
    const hiddenCount = columns.filter(c => hidden.includes(c.key)).length;
    const toggle = (key: string) => onChange(hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key]);

    return (
        <div className="column-picker" ref={ref}>
            <button type="button" className={`btn btn-secondary btn-sm${hiddenCount ? ' column-picker-active' : ''}`}
                onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <Columns3 size={14} /> Columns{hiddenCount ? ` · ${hiddenCount} hidden` : ''}
            </button>
            {open && (
                <div className="column-picker-menu" role="menu">
                    <div className="column-picker-head">
                        <span>Show columns</span>
                        <span style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={() => onChange([])} disabled={hiddenCount === 0}><Eye size={12} /> Show all</button>
                            <button type="button" onClick={() => onChange(columns.map(c => c.key))} disabled={hiddenCount === columns.length}><EyeOff size={12} /> Hide all</button>
                        </span>
                    </div>
                    {columns.map(c => (
                        <label key={c.key} className="column-picker-item">
                            <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />
                            <span className="kanban-column-dot" style={{ background: c.color }} />
                            <span className={hidden.includes(c.key) ? 'column-picker-hidden' : ''}>{c.title}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
