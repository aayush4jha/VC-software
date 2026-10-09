-- The two tables appended to legal-fund-master.sql after it was first run.
--
-- Running the whole master file again is safe and does the same thing; this
-- file exists only so the two newest tables can be added without scrolling
-- past four hundred lines that are already applied.
--
-- Settings / Mapping, from 04_Developer Summary: "entity, bank, category and
-- FY mapping rules". Without it every misclassified transaction is a code
-- change — the built-in patterns read an Indian bank narration well enough,
-- but no fixed list survives a new bank, a new counterparty or a new expense
-- head. A rule here beats the built-ins, so the person who can see the
-- mistake is the person who can fix it.

CREATE TABLE IF NOT EXISTS public.fund_mapping_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    kind             TEXT NOT NULL DEFAULT 'category'
                     CHECK (kind IN ('category', 'entity_alias', 'bank_alias')),
    field            TEXT NOT NULL DEFAULT 'description'
                     CHECK (field IN ('description', 'major_head', 'entity', 'bank')),
    match_text       TEXT NOT NULL,
    category         TEXT,
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

-- One row: the defaults the Fund page opens with.
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
