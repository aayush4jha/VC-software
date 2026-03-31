-- Add stage_deadlines JSONB column to companies table
-- Stores per-stage deadlines as { stageId: ISO date string }
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage_deadlines JSONB DEFAULT '{}'::jsonb;
