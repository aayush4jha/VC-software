-- Keyword Filtering Migration
-- Adds relevance_label column to ingested_emails for tracking email classification

ALTER TABLE public.ingested_emails ADD COLUMN IF NOT EXISTS relevance_label text;
