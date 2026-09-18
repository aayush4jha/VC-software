-- Personal pitch-deck reports.
--
-- Everyone who connects their own Gmail gets a report of the companies that
-- sent them a pitch deck or an investment email — on demand in the Email
-- Workspace, and each morning by email. This is PER PERSON: each row belongs
-- to the user whose inbox it came from, and one user's report never reads
-- another's rows.
--
-- inbox_pitch_emails caches every message the scan has LOOKED AT — is_pitch
-- says whether it made the report. Keeping the rejects too is what stops a
-- 30-day report re-downloading the same 30 days of newsletters every time it
-- is opened; the daily email then only reads what is new since yesterday.

CREATE TABLE IF NOT EXISTS public.inbox_pitch_emails (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gmail_message_id    TEXT NOT NULL,
    gmail_thread_id     TEXT,
    sender_name         TEXT NOT NULL DEFAULT '',
    sender_email        TEXT NOT NULL DEFAULT '',
    subject             TEXT NOT NULL DEFAULT '',
    snippet             TEXT NOT NULL DEFAULT '',
    received_at         TIMESTAMPTZ,
    company_name        TEXT NOT NULL DEFAULT '',
    attachment_names    TEXT[] NOT NULL DEFAULT '{}',
    has_pitch_deck      BOOLEAN NOT NULL DEFAULT false,
    is_pitch            BOOLEAN NOT NULL DEFAULT false,
    relevance_label     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS inbox_pitch_emails_user_received_idx
    ON public.inbox_pitch_emails (user_id, is_pitch, received_at DESC);

-- One row per user; absent means the defaults (daily email ON).
CREATE TABLE IF NOT EXISTS public.user_report_prefs (
    user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    daily_deck_report     BOOLEAN NOT NULL DEFAULT true,
    last_report_sent_on   DATE,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_pitch_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_report_prefs ENABLE ROW LEVEL SECURITY;
