'use client';

import React, { useState } from 'react';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
    CATEGORY_DEFINITIONS, CATEGORY_LABELS, LEDGER_CATEGORIES,
    type LedgerCategory, type MappingRule, type FinancialYearStart,
} from '@/lib/fund-ledger';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export interface RuleRow {
    id: string; field: MappingRule['field']; match_text: string;
    category: LedgerCategory; priority: number; active: boolean; note: string;
}
export interface FundSettings {
    fy_start: FinancialYearStart;
    default_fx_rate: number | null;
}

/**
 * Settings / Mapping, from 04_Developer Summary.
 *
 * The built-in patterns read an Indian bank narration well enough, but no
 * fixed list survives a new bank, a new counterparty or a new expense head.
 * Without this page every misclassification is a code change; with it, the
 * person who can see the mistake is the person who fixes it — and the rule
 * they write outranks everything built in.
 *
 * Rules apply to the NEXT import. Transactions already in the ledger keep the
 * category they were given, because re-deciding history under a rule written
 * today would move last year's totals without anyone asking.
 */
export default function MappingRules({ rules, settings, onChanged }: {
    rules: RuleRow[];
    settings: FundSettings | null;
    onChanged: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<{ field: MappingRule['field']; matchText: string; category: LedgerCategory; note: string }>({
        field: 'description', matchText: '', category: 'office_expense', note: '',
    });

    const write = async (operation: string, data: Record<string, unknown>, match?: Record<string, unknown>) => {
        setSaving(true);
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'fund_mapping_rules', operation, data, match }),
        });
        setSaving(false);
        onChanged();
    };

    const add = async () => {
        if (!draft.matchText.trim()) return;
        await write('insert', {
            organization_id: ORGANIZATION_ID,
            field: draft.field,
            match_text: draft.matchText.trim(),
            category: draft.category,
            note: draft.note.trim(),
            // New rules go last, so adding one never silently re-sorts the rest.
            priority: (rules.reduce((m, r) => Math.max(m, r.priority), 0) || 0) + 10,
            active: true,
        });
        setDraft({ field: 'description', matchText: '', category: 'office_expense', note: '' });
    };

    const move = async (rule: RuleRow, direction: -1 | 1) => {
        const sorted = [...rules].sort((a, b) => a.priority - b.priority);
        const index = sorted.findIndex(r => r.id === rule.id);
        const swap = sorted[index + direction];
        if (!swap) return;
        await write('update', { priority: swap.priority }, { id: rule.id });
        await write('update', { priority: rule.priority }, { id: swap.id });
    };

    const saveSettings = async (patch: Partial<FundSettings>) => {
        setSaving(true);
        await fetch('/api/db', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'fund_settings', operation: 'upsert',
                data: {
                    organization_id: ORGANIZATION_ID,
                    fy_start: patch.fy_start ?? settings?.fy_start ?? 'april',
                    default_fx_rate: patch.default_fx_rate ?? settings?.default_fx_rate ?? null,
                    updated_at: new Date().toISOString(),
                },
            }),
        });
        setSaving(false);
        onChanged();
    };

    const sorted = [...rules].sort((a, b) => a.priority - b.priority);

    return (
        <div style={{ padding: '18px 24px 40px', maxWidth: 1000 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Classification rules</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 14px' }}>
                A rule here beats every built-in pattern. The first matching rule wins, so put the specific
                ones above the general ones. Rules apply to the <strong>next</strong> import — transactions
                already in the ledger keep the category they were given, because re-deciding history under a
                rule written today would move last year&apos;s totals without anyone asking for it.
            </p>

            <div className="table-container" style={{ marginBottom: 14 }}>
                <table className="data-table">
                    <thead>
                        <tr><th style={{ width: 70 }}>Order</th><th>When</th><th>Contains</th><th>Treat as</th><th>Note</th><th /></tr>
                    </thead>
                    <tbody>
                        {sorted.map((r, i) => (
                            <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                                <td style={{ fontSize: 11 }}>
                                    <button className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                                        disabled={i === 0 || saving} onClick={() => move(r, -1)}>
                                        <ArrowUp size={11} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                                        disabled={i === sorted.length - 1 || saving} onClick={() => move(r, 1)}>
                                        <ArrowDown size={11} />
                                    </button>
                                </td>
                                <td style={{ fontSize: 12 }}>{r.field.replace('_', ' ')}</td>
                                <td style={{ fontSize: 12, fontWeight: 600 }}>{r.match_text}</td>
                                <td style={{ fontSize: 12 }}>{CATEGORY_LABELS[r.category]}</td>
                                <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.note || '—'}</td>
                                <td>
                                    <button className="btn btn-ghost btn-sm" disabled={saving}
                                        onClick={() => write('delete', {}, { id: r.id })}>
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                No rules yet — the built-in patterns are doing the classifying.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8,
                padding: 12, borderRadius: 10, marginBottom: 24,
                border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
            }}>
                <select className="form-input" style={{ fontSize: 12 }} value={draft.field}
                    onChange={e => setDraft({ ...draft, field: e.target.value as MappingRule['field'] })}>
                    <option value="description">Description</option>
                    <option value="major_head">Major head</option>
                    <option value="entity">Entity</option>
                    <option value="bank">Bank</option>
                </select>
                <input className="form-input" style={{ fontSize: 12 }} placeholder="contains this text…"
                    value={draft.matchText} onChange={e => setDraft({ ...draft, matchText: e.target.value })} />
                <select className="form-input" style={{ fontSize: 12 }} value={draft.category}
                    onChange={e => setDraft({ ...draft, category: e.target.value as LedgerCategory })}>
                    {LEDGER_CATEGORIES.filter(c => c !== 'unclassified').map(c => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                </select>
                <input className="form-input" style={{ fontSize: 12 }} placeholder="Why (optional)"
                    value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={add} disabled={saving || !draft.matchText.trim()}>
                    {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <><Plus size={13} /> Add rule</>}
                </button>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Defaults</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                What the Fund page opens with, and the rate used only where a UAE statement carries no INR
                column of its own.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Financial year
                    <select className="form-input" style={{ fontSize: 12, width: 'auto' }}
                        value={settings?.fy_start ?? 'april'} disabled={saving}
                        onChange={e => saveSettings({ fy_start: e.target.value as FinancialYearStart })}>
                        <option value="april">April–March</option>
                        <option value="november">November–October</option>
                    </select>
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    AED → INR fallback
                    <input className="form-input" type="number" step="0.01" style={{ fontSize: 12, width: 100 }}
                        defaultValue={settings?.default_fx_rate ?? ''} disabled={saving}
                        onBlur={e => saveSettings({ default_fx_rate: e.target.value ? Number(e.target.value) : null })} />
                </label>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>What the categories mean</h3>
            <div className="table-container">
                <table className="data-table">
                    <thead><tr><th>Category</th><th>Includes</th><th>Never</th></tr></thead>
                    <tbody>
                        {CATEGORY_DEFINITIONS.filter(c => c.key !== 'unclassified').map(c => (
                            <tr key={c.key}>
                                <td style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</td>
                                <td style={{ fontSize: 11 }}>{c.includes}</td>
                                <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.excludes || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
