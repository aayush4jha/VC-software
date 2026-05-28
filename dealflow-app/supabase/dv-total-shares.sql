-- Total shares owned by DV after each follow-on round.
-- Separate from num_shares (shares bought THIS round) and total_shares
-- (the company's total outstanding shares). This is the running cumulative
-- count of DV's holdings after the round closes.

ALTER TABLE public.portfolio_follow_ons
ADD COLUMN IF NOT EXISTS dv_total_shares BIGINT DEFAULT NULL;
