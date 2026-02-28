-- ══════════════════════════════════════════════════════════════
-- Dholakia Ventures — Dealflow Platform Database Schema
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ─── Enable required extensions ────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles (linked to Supabase Auth) ────────────────────
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    name text not null default '',
    role text not null default 'analyst' check (role in ('analyst', 'partner', 'admin')),
    avatar_url text default '',
    organization_id uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
    for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
    for update using (auth.uid() = id);
create policy "Admins can view all profiles" on public.profiles
    for select using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Admins can update all profiles" on public.profiles
    for update using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Admins can insert profiles" on public.profiles
    for insert with check (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );

-- ─── Organizations (Multi-tenant) ─────────────────────────
create table public.organizations (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    slug text unique not null,
    logo_url text default '',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.organizations enable row level security;

create policy "Org members can view own org" on public.organizations
    for select using (
        id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Admins can manage orgs" on public.organizations
    for all using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );

-- Add FK from profiles to organizations
alter table public.profiles
    add constraint profiles_organization_fk
    foreign key (organization_id) references public.organizations(id) on delete set null;

-- ─── Pipeline Stages ──────────────────────────────────────
create table public.pipeline_stages (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    name text not null,
    "order" integer not null,
    color text not null default '#3b82f6',
    description text default '',
    created_at timestamptz default now()
);

alter table public.pipeline_stages enable row level security;

create policy "Org members can view stages" on public.pipeline_stages
    for select using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Partners/Admins can manage stages" on public.pipeline_stages
    for all using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and (p.role = 'admin' or (p.role = 'partner' and p.organization_id = organization_id))
        )
    );

-- ─── Industries ───────────────────────────────────────────
create table public.industries (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    name text not null,
    created_at timestamptz default now()
);

alter table public.industries enable row level security;

create policy "Org members can view industries" on public.industries
    for select using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Partners/Admins can manage industries" on public.industries
    for all using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and (p.role = 'admin' or (p.role = 'partner' and p.organization_id = organization_id))
        )
    );

-- ─── Deal Source Names ────────────────────────────────────
create table public.deal_source_names (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    name text not null,
    created_at timestamptz default now()
);

alter table public.deal_source_names enable row level security;

create policy "Org members can view deal sources" on public.deal_source_names
    for select using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Partners/Admins can manage deal sources" on public.deal_source_names
    for all using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and (p.role = 'admin' or (p.role = 'partner' and p.organization_id = organization_id))
        )
    );

-- ─── Rejection Reason Categories ──────────────────────────
create table public.rejection_reason_categories (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    name text not null,
    created_at timestamptz default now()
);

alter table public.rejection_reason_categories enable row level security;

create policy "Org members can view rejection categories" on public.rejection_reason_categories
    for select using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Partners/Admins can manage rejection categories" on public.rejection_reason_categories
    for all using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and (p.role = 'admin' or (p.role = 'partner' and p.organization_id = organization_id))
        )
    );

-- ─── Rejection Sub-Reasons ───────────────────────────────
create table public.rejection_sub_reasons (
    id uuid default uuid_generate_v4() primary key,
    category_id uuid references public.rejection_reason_categories(id) on delete cascade not null,
    name text not null,
    created_at timestamptz default now()
);

alter table public.rejection_sub_reasons enable row level security;

create policy "Org members can view sub-reasons" on public.rejection_sub_reasons
    for select using (
        category_id in (
            select id from public.rejection_reason_categories
            where organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        )
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Partners/Admins can manage sub-reasons" on public.rejection_sub_reasons
    for all using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );

-- ─── Companies (Core entity) ─────────────────────────────
create table public.companies (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    company_name text not null,
    founder_name text not null,
    founder_email text not null default '',
    analyst_id uuid references public.profiles(id) on delete set null,
    company_round text not null default 'Seed' check (company_round in (
        'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Growth Stage', 'Pre-IPO', 'IPO'
    )),
    pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null,
    priority_level text not null default 'Medium' check (priority_level in ('Low', 'Medium', 'High')),
    deal_source_type text not null default 'Founder Network' check (deal_source_type in (
        'Founder Network', 'Investment Banker', 'Friends & Family', 'VC & PE'
    )),
    deal_source_name_id uuid references public.deal_source_names(id) on delete set null,
    industry_id uuid references public.industries(id) on delete set null,
    sub_industry text default '',
    share_type text not null default 'Primary' check (share_type in ('Primary', 'Secondary')),
    total_fund_raise bigint,
    valuation bigint,
    google_drive_link text default '',
    custom_tags text[] default '{}',
    linked_previous_entry_id uuid references public.companies(id) on delete set null,
    terminal_status text check (terminal_status in (
        'Portfolio', 'Rejected', 'Awaiting Response', 'Blocker', 'Next Round Analysis', null
    )),
    sla_deadline timestamptz,
    is_overdue boolean default false,
    -- AI fields (stored as JSONB)
    quick_summary text,
    deck_analysis jsonb,
    kpi_data jsonb,
    call_transcript jsonb,
    filter_brief text,
    ic_memo text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.companies enable row level security;

create policy "Org members can view companies" on public.companies
    for select using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Org members can insert companies" on public.companies
    for insert with check (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Org members can update companies" on public.companies
    for update using (
        organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Admins can delete companies" on public.companies
    for delete using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );

-- ─── Rejection Records ───────────────────────────────────
create table public.rejection_records (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade not null,
    reasons jsonb not null default '[]',
    rejection_stage_id uuid references public.pipeline_stages(id) on delete set null,
    communication_method text not null default 'Not Yet Communicated' check (communication_method in (
        'Email', 'Verbal', 'WhatsApp', 'Call', 'Not Yet Communicated'
    )),
    rejection_email_recipient text default '',
    rejection_email_draft text default '',
    rejection_email_sent boolean default false,
    created_at timestamptz default now()
);

alter table public.rejection_records enable row level security;

create policy "Org members can view rejection records" on public.rejection_records
    for select using (
        company_id in (
            select id from public.companies
            where organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        )
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Org members can insert rejection records" on public.rejection_records
    for insert with check (
        company_id in (
            select id from public.companies
            where organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        )
    );

-- ─── Comments ─────────────────────────────────────────────
create table public.comments (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade not null,
    author_id uuid references public.profiles(id) on delete set null not null,
    text text not null,
    created_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "Org members can view comments" on public.comments
    for select using (
        company_id in (
            select id from public.companies
            where organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        )
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Authenticated users can insert comments" on public.comments
    for insert with check (auth.uid() = author_id);
create policy "Users can delete own comments" on public.comments
    for delete using (auth.uid() = author_id);

-- ─── Activity Logs ────────────────────────────────────────
create table public.activity_logs (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete set null not null,
    action text not null,
    details text default '',
    from_stage_id uuid references public.pipeline_stages(id) on delete set null,
    to_stage_id uuid references public.pipeline_stages(id) on delete set null,
    created_at timestamptz default now()
);

alter table public.activity_logs enable row level security;

create policy "Org members can view activity logs" on public.activity_logs
    for select using (
        company_id in (
            select id from public.companies
            where organization_id in (select organization_id from public.profiles where profiles.id = auth.uid())
        )
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
create policy "Authenticated users can insert activity logs" on public.activity_logs
    for insert with check (auth.uid() = user_id);

-- ─── Notifications ────────────────────────────────────────
create table public.notifications (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    type text not null check (type in ('assignment', 'overdue', 'stage_change', 'new_company', 'comment')),
    title text not null,
    message text not null,
    company_id uuid references public.companies(id) on delete cascade,
    read boolean default false,
    created_at timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "Users can view own notifications" on public.notifications
    for select using (auth.uid() = user_id);
create policy "Users can update own notifications" on public.notifications
    for update using (auth.uid() = user_id);
create policy "System can insert notifications" on public.notifications
    for insert with check (true);

-- ─── Indexes ──────────────────────────────────────────────
create index idx_companies_org on public.companies(organization_id);
create index idx_companies_stage on public.companies(pipeline_stage_id);
create index idx_companies_analyst on public.companies(analyst_id);
create index idx_companies_industry on public.companies(industry_id);
create index idx_companies_terminal on public.companies(terminal_status);
create index idx_comments_company on public.comments(company_id);
create index idx_activity_logs_company on public.activity_logs(company_id);
create index idx_notifications_user on public.notifications(user_id);
create index idx_profiles_org on public.profiles(organization_id);

-- ─── Updated_at trigger ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger companies_updated_at
    before update on public.companies
    for each row execute function public.handle_updated_at();

create trigger profiles_updated_at
    before update on public.profiles
    for each row execute function public.handle_updated_at();

create trigger organizations_updated_at
    before update on public.organizations
    for each row execute function public.handle_updated_at();

-- ─── Auto-create profile on signup ────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, name, avatar_url)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
    );
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ─── Realtime ─────────────────────────────────────────────
alter publication supabase_realtime add table public.companies;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.activity_logs;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.pipeline_stages;
