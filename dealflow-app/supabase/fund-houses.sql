-- The Fund House page: funds we track, one row each — Fund, House, Fund
-- Manager, Stage, Size, Commitment.
--
-- Size and Commitment are kept as written ("₹500 Cr", "$10M") rather than as
-- numbers, because the team writes them in whatever unit the fund quotes.
--
-- Reached only through /api/fund-houses with the service-role key, after the
-- caller is checked as a member; RLS is on with no policies, as for notes.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.fund_houses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    fund             TEXT NOT NULL DEFAULT '',
    house            TEXT NOT NULL DEFAULT '',
    fund_manager     TEXT NOT NULL DEFAULT '',
    stage            TEXT NOT NULL DEFAULT '',
    size             TEXT NOT NULL DEFAULT '',
    commitment       TEXT NOT NULL DEFAULT '',
    created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_houses_org_idx ON public.fund_houses (organization_id, created_at);

ALTER TABLE public.fund_houses ENABLE ROW LEVEL SECURITY;
