-- Which Gmail account a deal arrived in. Each analyst and admin connects their
-- own Gmail, so the same pitch can land in different inboxes; this records the
-- connected address that brought the company onto the platform.
-- Run this in the Supabase SQL Editor.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS ingested_by_email TEXT DEFAULT NULL;
ALTER TABLE ingested_emails ADD COLUMN IF NOT EXISTS ingested_by_email TEXT DEFAULT NULL;

-- Backfill: companies created from email before this column existed. The
-- 'created' activity log names the person whose run created it; their login
-- email is the best record we have of the Gmail account it came through.
UPDATE companies c
SET ingested_by_email = p.email
FROM activity_logs a
JOIN profiles p ON p.id = a.user_id
WHERE a.company_id = c.id
  AND a.action = 'created'
  AND c.ingestion_source IN ('email', 'email-workspace')
  AND c.ingested_by_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_companies_ingested_by_email ON companies(ingested_by_email);
