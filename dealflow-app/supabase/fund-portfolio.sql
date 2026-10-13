-- The investment and exit sheets, as rows.
--
-- Sheet1 of the requirements is a yearly table — Direct, Fund, Syndicate,
-- Total, Exits, Writeoffs, Net, Cumulative, Profit/Loss, Market Value, NAV —
-- and every column of it is derived from two sheets the firm already keeps.
-- Storing the rows rather than the totals means the table is a view of them:
-- a figure can be drilled into, and a corrected sheet re-uploaded without
-- anybody recomputing anything by hand.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.fund_portfolio_rows (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    kind             TEXT NOT NULL CHECK (kind IN ('investment', 'exit')),
    financial_year   TEXT NOT NULL DEFAULT '',
    -- Direct / Fund / Syndicate / Other, the split the summary is built on.
    fund_type        TEXT NOT NULL DEFAULT '',
    invested_from    TEXT NOT NULL DEFAULT '',
    company          TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT '',
    stage            TEXT NOT NULL DEFAULT '',
    invested_on      DATE,
    amount           NUMERIC NOT NULL DEFAULT 0,
    -- Exits only: what came back, and when.
    sold_on          DATE,
    consideration    NUMERIC,
    exit_kind        TEXT,
    -- Investments only.
    current_value    NUMERIC,
    post_money       NUMERIC,
    equity_pct       NUMERIC,
    multiple         NUMERIC,
    writeoff_year    TEXT NOT NULL DEFAULT '',
    source_file      TEXT NOT NULL DEFAULT '',
    source_sheet     TEXT NOT NULL DEFAULT '',
    source_row       INTEGER,
    -- The same sheet uploaded twice must not double the portfolio.
    import_key       TEXT,
    imported_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, import_key)
);

CREATE INDEX IF NOT EXISTS fund_portfolio_rows_year_idx
    ON public.fund_portfolio_rows (organization_id, kind, financial_year);

ALTER TABLE public.fund_portfolio_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fund_portfolio_rows_members_read ON public.fund_portfolio_rows;
CREATE POLICY fund_portfolio_rows_members_read ON public.fund_portfolio_rows
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.organization_id = fund_portfolio_rows.organization_id)
    );
