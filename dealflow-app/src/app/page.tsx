'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import CompanyDetail from '@/components/company/CompanyDetail';
import RejectionFlow from '@/components/company/RejectionFlow';
import EmailCompose from '@/components/integrations/EmailCompose';
import CalendarInvite from '@/components/integrations/CalendarInvite';
import CompanyForm from '@/components/company/CompanyForm';
import DashboardPage from '@/components/dashboard/DashboardPage';

export default function Home() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <DashboardPage />
      </main>
      <CompanyDetail />
      <RejectionFlow />
      <EmailCompose />
      <CalendarInvite />
      <CompanyForm />
    </div>
  );
}
