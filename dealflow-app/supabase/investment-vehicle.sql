-- Per-investment vehicle and type.
--
-- Both are recorded per investment rather than per company: the entry round
-- and each follow-on can come from a different vehicle and be a different
-- type, and reporting needs to know which entity holds what.
--
-- investment_vehicle: Dravya Personal / DVPL / DVFZ LLC / DV DMCC / Syndicate.
--   'Syndicate' carries a free-text name in syndicate_name; the fixed
--   vehicles leave it null. TEXT rather than an enum so a new vehicle needs
--   no migration.
--
-- investment_type: Primary / Secondary. The entry round already stores this
--   in companies.share_type, so only the follow-on table gains the column.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS investment_vehicle TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS syndicate_name TEXT DEFAULT NULL;

ALTER TABLE public.portfolio_follow_ons
ADD COLUMN IF NOT EXISTS investment_vehicle TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS syndicate_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS investment_type TEXT DEFAULT NULL;

-- Current stage is normally derived from the latest follow-on round, which
-- leaves no way to state it directly when the cap table doesn't tell the whole
-- story. This column overrides the derivation; clearing it restores it.
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT NULL;
