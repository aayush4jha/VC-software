-- Pending Invites Allowlist
-- Server-trusted record of emails an admin has invited. The auth callback
-- consults this table to decide whether an unknown email may register —
-- replacing the previous URL-param check, which was forgeable by anyone.

CREATE TABLE IF NOT EXISTS public.pending_invites (
    email text PRIMARY KEY,
    role text NOT NULL DEFAULT 'analyst',
    permissions text[] NOT NULL DEFAULT '{}',
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on, with no policies → only the service role (used by the invite API
-- and the auth callback) can read or write. Clients cannot enumerate or
-- self-insert invites.
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;
