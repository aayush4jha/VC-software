-- ══════════════════════════════════════════════════════════════
-- Seed Data — Run AFTER schema.sql
-- Creates the default Dholakia Ventures organization + config
-- ══════════════════════════════════════════════════════════════

-- ─── Default Organization ─────────────────────────────────
insert into public.organizations (id, name, slug) values
    ('00000000-0000-0000-0000-000000000001', 'Dholakia Ventures', 'dholakia-ventures');

-- ─── Pipeline Stages ──────────────────────────────────────
insert into public.pipeline_stages (organization_id, name, "order", color, description) values
    ('00000000-0000-0000-0000-000000000001', 'Thesis Check', 1, '#8b5cf6', '15-30 min analyst review'),
    ('00000000-0000-0000-0000-000000000001', 'Initial Screening', 2, '#3b82f6', 'Full AI deck analysis'),
    ('00000000-0000-0000-0000-000000000001', 'Intro Call', 3, '#06b6d4', 'Analyst takes the call'),
    ('00000000-0000-0000-0000-000000000001', 'Filter Discussion', 4, '#f59e0b', 'Async partner review'),
    ('00000000-0000-0000-0000-000000000001', 'Filter IC', 5, '#ef4444', 'All partners review'),
    ('00000000-0000-0000-0000-000000000001', 'Due Diligence', 6, '#10b981', 'Internal + external DD');

-- ─── Industries (17 from Notion) ──────────────────────────
insert into public.industries (organization_id, name) values
    ('00000000-0000-0000-0000-000000000001', 'AI'),
    ('00000000-0000-0000-0000-000000000001', 'Climate'),
    ('00000000-0000-0000-0000-000000000001', 'Consumer'),
    ('00000000-0000-0000-0000-000000000001', 'Crypto'),
    ('00000000-0000-0000-0000-000000000001', 'Data & Analytics'),
    ('00000000-0000-0000-0000-000000000001', 'Defense'),
    ('00000000-0000-0000-0000-000000000001', 'Developer Tools'),
    ('00000000-0000-0000-0000-000000000001', 'FinTech'),
    ('00000000-0000-0000-0000-000000000001', 'GTM'),
    ('00000000-0000-0000-0000-000000000001', 'Hardware'),
    ('00000000-0000-0000-0000-000000000001', 'Healthcare'),
    ('00000000-0000-0000-0000-000000000001', 'Infrastructure'),
    ('00000000-0000-0000-0000-000000000001', 'Legal'),
    ('00000000-0000-0000-0000-000000000001', 'Marketplace'),
    ('00000000-0000-0000-0000-000000000001', 'Operations'),
    ('00000000-0000-0000-0000-000000000001', 'Productivity'),
    ('00000000-0000-0000-0000-000000000001', 'Security');

-- ─── Deal Source Names ────────────────────────────────────
insert into public.deal_source_names (organization_id, name) values
    ('00000000-0000-0000-0000-000000000001', 'Rajesh Gupta'),
    ('00000000-0000-0000-0000-000000000001', 'Sequoia Capital'),
    ('00000000-0000-0000-0000-000000000001', 'Accel Partners'),
    ('00000000-0000-0000-0000-000000000001', 'Matrix Partners'),
    ('00000000-0000-0000-0000-000000000001', 'Anand Mahindra'),
    ('00000000-0000-0000-0000-000000000001', 'Peak XV Partners'),
    ('00000000-0000-0000-0000-000000000001', 'Tiger Global'),
    ('00000000-0000-0000-0000-000000000001', 'Blume Ventures');

-- ─── Rejection Reason Categories + Sub-Reasons ────────────
-- We'll use a DO block to insert categories and sub-reasons
do $$
declare
    cat_founders uuid;
    cat_industry uuid;
    cat_execution uuid;
    cat_product uuid;
begin
    insert into public.rejection_reason_categories (organization_id, name)
    values ('00000000-0000-0000-0000-000000000001', 'Founders')
    returning id into cat_founders;

    insert into public.rejection_reason_categories (organization_id, name)
    values ('00000000-0000-0000-0000-000000000001', 'Industry')
    returning id into cat_industry;

    insert into public.rejection_reason_categories (organization_id, name)
    values ('00000000-0000-0000-0000-000000000001', 'Execution')
    returning id into cat_execution;

    insert into public.rejection_reason_categories (organization_id, name)
    values ('00000000-0000-0000-0000-000000000001', 'Product/Business Model')
    returning id into cat_product;

    -- Founders sub-reasons
    insert into public.rejection_sub_reasons (category_id, name) values
        (cat_founders, 'Lack of domain expertise'),
        (cat_founders, 'Solo founder risk'),
        (cat_founders, 'Weak track record'),
        (cat_founders, 'Culture/values misalignment');

    -- Industry sub-reasons
    insert into public.rejection_sub_reasons (category_id, name) values
        (cat_industry, 'Market too small'),
        (cat_industry, 'Regulatory risk'),
        (cat_industry, 'Outside thesis'),
        (cat_industry, 'Overcrowded market');

    -- Execution sub-reasons
    insert into public.rejection_sub_reasons (category_id, name) values
        (cat_execution, 'Poor go-to-market strategy'),
        (cat_execution, 'Lack of traction'),
        (cat_execution, 'Scaling concerns'),
        (cat_execution, 'Burn rate too high');

    -- Product/Business Model sub-reasons
    insert into public.rejection_sub_reasons (category_id, name) values
        (cat_product, 'Weak moat / defensibility'),
        (cat_product, 'Unclear unit economics'),
        (cat_product, 'Product-market fit not proven'),
        (cat_product, 'Too early stage for us');
end $$;
