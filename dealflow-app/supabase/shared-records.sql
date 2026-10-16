-- The fund tracker and the per-company legal record used to live in each
-- person's browser (localStorage keys dholakia.fund.v1 and dholakia.legal.v1).
-- That meant every colleague opened the Fund and Legal pages and saw an empty
-- default: the numbers only ever existed in the browser that typed them.
--
-- These two tables move both records to the firm, where they belong. The shape
-- stays exactly as the TypeScript defines it, stored as JSONB, so nothing had
-- to be re-modelled column by column to stop the data being private.

-- One row for the whole firm.
CREATE TABLE IF NOT EXISTS public.fund_records (
    organization_id  UUID PRIMARY KEY,
    payload          JSONB NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by       UUID
);

-- One row per company.
CREATE TABLE IF NOT EXISTS public.legal_records (
    organization_id  UUID NOT NULL,
    company_id       TEXT NOT NULL,
    payload          JSONB NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by       UUID,
    PRIMARY KEY (organization_id, company_id)
);

CREATE INDEX IF NOT EXISTS legal_records_org_idx ON public.legal_records (organization_id);

-- Both are reached only through API routes using the service role, which
-- authenticate the caller themselves. No direct client access.
ALTER TABLE public.fund_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_records ENABLE ROW LEVEL SECURITY;
