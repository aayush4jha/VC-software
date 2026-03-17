-- Google OAuth tokens stored per user so sessions persist across browser restarts
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS google_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT,  -- epoch ms from Google
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- RLS: users can only see their own tokens
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (used by API routes)
CREATE POLICY "Service role full access on google_tokens"
    ON google_tokens FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_google_tokens_user_id ON google_tokens(user_id);
