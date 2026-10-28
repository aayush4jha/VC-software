-- Notion-style notes on every Deal Flow company: a Notes page, and two pages
-- beneath it, Brief and Detailed Note, plus a comment thread.
--
-- A page is stored as the editor's own JSON (Tiptap), so tables, images and
-- file attachments come back exactly as they were written. Images and files
-- live in the company-documents bucket under company/<id>/notes/; the JSON
-- only points at them.
--
-- One row per page, edited in place. updated_at is what the editor checks
-- before saving, so two people with the same page open cannot silently
-- overwrite each other: the second save is refused and offered the newer text.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.company_note_pages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL CHECK (kind IN ('notes', 'brief', 'detailed')),
    content          JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Kept as text too, so "last edited by" survives the profile being removed.
    updated_by_name  TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, kind)
);

CREATE TABLE IF NOT EXISTS public.company_note_comments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    author_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_name      TEXT NOT NULL DEFAULT '',
    body             TEXT NOT NULL DEFAULT '',
    -- [{ name, path, size, mimeType }] — files in the bucket, as uploaded.
    attachments      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_note_comments_company_idx
    ON public.company_note_comments (company_id, created_at);

-- Reached only through the API routes, with the service-role key, after they
-- have checked the caller is a member — the same posture as company_notes.
ALTER TABLE public.company_note_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_note_comments ENABLE ROW LEVEL SECURITY;
