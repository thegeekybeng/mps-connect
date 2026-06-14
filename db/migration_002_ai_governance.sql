-- =============================================================
-- MPS-Connect — Migration 002: AI Governance Compliance
-- IMDA Agentic AI Framework + PDPA alignment
-- Idempotent — safe to re-run
-- =============================================================

-- TD-012: Named human accountability per IMDA Agentic AI Framework Dim.2
-- Every AI decision must record the human officer who triggered/owns it
ALTER TABLE agent_decisions
  ADD COLUMN IF NOT EXISTS accountable_officer_id INT REFERENCES users(id);

-- TD-013: PDPA §13 — Consent tracking
-- Records when a resident consented to AI processing + data collection
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- TD-015: PDPA §25 — Retention tracking
-- Marks when a case's data should be purged (default: 5 years from creation)
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- Set default retention for existing cases (5 years from creation)
UPDATE cases
  SET retention_expires_at = created_at + INTERVAL '5 years'
  WHERE retention_expires_at IS NULL;

-- Create index for retention cleanup queries
CREATE INDEX IF NOT EXISTS idx_cases_retention ON cases(retention_expires_at)
  WHERE retention_expires_at IS NOT NULL;
