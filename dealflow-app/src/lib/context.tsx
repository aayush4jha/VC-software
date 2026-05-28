
'use client';
// Single-tenant organization UUID
const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
    User, Company, PipelineStage, Industry, DealSourceName,
    RejectionReasonCategory, RejectionSubReason, RejectionRecord, Notification,
    Comment, ActivityLog, UserRole, SavedView, EmailLog, TerminalStatus,
    PagePermission, FollowOnRound, CompanyScore, CompanyFeedback,
} from '@/types/database';

// ──────────────────────────────────────────────────
// DB → TypeScript Mappers
// ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, PagePermission[]> = {
    admin: ['dashboard', 'dealflow', 'portfolio', 'analytics', 'pipeline-analytics', 'audit-trail', 'contacts', 'emails', 'news', 'admin', 'settings'],
    partner: ['dashboard', 'dealflow', 'portfolio', 'analytics', 'pipeline-analytics', 'audit-trail', 'contacts', 'emails', 'news', 'admin'],
    analyst: ['dashboard', 'dealflow', 'contacts', 'emails', 'news'],
};

function mapUser(r: any): User {
    if (!r) return r;
    const role = (r.role ?? 'analyst') as UserRole;
    const rawPermissions = r.permissions as PagePermission[] | null;
    // If no permissions set, fall back to role-based defaults
    const permissions = (rawPermissions && rawPermissions.length > 0)
        ? rawPermissions
        : (DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE['analyst']);
    return {
        id: r.id,
        name: r.name ?? '',
        email: r.email ?? '',
        role,
        avatar: r.avatar_url ?? r.avatar ?? '',
        organizationId: r.organization_id ?? null,
        permissions,
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
        stageDeadlines: r.stage_deadlines ?? {},
        needsReview: r.needs_review ?? false,
        ingestionSource: r.ingestion_source ?? null,
        quickSummary: r.quick_summary ?? null,
        deckAnalysis: r.deck_analysis ?? null,
        kpiData: r.kpi_data ?? null,
        callTranscript: r.call_transcript ?? null,
        filterBrief: r.filter_brief ?? null,
        icMemo: r.ic_memo ?? null,
        deckEmailLink: r.deck_email_link ?? null,
        meetEventTitle: r.meet_event_title ?? null,
        meetEventDate: r.meet_event_date ?? null,
        initialInvestment: r.initial_investment ?? null,
        entryValuation: r.entry_valuation ?? null,
        entryOwnership: r.entry_ownership != null ? Number(r.entry_ownership) : null,
        currentOwnership: r.current_ownership != null ? Number(r.current_ownership) : null,
        latestValuation: r.latest_valuation ?? null,
        portfolioStatus: r.portfolio_status ?? 'Active',
        exitValue: r.exit_value ?? null,
        exitDate: r.exit_date ?? null,
        hqLocation: r.hq_location ?? '',
        notes: r.notes ?? '',
        sharePrice: r.share_price != null ? Number(r.share_price) : null,
        numShares: r.num_shares != null ? Number(r.num_shares) : null,
        totalShares: r.total_shares != null ? Number(r.total_shares) : null,
        entryPreMoneyValuation: r.entry_pre_money_valuation ?? null,
        entryPostMoneyValuation: r.entry_post_money_valuation ?? null,
        entryTotalRaised: r.entry_total_raised ?? null,
        noOfShares: r.no_of_shares != null ? Number(r.no_of_shares) : null,
        portfolioHealth: r.portfolio_health ?? null,
        founders: Array.isArray(r.founders)
            ? r.founders.filter((f: unknown): f is { name?: unknown; email?: unknown } => !!f && typeof f === 'object')
                .map((f: { name?: unknown; email?: unknown }) => ({ name: String(f.name ?? ''), email: String(f.email ?? '') }))
            : [],
    };
}

// Postgres BIGINT columns can't accept decimals — round before sending.
// Money fields are stored as whole rupees. Decimal-friendly columns
// (share_price, ownership_after, ownership_sought, etc.) skip this.
function toBigint(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
}

// Detect Postgrest's "missing column" error so the client can transparently
// drop newly-added fields when the DB migration hasn't run yet — instead of
// failing the whole insert/update.
function isMissingColumnError(error: unknown): boolean {
    if (!error) return false;
    const e = error as { message?: string; code?: string };
    if (e.code === 'PGRST204' || e.code === '42703') return true;
    return /Could not find the .* column|column .* does not exist/i.test(e.message || '');
}
function extractMissingColumns(error: unknown): string[] {
    const msg = (error as { message?: string })?.message || '';
    const cols = new Set<string>();
    const re = /(?:Could not find the |column )['"]?([a-z_][a-z0-9_]*)['"]?(?: column| does not exist)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg))) cols.add(m[1]);
    return [...cols];
}

function mapFollowOn(r: any): FollowOnRound {
    // Prefer the new post_money_valuation column, fall back to legacy round_valuation.
    const postMoney = r.post_money_valuation ?? r.round_valuation ?? null;
    return {
        id: r.id,
        companyId: r.company_id,
        organizationId: r.organization_id,
        roundName: r.round_name ?? '',
        roundDate: r.round_date ?? '',
        totalRaised: r.total_raised ?? null,
        ourInvestment: r.our_investment ?? null,
        didWeInvest: r.did_we_invest ?? false,
        roundValuation: postMoney,
        ownershipAfter: r.ownership_after != null ? Number(r.ownership_after) : null,
        investorNames: r.investor_names ?? '',
        notes: r.notes ?? '',
        sharePrice: r.share_price != null ? Number(r.share_price) : null,
        numShares: r.num_shares != null ? Number(r.num_shares) : null,
        totalShares: r.total_shares != null ? Number(r.total_shares) : null,
        dvTotalShares: r.dv_total_shares != null ? Number(r.dv_total_shares) : null,
        preMoneyValuation: r.pre_money_valuation ?? null,
        postMoneyValuation: postMoney,
        ownershipSought: r.ownership_sought != null ? Number(r.ownership_sought) : null,
        dilutionPercent: r.dilution_percent != null ? Number(r.dilution_percent) : null,
        ourValueTodayOverride: r.our_value_today_override != null ? Number(r.our_value_today_override) : null,
        noOfShares: r.no_of_shares != null ? Number(r.no_of_shares) : null,
        createdAt: r.created_at ?? '',
        updatedAt: r.updated_at ?? '',
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

// Fixed per-stage SLA offsets from the day the deal entered the pipeline.
// Stage keys are matched case-insensitively against pipeline_stages.name.
// Due Diligence is intentionally absent — it has no deadline.
export const STAGE_DEADLINE_DAYS: Record<string, number> = {
    'thesis check': 2,
    'initial screening': 5,
    'intro call': 10,
    'filter discussion': 18,
    'filter ic': 25,
};

export function getStageDeadline(stageName: string | null | undefined, createdAt: string | null | undefined): Date | null {
    if (!stageName || !createdAt) return null;
    const days = STAGE_DEADLINE_DAYS[stageName.trim().toLowerCase()];
    if (days == null) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function isStageOverdue(stageName: string | null | undefined, createdAt: string | null | undefined): boolean {
    const deadline = getStageDeadline(stageName, createdAt);
    if (!deadline) return false;
    return Date.now() > deadline.getTime();
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
    rejectionRecords: RejectionRecord[];
    notifications: Notification[];
    savedViews: SavedView[];

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
    fetchEmailLogs: (companyId: string) => Promise<EmailLog[]>;
    fetchScores: (companyId: string) => Promise<CompanyScore[]>;
    addScore: (companyId: string, scorerType: 'ai' | 'analyst', score: number, scorerId?: string | null) => Promise<CompanyScore | null>;
    deleteScore: (scoreId: string) => Promise<void>;
    fetchFeedback: (companyId: string) => Promise<CompanyFeedback[]>;
    addFeedback: (data: { companyId: string; stageId: string; ratings: Record<string, number>; comment: string; tags: string[] }) => Promise<CompanyFeedback | null>;
    updateFeedbackStatus: (feedbackId: string, status: 'active' | 'addressed' | 'resolved') => Promise<void>;
    deleteFeedback: (feedbackId: string) => Promise<void>;

    // Mutations
    createCompany: (data: Record<string, unknown>) => Promise<Company | null>;
    updateCompany: (id: string, data: Record<string, unknown>) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;
    moveCompanyStage: (companyId: string, targetStageId: string) => Promise<string | null>;
    assignAnalyst: (companyId: string, analystId: string | null) => Promise<void>;
    addComment: (companyId: string, text: string) => Promise<Comment | null>;
    rejectCompany: (companyId: string, reasons: { categoryId: string; subReasonIds: string[] }[], commMethod: string, emailDraft?: string, recipientEmail?: string) => Promise<void>;
    markNotificationsRead: () => Promise<void>;

    // Terminal status mutations
    setTerminalStatus: (companyId: string, status: TerminalStatus, reminderDate?: string) => Promise<void>;
    resolveTerminalStatus: (companyId: string, targetStageId: string) => Promise<void>;

    // AI generation mutations
    generateAISummary: (companyId: string) => Promise<void>;
    generateDeckAnalysis: (companyId: string, uploadedFile?: { data: string; mimeType: string; filename: string } | null) => Promise<void>;
    generateFilterBrief: (companyId: string) => Promise<void>;
    generateICMemo: (companyId: string) => Promise<void>;
    analyzeMeetingRecording: (companyId: string, file: { data: string; mimeType: string; filename: string }) => Promise<void>;
    fetchAndAnalyzeMeetingRecording: (companyId: string) => Promise<void>;

    // Saved views CRUD
    fetchSavedViews: () => Promise<void>;
    saveSavedView: (name: string, filters: Record<string, string[]>) => Promise<void>;
    deleteSavedView: (id: string) => Promise<void>;

    // Settings CRUD
    addPipelineStage: (name: string, color: string, description: string) => Promise<void>;
    updatePipelineStage: (id: string, data: { name?: string; color?: string; description?: string }) => Promise<void>;
    deletePipelineStage: (id: string) => Promise<void>;
    addIndustry: (name: string) => Promise<Industry | null>;
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
    inviteUser: (email: string, role: UserRole, permissions?: PagePermission[]) => Promise<void>;
    updateUserPermissions: (userId: string, permissions: PagePermission[]) => Promise<void>;
    updateUserRole: (userId: string, role: string) => Promise<void>;

    // Follow-on rounds
    fetchFollowOns: (companyId: string) => Promise<FollowOnRound[]>;
    fetchAllFollowOns: () => Promise<FollowOnRound[]>;
    addFollowOn: (data: Record<string, unknown>) => Promise<FollowOnRound | null>;
    updateFollowOn: (id: string, data: Record<string, unknown>) => Promise<void>;
    deleteFollowOn: (id: string) => Promise<void>;

    // Email ingestion
    syncEmails: () => Promise<{ processed: number; skipped: number; created: { companyName: string; companyId: string }[]; errors?: string[] } | null>;
    approveCompany: (companyId: string) => Promise<void>;

    // Deck email links (resolved from Gmail)
    deckEmailLinks: Record<string, string>;

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
    companyFormPortfolioMode: boolean;
    setCompanyFormPortfolioMode: (mode: boolean) => void;
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
    const [rejectionRecords, setRejectionRecords] = useState<RejectionRecord[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [savedViews, setSavedViews] = useState<SavedView[]>([]);
    const [deckEmailLinks, setDeckEmailLinks] = useState<Record<string, string>>({});

    // UI state
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showRejectionFlow, setShowRejectionFlow] = useState(false);
    const [showEmailCompose, setShowEmailCompose] = useState(false);
    const [showCalendarInvite, setShowCalendarInvite] = useState(false);
    const [showCompanyForm, setShowCompanyForm] = useState(false);
    const [companyFormPortfolioMode, setCompanyFormPortfolioMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

    // ─── Helper: get access token ─────────────────
    const getToken = useCallback(async (): Promise<string | null> => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ?? null;
    }, [supabase]);

    // ─── Helper: call /api/db (service-role proxy) ──
    const apiDb = useCallback(async (body: Record<string, unknown>): Promise<{ data: any; error: string | null }> => {
        try {
            const token = await getToken();
            if (!token) return { data: null, error: 'No auth token' };
            const res = await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) return { data: null, error: json.error || `HTTP ${res.status}` };
            return { data: json.data, error: null };
        } catch (err) {
            return { data: null, error: (err as Error).message };
        }
    }, [getToken]);

    // ─── Fetch All Org Data ─────────────────────────
    const fetchAllData = useCallback(async (_userId: string) => {
        try {
            const token = await getToken();
            if (!token) { console.error('[fetchAllData] No auth token'); return; }

            const res = await fetch('/api/data', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { console.error('[fetchAllData] API error:', res.status); return; }
            const json = await res.json();

            setCompanies((json.companies || []).map(mapCompany));
            setPipelineStages((json.stages || []).map(mapStage));
            setIndustries((json.industries || []).map((r: any) => ({ id: r.id, name: r.name })));
            setDealSourceNames((json.sources || []).map((r: any) => ({ id: r.id, name: r.name })));
            setNotifications((json.notifications || []).map(mapNotification));
            setUsers((json.profiles || []).map(mapUser));
            setSavedViews((json.savedViews || []).map((r: any): SavedView => ({
                id: r.id, name: r.name, filters: r.filters ?? {}, createdAt: r.created_at,
            })));

            // Build rejection categories with sub-reasons
            const cats: RejectionReasonCategory[] = (json.categories || []).map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                subReasons: (json.subReasons || [])
                    .filter((sr: any) => sr.category_id === cat.id)
                    .map((sr: any): RejectionSubReason => ({
                        id: sr.id,
                        name: sr.name,
                        categoryId: sr.category_id,
                    })),
            }));
            setRejectionReasonCategories(cats);

            // Rejection records
            setRejectionRecords((json.rejectionRecords || []).map((r: any): RejectionRecord => ({
                id: r.id,
                companyId: r.company_id,
                reasons: r.reasons || [],
                rejectionStageId: r.rejection_stage_id,
                communicationMethod: r.communication_method,
                rejectionEmailRecipient: r.rejection_email_recipient || '',
                rejectionEmailDraft: r.rejection_email_draft || '',
                rejectionEmailSent: r.rejection_email_sent || false,
                createdAt: r.created_at,
            })));
        } catch (err) {
            console.error('[fetchAllData] error:', err);
        }
    }, [getToken]);

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
                        setSavedViews([]);
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
                apiDb({
                    table: 'pipeline_stages', operation: 'select',
                    order: { column: 'order', ascending: true },
                }).then(({ data }) => {
                    if (data) setPipelineStages(data.map(mapStage));
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, supabase, apiDb]);

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
        const { data } = await apiDb({
            table: 'comments', operation: 'select',
            filter: [{ column: 'company_id', op: 'eq', value: companyId }],
            order: { column: 'created_at', ascending: true },
        });
        return (data || []).map(mapComment);
    }, [apiDb]);

    const fetchActivity = useCallback(async (companyId: string): Promise<ActivityLog[]> => {
        const { data } = await apiDb({
            table: 'activity_logs', operation: 'select',
            filter: [{ column: 'company_id', op: 'eq', value: companyId }],
            order: { column: 'created_at', ascending: false },
        });
        return (data || []).map(mapActivity);
    }, [apiDb]);

    const fetchEmailLogs = useCallback(async (companyId: string): Promise<EmailLog[]> => {
        const { data } = await apiDb({
            table: 'email_logs', operation: 'select',
            filter: [{ column: 'company_id', op: 'eq', value: companyId }],
            order: { column: 'created_at', ascending: false },
        });
        return (data || []).map((r: any): EmailLog => ({
            id: r.id,
            companyId: r.company_id ?? null,
            senderId: r.sender_id ?? null,
            recipientEmail: r.recipient_email ?? '',
            subject: r.subject ?? '',
            body: r.body ?? '',
            emailType: r.email_type ?? '',
            createdAt: r.created_at ?? '',
        }));
    }, [apiDb]);

    // ─── Company Scores ─────────────────────────────
    const fetchScores = useCallback(async (companyId: string): Promise<CompanyScore[]> => {
        const { data } = await apiDb({
            table: 'company_scores', operation: 'select',
            filter: [{ column: 'company_id', op: 'eq', value: companyId }],
            order: { column: 'created_at', ascending: false },
        });
        return (data || []).map((r: any): CompanyScore => ({
            id: r.id,
            companyId: r.company_id,
            scorerType: r.scorer_type,
            scorerId: r.scorer_id ?? null,
            score: r.score,
            createdAt: r.created_at ?? '',
        }));
    }, [apiDb]);

    const addScore = useCallback(async (companyId: string, scorerType: 'ai' | 'analyst', score: number, scorerId?: string | null): Promise<CompanyScore | null> => {
        const { data, error } = await apiDb({
            table: 'company_scores', operation: 'insert',
            data: { company_id: companyId, scorer_type: scorerType, scorer_id: scorerId || null, score },
        });
        if (error) { console.error('addScore error:', error); return null; }
        const r = data;
        if (!r) return null;
        return { id: r.id, companyId: r.company_id, scorerType: r.scorer_type, scorerId: r.scorer_id ?? null, score: r.score, createdAt: r.created_at ?? '' };
    }, [apiDb]);

    const deleteScore = useCallback(async (scoreId: string): Promise<void> => {
        const { error } = await apiDb({ table: 'company_scores', operation: 'delete', match: { id: scoreId } });
        if (error) console.error('deleteScore error:', error);
    }, [apiDb]);

    // ─── Company Feedback ───────────────────────────
    const fetchFeedback = useCallback(async (companyId: string): Promise<CompanyFeedback[]> => {
        const { data } = await apiDb({
            table: 'company_feedback', operation: 'select',
            filter: [{ column: 'company_id', op: 'eq', value: companyId }],
            order: { column: 'created_at', ascending: false },
        });
        return (data || []).map((r: any): CompanyFeedback => ({
            id: r.id, companyId: r.company_id, userId: r.user_id, stageId: r.stage_id,
            ratings: r.ratings ?? {}, comment: r.comment ?? '', tags: r.tags ?? [],
            status: r.status ?? 'active', createdAt: r.created_at ?? '',
        }));
    }, [apiDb]);

    const addFeedback = useCallback(async (data: { companyId: string; stageId: string; ratings: Record<string, number>; comment: string; tags: string[] }): Promise<CompanyFeedback | null> => {
        if (!user) return null;
        const { data: row, error } = await apiDb({
            table: 'company_feedback', operation: 'insert',
            data: { company_id: data.companyId, user_id: user.id, stage_id: data.stageId, ratings: data.ratings, comment: data.comment, tags: data.tags },
        });
        if (error || !row) { console.error('addFeedback error:', error); return null; }
        return { id: row.id, companyId: row.company_id, userId: row.user_id, stageId: row.stage_id, ratings: row.ratings ?? {}, comment: row.comment ?? '', tags: row.tags ?? [], status: row.status ?? 'active', createdAt: row.created_at ?? '' };
    }, [apiDb, user]);

    const updateFeedbackStatus = useCallback(async (feedbackId: string, status: 'active' | 'addressed' | 'resolved'): Promise<void> => {
        await apiDb({ table: 'company_feedback', operation: 'update', data: { status }, match: { id: feedbackId } });
    }, [apiDb]);

    const deleteFeedback = useCallback(async (feedbackId: string): Promise<void> => {
        await apiDb({ table: 'company_feedback', operation: 'delete', match: { id: feedbackId } });
    }, [apiDb]);

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
        const insertPayload: Record<string, unknown> = {
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
            linked_previous_entry_id: data.linkedPreviousEntryId || null,
            ...(data.terminalStatus ? { terminal_status: data.terminalStatus } : {}),
            ...(data.initialInvestment != null ? { initial_investment: toBigint(data.initialInvestment) } : {}),
            ...(data.entryValuation != null ? { entry_valuation: toBigint(data.entryValuation) } : {}),
            ...(data.entryOwnership != null ? { entry_ownership: data.entryOwnership } : {}),
            ...(data.currentOwnership != null ? { current_ownership: data.currentOwnership } : {}),
            ...(data.latestValuation != null ? { latest_valuation: toBigint(data.latestValuation) } : {}),
            ...(data.portfolioStatus ? { portfolio_status: data.portfolioStatus } : {}),
            ...(data.exitValue != null ? { exit_value: toBigint(data.exitValue) } : {}),
            ...(data.exitDate ? { exit_date: data.exitDate } : {}),
            ...(data.hqLocation ? { hq_location: data.hqLocation } : {}),
            ...(data.notes ? { notes: data.notes } : {}),
            ...(data.sharePrice != null ? { share_price: data.sharePrice } : {}),
            ...(data.numShares != null ? { num_shares: toBigint(data.numShares) } : {}),
            ...(data.totalShares != null ? { total_shares: toBigint(data.totalShares) } : {}),
            ...(data.entryPreMoneyValuation != null ? { entry_pre_money_valuation: toBigint(data.entryPreMoneyValuation) } : {}),
            ...(data.entryPostMoneyValuation != null ? { entry_post_money_valuation: toBigint(data.entryPostMoneyValuation) } : {}),
            ...(data.entryTotalRaised != null ? { entry_total_raised: toBigint(data.entryTotalRaised) } : {}),
            ...(data.noOfShares != null ? { no_of_shares: data.noOfShares } : {}),
            ...(data.portfolioHealth ? { portfolio_health: data.portfolioHealth } : {}),
            ...(Array.isArray(data.founders) ? { founders: data.founders } : {}),
            // Honor caller-supplied created_at (e.g. backdated portfolio
            // entries). Without this, Postgres applies now() as the default.
            ...(data.createdAt ? { created_at: data.createdAt } : {}),
        };

        // Verifiable trace for the entry-date bug.
        if (data.createdAt) {
            console.log('[createCompany] sending created_at:', data.createdAt);
        }

        let { data: row, error } = await apiDb({
            table: 'companies', operation: 'insert', data: insertPayload,
        });

        if (row && (row as { created_at?: string }).created_at) {
            console.log('[createCompany] db returned created_at:', (row as { created_at?: string }).created_at);
        }

        // Forward-compat: if the DB hasn't been migrated yet, retry without any
        // columns Postgres says are missing instead of failing the whole insert.
        if (error && isMissingColumnError(error)) {
            const missing = extractMissingColumns(error);
            for (const col of missing) delete insertPayload[col];
            console.warn(`Retrying create company without missing column(s): ${missing.join(', ')}`);
            ({ data: row, error } = await apiDb({
                table: 'companies', operation: 'insert', data: insertPayload,
            }));
        }

        if (error) { console.error('Create company error:', error); return null; }
        const company = mapCompany(row);
        setCompanies(prev => [...prev, company]);

        if (user) {
            const isPortfolio = data.terminalStatus === 'Portfolio';
            await apiDb({
                table: 'activity_logs', operation: 'insert',
                data: {
                    company_id: company.id, user_id: user.id,
                    action: isPortfolio ? 'terminal_status_set' : 'created',
                    details: isPortfolio
                        ? `Added ${company.companyName} directly to Portfolio`
                        : `Added ${company.companyName} to pipeline`,
                },
            });

            // Notify all users
            const notifInserts = users
                .filter(u => u.id !== user.id)
                .map(u => ({
                    user_id: u.id, type: isPortfolio ? 'stage_change' as const : 'new_company' as const,
                    title: isPortfolio ? 'Portfolio Company' : 'New Company',
                    message: isPortfolio
                        ? `${company.companyName} has been added to Portfolio`
                        : `${company.companyName} has been added to the pipeline`,
                    company_id: company.id,
                }));
            if (notifInserts.length > 0) {
                await apiDb({ table: 'notifications', operation: 'insert', data: notifInserts });
            }
        }

        return company;
    }, [apiDb, user, users]);

    // Fields worth tracking in audit (skip large JSON blobs)
    const AUDIT_FIELDS = new Set([
        'companyName', 'founderName', 'founderEmail', 'analystId', 'companyRound',
        'priorityLevel', 'dealSourceType', 'dealSourceNameId', 'industryId',
        'subIndustry', 'shareType', 'totalFundRaise', 'valuation', 'googleDriveLink',
        'customTags', 'terminalStatus', 'needsReview', 'pipelineStageId', 'slaDeadline',
        'hqLocation', 'notes', 'portfolioStatus', 'initialInvestment', 'entryValuation',
    ]);

    const updateCompany = useCallback(async (id: string, data: Record<string, unknown>) => {
        // Capture old values for audit
        const oldCompany = companies.find(c => c.id === id);

        const dbData: Record<string, unknown> = {};
        const fieldMap: Record<string, string> = {
            companyName: 'company_name', founderName: 'founder_name', founderEmail: 'founder_email',
            analystId: 'analyst_id', companyRound: 'company_round', pipelineStageId: 'pipeline_stage_id',
            priorityLevel: 'priority_level', dealSourceType: 'deal_source_type',
            dealSourceNameId: 'deal_source_name_id', industryId: 'industry_id',
            subIndustry: 'sub_industry', shareType: 'share_type', totalFundRaise: 'total_fund_raise',
            valuation: 'valuation', googleDriveLink: 'google_drive_link', customTags: 'custom_tags',
            terminalStatus: 'terminal_status', slaDeadline: 'sla_deadline', isOverdue: 'is_overdue', stageDeadlines: 'stage_deadlines',
            quickSummary: 'quick_summary', deckAnalysis: 'deck_analysis', kpiData: 'kpi_data',
            callTranscript: 'call_transcript', filterBrief: 'filter_brief', icMemo: 'ic_memo', meetEventTitle: 'meet_event_title', meetEventDate: 'meet_event_date',
            linkedPreviousEntryId: 'linked_previous_entry_id',
            needsReview: 'needs_review', ingestionSource: 'ingestion_source',
            initialInvestment: 'initial_investment', entryValuation: 'entry_valuation',
            entryOwnership: 'entry_ownership', currentOwnership: 'current_ownership',
            latestValuation: 'latest_valuation', portfolioStatus: 'portfolio_status',
            exitValue: 'exit_value', exitDate: 'exit_date',
            hqLocation: 'hq_location', notes: 'notes',
            sharePrice: 'share_price', numShares: 'num_shares', totalShares: 'total_shares',
            entryPreMoneyValuation: 'entry_pre_money_valuation',
            entryPostMoneyValuation: 'entry_post_money_valuation',
            entryTotalRaised: 'entry_total_raised',
            noOfShares: 'no_of_shares',
            portfolioHealth: 'portfolio_health',
            founders: 'founders',
            createdAt: 'created_at',
        };
        // Postgres BIGINT-bound camelCase keys — round any decimals.
        // noOfShares is intentionally absent: it's a NUMERIC column holding
        // a decimal percentage (Total Ownership After Round %) and must not
        // be rounded to an integer on save.
        const BIGINT_KEYS = new Set([
            'initialInvestment', 'entryValuation', 'latestValuation', 'exitValue',
            'numShares', 'totalShares',
            'entryPreMoneyValuation', 'entryPostMoneyValuation', 'entryTotalRaised',
            'totalFundRaise', 'valuation',
        ]);
        for (const [key, val] of Object.entries(data)) {
            const dbKey = fieldMap[key] || key;
            dbData[dbKey] = BIGINT_KEYS.has(key) && val != null ? toBigint(val) : val;
        }
        let { data: rows, error } = await apiDb({ table: 'companies', operation: 'update', data: dbData, match: { id } });

        // Same forward-compat retry as createCompany — drop any columns Postgres
        // doesn't know about yet rather than discarding the entire update.
        if (error && isMissingColumnError(error)) {
            const missing = extractMissingColumns(error);
            for (const col of missing) delete dbData[col];
            console.warn(`Retrying update company without missing column(s): ${missing.join(', ')}`);
            ({ data: rows, error } = await apiDb({ table: 'companies', operation: 'update', data: dbData, match: { id } }));
        }
        if (error) { console.error('Update company error:', error); return; }
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row) {
            const updated = mapCompany(row);
            setCompanies(prev => prev.map(c => c.id === id ? updated : c));
            setSelectedCompany(prev => prev?.id === id ? updated : prev);
        } else {
            // Fallback: apply changes locally from the input data
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
            setSelectedCompany(prev => prev?.id === id ? { ...prev, ...data } : prev);
        }

        // Audit log: track field-level changes
        if (user && oldCompany) {
            const auditInserts: Record<string, unknown>[] = [];
            for (const [key, newVal] of Object.entries(data)) {
                if (!AUDIT_FIELDS.has(key)) continue;
                const oldVal = (oldCompany as unknown as Record<string, unknown>)[key];
                const oldStr = oldVal == null ? '' : typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
                const newStr = newVal == null ? '' : typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal);
                if (oldStr === newStr) continue;
                auditInserts.push({
                    company_id: id, user_id: user.id, action: 'field_update',
                    entity: 'company', field: key, old_value: oldStr.slice(0, 500), new_value: newStr.slice(0, 500),
                    details: `Changed ${key} on ${oldCompany.companyName}`,
                });
            }
            if (auditInserts.length > 0) {
                apiDb({ table: 'audit_logs', operation: 'insert', data: auditInserts }).catch(() => {});
            }
        }
    }, [apiDb, user, companies]);

    const deleteCompany = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'companies', operation: 'delete', match: { id } });
        if (error) { console.error('Delete company error:', error); return; }
        setCompanies(prev => prev.filter(c => c.id !== id));
    }, [apiDb]);

    const moveCompanyStage = useCallback(async (companyId: string, targetStageId: string): Promise<string | null> => {
        if (!user) return null;
        const company = companies.find(c => c.id === companyId);
        if (!company) return null;
        const fromStageId = company.pipelineStageId;
        const toStage = pipelineStages.find(s => s.id === targetStageId);

        // ─── Stage gate: Filter Discussion requires all key fields ───
        if (toStage?.name?.toLowerCase().includes('filter')) {
            const missing: string[] = [];
            if (!company.founderName) missing.push('Founder Name');
            if (!company.analystId) missing.push('Analyst');
            if (!company.founderEmail) missing.push('Founder Email');
            if (!company.companyRound) missing.push('Company Round');
            if (!company.priorityLevel) missing.push('Priority Level');
            if (!company.industryId) missing.push('Industry');
            if (!company.subIndustry) missing.push('Sub-Industry');
            if (!company.dealSourceType) missing.push('Deal Source Type');
            if (!company.dealSourceNameId) missing.push('Deal Source Name');
            if (!company.totalFundRaise) missing.push('Total Fund Raise');
            if (!company.valuation) missing.push('Valuation');
            if (!company.shareType) missing.push('Share Type');
            if (!company.deckAnalysis) missing.push('Deck Analysis (run Analyze Deck first)');
            if (missing.length > 0) {
                return `Cannot move to ${toStage.name}. Missing required fields:\n\n• ${missing.join('\n• ')}`;
            }
        }

        await apiDb({ table: 'companies', operation: 'update', data: { pipeline_stage_id: targetStageId }, match: { id: companyId } });
        setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, pipelineStageId: targetStageId } : c));
        await apiDb({
            table: 'activity_logs', operation: 'insert',
            data: {
                company_id: companyId, user_id: user.id,
                action: 'stage_change', details: `Moved to ${toStage?.name || 'unknown'}`,
                from_stage_id: fromStageId, to_stage_id: targetStageId,
            },
        });

        // Notify the assigned analyst about stage change
        if (company.analystId && company.analystId !== user.id) {
            await apiDb({
                table: 'notifications', operation: 'insert',
                data: {
                    user_id: company.analystId, type: 'stage_change',
                    title: 'Stage Changed',
                    message: `${company.companyName} moved to ${toStage?.name || 'unknown'}`,
                    company_id: companyId,
                },
            });
        }
        return null;
    }, [apiDb, user, companies, pipelineStages]);

    const assignAnalyst = useCallback(async (companyId: string, analystId: string | null) => {
        if (!user) return;
        await apiDb({ table: 'companies', operation: 'update', data: { analyst_id: analystId }, match: { id: companyId } });
        const analyst = users.find(u => u.id === analystId);
        await apiDb({
            table: 'activity_logs', operation: 'insert',
            data: {
                company_id: companyId, user_id: user.id,
                action: 'assigned',
                details: analystId ? `Assigned to ${analyst?.name || 'analyst'}` : 'Unassigned',
            },
        });
        if (analystId) {
            const company = companies.find(c => c.id === companyId);
            await apiDb({
                table: 'notifications', operation: 'insert',
                data: {
                    user_id: analystId, type: 'assignment',
                    title: 'New Assignment',
                    message: `${company?.companyName || 'A company'} has been assigned to you`,
                    company_id: companyId,
                },
            });
        }
    }, [apiDb, user, users, companies]);

    const addComment = useCallback(async (companyId: string, text: string): Promise<Comment | null> => {
        if (!user) return null;
        const { data, error } = await apiDb({
            table: 'comments', operation: 'insert',
            data: { company_id: companyId, author_id: user.id, text },
        });
        if (error) { console.error('Add comment error:', error); return null; }

        // Notify the assigned analyst about new comment
        const company = companies.find(c => c.id === companyId);
        if (company?.analystId && company.analystId !== user.id) {
            await apiDb({
                table: 'notifications', operation: 'insert',
                data: {
                    user_id: company.analystId, type: 'comment',
                    title: 'New Comment',
                    message: `New comment on ${company.companyName}`,
                    company_id: companyId,
                },
            });
        }

        return mapComment(data);
    }, [apiDb, user, companies]);

    const rejectCompany = useCallback(async (
        companyId: string,
        reasons: { categoryId: string; subReasonIds: string[] }[],
        commMethod: string, emailDraft?: string, recipientEmail?: string,
    ) => {
        if (!user) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;

        await apiDb({ table: 'companies', operation: 'update', data: { terminal_status: 'Rejected' }, match: { id: companyId } });
        await apiDb({
            table: 'rejection_records', operation: 'insert',
            data: {
                company_id: companyId, reasons,
                rejection_stage_id: company.pipelineStageId,
                communication_method: commMethod,
                rejection_email_recipient: recipientEmail || '',
                rejection_email_draft: emailDraft || '',
                rejection_email_sent: commMethod === 'Email' && !!emailDraft,
            },
        });
        await apiDb({
            table: 'activity_logs', operation: 'insert',
            data: {
                company_id: companyId, user_id: user.id,
                action: 'rejected',
                details: `Rejected at ${pipelineStages.find(s => s.id === company.pipelineStageId)?.name || 'current stage'}`,
            },
        });
    }, [apiDb, user, companies, pipelineStages]);

    const markNotificationsRead = useCallback(async () => {
        if (!user) return;
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;
        // Update each notification individually since apiDb doesn't support .in()
        await Promise.all(unreadIds.map(id =>
            apiDb({ table: 'notifications', operation: 'update', data: { read: true }, match: { id } })
        ));
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, [apiDb, user, notifications]);

    // ─── Terminal Status Mutations ──────────────────

    const setTerminalStatus = useCallback(async (companyId: string, status: TerminalStatus, reminderDate?: string) => {
        if (!user) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;

        const updatePayload: Record<string, unknown> = { terminal_status: status };
        if ((status === 'Awaiting Response' || status === 'Blocker') && reminderDate) {
            updatePayload.sla_deadline = reminderDate;
        }

        const { error } = await apiDb({ table: 'companies', operation: 'update', data: updatePayload, match: { id: companyId } });
        if (error) { console.error('setTerminalStatus error:', error); return; }

        await apiDb({
            table: 'activity_logs', operation: 'insert',
            data: {
                company_id: companyId, user_id: user.id,
                action: 'terminal_status_set',
                details: `Set terminal status to ${status}`,
            },
        });

        // For Portfolio: notify all analysts
        if (status === 'Portfolio') {
            const notifInserts = users
                .filter(u => u.id !== user.id)
                .map(u => ({
                    user_id: u.id, type: 'stage_change' as const,
                    title: 'Portfolio Company',
                    message: `${company.companyName} has been marked as Portfolio`,
                    company_id: companyId,
                }));
            if (notifInserts.length > 0) {
                await apiDb({ table: 'notifications', operation: 'insert', data: notifInserts });
            }
        }
    }, [apiDb, user, companies, users]);

    const resolveTerminalStatus = useCallback(async (companyId: string, targetStageId: string) => {
        if (!user) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const toStage = pipelineStages.find(s => s.id === targetStageId);

        const { error } = await apiDb({
            table: 'companies', operation: 'update',
            data: { terminal_status: null, pipeline_stage_id: targetStageId },
            match: { id: companyId },
        });
        if (error) { console.error('resolveTerminalStatus error:', error); return; }

        await apiDb({
            table: 'activity_logs', operation: 'insert',
            data: {
                company_id: companyId, user_id: user.id,
                action: 'terminal_status_resolved',
                details: `Resolved terminal status, returned to ${toStage?.name || 'pipeline'}`,
                from_stage_id: company.pipelineStageId,
                to_stage_id: targetStageId,
            },
        });
    }, [apiDb, user, companies, pipelineStages]);

    // ─── Follow-on Rounds CRUD ─────────────────────

    const fetchFollowOns = useCallback(async (companyId: string): Promise<FollowOnRound[]> => {
        const { data: rows, error } = await apiDb({
            table: 'portfolio_follow_ons', operation: 'select',
            match: { company_id: companyId },
            order: 'round_date',
        });
        if (error || !rows) return [];
        return (Array.isArray(rows) ? rows : [rows]).map(mapFollowOn);
    }, [apiDb]);

    // Bulk-load every follow-on round, used by views that need to derive
    // per-company state (e.g. current stage) without N round-trips.
    const fetchAllFollowOns = useCallback(async (): Promise<FollowOnRound[]> => {
        const { data: rows, error } = await apiDb({
            table: 'portfolio_follow_ons', operation: 'select',
            order: 'round_date',
        });
        if (error || !rows) return [];
        return (Array.isArray(rows) ? rows : [rows]).map(mapFollowOn);
    }, [apiDb]);

    const addFollowOn = useCallback(async (data: Record<string, unknown>): Promise<FollowOnRound | null> => {
        // Prefer post_money_valuation; fall back to roundValuation alias so older code paths keep working.
        const postMoneyRaw = data.postMoneyValuation ?? data.roundValuation ?? null;
        const postMoney = toBigint(postMoneyRaw);

        // Columns the schema has always had — guaranteed safe.
        const legacyRow: Record<string, unknown> = {
            company_id: data.companyId,
            organization_id: ORGANIZATION_ID,
            round_name: data.roundName || '',
            round_date: data.roundDate || new Date().toISOString(),
            total_raised: toBigint(data.totalRaised),
            our_investment: toBigint(data.ourInvestment),
            did_we_invest: data.didWeInvest || false,
            round_valuation: postMoney,
            ownership_after: data.ownershipAfter ?? null,
            investor_names: data.investorNames || '',
            notes: data.notes || '',
        };
        // Columns added by supabase/portfolio-extras.sql. If the migration
        // hasn't been applied yet, Postgres rejects the whole insert.
        const newRow: Record<string, unknown> = {
            ...legacyRow,
            post_money_valuation: postMoney,
            pre_money_valuation: toBigint(data.preMoneyValuation),
            share_price: data.sharePrice ?? null,
            num_shares: toBigint(data.numShares),
            total_shares: toBigint(data.totalShares),
            dv_total_shares: toBigint(data.dvTotalShares),
            ownership_sought: data.ownershipSought ?? null,
            dilution_percent: data.dilutionPercent ?? null,
            our_value_today_override: data.ourValueTodayOverride ?? null,
            no_of_shares: data.noOfShares ?? null,
        };

        let { data: row, error } = await apiDb({
            table: 'portfolio_follow_ons', operation: 'insert', data: newRow,
        });
        // Fall back to the legacy column set if the new columns are missing on the DB.
        if (error && /column .* does not exist|schema cache|could not find the/i.test(error)) {
            console.warn('addFollowOn: new columns missing, retrying with legacy schema. Run supabase/portfolio-extras.sql to enable share price / pre-money / ownership-sought fields.');
            ({ data: row, error } = await apiDb({
                table: 'portfolio_follow_ons', operation: 'insert', data: legacyRow,
            }));
        }
        if (error || !row) { console.error('addFollowOn error:', error); return null; }
        return mapFollowOn(row);
    }, [apiDb]);

    const updateFollowOn = useCallback(async (id: string, data: Record<string, unknown>) => {
        const dbData: Record<string, unknown> = {};
        if (data.roundName !== undefined) dbData.round_name = data.roundName;
        if (data.roundDate !== undefined) dbData.round_date = data.roundDate;
        if (data.totalRaised !== undefined) dbData.total_raised = toBigint(data.totalRaised);
        if (data.ourInvestment !== undefined) dbData.our_investment = toBigint(data.ourInvestment);
        if (data.didWeInvest !== undefined) dbData.did_we_invest = data.didWeInvest;
        // Mirror post-money to legacy round_valuation column so older readers stay correct.
        if (data.postMoneyValuation !== undefined) {
            const v = toBigint(data.postMoneyValuation);
            dbData.post_money_valuation = v;
            dbData.round_valuation = v;
        } else if (data.roundValuation !== undefined) {
            const v = toBigint(data.roundValuation);
            dbData.round_valuation = v;
            dbData.post_money_valuation = v;
        }
        if (data.preMoneyValuation !== undefined) dbData.pre_money_valuation = toBigint(data.preMoneyValuation);
        if (data.sharePrice !== undefined) dbData.share_price = data.sharePrice;
        if (data.numShares !== undefined) dbData.num_shares = toBigint(data.numShares);
        if (data.totalShares !== undefined) dbData.total_shares = toBigint(data.totalShares);
        if (data.dvTotalShares !== undefined) dbData.dv_total_shares = toBigint(data.dvTotalShares);
        if (data.ownershipSought !== undefined) dbData.ownership_sought = data.ownershipSought;
        if (data.dilutionPercent !== undefined) dbData.dilution_percent = data.dilutionPercent;
        if (data.ourValueTodayOverride !== undefined) dbData.our_value_today_override = data.ourValueTodayOverride;
        if (data.ownershipAfter !== undefined) dbData.ownership_after = data.ownershipAfter;
        if (data.noOfShares !== undefined) dbData.no_of_shares = data.noOfShares;
        if (data.investorNames !== undefined) dbData.investor_names = data.investorNames;
        if (data.notes !== undefined) dbData.notes = data.notes;
        await apiDb({ table: 'portfolio_follow_ons', operation: 'update', data: dbData, match: { id } });
    }, [apiDb]);

    const deleteFollowOn = useCallback(async (id: string) => {
        await apiDb({ table: 'portfolio_follow_ons', operation: 'delete', match: { id } });
    }, [apiDb]);

    // ─── AI Generation Mutations ────────────────────

    const generateAISummary = useCallback(async (companyId: string) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const ind = industries.find(i => i.id === company.industryId);
        const res = await fetch('/api/ai/quick-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: company.companyName, founderName: company.founderName,
                industry: ind?.name, subIndustry: company.subIndustry,
                companyRound: company.companyRound, totalFundRaise: company.totalFundRaise,
                valuation: company.valuation, dealSourceType: company.dealSourceType,
            }),
        });
        if (!res.ok) { console.error('generateAISummary error:', await res.text()); return; }
        const { summary } = await res.json();
        await apiDb({ table: 'companies', operation: 'update', data: { quick_summary: summary }, match: { id: companyId } });
    }, [apiDb, companies, industries]);

    const generateDeckAnalysis = useCallback(async (companyId: string, uploadedFile?: { data: string; mimeType: string; filename: string } | null) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const ind = industries.find(i => i.id === company.industryId);
        const res = await fetch('/api/ai/deck-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyId,
                companyName: company.companyName, founderName: company.founderName,
                industry: ind?.name, subIndustry: company.subIndustry,
                companyRound: company.companyRound, totalFundRaise: company.totalFundRaise,
                valuation: company.valuation, quickSummary: company.quickSummary,
                googleDriveLink: company.googleDriveLink,
                ...(uploadedFile ? { uploadedFile } : {}),
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('generateDeckAnalysis error:', errText);
            throw new Error(`AI analysis failed (${res.status}): ${errText.slice(0, 200)}`);
        }
        const { analysis } = await res.json();
        await apiDb({ table: 'companies', operation: 'update', data: { deck_analysis: analysis }, match: { id: companyId } });
        // Auto-save AI confidence score
        if (typeof analysis.confidenceScore === 'number' && analysis.confidenceScore > 0) {
            await addScore(companyId, 'ai', analysis.confidenceScore, null);
        }
        // Update local state so the UI re-renders with the analysis
        const updated = { ...company, deckAnalysis: analysis };
        setCompanies(prev => prev.map(c => c.id === companyId ? updated : c));
        setSelectedCompany(updated);
    }, [apiDb, companies, industries, setSelectedCompany, addScore]);

    const generateFilterBrief = useCallback(async (companyId: string) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const ind = industries.find(i => i.id === company.industryId);
        const res = await fetch('/api/ai/filter-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: company.companyName, founderName: company.founderName,
                industry: ind?.name, companyRound: company.companyRound,
                totalFundRaise: company.totalFundRaise, valuation: company.valuation,
                quickSummary: company.quickSummary, deckAnalysis: company.deckAnalysis,
                kpiData: company.kpiData, callTranscript: company.callTranscript,
            }),
        });
        if (!res.ok) { console.error('generateFilterBrief error:', await res.text()); return; }
        const { brief } = await res.json();
        await apiDb({ table: 'companies', operation: 'update', data: { filter_brief: brief }, match: { id: companyId } });
    }, [apiDb, companies, industries]);

    const generateICMemo = useCallback(async (companyId: string) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const ind = industries.find(i => i.id === company.industryId);
        const res = await fetch('/api/ai/ic-memo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: company.companyName, founderName: company.founderName,
                industry: ind?.name, subIndustry: company.subIndustry,
                companyRound: company.companyRound, totalFundRaise: company.totalFundRaise,
                valuation: company.valuation, shareType: company.shareType,
                quickSummary: company.quickSummary, deckAnalysis: company.deckAnalysis,
                kpiData: company.kpiData, callTranscript: company.callTranscript,
                filterBrief: company.filterBrief,
            }),
        });
        if (!res.ok) { console.error('generateICMemo error:', await res.text()); return; }
        const { memo } = await res.json();
        await apiDb({ table: 'companies', operation: 'update', data: { ic_memo: memo }, match: { id: companyId } });
    }, [apiDb, companies, industries]);

    const analyzeMeetingRecording = useCallback(async (companyId: string, file: { data: string; mimeType: string; filename: string }) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const res = await fetch('/api/ai/meeting-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: company.companyName,
                founderName: company.founderName,
                fileData: file.data,
                fileMimeType: file.mimeType,
                fileName: file.filename,
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Meeting analysis failed (${res.status}): ${errText.slice(0, 200)}`);
        }
        const { analysis } = await res.json();
        const callTranscript = {
            recordingUrl: '',
            date: new Date().toISOString().split('T')[0],
            duration: analysis.duration || 'Unknown',
            platform: 'Google Meet',
            keyPoints: analysis.keyPoints || [],
            actionItems: analysis.actionItems || [],
            concerns: analysis.concerns || [],
            redFlags: analysis.redFlags || [],
            transcript: analysis.transcript || '',
            facialAnalysis: analysis.facialAnalysis || '',
            sentimentSummary: analysis.sentimentSummary || '',
            participantBehavior: analysis.participantBehavior || [],
        };
        await apiDb({ table: 'companies', operation: 'update', data: { call_transcript: callTranscript }, match: { id: companyId } });
        const updated = { ...company, callTranscript };
        setCompanies(prev => prev.map(c => c.id === companyId ? updated : c));
        setSelectedCompany(updated);
    }, [apiDb, companies, setSelectedCompany]);

    const fetchAndAnalyzeMeetingRecording = useCallback(async (companyId: string) => {
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        const res = await fetch('/api/ai/fetch-meeting-recording', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyName: company.companyName,
                founderName: company.founderName,
                meetEventTitle: company.meetEventTitle,
                meetEventDate: company.meetEventDate,
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed (${res.status}): ${errText.slice(0, 200)}`);
        }
        const data = await res.json();
        if (!data.found) {
            throw new Error(data.error || 'No recording found in Google Drive.');
        }
        const callTranscript = {
            recordingUrl: '',
            date: new Date().toISOString().split('T')[0],
            duration: data.analysis.duration || 'Unknown',
            platform: 'Google Meet',
            keyPoints: data.analysis.keyPoints || [],
            actionItems: data.analysis.actionItems || [],
            concerns: data.analysis.concerns || [],
            redFlags: data.analysis.redFlags || [],
            transcript: data.analysis.transcript || '',
            facialAnalysis: data.analysis.facialAnalysis || '',
            sentimentSummary: data.analysis.sentimentSummary || '',
            participantBehavior: data.analysis.participantBehavior || [],
        };
        await apiDb({ table: 'companies', operation: 'update', data: { call_transcript: callTranscript }, match: { id: companyId } });
        const updated = { ...company, callTranscript };
        setCompanies(prev => prev.map(c => c.id === companyId ? updated : c));
        setSelectedCompany(updated);
    }, [apiDb, companies, setSelectedCompany]);

    // ─── Saved Views CRUD ───────────────────────────

    const fetchSavedViews = useCallback(async () => {
        const { data, error } = await apiDb({
            table: 'saved_views', operation: 'select',
            order: { column: 'created_at', ascending: false },
        });
        if (error) { console.error('fetchSavedViews error:', error); return; }
        setSavedViews((data || []).map((r: any): SavedView => ({
            id: r.id, name: r.name, filters: r.filters ?? {}, createdAt: r.created_at,
        })));
    }, [apiDb]);

    const saveSavedView = useCallback(async (name: string, filters: Record<string, string[]>) => {
        if (!user) return;
        const { data, error } = await apiDb({
            table: 'saved_views', operation: 'insert',
            data: { name, filters, user_id: user.id },
        });
        if (error) { console.error('saveSavedView error:', error); return; }
        if (data) {
            const view: SavedView = { id: data.id, name: data.name, filters: data.filters ?? {}, createdAt: data.created_at };
            setSavedViews(prev => [view, ...prev]);
        }
    }, [apiDb, user]);

    const deleteSavedView = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'saved_views', operation: 'delete', match: { id } });
        if (error) { console.error('deleteSavedView error:', error); return; }
        setSavedViews(prev => prev.filter(v => v.id !== id));
    }, [apiDb]);

    // ─── Settings CRUD ──────────────────────────────

    const addPipelineStage = useCallback(async (name: string, color: string, description: string) => {
        const maxOrder = pipelineStages.reduce((max, s) => Math.max(max, s.order), 0);
        const { data, error } = await apiDb({
            table: 'pipeline_stages', operation: 'insert',
            data: { organization_id: ORGANIZATION_ID, name, color, description, order: maxOrder + 1 },
        });
        if (error) { console.error('addPipelineStage error:', error); return; }
        if (data) setPipelineStages(prev => [...prev, mapStage(data)]);
    }, [apiDb, pipelineStages]);

    const updatePipelineStage = useCallback(async (id: string, data: { name?: string; color?: string; description?: string }) => {
        const { error } = await apiDb({ table: 'pipeline_stages', operation: 'update', data, match: { id } });
        if (error) { console.error('updatePipelineStage error:', error); return; }
        setPipelineStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }, [apiDb]);

    const deletePipelineStage = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'pipeline_stages', operation: 'delete', match: { id } });
        if (error) { console.error('deletePipelineStage error:', error); return; }
        setPipelineStages(prev => prev.filter(s => s.id !== id));
    }, [apiDb]);

    const addIndustry = useCallback(async (name: string): Promise<Industry | null> => {
        const { data, error } = await apiDb({
            table: 'industries', operation: 'insert',
            data: { organization_id: ORGANIZATION_ID, name },
        });
        if (error || !data) { console.error('addIndustry error:', error); return null; }
        const created: Industry = { id: data.id, name: data.name };
        setIndustries(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        return created;
    }, [apiDb]);

    const updateIndustry = useCallback(async (id: string, name: string) => {
        const { error } = await apiDb({ table: 'industries', operation: 'update', data: { name }, match: { id } });
        if (error) { console.error('updateIndustry error:', error); return; }
        setIndustries(prev => prev.map(i => i.id === id ? { ...i, name } : i));
    }, [apiDb]);

    const deleteIndustry = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'industries', operation: 'delete', match: { id } });
        if (error) { console.error('deleteIndustry error:', error); return; }
        setIndustries(prev => prev.filter(i => i.id !== id));
    }, [apiDb]);

    const addDealSourceName = useCallback(async (name: string) => {
        const { data, error } = await apiDb({
            table: 'deal_source_names', operation: 'insert',
            data: { organization_id: ORGANIZATION_ID, name },
        });
        if (error) { console.error('addDealSourceName error:', error); return; }
        if (data) setDealSourceNames(prev => [...prev, { id: data.id, name: data.name }]);
    }, [apiDb]);

    const updateDealSourceName = useCallback(async (id: string, name: string) => {
        const { error } = await apiDb({ table: 'deal_source_names', operation: 'update', data: { name }, match: { id } });
        if (error) { console.error('updateDealSourceName error:', error); return; }
        setDealSourceNames(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    }, [apiDb]);

    const deleteDealSourceName = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'deal_source_names', operation: 'delete', match: { id } });
        if (error) { console.error('deleteDealSourceName error:', error); return; }
        setDealSourceNames(prev => prev.filter(d => d.id !== id));
    }, [apiDb]);

    const addRejectionCategory = useCallback(async (name: string) => {
        const { data, error } = await apiDb({
            table: 'rejection_reason_categories', operation: 'insert',
            data: { organization_id: ORGANIZATION_ID, name },
        });
        if (error) { console.error('addRejectionCategory error:', error); return; }
        if (data) setRejectionReasonCategories(prev => [...prev, { id: data.id, name: data.name, subReasons: [] }]);
    }, [apiDb]);

    const deleteRejectionCategory = useCallback(async (id: string) => {
        await apiDb({ table: 'rejection_sub_reasons', operation: 'delete', match: { category_id: id } });
        const { error } = await apiDb({ table: 'rejection_reason_categories', operation: 'delete', match: { id } });
        if (error) { console.error('deleteRejectionCategory error:', error); return; }
        setRejectionReasonCategories(prev => prev.filter(cat => cat.id !== id));
    }, [apiDb]);

    const addSubReason = useCallback(async (categoryId: string, name: string) => {
        const { data, error } = await apiDb({
            table: 'rejection_sub_reasons', operation: 'insert',
            data: { category_id: categoryId, name },
        });
        if (error) { console.error('addSubReason error:', error); return; }
        if (data) {
            const sr: RejectionSubReason = { id: data.id, name: data.name, categoryId: data.category_id };
            setRejectionReasonCategories(prev =>
                prev.map(cat => cat.id === categoryId ? { ...cat, subReasons: [...cat.subReasons, sr] } : cat)
            );
        }
    }, [apiDb]);

    const updateSubReason = useCallback(async (id: string, name: string) => {
        const { error } = await apiDb({ table: 'rejection_sub_reasons', operation: 'update', data: { name }, match: { id } });
        if (error) { console.error('updateSubReason error:', error); return; }
        setRejectionReasonCategories(prev =>
            prev.map(cat => ({ ...cat, subReasons: cat.subReasons.map(sr => sr.id === id ? { ...sr, name } : sr) }))
        );
    }, [apiDb]);

    const deleteSubReason = useCallback(async (id: string) => {
        const { error } = await apiDb({ table: 'rejection_sub_reasons', operation: 'delete', match: { id } });
        if (error) { console.error('deleteSubReason error:', error); return; }
        setRejectionReasonCategories(prev =>
            prev.map(cat => ({ ...cat, subReasons: cat.subReasons.filter(sr => sr.id !== id) }))
        );
    }, [apiDb]);

    // Invite user: calls API route to send invite and upsert profile
    const inviteUser = useCallback(async (email: string, role: UserRole, permissions?: PagePermission[]) => {
        const res = await fetch('/api/invite-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role, organizationId: ORGANIZATION_ID, permissions }),
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

    const updateUserPermissions = useCallback(async (userId: string, permissions: PagePermission[]) => {
        const { error } = await apiDb({
            table: 'profiles', operation: 'update',
            data: { permissions },
            match: { id: userId },
        });
        if (error) { console.error('updateUserPermissions error:', error); return; }
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions } : u));
    }, [apiDb]);

    const updateUserRole = useCallback(async (userId: string, role: string) => {
        const { error } = await apiDb({
            table: 'profiles', operation: 'update',
            data: { role },
            match: { id: userId },
        });
        if (error) { console.error('updateUserRole error:', error); return; }
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    }, [apiDb]);

    // ─── Email Ingestion ─────────────────────────────

    const syncEmails = useCallback(async () => {
        try {
            const res = await fetch('/api/gmail/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');
            if (user) await fetchAllData(user.id);
            return data;
        } catch (err) {
            console.error('Email sync error:', err);
            return null;
        }
    }, [user, fetchAllData]);

    // ─── Background bulk search for deck email links ───
    useEffect(() => {
        if (!user || isLoading || companies.length === 0) return;
        const missing = companies.filter(c => !c.deckEmailLink && c.founderEmail && !deckEmailLinks[c.id]);
        if (missing.length === 0) return;

        let cancelled = false;

        (async () => {
            for (const company of missing) {
                if (cancelled) break;
                try {
                    const res = await fetch('/api/gmail/find-deck-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: company.id,
                            companyName: company.companyName,
                            founderName: company.founderName,
                            founderEmail: company.founderEmail,
                        }),
                    });
                    const data = await res.json();
                    if (!cancelled && data.found && data.messageId) {
                        setDeckEmailLinks(prev => ({ ...prev, [company.id]: data.messageId }));
                    }
                } catch { /* skip failures silently */ }
            }
        })();

        return () => { cancelled = true; };
    // Run once after initial load — keyed on isLoading transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

    const approveCompany = useCallback(async (companyId: string) => {
        await updateCompany(companyId, { needsReview: false });
        if (user) {
            await apiDb({
                table: 'activity_logs', operation: 'insert',
                data: {
                    company_id: companyId, user_id: user.id,
                    action: 'approved', details: 'Approved email-ingested company for pipeline',
                },
            });
        }
    }, [updateCompany, apiDb, user]);

    // ─── Context Value ──────────────────────────────
    const value = useMemo<AppContextType>(() => ({
        user, isLoading, signOut,
        users, companies, pipelineStages, industries, dealSourceNames, rejectionReasonCategories, rejectionRecords, notifications,
        savedViews,
        getUserById, getIndustryById, getStageById, getDealSourceNameById,
        getCompaniesByStage, getUnassignedCompanies, getUnreadNotifications,
        formatCurrency, getDaysInPipeline,
        fetchComments, fetchActivity, fetchEmailLogs, fetchScores, addScore, deleteScore, fetchFeedback, addFeedback, updateFeedbackStatus, deleteFeedback,
        createCompany, updateCompany, deleteCompany, moveCompanyStage, assignAnalyst,
        addComment, rejectCompany, markNotificationsRead,
        setTerminalStatus, resolveTerminalStatus,
        generateAISummary, generateDeckAnalysis, generateFilterBrief, generateICMemo, analyzeMeetingRecording, fetchAndAnalyzeMeetingRecording,
        fetchSavedViews, saveSavedView, deleteSavedView,
        addPipelineStage, updatePipelineStage, deletePipelineStage,
        addIndustry, updateIndustry, deleteIndustry,
        addDealSourceName, updateDealSourceName, deleteDealSourceName,
        addRejectionCategory, deleteRejectionCategory, addSubReason, updateSubReason, deleteSubReason,
        inviteUser, updateUserPermissions, updateUserRole, refreshData,
        fetchFollowOns, fetchAllFollowOns, addFollowOn, updateFollowOn, deleteFollowOn,
        syncEmails, approveCompany,
        deckEmailLinks,
        selectedCompany, setSelectedCompany,
        editingCompany, setEditingCompany,
        showNotifications, setShowNotifications,
        showRejectionFlow, setShowRejectionFlow,
        showEmailCompose, setShowEmailCompose,
        showCalendarInvite, setShowCalendarInvite,
        showCompanyForm, setShowCompanyForm,
        companyFormPortfolioMode, setCompanyFormPortfolioMode,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        activeFilters, setActiveFilters,
    }), [
        user, isLoading, signOut,
        users, companies, pipelineStages, industries, dealSourceNames, rejectionReasonCategories, rejectionRecords, notifications,
        savedViews,
        getUserById, getIndustryById, getStageById, getDealSourceNameById,
        getCompaniesByStage, getUnassignedCompanies, getUnreadNotifications,
        fetchComments, fetchActivity, fetchEmailLogs, fetchScores, addScore, deleteScore, fetchFeedback, addFeedback, updateFeedbackStatus, deleteFeedback,
        createCompany, updateCompany, deleteCompany, moveCompanyStage, assignAnalyst,
        addComment, rejectCompany, markNotificationsRead,
        setTerminalStatus, resolveTerminalStatus,
        generateAISummary, generateDeckAnalysis, generateFilterBrief, generateICMemo, analyzeMeetingRecording, fetchAndAnalyzeMeetingRecording,
        fetchSavedViews, saveSavedView, deleteSavedView,
        addPipelineStage, updatePipelineStage, deletePipelineStage,
        addIndustry, updateIndustry, deleteIndustry,
        addDealSourceName, updateDealSourceName, deleteDealSourceName,
        addRejectionCategory, deleteRejectionCategory, addSubReason, updateSubReason, deleteSubReason,
        inviteUser, updateUserPermissions, updateUserRole, refreshData,
        fetchFollowOns, fetchAllFollowOns, addFollowOn, updateFollowOn, deleteFollowOn,
        syncEmails, approveCompany, deckEmailLinks,
        selectedCompany, editingCompany,
        showNotifications, showRejectionFlow, showEmailCompose, showCalendarInvite, showCompanyForm, companyFormPortfolioMode,
        searchQuery, viewMode, activeFilters,
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}
