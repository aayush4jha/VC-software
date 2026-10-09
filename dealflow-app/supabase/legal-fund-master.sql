-- Legal tracker and fund ledger.
--
-- Two requirements sheets land here:
--
--   02_Legal Page — a legal tracker ACROSS the portfolio: documents, investor
--   rights and open actions for every company at once. What exists today is a
--   per-company record in the browser's localStorage, which cannot be counted,
--   searched, alerted on or seen by a second person — none of the six KPI
--   cards on the sheet can be built from it.
--
--   01_Fund Page + 03_Data Mapping — one bank ledger behind every number on
--   the fund dashboard, so a figure is traceable to the transactions that
--   produced it and nobody re-types a transaction into a dashboard.
--
-- Paste this whole file into the Supabase SQL editor. It is safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────
-- LEGAL
-- ─────────────────────────────────────────────────────────────────────────

-- C. DOCUMENT TRACKER — one row per (company, document type).
CREATE TABLE IF NOT EXISTS public.legal_documents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- Matches a key in LEGAL_DOCUMENT_TYPES (src/lib/legal-tracker.ts).
    doc_type         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('received', 'pending', 'na')),
    doc_date         DATE,
    version          TEXT NOT NULL DEFAULT '',
    -- Either a link somewhere else, or a file in the company-documents bucket.
    link             TEXT NOT NULL DEFAULT '',
    storage_path     TEXT,
    remarks          TEXT NOT NULL DEFAULT '',
    updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, doc_type)
);

CREATE INDEX IF NOT EXISTS legal_documents_company_idx ON public.legal_documents (company_id);
CREATE INDEX IF NOT EXISTS legal_documents_status_idx  ON public.legal_documents (organization_id, status);

-- "Do not overwrite old versions of documents or rights; retain version/date
-- history." Every write to the two tables above appends here first, so the
-- tracker can be corrected without losing what it said before.
CREATE TABLE IF NOT EXISTS public.legal_document_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    doc_type         TEXT NOT NULL,
    status           TEXT NOT NULL,
    doc_date         DATE,
    version          TEXT NOT NULL DEFAULT '',
    link             TEXT NOT NULL DEFAULT '',
    storage_path     TEXT,
    remarks          TEXT NOT NULL DEFAULT '',
    changed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_document_history_idx
    ON public.legal_document_history (company_id, doc_type, changed_at DESC);

-- D. INVESTOR RIGHTS TRACKER — one row per (company, right).
CREATE TABLE IF NOT EXISTS public.investor_rights (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- Matches a key in INVESTOR_RIGHTS (src/lib/legal-tracker.ts).
    right_key        TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (status IN ('available', 'not_available', 'triggered', 'lost', 'unknown')),
    -- "Where rights depend on ownership thresholds, the system should
    -- calculate current eligibility from the cap table." This holds the
    -- threshold; eligibility is derived, never stored.
    threshold_pct    NUMERIC,
    condition_text   TEXT NOT NULL DEFAULT '',
    document_ref     TEXT NOT NULL DEFAULT '',
    next_action      TEXT NOT NULL DEFAULT '',
    updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, right_key)
);

CREATE INDEX IF NOT EXISTS investor_rights_company_idx ON public.investor_rights (company_id);
CREATE INDEX IF NOT EXISTS investor_rights_status_idx  ON public.investor_rights (organization_id, status);

CREATE TABLE IF NOT EXISTS public.investor_rights_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    right_key        TEXT NOT NULL,
    status           TEXT NOT NULL,
    threshold_pct    NUMERIC,
    condition_text   TEXT NOT NULL DEFAULT '',
    document_ref     TEXT NOT NULL DEFAULT '',
    next_action      TEXT NOT NULL DEFAULT '',
    changed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investor_rights_history_idx
    ON public.investor_rights_history (company_id, right_key, changed_at DESC);

-- E. LEGAL ACTION / DEADLINE TRACKER.
CREATE TABLE IF NOT EXISTS public.legal_actions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    -- Nullable: a compliance filing can belong to the firm, not a company.
    company_id       UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    action           TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'documentation'
                     CHECK (category IN ('documentation', 'compliance', 'transaction', 'dispute')),
    owner            TEXT NOT NULL DEFAULT '',
    priority         TEXT NOT NULL DEFAULT 'medium'
                     CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    due_date         DATE,
    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed', 'on_hold')),
    notes            TEXT NOT NULL DEFAULT '',
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_actions_open_idx
    ON public.legal_actions (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS legal_actions_company_idx ON public.legal_actions (company_id);

-- B. PORTFOLIO LEGAL MASTER — the two statuses the sheet asks for that the
-- portfolio does not have. Everything else on that table already lives on
-- companies, and is read from there rather than copied, so a company cannot
-- say one thing on the Legal page and another on the Portfolio page.
DO $$
BEGIN
    ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_portfolio_status_check;
    ALTER TABLE public.companies ADD CONSTRAINT companies_portfolio_status_check
        CHECK (portfolio_status IS NULL OR portfolio_status IN (
            'Active', 'Exited', 'Written Off', 'Ongoing Exit', 'Potential Write-off'
        ));
EXCEPTION WHEN others THEN
    RAISE NOTICE 'portfolio_status check not replaced: %', SQLERRM;
END $$;

-- The sheet's "Lead / Key Investor" column. Nothing else records it.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS lead_investor TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- FUND
-- ─────────────────────────────────────────────────────────────────────────

-- B. BANK & ENTITY BALANCE. One row per account we hold.
CREATE TABLE IF NOT EXISTS public.fund_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    entity           TEXT NOT NULL,
    country          TEXT NOT NULL DEFAULT 'India',
    bank             TEXT NOT NULL DEFAULT '',
    account_label    TEXT NOT NULL DEFAULT '',
    currency         TEXT NOT NULL DEFAULT 'INR',
    opening_balance  NUMERIC NOT NULL DEFAULT 0,
    -- The balance the bank itself last stated, and when. A closing balance is
    -- shown from this rather than from the sum of our rows, so an import that
    -- missed a transaction shows up as a discrepancy instead of disappearing.
    stated_balance   NUMERIC,
    stated_as_of     DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, entity, bank, account_label)
);

-- 03_DATA MAPPING — every bank line, normalised. One ledger behind the page.
CREATE TABLE IF NOT EXISTS public.fund_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    account_id       UUID REFERENCES public.fund_accounts(id) ON DELETE CASCADE,
    entity           TEXT NOT NULL DEFAULT '',
    bank             TEXT NOT NULL DEFAULT '',
    txn_date         DATE,
    description      TEXT NOT NULL DEFAULT '',
    -- Signed, in the account's own currency: negative is money leaving.
    amount           NUMERIC NOT NULL DEFAULT 0,
    currency         TEXT NOT NULL DEFAULT 'INR',
    -- "Retain AED and INR values": the rate used, and the INR figure every
    -- consolidated total is built from.
    fx_rate          NUMERIC,
    amount_inr       NUMERIC,
    balance_after    NUMERIC,
    -- The normalised category from sheet 03.
    category         TEXT NOT NULL DEFAULT 'unclassified'
                     CHECK (category IN (
                        'funds_received', 'exit_proceeds', 'other_income',
                        'investment', 'investment_expense', 'office_expense',
                        'internal_transfer', 'adjustment', 'unclassified'
                     )),
    -- Why it was classified that way, so a wrong total can be traced.
    category_source  TEXT NOT NULL DEFAULT 'rule',
    major_head       TEXT NOT NULL DEFAULT '',
    counterparty     TEXT NOT NULL DEFAULT '',
    company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    -- "Flag missing entity, bank, account, date, currency, category or amount
    -- instead of silently excluding the transaction."
    data_issues      TEXT[] NOT NULL DEFAULT '{}',
    source_file      TEXT NOT NULL DEFAULT '',
    source_sheet     TEXT NOT NULL DEFAULT '',
    source_row       INTEGER,
    -- Identical rows in one upload are real (two ₹500 charges in a day); the
    -- same row uploaded twice is not. This is the file-and-row fingerprint.
    import_key       TEXT,
    imported_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, import_key)
);

CREATE INDEX IF NOT EXISTS fund_transactions_date_idx
    ON public.fund_transactions (organization_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS fund_transactions_category_idx
    ON public.fund_transactions (organization_id, category, txn_date);
CREATE INDEX IF NOT EXISTS fund_transactions_account_idx
    ON public.fund_transactions (account_id, txn_date);

-- "Provide a controlled adjustment table with date, entity, category, amount,
-- reason, approved by and remarks." Kept apart from the ledger so the Actual
-- and Adjusted views are the same data with one set of rows added.
CREATE TABLE IF NOT EXISTS public.fund_adjustments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    adj_date         DATE NOT NULL,
    entity           TEXT NOT NULL DEFAULT '',
    category         TEXT NOT NULL DEFAULT 'adjustment',
    amount           NUMERIC NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'INR',
    amount_inr       NUMERIC,
    reason           TEXT NOT NULL,
    approved_by      TEXT NOT NULL DEFAULT '',
    remarks          TEXT NOT NULL DEFAULT '',
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_adjustments_date_idx
    ON public.fund_adjustments (organization_id, adj_date DESC);

-- One row per upload, so "audit trail: every dashboard number should be
-- traceable to source transaction(s)" reaches back to the file as well.
CREATE TABLE IF NOT EXISTS public.fund_imports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    file_name        TEXT NOT NULL,
    sheet_summary    JSONB NOT NULL DEFAULT '{}',
    rows_imported    INTEGER NOT NULL DEFAULT 0,
    rows_skipped     INTEGER NOT NULL DEFAULT 0,
    rows_flagged     INTEGER NOT NULL DEFAULT 0,
    imported_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Reads and writes go through API routes on the service role, which authorise
-- per request. RLS is on so that a leaked anon key cannot read any of it.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.legal_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_rights          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_rights_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_actions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_adjustments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_imports             ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'legal_documents', 'legal_document_history', 'investor_rights',
        'investor_rights_history', 'legal_actions', 'fund_accounts',
        'fund_transactions', 'fund_adjustments', 'fund_imports'
    ] LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I', t || '_members_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
                 EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.id = auth.uid()
                           AND p.organization_id = %I.organization_id)
             )', t || '_members_read', t, t);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- SETTINGS / MAPPING
--
-- 04_Developer Summary suggests a Settings page for "entity, bank, category
-- and FY mapping rules". Without it, every misclassified transaction is a
-- code change: the built-in rules read an Indian bank narration well enough,
-- but no fixed list of patterns survives contact with a new bank, a new
-- counterparty or a new expense head. A rule here beats the built-ins, so the
-- person who can see the mistake is the person who can fix it.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fund_mapping_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    kind             TEXT NOT NULL DEFAULT 'category'
                     CHECK (kind IN ('category', 'entity_alias', 'bank_alias')),
    -- Which column to look in, and what to look for (case-insensitive substring).
    field            TEXT NOT NULL DEFAULT 'description'
                     CHECK (field IN ('description', 'major_head', 'entity', 'bank')),
    match_text       TEXT NOT NULL,
    -- For kind='category': the category to assign.
    category         TEXT,
    -- For the alias kinds: the canonical name to map onto.
    maps_to          TEXT,
    -- Lower runs first, so a specific rule can be put ahead of a general one.
    priority         INTEGER NOT NULL DEFAULT 100,
    active           BOOLEAN NOT NULL DEFAULT true,
    note             TEXT NOT NULL DEFAULT '',
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_mapping_rules_idx
    ON public.fund_mapping_rules (organization_id, active, priority);

-- One row. The defaults the Fund page opens with.
CREATE TABLE IF NOT EXISTS public.fund_settings (
    organization_id  UUID PRIMARY KEY,
    fy_start         TEXT NOT NULL DEFAULT 'april' CHECK (fy_start IN ('april', 'november')),
    -- Used only where a UAE statement carries no INR column of its own.
    default_fx_rate  NUMERIC,
    updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fund_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_settings      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['fund_mapping_rules', 'fund_settings'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_members_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
                 EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.id = auth.uid()
                           AND p.organization_id = %I.organization_id)
             )', t || '_members_read', t, t);
    END LOOP;
END $$;
