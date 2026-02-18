'use client';

import React from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import TableView from '@/components/pipeline/TableView';
import FilterBar from '@/components/pipeline/FilterBar';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import { AppProvider, useAppContext } from '@/lib/context';
import { companies } from '@/lib/mock-data';

function DealflowContent() {
    const { viewMode, setViewMode, setShowCompanyForm } = useAppContext();
    const activeCount = companies.filter(c => !c.terminalStatus).length;

    return (
        <>
            <TopHeader title="Deal Flow Pipeline" subtitle={`${activeCount} active companies`} />
            <div className="page-content">
                {/* Toolbar */}
                <div className="toolbar">
                    <div className="toolbar-left">
                        <div className="view-toggle">
                            <button
                                className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                                onClick={() => setViewMode('kanban')}
                            >
                                <LayoutGrid size={14} /> Board
                            </button>
                            <button
                                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                                onClick={() => setViewMode('table')}
                            >
                                <List size={14} /> Table
                            </button>
                        </div>
                    </div>
                    <div className="toolbar-right">
                        <button className="btn btn-primary" onClick={() => setShowCompanyForm(true)}>
                            <Plus size={16} /> Add Company
                        </button>
                    </div>
                </div>

                <FilterBar />

                {viewMode === 'kanban' ? <KanbanBoard /> : <TableView />}
            </div>
        </>
    );
}

export default function DealflowPage() {
    return (
        <AppProvider>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <DealflowContent />
                </main>
                <CompanyDetail />
                <RejectionFlow />
                <EmailCompose />
                <CalendarInvite />
                <CompanyForm />
            </div>
        </AppProvider>
    );
}
