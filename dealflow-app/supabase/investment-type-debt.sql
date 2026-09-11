-- Debt joins Primary / Secondary as an investment type.
--
-- companies.share_type holds the entry round's type and is constrained by a
-- CHECK, so widening the vocabulary needs the constraint rebuilt. The name is
-- the one Postgres generated for the inline CHECK in schema.sql; IF EXISTS
-- keeps this rerunnable and covers a database where it was never created.
--
-- portfolio_follow_ons.investment_type is plain TEXT with no CHECK (see
-- investment-vehicle.sql), so follow-on rounds accept 'Debt' as-is.

ALTER TABLE public.companies
DROP CONSTRAINT IF EXISTS companies_share_type_check;

ALTER TABLE public.companies
ADD CONSTRAINT companies_share_type_check
CHECK (share_type IN ('Primary', 'Secondary', 'Debt'));
