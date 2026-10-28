-- Keeps the file behind every Fund upload, so the Upload history on the Fund
-- page can open the exact workbook that produced the numbers.
--
-- fund_imports already records each upload (name, counts, who); this adds
-- where the file itself is kept — in the private company-documents bucket,
-- under fund/imports/ — and the uploader's name as it was at the time.
-- Uploads made before this ran have no file kept; they are still listed.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

ALTER TABLE public.fund_imports ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.fund_imports ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.fund_imports ADD COLUMN IF NOT EXISTS imported_by_name TEXT;
