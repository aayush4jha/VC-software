-- Company feedback table for the feedback loop system
CREATE TABLE IF NOT EXISTS company_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    ratings JSONB NOT NULL DEFAULT '{}',
    comment TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'addressed', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_feedback_company ON company_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_company_feedback_user ON company_feedback(user_id);

ALTER TABLE company_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on company_feedback"
    ON company_feedback FOR ALL USING (true) WITH CHECK (true);
