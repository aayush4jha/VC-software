'use client';

import React from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import TableView from '@/components/pipeline/TableView';
import FilterBar from '@/components/pipeline/FilterBar';
import ColumnPicker, { useHiddenColumns } from '@/components/pipeline/ColumnPicker';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import { useAppContext } from '@/lib/context';

interface BoardPageProps {
    title: string;
    noun: string;        // what the subtitle counts: "companies", "funds"
    addLabel: string;
    columnsKey: string;  // where this board's hidden columns are kept
    notice?: React.ReactNode;  // shown in place of the board, when it cannot be used yet
}

function BoardContent({ title, noun, addLabel, columnsKey, notice }: BoardPageProps) {
    const { viewMode, setViewMode, setShowCompanyForm, companies } = useAppContext();
    const activeCount = companies.filter(c => !c.terminalStatus).length;
    const columns = useHiddenColumns(columnsKey);

    return (
        <>
            <TopHeader title={title} subtitle={notice ? undefined : `${activeCount} active ${noun}`} />
            <div className="page-content">
                {notice || (
                    <>
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
                                {viewMode === 'kanban' && <ColumnPicker hidden={columns.hidden} onChange={columns.setHidden} />}
                            </div>
                            <div className="toolbar-right">
                                <button className="btn btn-primary" onClick={() => setShowCompanyForm(true)}>
                                    <Plus size={16} /> {addLabel}
                                </button>
                            </div>
                        </div>

                        <FilterBar />

                        {viewMode === 'kanban' ? <KanbanBoard hiddenColumns={columns.hidden} /> : <TableView />}
                    </>
                )}
            </div>
        </>
    );
}

/**
 * A pipeline page: Board / Table, Columns, filters, and the company panels.
 * Deal Flow shows its companies; Fund House, inside FundHouseScope, its funds.
 */
export default function BoardPage(props: BoardPageProps) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <BoardContent {...props} />
            </main>
            <CompanyDetail />
            <RejectionFlow />
            <EmailCompose />
            <CalendarInvite />
            <CompanyForm />
        </div>
    );
}
