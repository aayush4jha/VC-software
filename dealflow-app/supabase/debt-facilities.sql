-- Debt investments: the loan terms, and one row per repayment term.
--
-- A facility holds the terms (amount, rate, tenure, how often payments fall
-- due, and whether each term pays interest only or an EMI). Payments are NOT
-- all created up front: the first term is created with the facility, and
-- marking a term received creates the next one. That keeps the table a record
-- of what has actually happened plus the one thing currently owed, which is
-- what reminders are sent for.
--
-- unique (facility_id, term_number) makes "create the next term" idempotent: a
-- double-click, or two people marking the same term received at once, cannot
-- produce two copies of term 4.

CREATE TABLE IF NOT EXISTS public.debt_facilities (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL,
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    principal             NUMERIC(18, 2) NOT NULL CHECK (principal > 0),
    annual_rate           NUMERIC(7, 4)  NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 100),
    tenure_months         INTEGER NOT NULL CHECK (tenure_months > 0),
    frequency             TEXT NOT NULL CHECK (frequency IN ('Monthly', 'Quarterly', 'Half-yearly', 'Annually')),
    repayment_type        TEXT NOT NULL CHECK (repayment_type IN ('interest_only_bullet', 'emi')),
    start_date            DATE NOT NULL,
    borrower_email        TEXT,
    reminders_enabled     BOOLEAN NOT NULL DEFAULT true,
    reminder_days_before  INTEGER NOT NULL DEFAULT 7 CHECK (reminder_days_before BETWEEN 0 AND 60),
    -- Whose Gmail sends the reminders: the person who set the facility up.
    owner_user_id         UUID,
    status                TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed')),
    notes                 TEXT NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debt_facilities_company_idx ON public.debt_facilities (company_id);

CREATE TABLE IF NOT EXISTS public.debt_payments (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           UUID NOT NULL,
    facility_id               UUID NOT NULL REFERENCES public.debt_facilities(id) ON DELETE CASCADE,
    company_id                UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    term_number               INTEGER NOT NULL CHECK (term_number > 0),
    due_date                  DATE NOT NULL,
    interest_due              NUMERIC(18, 2) NOT NULL DEFAULT 0,
    principal_due             NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_due                 NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status                    TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Received')),
    received_on               DATE,
    amount_received           NUMERIC(18, 2),
    notes                     TEXT NOT NULL DEFAULT '',
    -- Reminder bookkeeping, so the daily run sends each reminder once.
    reminder_before_sent_at   TIMESTAMPTZ,
    reminder_due_sent_at      TIMESTAMPTZ,
    last_overdue_reminder_at  TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (facility_id, term_number)
);

CREATE INDEX IF NOT EXISTS debt_payments_pending_idx ON public.debt_payments (status, due_date);
CREATE INDEX IF NOT EXISTS debt_payments_company_idx ON public.debt_payments (company_id);

-- Only the service-role API touches these; no client policies.
ALTER TABLE public.debt_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
