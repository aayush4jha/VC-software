-- Company scores table: stores AI and analyst scores for companies
CREATE TABLE IF NOT EXISTS company_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    scorer_type TEXT NOT NULL CHECK (scorer_type IN ('ai', 'analyst')),
    scorer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_scores_company_id ON company_scores(company_id);

ALTER TABLE company_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on company_scores"
    ON company_scores FOR ALL
    USING (true)
    WITH CHECK (true);
