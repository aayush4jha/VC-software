'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import FundDashboard from '@/components/fund/FundDashboard';

export default function FundPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Fund Tracker" subtitle="Bank balances, payment dues, and expense bifurcation" />
                <div className="page-content">
                    <FundDashboard />
                </div>
            </main>
        </div>
    );
}
