-- The SHA rights grid, stored as the spreadsheet lays it out.
--
-- The firm maintains one of these per company and will go on maintaining it:
-- the platform's job is to mirror it, not to become a second place where the
-- same facts are kept and drift apart. So the whole parsed sheet is stored —
-- rights, every column including ones nobody anticipated, cell colours, the
-- legend that explains them, and every block below the grid — rather than
-- only the parts that happen to fit the tracker's fields.
--
-- The structured tracker (investor_rights) is still written alongside, because
-- the KPI counts and the threshold alerts need columns they can count. The
-- grid is the record; the tracker is an index into it.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.company_sha_grids (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    -- The parsed sheet. JSONB because the shape is the sheet's, not ours: a
    -- new amendment column must not need a migration.
    grid             JSONB NOT NULL,
    sheet_name       TEXT NOT NULL DEFAULT '',
    file_name        TEXT NOT NULL DEFAULT '',
    rights_count     INTEGER NOT NULL DEFAULT 0,
    column_count     INTEGER NOT NULL DEFAULT 0,
    warnings         TEXT[] NOT NULL DEFAULT '{}',
    uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per upload, never overwritten: re-uploading a corrected sheet must
-- not erase what the previous one said, for the same reason the document
-- tracker keeps its history. The newest row is the current grid.
CREATE INDEX IF NOT EXISTS company_sha_grids_current_idx
    ON public.company_sha_grids (company_id, created_at DESC);

ALTER TABLE public.company_sha_grids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_sha_grids_members_read ON public.company_sha_grids;
CREATE POLICY company_sha_grids_members_read ON public.company_sha_grids
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.organization_id = company_sha_grids.organization_id)
    );
