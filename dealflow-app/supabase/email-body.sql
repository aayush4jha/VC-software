-- Keep the text of every ingested email.
--
-- ingested_emails recorded who sent it, the subject and the attachment names,
-- but not what it said. The first email's text went into the company's quick
-- summary; every follow-up after that existed only in Gmail, so the company's
-- own page could not show the conversation.
--
-- body_text is what the Emails tab reads. Rows ingested before this have none;
-- the tab fetches those from Gmail on demand and fills the column in, so the
-- history backfills itself as it is read.

ALTER TABLE public.ingested_emails
ADD COLUMN IF NOT EXISTS body_text TEXT,
ADD COLUMN IF NOT EXISTS snippet TEXT;
