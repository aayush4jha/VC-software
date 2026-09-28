-- Funds we invest IN, as an LP.
--
-- Not the Fund tracker, which is our own entities' bank balances and expenses.
-- This is a commitment to somebody else's fund: what we promised, how it gets
-- drawn down, and what the fund says it is worth over time.
--
-- Drawdowns are generated from the terms when the commitment is recorded — a
-- down payment on the start date, then the installments at the chosen interval
-- (or on given dates, when Custom). Each is marked paid as the capital call is
-- met, so "drawn" is what actually went out, not what was promised.

CREATE TABLE IF NOT EXISTS public.fund_investments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,
    fund_name          TEXT NOT NULL,
    contribution_type  TEXT NOT NULL CHECK (contribution_type IN ('Monthly', 'Quarterly', 'Annually', 'Custom')),
    start_date         DATE NOT NULL,
    commitment         NUMERIC(18, 2) NOT NULL CHECK (commitment > 0),
    down_payment       NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
    installments       INTEGER NOT NULL DEFAULT 0 CHECK (installments >= 0),
    -- What the fund was worth when we went in, so there is a baseline before
    -- the first NAV is reported.
    nav_at_investment  NUMERIC(18, 2),
    investment_entity  TEXT,          -- which of our entities the money came from
    status             TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Exited', 'Closed')),
    notes              TEXT NOT NULL DEFAULT '',
    owner_user_id      UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fund_drawdowns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    fund_investment_id  UUID NOT NULL REFERENCES public.fund_investments(id) ON DELETE CASCADE,
    -- 0 is the down payment; 1..n are the installments.
    sequence            INTEGER NOT NULL CHECK (sequence >= 0),
    due_date            DATE NOT NULL,
    amount              NUMERIC(18, 2) NOT NULL,
    is_down_payment     BOOLEAN NOT NULL DEFAULT false,
    status              TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid')),
    paid_on             DATE,
    amount_paid         NUMERIC(18, 2),
    notes               TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fund_investment_id, sequence)
);

CREATE INDEX IF NOT EXISTS fund_drawdowns_investment_idx ON public.fund_drawdowns (fund_investment_id, sequence);

-- NAV as the fund reports it, one row per report.
CREATE TABLE IF NOT EXISTS public.fund_nav_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    fund_investment_id  UUID NOT NULL REFERENCES public.fund_investments(id) ON DELETE CASCADE,
    as_of_date          DATE NOT NULL,
    nav                 NUMERIC(18, 2) NOT NULL,
    notes               TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One NAV per date: a corrected figure replaces the earlier one rather
    -- than sitting beside it.
    UNIQUE (fund_investment_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS fund_nav_entries_investment_idx ON public.fund_nav_entries (fund_investment_id, as_of_date DESC);

ALTER TABLE public.fund_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_drawdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_nav_entries ENABLE ROW LEVEL SECURITY;
