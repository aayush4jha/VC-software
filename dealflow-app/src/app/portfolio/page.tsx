'use client';

import React from 'react';
import { Briefcase, TrendingUp, DollarSign } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { AppProvider } from '@/lib/context';

export default function PortfolioPage() {
    return (
        <AppProvider>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <TopHeader title="Portfolio" subtitle="Invested companies" />
                    <div className="page-content page-enter">
                        <div className="empty-state" style={{ height: '60vh' }}>
                            <div className="empty-state-icon"><Briefcase size={28} /></div>
                            <div className="empty-state-title">Portfolio Management</div>
                            <div className="empty-state-text">
                                Companies marked as &quot;Portfolio&quot; in the pipeline will appear here.
                                <br />This module connects to the Post-Investment system (Part 3).
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </AppProvider>
    );
}
