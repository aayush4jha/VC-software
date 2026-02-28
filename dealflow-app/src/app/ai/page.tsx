'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { Sparkles, FileSearch, BarChart3, MessageSquare, FileText, FileSpreadsheet } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';

const aiFeatures = [
    { icon: FileSearch, title: 'Quick Summary', desc: '2-3 line AI summary at Thesis Check stage', stage: 'Stage 1' },
    { icon: FileText, title: 'Full Deck Analysis', desc: 'Structured deck analysis with problem/solution, market, traction, red flags', stage: 'Stage 2' },
    { icon: BarChart3, title: 'KPI Benchmarking', desc: 'Extract KPIs and benchmark against industry standards', stage: 'Stage 2' },
    { icon: MessageSquare, title: 'Call Transcript Analysis', desc: 'Auto-transcribe calls, extract key points and action items', stage: 'Stage 3' },
    { icon: FileSpreadsheet, title: 'Filter Brief', desc: 'Auto-generate brief combining AI analysis, KPIs, and call notes', stage: 'Stage 4' },
    { icon: FileText, title: 'IC Memo', desc: 'Investment committee memo with exportable PDF', stage: 'Stage 5' },
];

export default function AIPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Dealflow AI" subtitle="AI-powered analysis features" />
                <div className="page-content page-enter">
                    <div className="ai-card" style={{ marginBottom: 24 }}>
                        <div className="ai-card-header">
                            <div className="ai-card-icon"><Sparkles size={16} /></div>
                            <span className="ai-card-title">Powered by Gemini API</span>
                        </div>
                        <div className="ai-card-body">
                            AI features are integrated throughout the pipeline. Each stage has specific AI capabilities that assist analysts in their evaluation process.
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        {aiFeatures.map((feat, i) => {
                            const Icon = feat.icon;
                            return (
                                <div key={i} className="card" style={{ cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <div className="ai-card-icon"><Icon size={16} /></div>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{feat.title}</div>
                                            <div className="badge badge-primary" style={{ marginTop: 2 }}>{feat.stage}</div>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{feat.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
}
