-- Investment instrument: what the money bought.
--
-- Distinct from investment type (Primary / Secondary / Debt), which says how
-- the stake was acquired — a Primary investment can be issued as CCPS or as
-- Common Equity, so the two are recorded separately.
--
-- Like investment_vehicles, the column stores the instrument NAME as text
-- rather than a foreign key, and this table is only the registry that fills the
-- dropdown. Adding, renaming or removing an entry can therefore never orphan an
-- investment that already records it.

CREATE TABLE IF NOT EXISTS public.investment_instruments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

ALTER TABLE public.investment_instruments ENABLE ROW LEVEL SECURITY;

INSERT INTO public.investment_instruments (organization_id, name)
SELECT '00000000-0000-0000-0000-000000000001', v
FROM (VALUES ('CCPS'), ('CCD'), ('Debt'), ('Common Equity')) AS t(v)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Recorded per investment: the entry round on the company, each follow-on on
-- its own row, since a later round can be a different instrument.
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS investment_instrument TEXT DEFAULT NULL;

ALTER TABLE public.portfolio_follow_ons
ADD COLUMN IF NOT EXISTS investment_instrument TEXT DEFAULT NULL;
