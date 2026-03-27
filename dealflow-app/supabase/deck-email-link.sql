-- Add deck_email_link column to companies table
-- Stores the direct Gmail link to the email where the startup sent their pitch deck
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deck_email_link TEXT DEFAULT NULL;

-- Backfill: set deck_email_link for existing companies that were ingested from email
-- Uses the gmail_message_id from ingested_emails to construct the Gmail link
UPDATE companies c
SET deck_email_link = 'https://mail.google.com/mail/u/0/#inbox/' || ie.gmail_message_id
FROM ingested_emails ie
WHERE ie.company_id = c.id
  AND ie.status = 'processed'
  AND ie.gmail_message_id IS NOT NULL
  AND c.deck_email_link IS NULL;
