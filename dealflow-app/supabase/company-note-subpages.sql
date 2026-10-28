-- Pages beneath a company's Notes window — Brief, Detailed Note, and any more
-- the team creates — each of which can be renamed or deleted.
--
-- This table is the list: one row per page, with its title and place in the
-- list. The page's text stays in company_note_pages, under kind = the row's
-- key. Brief and Detailed keep the keys 'brief' and 'detailed', so what has
-- already been written in them stays where it is; a new page's key is its id.
--
-- A company gets its Brief and Detailed rows the first time its notes are
-- opened. A deleted page keeps its row, marked deleted_at, so that a company
-- whose Brief was deleted on purpose does not get it back the next time.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.company_note_subpages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    key              TEXT NOT NULL,
    title            TEXT NOT NULL,
    position         INTEGER NOT NULL DEFAULT 0,
    created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    UNIQUE (company_id, key)
);

-- Pages are no longer only notes / brief / detailed.
ALTER TABLE public.company_note_pages DROP CONSTRAINT IF EXISTS company_note_pages_kind_check;

ALTER TABLE public.company_note_subpages ENABLE ROW LEVEL SECURITY;
