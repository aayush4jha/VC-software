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
    allowed_slots JSONB,         -- array of { start, end } ISO strings; if NULL, fall back to host's full availability
    additional_guests JSONB,     -- array of guest email strings to cc as attendees on the booked event
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additive migration for existing installs
ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS allowed_slots JSONB;
ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS additional_guests JSONB;

ALTER TABLE booking_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on booking_tokens" ON booking_tokens FOR ALL USING (true) WITH CHECK (true);
