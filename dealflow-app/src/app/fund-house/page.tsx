'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import BoardPage from '@/components/pipeline/BoardPage';
import { FundHouseScope, useAppContext } from '@/lib/context';

/** Funds the team tracks, on Deal Flow's board: the same cards, detail panel and notes. */
function FundHouseBoard() {
    const { fundHouseReady } = useAppContext();
    const notice = fundHouseReady ? undefined : (
        <div className="fund-house-message">
            The Fund House page needs <code>supabase/company-board.sql</code> run in the Supabase SQL editor.
            It adds one column to companies and is safe to run more than once.
        </div>
    );
    return <BoardPage title="Fund House" noun="funds" addLabel="Add Fund" columnsKey="fundHouse.hiddenColumns" notice={notice} />;
}

export default function FundHousePage() {
    return (
        <FundHouseScope>
            <FundHouseBoard />
        </FundHouseScope>
    );
}
