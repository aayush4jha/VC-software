-- Portfolio extras: share price, share count, pre/post-money breakdown,
-- and ownership sought on follow-on rounds.
-- Safe to re-run.

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS share_price NUMERIC(18,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS num_shares BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_pre_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_post_money_valuation BIGINT DEFAULT NULL;

ALTER TABLE portfolio_follow_ons
ADD COLUMN IF NOT EXISTS share_price NUMERIC(18,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS num_shares BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pre_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ownership_sought NUMERIC(10,4) DEFAULT NULL;
