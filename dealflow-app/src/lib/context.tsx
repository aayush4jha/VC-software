
'use client';
// Single-tenant organization UUID
const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
    User, Company, PipelineStage, Industry, DealSourceName,
    RejectionReasonCategory, RejectionSubReason, Notification,
    Comment, ActivityLog, UserRole,
} from '@/types/database';

// ──────────────────────────────────────────────────
// DB → TypeScript Mappers
// ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapUser(r: any): User {
    if (!r) return r;
    return {
        id: r.id,
        name: r.name ?? '',
        email: r.email ?? '',
        role: (r.role ?? 'analyst') as UserRole,
        avatar: r.avatar_url ?? r.avatar ?? '',
        organizationId: r.organization_id ?? null,
    };
}

function mapCompany(r: any): Company {
    if (!r) return r;
    return {
        id: r.id,
        companyName: r.company_name ?? '',
        founderName: r.founder_name ?? '',
        founderEmail: r.founder_email ?? '',
        analystId: r.analyst_id ?? null,
        companyRound: r.company_round ?? 'Seed',
        pipelineStageId: r.pipeline_stage_id ?? '',
        priorityLevel: r.priority_level ?? 'Medium',
        dealSourceType: r.deal_source_type ?? 'Founder Network',
        dealSourceNameId: r.deal_source_name_id ?? '',
        industryId: r.industry_id ?? '',
        subIndustry: r.sub_industry ?? '',
        shareType: r.share_type ?? 'Primary',
        totalFundRaise: r.total_fund_raise ?? null,
        valuation: r.valuation ?? null,
        googleDriveLink: r.google_drive_link ?? '',
        customTags: r.custom_tags ?? [],
        linkedPreviousEntryId: r.linked_previous_entry_id ?? null,
        terminalStatus: r.terminal_status ?? null,
        createdAt: r.created_at ?? '',
        updatedAt: r.updated_at ?? '',
        slaDeadline: r.sla_deadline ?? null,
        isOverdue: r.is_overdue ?? false,
        quickSummary: r.quick_summary ?? null,
        deckAnalysis: r.deck_analysis ?? null,
        kpiData: r.kpi_data ?? null,
        callTranscript: r.call_transcript ?? null,
        filterBrief: r.filter_brief ?? null,
        icMemo: r.ic_memo ?? null,
    };
}

function mapStage(r: any): PipelineStage {
    return { id: r.id, name: r.name, order: r.order, color: r.color ?? '#3b82f6', description: r.description ?? '' };
}

function mapComment(r: any): Comment {
    return { id: r.id, companyId: r.company_id, authorId: r.author_id, text: r.text, createdAt: r.created_at };
}

function mapActivity(r: any): ActivityLog {
    return {
        id: r.id, companyId: r.company_id, userId: r.user_id,
        action: r.action, details: r.details ?? '',
        fromStageId: r.from_stage_id, toStageId: r.to_stage_id,
        createdAt: r.created_at,
    };
}

function mapNotification(r: any): Notification {
    return {
        id: r.id, userId: r.user_id, type: r.type, title: r.title,
        message: r.message, companyId: r.company_id ?? '',
        read: r.read ?? false, createdAt: r.created_at,
    };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ──────────────────────────────────────────────────
// Utility functions (exported for direct import where needed)
// ──────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount.toLocaleString('en-IN')}`;
}

export function getDaysInPipeline(createdAt: string): number {
    const start = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// ──────────────────────────────────────────────────
// Context Type
// ──────────────────────────────────────────────────

interface AppContextType {
    // Auth
    user: User | null;
    isLoading: boolean;
    signOut: () => Promise<void>;

    // Data
    users: User[];
    companies: Company[];
    pipelineStages: PipelineStage[];
    industries: Industry[];
    dealSourceNames: DealSourceName[];
    rejectionReasonCategories: RejectionReasonCategory[];
    notifications: Notification[];

    // Lookups
    getUserById: (id: string) => User | undefined;
    getIndustryById: (id: string) => Industry | undefined;
    getStageById: (id: string) => PipelineStage | undefined;
    getDealSourceNameById: (id: string) => DealSourceName | undefined;
    getCompaniesByStage: (stageId: string) => Company[];
    getUnassignedCompanies: () => Company[];
    getUnreadNotifications: () => Notification[];
    formatCurrency: (amount: number) => string;
    getDaysInPipeline: (createdAt: string) => number;

    // Async data
    fetchComments: (companyId: string) => Promise<Comment[]>;
    fetchActivity: (companyId: string) => Promise<ActivityLog[]>;

    // Mutations
    createCompany: (data: Record<string, unknown>) => Promise<Company | null>;
    updateCompany: (id: string, data: Record<string, unknown>) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;
    moveCompanyStage: (companyId: string, targetStageId: string) => Promise<void>;
    assignAnalyst: (companyId: string, analystId: string | null) => Promise<void>;
    addComment: (companyId: string, text: string) => Promise<Comment | null>;
    rejectCompany: (companyId: string, reasons: { categoryId: string; subReasonIds: string[] }[], commMethod: string, emailDraft?: string, recipientEmail?: string) => Promise<void>;
    markNotificationsRead: () => Promise<void>;

    // Settings CRUD
    addPipelineStage: (name: string, color: string, description: string) => Promise<void>;
    updatePipelineStage: (id: string, data: { name?: string; color?: string; description?: string }) => Promise<void>;
    deletePipelineStage: (id: string) => Promise<void>;
    addIndustry: (name: string) => Promise<void>;
    updateIndustry: (id: string, name: string) => Promise<void>;
    deleteIndustry: (id: string) => Promise<void>;
    addDealSourceName: (name: string) => Promise<void>;
    updateDealSourceName: (id: string, name: string) => Promise<void>;
    deleteDealSourceName: (id: string) => Promise<void>;
    addRejectionCategory: (name: string) => Promise<void>;
    deleteRejectionCategory: (id: string) => Promise<void>;
    addSubReason: (categoryId: string, name: string) => Promise<void>;
    updateSubReason: (id: string, name: string) => Promise<void>;
    deleteSubReason: (id: string) => Promise<void>;
    inviteUser: (email: string, role: UserRole) => Promise<void>;

    // Refresh
    refreshData: () => Promise<void>;

    // UI state
    selectedCompany: Company | null;
    setSelectedCompany: (company: Company | null) => void;
    editingCompany: Company | null;
    setEditingCompany: (company: Company | null) => void;
    showNotifications: boolean;
    setShowNotifications: (show: boolean) => void;
    showRejectionFlow: boolean;
    setShowRejectionFlow: (show: boolean) => void;
    showEmailCompose: boolean;
    setShowEmailCompose: (show: boolean) => void;
    showCalendarInvite: boolean;
    setShowCalendarInvite: (show: boolean) => void;
    showCompanyForm: boolean;
    setShowCompanyForm: (show: boolean) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    viewMode: 'kanban' | 'table';
    setViewMode: (mode: 'kanban' | 'table') => void;
    activeFilters: Record<string, string[]>;
    setActiveFilters: (filters: Record<string, string[]>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ──────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createClient(), []);

    // Auth state
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Data state
    const [users, setUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
    const [industries, setIndustries] = useState<Industry[]>([]);
    const [dealSourceNames, setDealSourceNames] = useState<DealSourceName[]>([]);
    const [rejectionReasonCategories, setRejectionReasonCategories] = useState<RejectionReasonCategory[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);

    // UI state
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showRejectionFlow, setShowRejectionFlow] = useState(false);
    const [showEmailCompose, setShowEmailCompose] = useState(false);
    const [showCalendarInvite, setShowCalendarInvite] = useState(false);
    const [showCompanyForm, setShowCompanyForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

    // ─── Fetch All Org Data ─────────────────────────
    const fetchAllData = useCallback(async (userId: string) => {
        const [
            { data: companiesData },
            { data: stagesData },
            { data: industriesData },
            { data: sourcesData },
            { data: categoriesData },
            { data: subReasonsData },
            { data: notifsData },
            { data: profilesData },
        ] = await Promise.all([
            supabase.from('companies').select('*').order('created_at', { ascending: false }),
            supabase.from('pipeline_stages').select('*').order('order'),
            supabase.from('industries').select('*').order('name'),
            supabase.from('deal_source_names').select('*').order('name'),
            supabase.from('rejection_reason_categories').select('*').order('name'),
            supabase.from('rejection_sub_reasons').select('*'),
            supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
            supabase.from('profiles').select('*'),
        ]);

        setCompanies((companiesData || []).map(mapCompany));
        setPipelineStages((stagesData || []).map(mapStage));
        setIndustries((industriesData || []).map((r: any) => ({ id: r.id, name: r.name })));
        setDealSourceNames((sourcesData || []).map((r: any) => ({ id: r.id, name: r.name })));
        setNotifications((notifsData || []).map(mapNotification));
        setUsers((profilesData || []).map(mapUser));

        // Build rejection categories with sub-reasons
        const cats: RejectionReasonCategory[] = (categoriesData || []).map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            subReasons: (subReasonsData || [])
                .filter((sr: any) => sr.category_id === cat.id)
                .map((sr: any): RejectionSubReason => ({
                    id: sr.id,
                    name: sr.name,
                    categoryId: sr.category_id,
                })),
        }));
        setRejectionReasonCategories(cats);
    }, [supabase]);

    // ─── Auth Init ──────────────────────────────────
    useEffect(() => {
        let mounted = true;

        // Fetch profile via server API with the access token.
        // Accepts a token directly (e.g. from onAuthStateChange) to avoid a
        // second getSession() call that can race against the session being saved.
        const fetchProfile = async (accessToken?: string): Promise<ReturnType<typeof mapUser> | null> => {
            try {
                let token = accessToken;
                if (!token) {
                    const { data: { session } } = await supabase.auth.getSession();
                    token = session?.access_token;
                }
                if (!token) return null;
                const res = await fetch('/api/me', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return null;
                const { profile } = await res.json();
                return profile ? mapUser(profile) : null;
            } catch {
                return null;
            }
        };

        const init = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) {
                    if (mounted) setIsLoading(false);
                    return;
                }

                // fetchProfile uses the same session access token
                const profile = await fetchProfile();
                if (mounted && profile) {
                    setUser(profile);
                    fetchAllData(session.user.id); // fire and forget — finally runs immediately
                } else if (mounted && !profile) {
                    // Profile not found — set isLoading false so UI doesn't hang
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Auth init error:', err);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_OUT') {
                    if (mounted) {
                        setUser(null);
                        setCompanies([]);
                        setPipelineStages([]);
                        setIndustries([]);
                        setDealSourceNames([]);
                        setRejectionReasonCategories([]);
                        setNotifications([]);
                        setUsers([]);
                    }
                } else if (event === 'SIGNED_IN' && session?.user) {
                    // Profile is created/updated server-side in the auth callback.
                    // Pass the token directly so we don't race against getSession().
                    const profile = await fetchProfile(session.access_token);
                    if (mounted && profile) {
                        setUser(profile);
                        fetchAllData(session.user.id); // fire and forget
                    }
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [supabase, fetchAllData]);

    // ─── Realtime Subscriptions ─────────────────────
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('realtime-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setCompanies(prev => [mapCompany(payload.new), ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    const updated = mapCompany(payload.new);
                    setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
                    setSelectedCompany(prev => prev?.id === updated.id ? updated : prev);
                } else if (payload.eventType === 'DELETE') {
                    setCompanies(prev => prev.filter(c => c.id !== (payload.old as any).id));
                    setSelectedCompany(prev => prev?.id === (payload.old as any).id ? null : prev);
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
                if ((payload.new as any).user_id === user.id) {
                    setNotifications(prev => [mapNotification(payload.new), ...prev]);
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_stages' }, () => {
                supabase.from('pipeline_stages').select('*').order('order').then(({ data }) => {
                    if (data) setPipelineStages(data.map(mapStage));
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, supabase]);

    // ─── Lookups ────────────────────────────────────
    const getUserById = useCallback((id: string) => users.find(u => u.id === id), [users]);
    const getIndustryById = useCallback((id: string) => industries.find(i => i.id === id), [industries]);
    const getStageById = useCallback((id: string) => pipelineStages.find(s => s.id === id), [pipelineStages]);
    const getDealSourceNameById = useCallback((id: string) => dealSourceNames.find(d => d.id === id), [dealSourceNames]);
    const getCompaniesByStage = useCallback((stageId: string) => companies.filter(c => c.pipelineStageId === stageId && !c.terminalStatus), [companies]);
    const getUnassignedCompanies = useCallback(() => companies.filter(c => c.analystId === null && !c.terminalStatus), [companies]);
    const getUnreadNotifications = useCallback(() => notifications.filter(n => !n.read), [notifications]);

    // ─── Async data fetchers ────────────────────────
    const fetchComments = useCallback(async (companyId: string): Promise<Comment[]> => {
        const { data } = await supabase
            .from('comments').select('*')
            .eq('company_id', companyId)
            .order('created_at');
        return (data || []).map(mapComment);
    }, [supabase]);

    const fetchActivity = useCallback(async (companyId: string): Promise<ActivityLog[]> => {
        const { data } = await supabase
            .from('activity_logs').select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });
        return (data || []).map(mapActivity);
    }, [supabase]);

    // ─── Sign Out ───────────────────────────────────
    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    }, [supabase]);

    // ─── Refresh ────────────────────────────────────
    const refreshData = useCallback(async () => {
        if (user) await fetchAllData(user.id);
    }, [user, fetchAllData]);

    // ──────────────────────────────────────────────────
    // MUTATIONS
    // ──────────────────────────────────────────────────

    const createCompany = useCallback(async (data: Record<string, unknown>): Promise<Company | null> => {
        const { data: row, error } = await supabase.from('companies').insert({
            organization_id: ORGANIZATION_ID,
            company_name: data.companyName,
            founder_name: data.founderName,
            founder_email: data.founderEmail || '',
            analyst_id: data.analystId || null,
            company_round: data.companyRound || 'Seed',
            pipeline_stage_id: data.pipelineStageId,
            priority_level: data.priorityLevel || 'Medium',
            deal_source_type: data.dealSourceType || 'Founder Network',
            deal_source_name_id: data.dealSourceNameId || null,
            industry_id: data.industryId || null,
            sub_industry: data.subIndustry || '',
            share_type: data.shareType || 'Primary',
            total_fund_raise: data.totalFundRaise || null,
            valuation: data.valuation || null,
            google_drive_link: data.googleDriveLink || '',
            custom_tags: data.customTags || [],
            sla_deadline: data.slaDeadline || null,
        }).select().single();

        if (error) { console.error('Create company error:', error); return null; }
        const company = mapCompany(row);

        if (user) await supabase.from('activity_logs').insert({
            company_id: company.id, user_id: user.id,
            action: 'created', details: `Added ${company.companyName} to pipeline`,
        });

        return company;
    }, [supabase, user]);

    const updateCompany = useCallback(async (id: string, data: Record<string, unknown>) => {
        const dbData: Record<string, unknown> = {};
        const fieldMap: Record<string, string> = {
            companyName: 'company_name', founderName: 'founder_name', founderEmail: 'founder_email',
            analystId: 'analyst_id', companyRound: 'company_round', pipelineStageId: 'pipeline_stage_id',
            priorityLevel: 'priority_level', dealSourceType: 'deal_source_type',
            dealSourceNameId: 'deal_source_name_id', industryId: 'industry_id',
            subIndustry: 'sub_industry', shareType: 'share_type', totalFundRaise: 'total_fund_raise',
            valuation: 'valuation', googleDriveLink: 'google_drive_link', customTags: 'custom_tags',
            terminalStatus: 'terminal_status', slaDeadline: 'sla_deadline', isOverdue: 'is_overdue',
            quickSummary: 'quick_summary', deckAnalysis: 'deck_analysis', kpiData: 'kpi_data',
            callTranscript: 'call_transcript', filterBrief: 'filter_brief', icMemo: 'ic_memo',
        };
        for (const [key, val] of Object.entries(data)) {
            const dbKey = fieldMap[key] || key;
            dbData[dbKey] = val;
        }
        const { error } = await supabase.from('companies').update(dbData).eq('id', id);
        if (error) console.error('Update company error:', error);
    }, [supabase]);

    const deleteCompany = useCallback(async (id: string) => {
        const { error } = await supabase.from('companies').delete().eq('id', id);
        if (error) console.error('Delete company error:', error);
    }, [supabase]);

    const moveCompanyStage = useCallback(async (companyId: string, targetStageId: string) => {
        if (!user) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const fromStageId = company.pipelineStageId;
        const toStage = pipelineStages.find(s => s.id === targetStageId);

        await supabase.from('companies').update({ pipeline_stage_id: targetStageId }).eq('id', companyId);
        await supabase.from('activity_logs').insert({
            company_id: companyId, user_id: user.id,
            action: 'stage_change', details: `Moved to ${toStage?.name || 'unknown'}`,
            from_stage_id: fromStageId, to_stage_id: targetStageId,
        });
    }, [supabase, user, companies, pipelineStages]);

    const assignAnalyst = useCallback(async (companyId: string, analystId: string | null) => {
        if (!user) return;
        await supabase.from('companies').update({ analyst_id: analystId }).eq('id', companyId);
        const analyst = users.find(u => u.id === analystId);
        await supabase.from('activity_logs').insert({
            company_id: companyId, user_id: user.id,
            action: 'assigned',
            details: analystId ? `Assigned to ${analyst?.name || 'analyst'}` : 'Unassigned',
        });
        if (analystId) {
            const company = companies.find(c => c.id === companyId);
            await supabase.from('notifications').insert({
                user_id: analystId, type: 'assignment',
                title: 'New Assignment',
                message: `${company?.companyName || 'A company'} has been assigned to you`,
                company_id: companyId,
            });
        }
    }, [supabase, user, users, companies]);

    const addComment = useCallback(async (companyId: string, text: string): Promise<Comment | null> => {
        if (!user) return null;
        const { data, error } = await supabase.from('comments').insert({
            company_id: companyId, author_id: user.id, text,
        }).select().single();
        if (error) { console.error('Add comment error:', error); return null; }
        return mapComment(data);
    }, [supabase, user]);

    const rejectCompany = useCallback(async (
        companyId: string,
        reasons: { categoryId: string; subReasonIds: string[] }[],
        commMethod: string, emailDraft?: string, recipientEmail?: string,
    ) => {
        if (!user) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;

        await supabase.from('companies').update({ terminal_status: 'Rejected' }).eq('id', companyId);
        await supabase.from('rejection_records').insert({
            company_id: companyId, reasons,
            rejection_stage_id: company.pipelineStageId,
            communication_method: commMethod,
            rejection_email_recipient: recipientEmail || '',
            rejection_email_draft: emailDraft || '',
            rejection_email_sent: commMethod === 'Email' && !!emailDraft,
        });
        await supabase.from('activity_logs').insert({
            company_id: companyId, user_id: user.id,
            action: 'rejected',
            details: `Rejected at ${pipelineStages.find(s => s.id === company.pipelineStageId)?.name || 'current stage'}`,
        });
    }, [supabase, user, companies, pipelineStages]);

    const markNotificationsRead = useCallback(async () => {
        if (!user) return;
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;
        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, [supabase, user, notifications]);

    // ─── Settings CRUD ──────────────────────────────

    const addPipelineStage = useCallback(async (name: string, color: string, description: string) => {
        const maxOrder = pipelineStages.reduce((max, s) => Math.max(max, s.order), 0);
        const { data, error } = await supabase.from('pipeline_stages').insert({
            organization_id: ORGANIZATION_ID, name, color, description, order: maxOrder + 1,
        }).select().single();
        if (!error && data) setPipelineStages(prev => [...prev, mapStage(data)]);
    }, [supabase, user, pipelineStages]);

    const updatePipelineStage = useCallback(async (id: string, data: { name?: string; color?: string; description?: string }) => {
        const { error } = await supabase.from('pipeline_stages').update(data).eq('id', id);
        if (!error) setPipelineStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }, [supabase]);

    const deletePipelineStage = useCallback(async (id: string) => {
        const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
        if (!error) setPipelineStages(prev => prev.filter(s => s.id !== id));
    }, [supabase]);

    const addIndustry = useCallback(async (name: string) => {
        const { data, error } = await supabase.from('industries').insert({
            organization_id: ORGANIZATION_ID, name,
        }).select().single();
        if (!error && data) setIndustries(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
    }, [supabase, user]);

    const updateIndustry = useCallback(async (id: string, name: string) => {
        const { error } = await supabase.from('industries').update({ name }).eq('id', id);
        if (!error) setIndustries(prev => prev.map(i => i.id === id ? { ...i, name } : i));
    }, [supabase]);

    const deleteIndustry = useCallback(async (id: string) => {
        const { error } = await supabase.from('industries').delete().eq('id', id);
        if (!error) setIndustries(prev => prev.filter(i => i.id !== id));
    }, [supabase]);

    const addDealSourceName = useCallback(async (name: string) => {
        const { data, error } = await supabase.from('deal_source_names').insert({
            organization_id: ORGANIZATION_ID, name,
        }).select().single();
        if (!error && data) setDealSourceNames(prev => [...prev, { id: data.id, name: data.name }]);
    }, [supabase, user]);

    const updateDealSourceName = useCallback(async (id: string, name: string) => {
        const { error } = await supabase.from('deal_source_names').update({ name }).eq('id', id);
        if (!error) setDealSourceNames(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    }, [supabase]);

    const deleteDealSourceName = useCallback(async (id: string) => {
        const { error } = await supabase.from('deal_source_names').delete().eq('id', id);
        if (!error) setDealSourceNames(prev => prev.filter(d => d.id !== id));
    }, [supabase]);

    const addRejectionCategory = useCallback(async (name: string) => {
        const { data, error } = await supabase.from('rejection_reason_categories').insert({
            organization_id: ORGANIZATION_ID, name,
        }).select().single();
        if (!error && data) setRejectionReasonCategories(prev => [...prev, { id: data.id, name: data.name, subReasons: [] }]);
    }, [supabase, user]);

    const deleteRejectionCategory = useCallback(async (id: string) => {
        // Sub-reasons are deleted first (or rely on DB cascade)
        await supabase.from('rejection_sub_reasons').delete().eq('category_id', id);
        const { error } = await supabase.from('rejection_reason_categories').delete().eq('id', id);
        if (!error) setRejectionReasonCategories(prev => prev.filter(cat => cat.id !== id));
    }, [supabase]);

    const addSubReason = useCallback(async (categoryId: string, name: string) => {
        const { data, error } = await supabase.from('rejection_sub_reasons').insert({
            category_id: categoryId, name,
        }).select().single();
        if (!error && data) {
            const sr: RejectionSubReason = { id: data.id, name: data.name, categoryId: data.category_id };
            setRejectionReasonCategories(prev =>
                prev.map(cat => cat.id === categoryId ? { ...cat, subReasons: [...cat.subReasons, sr] } : cat)
            );
        }
    }, [supabase]);

    const updateSubReason = useCallback(async (id: string, name: string) => {
        const { error } = await supabase.from('rejection_sub_reasons').update({ name }).eq('id', id);
        if (!error) {
            setRejectionReasonCategories(prev =>
                prev.map(cat => ({ ...cat, subReasons: cat.subReasons.map(sr => sr.id === id ? { ...sr, name } : sr) }))
            );
        }
    }, [supabase]);

    const deleteSubReason = useCallback(async (id: string) => {
        const { error } = await supabase.from('rejection_sub_reasons').delete().eq('id', id);
        if (!error) {
            setRejectionReasonCategories(prev =>
                prev.map(cat => ({ ...cat, subReasons: cat.subReasons.filter(sr => sr.id !== id) }))
            );
        }
    }, [supabase]);

    // Invite user: calls API route to send invite and upsert profile
    const inviteUser = useCallback(async (email: string, role: UserRole) => {
        console.log('✅ Invite API HIT');
        // if (!user?.organizationId) {
        //     console.warn('inviteUser: No organizationId in user context', user);
        //     throw new Error('Failed to send invite');
        // }
        // console.log('inviteUser: Sending invite', { email, role, organizationId: user.organizationId });
        const res = await fetch('/api/invite-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role, organizationId: ORGANIZATION_ID }),
        });
        let data;
        try {
            data = await res.json();
        } catch (err) {
            console.error('inviteUser: Failed to parse API response', err);
            throw new Error('Failed to send invite: Invalid server response');
        }
        if (!res.ok) {
            console.error('inviteUser: API error', data, 'Status:', res.status);
            if (data && data.error) {
                throw new Error(data.error);
            } else {
                throw new Error(`Failed to send invite (status ${res.status})`);
            }
        }
        await refreshData();
    }, [user, refreshData]);

    // ─── Context Value ──────────────────────────────
    const value = useMemo<AppContextType>(() => ({
        user, isLoading, signOut,
        users, companies, pipelineStages, industries, dealSourceNames, rejectionReasonCategories, notifications,
        getUserById, getIndustryById, getStageById, getDealSourceNameById,
        getCompaniesByStage, getUnassignedCompanies, getUnreadNotifications,
        formatCurrency, getDaysInPipeline,
        fetchComments, fetchActivity,
        createCompany, updateCompany, deleteCompany, moveCompanyStage, assignAnalyst,
        addComment, rejectCompany, markNotificationsRead,
        addPipelineStage, updatePipelineStage, deletePipelineStage,
        addIndustry, updateIndustry, deleteIndustry,
        addDealSourceName, updateDealSourceName, deleteDealSourceName,
        addRejectionCategory, deleteRejectionCategory, addSubReason, updateSubReason, deleteSubReason,
        inviteUser, refreshData,
        selectedCompany, setSelectedCompany,
        editingCompany, setEditingCompany,
        showNotifications, setShowNotifications,
        showRejectionFlow, setShowRejectionFlow,
        showEmailCompose, setShowEmailCompose,
        showCalendarInvite, setShowCalendarInvite,
        showCompanyForm, setShowCompanyForm,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        activeFilters, setActiveFilters,
    }), [
        user, isLoading, signOut,
        users, companies, pipelineStages, industries, dealSourceNames, rejectionReasonCategories, notifications,
        getUserById, getIndustryById, getStageById, getDealSourceNameById,
        getCompaniesByStage, getUnassignedCompanies, getUnreadNotifications,
        fetchComments, fetchActivity,
        createCompany, updateCompany, deleteCompany, moveCompanyStage, assignAnalyst,
        addComment, rejectCompany, markNotificationsRead,
        addPipelineStage, updatePipelineStage, deletePipelineStage,
        addIndustry, updateIndustry, deleteIndustry,
        addDealSourceName, updateDealSourceName, deleteDealSourceName,
        addRejectionCategory, deleteRejectionCategory, addSubReason, updateSubReason, deleteSubReason,
        inviteUser, refreshData,
        selectedCompany, editingCompany,
        showNotifications, showRejectionFlow, showEmailCompose, showCalendarInvite, showCompanyForm,
        searchQuery, viewMode, activeFilters,
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}
