-- Editable list of investment vehicles.
--
-- companies.investment_vehicle and portfolio_follow_ons.investment_vehicle
-- store the vehicle NAME as text, not a foreign key. This table is only the
-- registry that populates the dropdown, so adding, renaming or removing an
-- entry never orphans an investment that already records it.
--
-- Seeded with the fixed vehicles; anything else is added from the UI.

CREATE TABLE IF NOT EXISTS public.investment_vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

ALTER TABLE public.investment_vehicles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.investment_vehicles (organization_id, name)
SELECT '00000000-0000-0000-0000-000000000001', v
FROM (VALUES ('Dravya Personal'), ('DVPL'), ('DVFZ LLC'), ('DV DMCC'), ('Syndicate')) AS t(v)
ON CONFLICT (organization_id, name) DO NOTHING;
