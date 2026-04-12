-- Booking tokens for scheduling links
CREATE TABLE IF NOT EXISTS booking_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL DEFAULT '',
    attendee_name TEXT NOT NULL DEFAULT '',
    attendee_email TEXT NOT NULL DEFAULT '',
    host_name TEXT NOT NULL DEFAULT '',
    host_email TEXT NOT NULL DEFAULT '',
    event_title TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    booked BOOLEAN NOT NULL DEFAULT false,
    booked_slot TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on booking_tokens" ON booking_tokens FOR ALL USING (true) WITH CHECK (true);
