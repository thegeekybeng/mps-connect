-- Migration 003: Expand agent preferences structure for category alignment
ALTER TABLE agent_preferences 
  ADD COLUMN IF NOT EXISTS auto_approve_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluded_keywords TEXT[] DEFAULT '{}';

-- Migrate existing keywords from excluded_categories column to excluded_keywords column
UPDATE agent_preferences 
  SET excluded_keywords = excluded_categories 
  WHERE excluded_keywords = '{}' OR excluded_keywords IS NULL;
