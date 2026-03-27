-- Add deck_email_link column to companies table
-- Stores the direct Gmail link to the email where the startup sent their pitch deck
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deck_email_link TEXT DEFAULT NULL;
