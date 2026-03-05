-- Email Ingestion Feature Migration
-- Adds support for auto-creating companies from inbound emails

-- 1. Add needs_review and ingestion_source columns to companies
alter table public.companies add column if not exists needs_review boolean default false;
alter table public.companies add column if not exists ingestion_source text;

-- 2. Create ingested_emails table for deduplication and audit trail
create table if not exists public.ingested_emails (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    gmail_message_id text not null,
    gmail_thread_id text,
    sender_name text not null default '',
    sender_email text not null,
    subject text not null default '',
    received_at timestamptz,
    has_attachments boolean default false,
    attachment_names text[] default '{}',
    company_id uuid references public.companies(id) on delete set null,
    status text not null default 'processed' check (status in ('processed', 'skipped', 'error')),
    error_message text,
    created_at timestamptz default now(),

    unique(organization_id, gmail_message_id)
);

alter table public.ingested_emails enable row level security;

-- RLS: org members can view
create policy "Org members can view ingested emails"
    on public.ingested_emails for select
    using (organization_id in (
        select organization_id from public.profiles where id = auth.uid()
    ));

-- RLS: authenticated users can insert (server-side via service role mostly)
create policy "Authenticated users can insert ingested emails"
    on public.ingested_emails for insert
    with check (true);

-- Indexes
create index if not exists idx_ingested_emails_gmail_id on public.ingested_emails(gmail_message_id);
create index if not exists idx_ingested_emails_org on public.ingested_emails(organization_id);
create index if not exists idx_companies_needs_review on public.companies(needs_review) where needs_review = true;
