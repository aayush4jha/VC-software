-- No. of Shares (now repurposed as Total Ownership After Round %)
-- Originally added as a share count; the field has since been renamed in
-- the UI to "Total Ownership After Round (%)" and now stores a decimal
-- percentage like 2.22, so the column must be NUMERIC, not BIGINT.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS no_of_shares NUMERIC DEFAULT NULL;

ALTER TABLE public.portfolio_follow_ons
ADD COLUMN IF NOT EXISTS no_of_shares NUMERIC DEFAULT NULL;

-- If an earlier version of this migration already ran with BIGINT, widen
-- the column type in place. Existing whole-number values are preserved.
ALTER TABLE public.companies
ALTER COLUMN no_of_shares TYPE NUMERIC USING no_of_shares::numeric;

ALTER TABLE public.portfolio_follow_ons
ALTER COLUMN no_of_shares TYPE NUMERIC USING no_of_shares::numeric;
