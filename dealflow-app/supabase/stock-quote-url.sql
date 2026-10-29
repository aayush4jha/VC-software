-- Live share prices on the Portfolio page for listed companies.
--
-- The Google Finance quote link for a company — e.g.
-- https://www.google.com/finance/quote/SWIGGY:NSE — set from the Portfolio
-- page's "Listed holdings" panel. A company with a link shows its live price,
-- and our holding at that price.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stock_quote_url TEXT;

UPDATE public.companies SET stock_quote_url = 'https://www.google.com/finance/quote/SWIGGY:NSE'
WHERE id = 'debfc219-e7f0-4932-a69e-f234ff5ea4b4' AND stock_quote_url IS NULL;

UPDATE public.companies SET stock_quote_url = 'https://www.google.com/finance/quote/JARO:NSE'
WHERE id = 'f99f81ff-2a96-40e2-9c64-4d2d250ee1e8' AND stock_quote_url IS NULL;
