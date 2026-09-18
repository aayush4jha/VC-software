-- WhatsApp bot: send a startup to the platform from your phone.
--
-- whatsapp_senders is the allowlist. The bot's number is public — anyone can
-- message it — so a message is only acted on when it comes from a number a
-- team member has linked to their own account in Settings. That link is also
-- who the company is attributed to.
--
-- whatsapp_messages makes processing idempotent. Meta retries a webhook it
-- thinks failed; the unique wa_message_id means a retried delivery is
-- recognised and not turned into a second company.

CREATE TABLE IF NOT EXISTS public.whatsapp_senders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone            TEXT NOT NULL UNIQUE,   -- digits with country code, no "+"
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_senders_user_idx ON public.whatsapp_senders (user_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    wa_message_id    TEXT NOT NULL UNIQUE,
    from_phone       TEXT NOT NULL,
    user_id          UUID,
    message_type     TEXT NOT NULL,
    body             TEXT NOT NULL DEFAULT '',
    file_name        TEXT,
    company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    -- A deck that arrived with no way to tell which company it is waits here
    -- (status awaiting_name) until the sender replies with the name.
    storage_path     TEXT,
    status           TEXT NOT NULL DEFAULT 'received',   -- received / created / attached / awaiting_name / ignored / unregistered / error
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_sender_idx ON public.whatsapp_messages (from_phone, created_at DESC);

ALTER TABLE public.whatsapp_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- A deck sent over WhatsApp has no Gmail message to stream it from later, so
-- the file itself is stored (Supabase Storage, private bucket
-- "company-documents", created by the app on first upload) and this column
-- says where.
ALTER TABLE public.company_documents
ADD COLUMN IF NOT EXISTS storage_path TEXT;
