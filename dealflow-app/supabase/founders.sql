-- Multiple Founders
-- Stores name + email pairs as a JSONB array so a portfolio company can
-- carry more than one founder. The legacy founder_name / founder_email
-- columns are still populated with the first entry for backward compat.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS founders JSONB DEFAULT '[]'::jsonb;
