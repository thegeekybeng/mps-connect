-- =============================================================
-- MPS-Connect — Combined DB initialisation
-- Runs schema creation then GE2025 constituency data migration.
-- Idempotent — safe to re-run on every container start.
-- =============================================================

\i /migrations/schema.sql
\i /migrations/migration_001_ge2025.sql
\i /migrations/migration_002_ai_governance.sql
