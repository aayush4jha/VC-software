-- Split the company HQ into city and state.
--
-- hq_location was one free-text box holding whatever was typed — a state for
-- some companies, a city for others — which made it useless to group or filter
-- by. It now holds the STATE, picked from a fixed list of states and Union
-- Territories, and hq_city holds the city, which stays free text because no
-- fixed list of Indian cities is worth maintaining.
--
-- Existing rows are left exactly as they are: a value that is already a state
-- keeps working, and anything else still displays as the current value rather
-- than reading blank. Nothing is guessed or rewritten.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS hq_city TEXT DEFAULT '';
