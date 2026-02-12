'use client';

import React from 'react';
import { Mail, Send, Inbox } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { AppProvider } from '@/lib/context';

export default function EmailsPage() {
    return (
        <AppProvider>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <TopHeader title="Emails" subtitle="Email communications" />
                    <div className="page-content page-enter">
                        <div className="empty-state" style={{ height: '60vh' }}>
                            <div className="empty-state-icon"><Mail size={28} /></div>
                            <div className="empty-state-title">Email Integration</div>
                            <div className="empty-state-text">
                                Connect your Google Workspace account via OAuth to send emails.
                                <br />Emails can be composed from any company card.
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 16 }}>
                                Connect Google Account
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </AppProvider>
    );
}
