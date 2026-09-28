'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import FundInvestments from '@/components/fund/FundInvestments';

export default function FundInvestmentsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Fund Investments" subtitle="Funds we invest in — drawdowns and NAV" />
                <div className="page-content page-enter">
                    <FundInvestments />
                </div>
            </main>
        </div>
    );
}
