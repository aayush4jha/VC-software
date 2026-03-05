-- ══════════════════════════════════════════════════════════════
-- FIX: Infinite recursion in RLS policies
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ══════════════════════════════════════════════════════════════
--
-- Problem: RLS policies on `profiles` check `profiles` to see if the
-- user is an admin, which triggers the same policies → infinite loop.
-- All other tables that reference `profiles` in their policies are
-- also affected.
--
-- Solution: Create a SECURITY DEFINER helper function that reads
-- the user's role WITHOUT going through RLS. Then rewrite every
-- policy to call this function instead of querying profiles directly.
-- ══════════════════════════════════════════════════════════════

-- ─── Step 1: Helper functions (SECURITY DEFINER = bypasses RLS) ───

-- Returns the current user's role from profiles
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Returns true if the current user is an admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Returns the current user's organization_id
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;


-- ─── Step 2: Fix profiles table policies ─────────────────────

-- Drop the recursive policies
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins can insert profiles" on public.profiles;

-- Recreate without recursion
create policy "Users can view own profile" on public.profiles
    for select using (auth.uid() = id);

create policy "Admins can view all profiles" on public.profiles
    for select using (public.is_admin());

create policy "Users can update own profile" on public.profiles
    for update using (auth.uid() = id);

create policy "Admins can update all profiles" on public.profiles
    for update using (public.is_admin());

create policy "Admins can insert profiles" on public.profiles
    for insert with check (public.is_admin());


-- ─── Step 3: Fix organizations table policies ────────────────

drop policy if exists "Org members can view own org" on public.organizations;
drop policy if exists "Admins can manage orgs" on public.organizations;

create policy "Org members can view own org" on public.organizations
    for select using (
        id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Admins can manage orgs" on public.organizations
    for all using (public.is_admin());


-- ─── Step 4: Fix pipeline_stages table policies ──────────────

drop policy if exists "Org members can view stages" on public.pipeline_stages;
drop policy if exists "Partners/Admins can manage stages" on public.pipeline_stages;

create policy "Org members can view stages" on public.pipeline_stages
    for select using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Partners/Admins can manage stages" on public.pipeline_stages
    for all using (
        public.is_admin()
        or (public.get_my_role() = 'partner' and organization_id = public.get_my_org_id())
    );


-- ─── Step 5: Fix industries table policies ──────────────────

drop policy if exists "Org members can view industries" on public.industries;
drop policy if exists "Partners/Admins can manage industries" on public.industries;

create policy "Org members can view industries" on public.industries
    for select using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Partners/Admins can manage industries" on public.industries
    for all using (
        public.is_admin()
        or (public.get_my_role() = 'partner' and organization_id = public.get_my_org_id())
    );


-- ─── Step 6: Fix deal_source_names table policies ───────────

drop policy if exists "Org members can view deal sources" on public.deal_source_names;
drop policy if exists "Partners/Admins can manage deal sources" on public.deal_source_names;

create policy "Org members can view deal sources" on public.deal_source_names
    for select using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Partners/Admins can manage deal sources" on public.deal_source_names
    for all using (
        public.is_admin()
        or (public.get_my_role() = 'partner' and organization_id = public.get_my_org_id())
    );


-- ─── Step 7: Fix rejection_reason_categories table policies ─

drop policy if exists "Org members can view rejection categories" on public.rejection_reason_categories;
drop policy if exists "Partners/Admins can manage rejection categories" on public.rejection_reason_categories;

create policy "Org members can view rejection categories" on public.rejection_reason_categories
    for select using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Partners/Admins can manage rejection categories" on public.rejection_reason_categories
    for all using (
        public.is_admin()
        or (public.get_my_role() = 'partner' and organization_id = public.get_my_org_id())
    );


-- ─── Step 8: Fix rejection_sub_reasons table policies ───────

drop policy if exists "Org members can view sub-reasons" on public.rejection_sub_reasons;
drop policy if exists "Partners/Admins can manage sub-reasons" on public.rejection_sub_reasons;

create policy "Org members can view sub-reasons" on public.rejection_sub_reasons
    for select using (
        category_id in (
            select id from public.rejection_reason_categories
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );

create policy "Partners/Admins can manage sub-reasons" on public.rejection_sub_reasons
    for all using (public.is_admin());


-- ─── Step 9: Fix companies table policies ───────────────────

drop policy if exists "Org members can view companies" on public.companies;
drop policy if exists "Org members can insert companies" on public.companies;
drop policy if exists "Org members can update companies" on public.companies;
drop policy if exists "Admins can delete companies" on public.companies;

create policy "Org members can view companies" on public.companies
    for select using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Org members can insert companies" on public.companies
    for insert with check (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Org members can update companies" on public.companies
    for update using (
        organization_id = public.get_my_org_id()
        or public.is_admin()
    );

create policy "Admins can delete companies" on public.companies
    for delete using (public.is_admin());


-- ─── Step 10: Fix rejection_records table policies ──────────

drop policy if exists "Org members can view rejection records" on public.rejection_records;
drop policy if exists "Org members can insert rejection records" on public.rejection_records;

create policy "Org members can view rejection records" on public.rejection_records
    for select using (
        company_id in (
            select id from public.companies
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );

create policy "Org members can insert rejection records" on public.rejection_records
    for insert with check (
        company_id in (
            select id from public.companies
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );


-- ─── Step 11: Fix comments table policies ───────────────────

drop policy if exists "Org members can view comments" on public.comments;
drop policy if exists "Authenticated users can insert comments" on public.comments;
drop policy if exists "Users can delete own comments" on public.comments;

create policy "Org members can view comments" on public.comments
    for select using (
        company_id in (
            select id from public.companies
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );

create policy "Authenticated users can insert comments" on public.comments
    for insert with check (auth.uid() = author_id);

create policy "Users can delete own comments" on public.comments
    for delete using (auth.uid() = author_id);


-- ─── Step 12: Fix activity_logs table policies ──────────────

drop policy if exists "Org members can view activity logs" on public.activity_logs;
drop policy if exists "Authenticated users can insert activity logs" on public.activity_logs;

create policy "Org members can view activity logs" on public.activity_logs
    for select using (
        company_id in (
            select id from public.companies
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );

create policy "Authenticated users can insert activity logs" on public.activity_logs
    for insert with check (auth.uid() = user_id);


-- ─── Step 13: Ensure saved_views & email_logs tables exist ──
-- (Must create tables BEFORE dropping/creating their policies)

create table if not exists public.saved_views (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    name text not null,
    filters jsonb not null default '{}',
    created_at timestamptz default now()
);

alter table public.saved_views enable row level security;
create index if not exists idx_saved_views_user on public.saved_views(user_id);

create table if not exists public.email_logs (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade,
    sender_id uuid references public.profiles(id) on delete set null,
    recipient_email text not null,
    subject text not null,
    body text not null,
    email_type text not null default 'general',
    created_at timestamptz default now()
);

alter table public.email_logs enable row level security;
create index if not exists idx_email_logs_company on public.email_logs(company_id);


-- ─── Step 14: Fix email_logs policies ───────────────────────

drop policy if exists "Org members can view email logs" on public.email_logs;
drop policy if exists "Authenticated users can insert email logs" on public.email_logs;

create policy "Org members can view email logs" on public.email_logs
    for select using (
        company_id in (
            select id from public.companies
            where organization_id = public.get_my_org_id()
        )
        or public.is_admin()
    );

create policy "Authenticated users can insert email logs" on public.email_logs
    for insert with check (auth.uid() = sender_id);


-- ─── Step 15: Fix saved_views policies ──────────────────────

drop policy if exists "Users can view own saved views" on public.saved_views;
drop policy if exists "Users can insert own saved views" on public.saved_views;
drop policy if exists "Users can delete own saved views" on public.saved_views;

create policy "Users can view own saved views" on public.saved_views
    for select using (auth.uid() = user_id);
create policy "Users can insert own saved views" on public.saved_views
    for insert with check (auth.uid() = user_id);
create policy "Users can delete own saved views" on public.saved_views
    for delete using (auth.uid() = user_id);


-- ─── Step 16: Notifications (these are fine, no profiles reference) ─
-- Notifications policies don't reference profiles, so no recursion issue.
-- But let's ensure they exist.
drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "System can insert notifications" on public.notifications;

create policy "Users can view own notifications" on public.notifications
    for select using (auth.uid() = user_id);
create policy "Users can update own notifications" on public.notifications
    for update using (auth.uid() = user_id);
create policy "System can insert notifications" on public.notifications
    for insert with check (true);


-- ══════════════════════════════════════════════════════════════
-- DONE! All policies now use SECURITY DEFINER helper functions
-- instead of direct subqueries on profiles, eliminating the
-- infinite recursion.
-- ══════════════════════════════════════════════════════════════
