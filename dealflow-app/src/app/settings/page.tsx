'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Layers, AlertTriangle, Tags, Building2, Users,
    Plus, Trash2, GripVertical, Pencil, Check, X,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopHeader from '@/components/layout/TopHeader';
import { useAppContext } from '@/lib/context';

type SettingsSection = 'stages' | 'industries' | 'rejection' | 'sources' | 'team';

const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
    { id: 'stages',    label: 'Pipeline Stages',         icon: Layers },
    { id: 'industries',label: 'Industries',               icon: Building2 },
    { id: 'rejection', label: 'Rejection Reasons',        icon: AlertTriangle },
    { id: 'sources',   label: 'Deal Sources',             icon: Tags },
    { id: 'team',      label: 'Team Members',             icon: Users },
];

// Deterministic avatar colour from a string
const AVATAR_COLORS = [
    '#6366f1','#8b5cf6','#ec4899','#f59e0b',
    '#10b981','#3b82f6','#ef4444','#14b8a6',
];
function avatarColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string, email: string) {
    const src = name?.trim() || email || '?';
    return src.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function SettingsPage() {
    const router = useRouter();
    const {
        user, isLoading,
        pipelineStages, industries, rejectionReasonCategories, dealSourceNames, users,
        addPipelineStage, updatePipelineStage, deletePipelineStage,
        addIndustry, updateIndustry, deleteIndustry,
        addDealSourceName, updateDealSourceName, deleteDealSourceName,
        addRejectionCategory, deleteRejectionCategory,
        addSubReason, updateSubReason, deleteSubReason,
        inviteUser,
    } = useAppContext();

    // ── redirect non-admins ──────────────────────────────────
    React.useEffect(() => {
        if (!isLoading && user && user.role !== 'admin') router.replace('/');
    }, [isLoading, user, router]);

    const [active, setActive] = useState<SettingsSection>('stages');

    // ── add-form visibility per section ─────────────────────
    const [showAdd, setShowAdd] = useState(false);

    // ── shared add-form fields ───────────────────────────────
    const [addName,  setAddName]  = useState('');
    const [addColor, setAddColor] = useState('#6366f1');
    const [addDesc,  setAddDesc]  = useState('');

    // ── inline-edit: pipeline stage ─────────────────────────
    const [editStageId,    setEditStageId]    = useState<string | null>(null);
    const [editStageName,  setEditStageName]  = useState('');
    const [editStageColor, setEditStageColor] = useState('');
    const [editStageDesc,  setEditStageDesc]  = useState('');

    // ── inline-edit: industry ───────────────────────────────
    const [editIndId,   setEditIndId]   = useState<string | null>(null);
    const [editIndName, setEditIndName] = useState('');

    // ── inline-edit: deal source ─────────────────────────────
    const [editSrcId,   setEditSrcId]   = useState<string | null>(null);
    const [editSrcName, setEditSrcName] = useState('');

    // ── inline-add sub-reason per category ──────────────────
    const [addSubCatId,   setAddSubCatId]   = useState<string | null>(null);
    const [addSubName,    setAddSubName]    = useState('');

    // ── inline-edit: sub-reason ──────────────────────────────
    const [editSubId,   setEditSubId]   = useState<string | null>(null);
    const [editSubName, setEditSubName] = useState('');

    // ── invite form ──────────────────────────────────────────
    const [inviteEmail,   setInviteEmail]   = useState('');
    const [inviteRole,    setInviteRole]    = useState<'analyst'|'partner'|'admin'>('analyst');
    const [inviteStatus,  setInviteStatus]  = useState<'idle'|'sending'|'success'|'error'>('idle');
    const [inviteMsg,     setInviteMsg]     = useState('');

    // ── helpers ──────────────────────────────────────────────
    const resetAdd = () => { setAddName(''); setAddDesc(''); setShowAdd(false); };

    const switchSection = (id: SettingsSection) => {
        setActive(id);
        setShowAdd(false);
        setAddName(''); setAddDesc(''); setAddColor('#6366f1');
        setEditStageId(null); setEditIndId(null); setEditSrcId(null);
        setEditSubId(null); setAddSubCatId(null);
    };

    // ── Loading ──────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <TopHeader title="Settings" subtitle="Configure system options" />
                    <div className="page-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'calc(100vh - 120px)' }}>
                        <span style={{ color:'var(--text-tertiary)', fontSize:14 }}>Loading settings…</span>
                    </div>
                </main>
            </div>
        );
    }
    if (!user || user.role !== 'admin') return null;

    // ────────────────────────────────────────────────────────
    // Section renderers
    // ────────────────────────────────────────────────────────

    /* ── Pipeline Stages ── */
    const renderStages = () => (
        <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div>
                    <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Pipeline Stages</h2>
                    <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'4px 0 0' }}>
                        Configure deal flow stages. Drag to reorder.
                    </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
                    <Plus size={14} /> Add Stage
                </button>
            </div>

            {showAdd && (
                <div style={{ display:'flex', gap:8, margin:'12px 0', padding:12, background:'var(--bg-tertiary)', borderRadius:8 }}>
                    <input className="form-input" placeholder="Stage name" value={addName} onChange={e => setAddName(e.target.value)} style={{ flex:1 }} autoFocus />
                    <input type="color" value={addColor} onChange={e => setAddColor(e.target.value)} style={{ width:38, height:36, border:'none', cursor:'pointer', borderRadius:6 }} title="Colour" />
                    <input className="form-input" placeholder="Description (optional)" value={addDesc} onChange={e => setAddDesc(e.target.value)} style={{ flex:1 }} />
                    <button className="btn btn-primary btn-sm" onClick={async () => { if (!addName.trim()) return; await addPipelineStage(addName, addColor, addDesc); resetAdd(); }}>
                        <Check size={13} /> Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={resetAdd}><X size={13} /></button>
                </div>
            )}

            {pipelineStages.length === 0 && !showAdd && (
                <p style={{ color:'var(--text-tertiary)', fontSize:13, marginTop:16 }}>No stages yet. Click "+ Add Stage" to create one.</p>
            )}

            <div className="config-list" style={{ marginTop:12 }}>
                {pipelineStages.map(s => (
                    <div key={s.id} className="config-item">
                        {editStageId === s.id ? (
                            <div style={{ display:'flex', gap:8, flex:1, alignItems:'center' }}>
                                <input className="form-input" value={editStageName} onChange={e => setEditStageName(e.target.value)} style={{ flex:1, fontSize:13 }} autoFocus />
                                <input type="color" value={editStageColor} onChange={e => setEditStageColor(e.target.value)} style={{ width:32, height:30, border:'none', cursor:'pointer', borderRadius:4 }} />
                                <input className="form-input" value={editStageDesc} onChange={e => setEditStageDesc(e.target.value)} placeholder="Description" style={{ flex:1, fontSize:13 }} />
                                <button className="btn btn-ghost btn-sm" style={{ color:'var(--success)' }} onClick={async () => { await updatePipelineStage(s.id, { name:editStageName, color:editStageColor, description:editStageDesc }); setEditStageId(null); }}><Check size={13} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditStageId(null)}><X size={13} /></button>
                            </div>
                        ) : (
                            <>
                                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                    <GripVertical size={14} style={{ color:'var(--text-tertiary)', cursor:'grab' }} />
                                    <span style={{ width:12, height:12, borderRadius:'50%', background:s.color, flexShrink:0, display:'inline-block' }} />
                                    <span style={{ fontWeight:600 }}>{s.name}</span>
                                    {s.description && <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>— {s.description}</span>}
                                </div>
                                <div className="config-item-actions">
                                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditStageId(s.id); setEditStageName(s.name); setEditStageColor(s.color); setEditStageDesc(s.description); }}><Pencil size={12} /></button>
                                    <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} title="Delete" onClick={() => deletePipelineStage(s.id)}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    /* ── Industries ── */
    const renderIndustries = () => (
        <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Industries ({industries.length})</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
                    <Plus size={14} /> Add Industry
                </button>
            </div>

            {showAdd && (
                <div style={{ display:'flex', gap:8, marginBottom:12, padding:12, background:'var(--bg-tertiary)', borderRadius:8 }}>
                    <input className="form-input" placeholder="Industry name" value={addName} onChange={e => setAddName(e.target.value)} style={{ flex:1 }} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={async () => { if (!addName.trim()) return; await addIndustry(addName); resetAdd(); }}><Check size={13} /> Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={resetAdd}><X size={13} /></button>
                </div>
            )}

            {industries.length === 0 && !showAdd && (
                <p style={{ color:'var(--text-tertiary)', fontSize:13 }}>No industries yet.</p>
            )}

            <div className="config-list">
                {industries.map(ind => (
                    <div key={ind.id} className="config-item">
                        {editIndId === ind.id ? (
                            <div style={{ display:'flex', gap:8, flex:1, alignItems:'center' }}>
                                <input className="form-input" value={editIndName} onChange={e => setEditIndName(e.target.value)} style={{ flex:1, fontSize:13 }} autoFocus />
                                <button className="btn btn-ghost btn-sm" style={{ color:'var(--success)' }} onClick={async () => { await updateIndustry(ind.id, editIndName); setEditIndId(null); }}><Check size={13} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditIndId(null)}><X size={13} /></button>
                            </div>
                        ) : (
                            <>
                                <span style={{ fontWeight:500 }}>{ind.name}</span>
                                <div className="config-item-actions">
                                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditIndId(ind.id); setEditIndName(ind.name); }}><Pencil size={12} /></button>
                                    <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} title="Delete" onClick={() => deleteIndustry(ind.id)}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    /* ── Rejection Reasons ── */
    const renderRejection = () => (
        <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Rejection Reason Taxonomy</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
                    <Plus size={14} /> Add Category
                </button>
            </div>

            {showAdd && (
                <div style={{ display:'flex', gap:8, marginBottom:12, padding:12, background:'var(--bg-tertiary)', borderRadius:8 }}>
                    <input className="form-input" placeholder="Category name" value={addName} onChange={e => setAddName(e.target.value)} style={{ flex:1 }} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={async () => { if (!addName.trim()) return; await addRejectionCategory(addName); resetAdd(); }}><Check size={13} /> Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={resetAdd}><X size={13} /></button>
                </div>
            )}

            {rejectionReasonCategories.length === 0 && !showAdd && (
                <p style={{ color:'var(--text-tertiary)', fontSize:13 }}>No rejection categories yet.</p>
            )}

            {rejectionReasonCategories.map(cat => (
                <div key={cat.id} style={{ marginBottom:20 }}>
                    {/* Category header */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>{cat.name}</span>
                        <div style={{ display:'flex', gap:6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setAddSubCatId(cat.id); setAddSubName(''); }}>
                                <Plus size={12} /> Sub-reason
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} title="Delete category" onClick={() => deleteRejectionCategory(cat.id)}>
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Inline add sub-reason */}
                    {addSubCatId === cat.id && (
                        <div style={{ display:'flex', gap:8, marginBottom:8, marginLeft:20, padding:10, background:'var(--bg-tertiary)', borderRadius:8 }}>
                            <input className="form-input" placeholder="Sub-reason name" value={addSubName} onChange={e => setAddSubName(e.target.value)} style={{ flex:1, fontSize:13 }} autoFocus />
                            <button className="btn btn-primary btn-sm" onClick={async () => { if (!addSubName.trim()) return; await addSubReason(cat.id, addSubName); setAddSubCatId(null); setAddSubName(''); }}><Check size={13} /> Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setAddSubCatId(null)}><X size={13} /></button>
                        </div>
                    )}

                    {/* Sub-reasons list */}
                    <div className="config-list">
                        {cat.subReasons.length === 0 && addSubCatId !== cat.id && (
                            <div style={{ fontSize:12, color:'var(--text-tertiary)', padding:'6px 20px' }}>No sub-reasons yet.</div>
                        )}
                        {cat.subReasons.map(sub => (
                            <div key={sub.id} className="config-item" style={{ marginLeft:20 }}>
                                {editSubId === sub.id ? (
                                    <div style={{ display:'flex', gap:8, flex:1, alignItems:'center' }}>
                                        <input className="form-input" value={editSubName} onChange={e => setEditSubName(e.target.value)} style={{ flex:1, fontSize:13 }} autoFocus />
                                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--success)' }} onClick={async () => { await updateSubReason(sub.id, editSubName); setEditSubId(null); }}><Check size={13} /></button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditSubId(null)}><X size={13} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span style={{ fontSize:13 }}>{sub.name}</span>
                                        <div className="config-item-actions">
                                            <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditSubId(sub.id); setEditSubName(sub.name); }}><Pencil size={12} /></button>
                                            <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} title="Delete" onClick={() => deleteSubReason(sub.id)}><Trash2 size={12} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );

    /* ── Deal Sources ── */
    const renderSources = () => (
        <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Deal Source Names</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
                    <Plus size={14} /> Add Source
                </button>
            </div>

            {showAdd && (
                <div style={{ display:'flex', gap:8, marginBottom:12, padding:12, background:'var(--bg-tertiary)', borderRadius:8 }}>
                    <input className="form-input" placeholder="Source name" value={addName} onChange={e => setAddName(e.target.value)} style={{ flex:1 }} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={async () => { if (!addName.trim()) return; await addDealSourceName(addName); resetAdd(); }}><Check size={13} /> Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={resetAdd}><X size={13} /></button>
                </div>
            )}

            {dealSourceNames.length === 0 && !showAdd && (
                <p style={{ color:'var(--text-tertiary)', fontSize:13 }}>No deal sources yet.</p>
            )}

            <div className="config-list">
                {dealSourceNames.map(ds => (
                    <div key={ds.id} className="config-item">
                        {editSrcId === ds.id ? (
                            <div style={{ display:'flex', gap:8, flex:1, alignItems:'center' }}>
                                <input className="form-input" value={editSrcName} onChange={e => setEditSrcName(e.target.value)} style={{ flex:1, fontSize:13 }} autoFocus />
                                <button className="btn btn-ghost btn-sm" style={{ color:'var(--success)' }} onClick={async () => { await updateDealSourceName(ds.id, editSrcName); setEditSrcId(null); }}><Check size={13} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditSrcId(null)}><X size={13} /></button>
                            </div>
                        ) : (
                            <>
                                <span style={{ fontWeight:500 }}>{ds.name}</span>
                                <div className="config-item-actions">
                                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditSrcId(ds.id); setEditSrcName(ds.name); }}><Pencil size={12} /></button>
                                    <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} title="Delete" onClick={() => deleteDealSourceName(ds.id)}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    /* ── Team Members ── */
    const renderTeam = () => (
        <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>Team Members ({users.length})</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>
                    <Plus size={14} /> Add Member
                </button>
            </div>

            {showAdd && (
                <div style={{ display:'flex', gap:8, marginBottom:12, padding:12, background:'var(--bg-tertiary)', borderRadius:8, alignItems:'center', flexWrap:'wrap' }}>
                    <input
                        className="form-input"
                        placeholder="Email address"
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        style={{ flex:2, minWidth:200 }}
                        autoFocus
                    />
                    <select
                        className="form-input"
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as 'analyst'|'partner'|'admin')}
                        style={{ flex:1, minWidth:120 }}
                    >
                        <option value="analyst">Analyst</option>
                        <option value="partner">Partner</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={inviteStatus === 'sending'}
                        onClick={async () => {
                            if (!inviteEmail.trim()) return;
                            setInviteStatus('sending'); setInviteMsg('');
                            try {
                                await inviteUser(inviteEmail, inviteRole);
                                setInviteStatus('success'); setInviteMsg('Invitation sent!');
                                setInviteEmail('');
                                setTimeout(() => { setInviteStatus('idle'); setShowAdd(false); }, 2000);
                            } catch {
                                setInviteStatus('error'); setInviteMsg('Failed to send invite.');
                            }
                        }}
                    >
                        {inviteStatus === 'sending' ? 'Sending…' : <><Plus size={13} /> Send Invite</>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setInviteStatus('idle'); setInviteEmail(''); }}><X size={13} /></button>
                    {inviteStatus !== 'idle' && (
                        <span style={{ fontSize:12, color: inviteStatus === 'success' ? 'var(--success)' : 'var(--danger)', width:'100%' }}>
                            {inviteMsg}
                        </span>
                    )}
                </div>
            )}

            {users.length === 0 && !showAdd && (
                <p style={{ color:'var(--text-tertiary)', fontSize:13 }}>No team members found.</p>
            )}

            <div className="config-list" style={{ marginTop:8 }}>
                {users.map(u => {
                    const bg = avatarColor(u.email || u.id);
                    const ini = initials(u.name, u.email);
                    return (
                        <div key={u.id} className="config-item">
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                                <div style={{
                                    width:34, height:34, borderRadius:'50%',
                                    background: bg,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    fontSize:12, fontWeight:700, color:'#fff', flexShrink:0,
                                }}>
                                    {ini}
                                </div>
                                <div>
                                    <div style={{ fontWeight:600, fontSize:13 }}>{u.name || u.email}</div>
                                    <div style={{ fontSize:11, color:'var(--text-tertiary)' }}>{u.email}</div>
                                </div>
                            </div>
                            <span className={`badge ${
                                u.role === 'admin'   ? 'badge-danger'  :
                                u.role === 'partner' ? 'badge-warning' : 'badge-info'
                            }`}>
                                {u.role}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // ────────────────────────────────────────────────────────
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <TopHeader title="Settings" subtitle="Configure system options" />
                <div className="page-content page-enter">
                    <div className="settings-grid">

                        {/* Left nav */}
                        <div className="settings-nav">
                            {SECTIONS.map(sec => {
                                const Icon = sec.icon;
                                return (
                                    <div
                                        key={sec.id}
                                        className={`settings-nav-item ${active === sec.id ? 'active' : ''}`}
                                        onClick={() => switchSection(sec.id)}
                                    >
                                        <Icon size={16} /> {sec.label}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Content */}
                        <div className="settings-content">
                            {active === 'stages'    && renderStages()}
                            {active === 'industries' && renderIndustries()}
                            {active === 'rejection'  && renderRejection()}
                            {active === 'sources'    && renderSources()}
                            {active === 'team'       && renderTeam()}
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
