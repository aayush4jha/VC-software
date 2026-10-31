'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { SimilarCompany, SimilarityReason } from '@/lib/company-dedupe';
import type { Company } from '@/types/database';

const REASON_LABEL: Record<SimilarityReason, string> = {
    'same-name': 'Same name',
    'spelling-variant': 'Similar spelling',
    'contains': 'Name overlaps',
};

/**
 * Shown under a company-name field when the name matches something already on
 * the platform — "Dholakiya" when "Dholakia" exists. Saving is blocked until the
 * person either opens the existing company or states this is a different one:
 * a near-duplicate is far cheaper to stop here than to merge later.
 */
export default function DuplicateCompanyWarning({
    matches,
    acknowledged,
    onAcknowledge,
    onBeforeOpen,
}: {
    matches: SimilarCompany<Company>[];
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    /** Close the form before the existing company is opened. */
    onBeforeOpen: () => void;
}) {
    const { setSelectedCompany, pipelineStages } = useAppContext();
    const router = useRouter();
    const pathname = usePathname();

    if (matches.length === 0) return null;

    const whereIs = (c: Company): string => {
        if (c.terminalStatus === 'Portfolio') return 'Portfolio';
        if (c.terminalStatus) return c.terminalStatus;
        const stage = pipelineStages.find(s => s.id === c.pipelineStageId)?.name;
        return stage ? `Deal Flow · ${stage}` : 'Deal Flow';
    };

    // Portfolio companies open in the portfolio panel; everything else in the
    // deal-flow panel. Selection lives in app context, so it survives the route
    // change and the panel opens on arrival.
    const open = (c: Company) => {
        onBeforeOpen();
        setSelectedCompany(c);
        const target = c.terminalStatus === 'Portfolio' ? '/portfolio' : '/dealflow';
        if (pathname !== target) router.push(target);
    };

    const strongest = matches[0];

    return (
        <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 8,
            border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#b45309' }}>
                <AlertTriangle size={14} />
                {strongest.reason === 'same-name'
                    ? 'This company is already on the platform'
                    : 'A company with a similar name is already on the platform'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {matches.map(m => (
                    <div key={m.company.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.company.companyName}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{whereIs(m.company)}</span>
                        <span style={{
                            fontSize: 10, fontWeight: 600, borderRadius: 999, padding: '1px 7px',
                            background: 'rgba(245,158,11,0.15)', color: '#b45309',
                        }}>
                            {REASON_LABEL[m.reason]}
                        </span>
                        <button
                            type="button"
                            onClick={() => open(m.company)}
                            style={{
                                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none',
                                cursor: 'pointer', padding: 0,
                            }}
                        >
                            Open <ExternalLink size={11} />
                        </button>
                    </div>
                ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={acknowledged} onChange={e => onAcknowledge(e.target.checked)} />
                It&apos;s a different company — save it anyway
            </label>
        </div>
    );
}
