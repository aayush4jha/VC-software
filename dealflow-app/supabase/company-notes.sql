-- Company Notes — a dated, multi-entry notes timeline per company.
--
-- Replaces the single free-text `companies.notes` blob for the Portfolio
-- detail view. Each row is one note with its own business date (note_date,
-- user-editable — a note written today can be dated to last week's board
-- meeting), so the timeline sorts newest-first on the date the note is
-- *about*, not the day it was typed.
--
-- The legacy `companies.notes` text is absorbed into this table the first
-- time a company's notes pane is opened (see CompanyNotesPanel), so no
-- backfill is needed here.

CREATE TABLE IF NOT EXISTS company_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    organization_id UUID,
    -- Author is denormalised: author_name survives the profile being deleted,
    -- which matters for an audit-style log.
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT '',
    note_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    content TEXT NOT NULL DEFAULT '',
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The pane always queries by company and sorts newest-first.
CREATE INDEX IF NOT EXISTS idx_company_notes_company_date
    ON company_notes(company_id, note_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_notes_author ON company_notes(author_id);

ALTER TABLE company_notes ENABLE ROW LEVEL SECURITY;

-- All access runs through /api/db with the service-role key, which already
-- validates the caller's JWT — same posture as company_feedback.
DROP POLICY IF EXISTS "Service role full access on company_notes" ON company_notes;
CREATE POLICY "Service role full access on company_notes"
    ON company_notes FOR ALL USING (true) WITH CHECK (true);
