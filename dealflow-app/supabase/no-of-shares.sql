-- No. of Shares
-- Tracks the share count used to compute valuation = no_of_shares × share_price.
-- Captured on the entry round (companies) and on every follow-on round
-- (portfolio_follow_ons). The latest round's values drive latest-valuation
-- in the portfolio utils.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS no_of_shares BIGINT DEFAULT NULL;

ALTER TABLE public.portfolio_follow_ons
ADD COLUMN IF NOT EXISTS no_of_shares BIGINT DEFAULT NULL;
