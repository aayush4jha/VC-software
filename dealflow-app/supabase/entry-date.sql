-- Dedicated Entry Date for portfolio companies.
-- Separates the business event (when DV entered the cap table) from
-- created_at, which goes back to being a pure row-insertion audit
-- timestamp. The IRR engine and Entry Date row in the detail panel
-- read this column with createdAt as a fallback for legacy rows.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS entry_date DATE DEFAULT NULL;
