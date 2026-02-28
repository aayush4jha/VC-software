'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { Users, Mail, Phone, Building2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';

export default function ContactsPage() {
    const { companies } = useAppContext();
    const founders = companies
        .filter(c => !c.terminalStatus)
        .map(c => ({
            name: c.founderName,
            email: c.founderEmail,
            company: c.companyName,
            status: c.terminalStatus || 'Pipeline',
        }));

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Contacts" subtitle="Founders database" />
                <div className="page-content page-enter">
                    <div className="toolbar">
                        <div className="toolbar-left">
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {founders.length} founders
                            </span>
                        </div>
                        <div className="toolbar-right">
                            <button className="btn btn-primary btn-sm">
                                <Users size={14} /> Add Contact
                            </button>
                        </div>
                    </div>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Company</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {founders.map((f, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div className="kanban-card-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                                                    {f.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                                </div>
                                                <span className="table-company-name">{f.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--primary)' }}>{f.email}</td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Building2 size={14} style={{ color: 'var(--text-tertiary)' }} />
                                                {f.company}
                                            </span>
                                        </td>
                                        <td><span className="badge badge-info">{f.status}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-sm"><Mail size={14} /></button>
                                                <button className="btn btn-ghost btn-sm"><Phone size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
