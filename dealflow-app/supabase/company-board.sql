-- The Fund House page: funds the team tracks, kept as companies so they get
-- the same card, detail panel, notes, documents and emails as a Deal Flow deal.
--
-- `board` says which page a company sits on: 'dealflow' (every existing
-- company) or 'fund_house'. Funds stay off Deal Flow, the Dashboard, Analytics
-- and the rest — until one is moved to Portfolio, when it joins the Portfolio
-- as a deal would.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS board TEXT NOT NULL DEFAULT 'dealflow'
    CHECK (board IN ('dealflow', 'fund_house'));
