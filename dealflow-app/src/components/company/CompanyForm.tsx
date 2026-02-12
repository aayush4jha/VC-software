'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { industries, users, dealSourceNames, pipelineStages } from '@/lib/mock-data';
import { CompanyRound, PriorityLevel, DealSourceType, ShareType } from '@/types/database';

const rounds: CompanyRound[] = ['Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'];
const priorities: PriorityLevel[] = ['Low', 'Medium', 'High'];
const dealSourceTypes: DealSourceType[] = ['Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'];
const shareTypes: ShareType[] = ['Primary', 'Secondary'];

export default function CompanyForm() {
    const { showCompanyForm, setShowCompanyForm } = useAppContext();

    if (!showCompanyForm) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowCompanyForm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh' }}>
                <div className="modal-header">
                    <div className="modal-title">Add New Company</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowCompanyForm(false)}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Company Name *</label>
                            <input className="form-input" placeholder="Enter company name" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Pipeline Stage</label>
                            <select className="form-select">
                                {pipelineStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Founder Name *</label>
                            <input className="form-input" placeholder="Enter founder name" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Founder Email *</label>
                            <input className="form-input" type="email" placeholder="founder@company.com" />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Assign to Analyst</label>
                            <select className="form-select">
                                <option value="">Unassigned</option>
                                {users.filter(u => u.role === 'analyst').map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Company Round</label>
                            <select className="form-select">
                                {rounds.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Priority Level</label>
                            <select className="form-select">
                                {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Industry</label>
                            <select className="form-select">
                                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Sub-Industry</label>
                            <input className="form-input" placeholder="e.g. B2B Payments" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Share Type</label>
                            <select className="form-select">
                                {shareTypes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Deal Source Type</label>
                            <select className="form-select">
                                {dealSourceTypes.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Deal Source Name</label>
                            <select className="form-select">
                                {dealSourceNames.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Total Fund Raise (₹)</label>
                            <input className="form-input" type="number" placeholder="e.g. 150000000" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Valuation (₹)</label>
                            <input className="form-input" type="number" placeholder="e.g. 600000000" />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Google Drive Link</label>
                        <input className="form-input" type="url" placeholder="https://drive.google.com/..." />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Custom Tags</label>
                        <input className="form-input" placeholder="Enter tags separated by commas" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">SLA Deadline</label>
                        <input className="form-input" type="date" />
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowCompanyForm(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => setShowCompanyForm(false)}>
                        <Plus size={14} /> Add Company
                    </button>
                </div>
            </div>
        </div>
    );
}
