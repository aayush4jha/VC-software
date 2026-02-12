'use client';

import React, { useState } from 'react';
import { Layers, AlertTriangle, Tags, Building2, Users, Plus, Trash2, GripVertical, Pencil } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { AppProvider } from '@/lib/context';
import { pipelineStages, industries, rejectionReasonCategories, dealSourceNames, users } from '@/lib/mock-data';

type SettingsSection = 'stages' | 'industries' | 'rejection' | 'sources' | 'team';

const settingsSections: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
    { id: 'stages', label: 'Pipeline Stages', icon: Layers },
    { id: 'industries', label: 'Industries', icon: Building2 },
    { id: 'rejection', label: 'Rejection Reasons', icon: AlertTriangle },
    { id: 'sources', label: 'Deal Sources', icon: Tags },
    { id: 'team', label: 'Team Members', icon: Users },
];

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('stages');

    return (
        <AppProvider>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <TopHeader title="Settings" subtitle="Configure system options" />
                    <div className="page-content page-enter">
                        <div className="settings-grid">
                            <div className="settings-nav">
                                {settingsSections.map(sec => {
                                    const Icon = sec.icon;
                                    return (
                                        <div
                                            key={sec.id}
                                            className={`settings-nav-item ${activeSection === sec.id ? 'active' : ''}`}
                                            onClick={() => setActiveSection(sec.id)}
                                        >
                                            <Icon size={16} /> {sec.label}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="settings-content">
                                {activeSection === 'stages' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Pipeline Stages</h2>
                                            <button className="btn btn-primary btn-sm"><Plus size={14} /> Add Stage</button>
                                        </div>
                                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
                                            Configure the stages of your deal flow pipeline. Drag to reorder.
                                        </p>
                                        <div className="config-list">
                                            {pipelineStages.map(s => (
                                                <div key={s.id} className="config-item">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <GripVertical size={14} style={{ color: 'var(--text-tertiary)', cursor: 'grab' }} />
                                                        <span className="config-item-color" style={{ background: s.color }} />
                                                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>— {s.description}</span>
                                                    </div>
                                                    <div className="config-item-actions">
                                                        <button className="btn btn-ghost btn-sm"><Pencil size={12} /></button>
                                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeSection === 'industries' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Industries ({industries.length})</h2>
                                            <button className="btn btn-primary btn-sm"><Plus size={14} /> Add Industry</button>
                                        </div>
                                        <div className="config-list">
                                            {industries.map(ind => (
                                                <div key={ind.id} className="config-item">
                                                    <span style={{ fontWeight: 500 }}>{ind.name}</span>
                                                    <div className="config-item-actions">
                                                        <button className="btn btn-ghost btn-sm"><Pencil size={12} /></button>
                                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeSection === 'rejection' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Rejection Reason Taxonomy</h2>
                                            <button className="btn btn-primary btn-sm"><Plus size={14} /> Add Category</button>
                                        </div>
                                        {rejectionReasonCategories.map(cat => (
                                            <div key={cat.id} style={{ marginBottom: 20 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    {cat.name}
                                                    <button className="btn btn-ghost btn-sm"><Plus size={12} /> Sub-reason</button>
                                                </div>
                                                <div className="config-list">
                                                    {cat.subReasons.map(sub => (
                                                        <div key={sub.id} className="config-item" style={{ marginLeft: 20 }}>
                                                            <span style={{ fontSize: 13 }}>{sub.name}</span>
                                                            <div className="config-item-actions">
                                                                <button className="btn btn-ghost btn-sm"><Pencil size={12} /></button>
                                                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeSection === 'sources' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Deal Source Names</h2>
                                            <button className="btn btn-primary btn-sm"><Plus size={14} /> Add Source</button>
                                        </div>
                                        <div className="config-list">
                                            {dealSourceNames.map(ds => (
                                                <div key={ds.id} className="config-item">
                                                    <span style={{ fontWeight: 500 }}>{ds.name}</span>
                                                    <div className="config-item-actions">
                                                        <button className="btn btn-ghost btn-sm"><Pencil size={12} /></button>
                                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeSection === 'team' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Team Members</h2>
                                            <button className="btn btn-primary btn-sm"><Plus size={14} /> Add Member</button>
                                        </div>
                                        <div className="config-list">
                                            {users.map(u => (
                                                <div key={u.id} className="config-item">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div className="kanban-card-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                                            {u.name.split(' ').map(n => n[0]).join('')}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.email}</div>
                                                        </div>
                                                    </div>
                                                    <span className={`badge ${u.role === 'partner' ? 'badge-warning' : 'badge-info'}`}>
                                                        {u.role}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </AppProvider>
    );
}
