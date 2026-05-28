-- Company-level override for "Total Shares Owned by DV".
-- The Investment Details row normally derives from the latest follow-on
-- round's dv_total_shares (or the entry-round num_shares as a fallback).
-- This column lets the user override the derived value with an explicit
-- count — the override wins when set, NULL falls back to derivation.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS dv_total_shares BIGINT DEFAULT NULL;
