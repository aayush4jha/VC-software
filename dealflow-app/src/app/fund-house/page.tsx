'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import FundHouseTable from '@/components/fund-house/FundHouseTable';

export default function FundHousePage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Fund House" subtitle="Funds we are tracking — house, manager, stage, size and our commitment" />
                <div className="page-content page-enter">
                    <FundHouseTable />
                </div>
            </main>
        </div>
    );
}
