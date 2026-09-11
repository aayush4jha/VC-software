-- Documents attached to a company — today, the pitch decks that arrive by email.
--
-- The file itself stays in Gmail rather than being copied into Postgres: the
-- row records where it is (message + attachment id) and what it is, and
-- /api/gmail/attachment streams it on demand. That keeps the deck viewable from
-- the company page at any time without a storage bucket to provision, and
-- without a second copy to keep in step.
--
-- The trade-off, stated plainly: if the Google account that received the mail
-- is disconnected, or the message is deleted from the mailbox, the row remains
-- but the download fails. Nothing else breaks.

CREATE TABLE IF NOT EXISTS public.company_documents (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL,
    company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    file_name            TEXT NOT NULL,
    mime_type            TEXT,
    size_bytes           BIGINT,
    is_pitch_deck        BOOLEAN NOT NULL DEFAULT false,
    source               TEXT NOT NULL DEFAULT 'email',
    gmail_message_id     TEXT,
    gmail_attachment_id  TEXT,
    received_at          TIMESTAMPTZ,
    sender_email         TEXT,
    subject              TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The same attachment re-ingested (a thread fetched twice, a forward of the
    -- same mail) must not add a second row.
    UNIQUE (company_id, gmail_message_id, file_name)
);

CREATE INDEX IF NOT EXISTS company_documents_company_idx
    ON public.company_documents (company_id, created_at DESC);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
