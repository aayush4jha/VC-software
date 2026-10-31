-- The Fund House table's own columns, on the funds kept in companies
-- (board = 'fund_house'): House, Stage, Size and Commitment. Fund is the
-- company's name and Fund Manager its founder, so each fund has the same
-- Notes as a Deal Flow company.
--
-- Stage, Size and Commitment are kept as written ("Evaluating", "₹500 Cr",
-- "$10M") rather than as numbers, because the team writes them in whatever
-- unit the fund quotes.
--
-- Also copies in any fund still in the old fund_houses table, keeping its id,
-- so running this twice copies nothing twice.
--
-- Run this in the Supabase SQL Editor, after company-board.sql. Safe to run
-- more than once.

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS fund_house_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS fund_stage      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS fund_size       TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS fund_commitment TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
    IF to_regclass('public.fund_houses') IS NOT NULL THEN
        INSERT INTO public.companies (
            id, organization_id, company_name, founder_name, board,
            fund_house_name, fund_stage, fund_size, fund_commitment, created_at, updated_at
        )
        SELECT f.id, f.organization_id, COALESCE(NULLIF(f.fund, ''), f.house), f.fund_manager, 'fund_house',
               f.house, f.stage, f.size, f.commitment, f.created_at, f.updated_at
        FROM public.fund_houses f
        WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = f.id);
    END IF;
END $$;
