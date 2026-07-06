-- =============================================================
-- MPS-Connect — Migration 003: Widen VARCHAR columns for CWI integration
-- Agency names from CWI causality engine can exceed VARCHAR(50).
-- Idempotent — safe to re-run.
-- =============================================================

-- Widen agency column in letters table
ALTER TABLE letters
  ALTER COLUMN agency TYPE VARCHAR(100);

-- Widen agency column in document_requirements table
ALTER TABLE document_requirements
  ALTER COLUMN agency TYPE VARCHAR(100);

-- Widen category in cases table (future-proof for longer CWI categories)
ALTER TABLE cases
  ALTER COLUMN category TYPE VARCHAR(100);

-- Confirm applied
DO $$
BEGIN
  RAISE NOTICE 'Migration 003: VARCHAR widening applied successfully.';
END $$;
