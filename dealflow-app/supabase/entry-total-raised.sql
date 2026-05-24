-- Entry-round Total Raised
-- Captures the total round size at the time we entered the cap table,
-- mirroring the existing follow_on_rounds.total_raised column. Used by the
-- "Add Portfolio Company" form so the entry round and follow-on rounds
-- track the same data points.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS entry_total_raised BIGINT DEFAULT NULL;
