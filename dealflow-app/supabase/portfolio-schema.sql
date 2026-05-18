-- Portfolio Schema Enhancement
-- Adds portfolio-specific fields to companies and creates follow-on rounds table

-- Ensure helper functions exist (safe to re-run)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT exists (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Add portfolio-specific columns to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS initial_investment BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_ownership NUMERIC(10,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_ownership NUMERIC(10,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS latest_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS portfolio_status TEXT DEFAULT 'Active' CHECK (portfolio_status IN ('Active', 'Exited', 'Written Off')),
ADD COLUMN IF NOT EXISTS exit_value BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS exit_date TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS hq_location TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
-- Entry round share / valuation breakdown
ADD COLUMN IF NOT EXISTS share_price NUMERIC(18,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS num_shares BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_pre_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entry_post_money_valuation BIGINT DEFAULT NULL;

-- Create follow-on rounds table
CREATE TABLE IF NOT EXISTS portfolio_follow_ons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    round_name TEXT NOT NULL DEFAULT '',
    round_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_raised BIGINT DEFAULT NULL,
    our_investment BIGINT DEFAULT NULL,
    did_we_invest BOOLEAN DEFAULT false,
    round_valuation BIGINT DEFAULT NULL,
    ownership_after NUMERIC(10,4) DEFAULT NULL,
    investor_names TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Additional valuation columns for follow-on rounds (safe to re-run)
ALTER TABLE portfolio_follow_ons
ADD COLUMN IF NOT EXISTS share_price NUMERIC(18,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS num_shares BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pre_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_money_valuation BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ownership_sought NUMERIC(10,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dilution_percent NUMERIC(10,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS our_value_today_override NUMERIC(20,2) DEFAULT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_follow_ons_company ON portfolio_follow_ons(company_id);
CREATE INDEX IF NOT EXISTS idx_follow_ons_org ON portfolio_follow_ons(organization_id);

-- RLS for follow-on rounds
ALTER TABLE portfolio_follow_ons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view follow-ons"
    ON portfolio_follow_ons FOR SELECT
    USING (organization_id = public.get_my_org_id());

CREATE POLICY "Org members can insert follow-ons"
    ON portfolio_follow_ons FOR INSERT
    WITH CHECK (organization_id = public.get_my_org_id());

CREATE POLICY "Org members can update follow-ons"
    ON portfolio_follow_ons FOR UPDATE
    USING (organization_id = public.get_my_org_id());

CREATE POLICY "Admins can delete follow-ons"
    ON portfolio_follow_ons FOR DELETE
    USING (public.is_admin());

-- Updated_at trigger for follow-ons
CREATE TRIGGER set_follow_ons_updated_at
    BEFORE UPDATE ON portfolio_follow_ons
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime for follow-ons
ALTER PUBLICATION supabase_realtime ADD TABLE portfolio_follow_ons;
