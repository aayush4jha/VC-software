'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import BoardPage from '@/components/pipeline/BoardPage';

export default function DealflowPage() {
    return <BoardPage title="Deal Flow Pipeline" noun="companies" addLabel="Add Company" columnsKey="dealflow.hiddenColumns" />;
}
