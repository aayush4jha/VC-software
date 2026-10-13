-- The bookkeeper's own columns, kept on every transaction.
--
-- Her statements carry a MAJOR HEAD saying what the money is and a DASHBOARD
-- HEAD saying what it is for, plus the account name she files it against and
-- the financial year she assigns it. The platform classifies from those heads,
-- but it must also be able to show them back: "every statement whose Major
-- Head relates to Investments" is a question only her own words can answer,
-- and a category of ours is a summary of them, not a substitute.
--
-- Safe to run more than once.

ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS dashboard_head TEXT NOT NULL DEFAULT '';
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS ac_name        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.fund_transactions ADD COLUMN IF NOT EXISTS financial_year TEXT NOT NULL DEFAULT '';

-- The investment view filters on the head, so it is worth an index.
CREATE INDEX IF NOT EXISTS fund_transactions_major_head_idx
    ON public.fund_transactions (organization_id, major_head);
