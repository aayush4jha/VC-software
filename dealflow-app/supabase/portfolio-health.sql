-- Portfolio Health
-- Investment-team's outlook on the company: Bullish / Base / Bearish.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS portfolio_health TEXT DEFAULT NULL;
