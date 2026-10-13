-- Making the imported pages editable.
--
-- The Fund and Legal pages mirror spreadsheets, so "editable" has a trap in
-- it: an edit that the next upload silently overwrites is worse than no edit
-- at all, because the number changes back without anybody noticing.
--
-- So an edited row is marked, and the importer refreshes everything EXCEPT the
-- rows somebody has corrected by hand. The file stays the source for anything
-- untouched; a correction stays a correction until it is reverted.
--
-- Safe to run more than once.

-- A transaction somebody has corrected: category, entity, amount, anything.
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS edited      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS edited_at   TIMESTAMPTZ;
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS edited_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- What the file said before the correction, so it can be put back.
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS original    JSONB;

-- The same for the portfolio rows behind the yearly table.
ALTER TABLE public.fund_portfolio_rows ADD COLUMN IF NOT EXISTS edited    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.fund_portfolio_rows ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.fund_portfolio_rows ADD COLUMN IF NOT EXISTS original  JSONB;

-- Hand-set figures on the yearly table, keyed by year and column. Kept apart
-- from the rows because they override a TOTAL, not any one transaction.
CREATE TABLE IF NOT EXISTS public.fund_year_overrides (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    financial_year   TEXT NOT NULL,
    field            TEXT NOT NULL,
    value            NUMERIC,
    note             TEXT NOT NULL DEFAULT '',
    updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, financial_year, field)
);

-- Cell edits on an uploaded SHA grid, so a correction survives a re-upload of
-- the same sheet. Keyed by right and column, which is how the grid is read.
ALTER TABLE public.company_sha_grids ADD COLUMN IF NOT EXISTS overrides JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.fund_year_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fund_year_overrides_members_read ON public.fund_year_overrides;
CREATE POLICY fund_year_overrides_members_read ON public.fund_year_overrides
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.organization_id = fund_year_overrides.organization_id)
    );
