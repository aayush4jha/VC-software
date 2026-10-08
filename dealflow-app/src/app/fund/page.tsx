'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import FundDashboard from '@/components/fund/FundDashboard';
import FundLedger from '@/components/fund/FundLedger';

type FundView = 'ledger' | 'tracker';

/**
 * Two views of the fund.
 *
 * The ledger is 01_Fund Page: balances, composition and year-on-year, all
 * derived from imported bank statements. The tracker is what was here before —
 * hand-kept entity balances and commitments — and stays because the ledger is
 * only as complete as the statements uploaded into it.
 */
export default function FundPage() {
    const [view, setView] = useState<FundView>('ledger');

    const tabs: { key: FundView; label: string }[] = [
        { key: 'ledger', label: 'Fund Ledger' },
        { key: 'tracker', label: 'Manual Tracker' },
    ];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader
                    title="Fund"
                    subtitle={view === 'ledger'
                        ? 'Balances, inflows and outflows from the bank ledger'
                        : 'Hand-kept balances, payment dues and expenses'}
                />
                <div className="page-content" style={{ padding: 0 }}>
                    <div style={{
                        display: 'flex', gap: 4, padding: '10px 24px 0',
                        borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    }}>
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setView(t.key)}
                                style={{
                                    padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                                    background: 'none', fontFamily: 'var(--font-sans)',
                                    fontWeight: view === t.key ? 600 : 500,
                                    color: view === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                                    borderBottom: `2px solid ${view === t.key ? 'var(--primary)' : 'transparent'}`,
                                    marginBottom: -1,
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {view === 'ledger'
                        ? <FundLedger />
                        : <div style={{ padding: '18px 24px 40px' }}><FundDashboard /></div>}
                </div>
            </main>
        </div>
    );
}
