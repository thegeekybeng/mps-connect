-- =============================================================
-- MPS-Connect — Combined DB initialisation
-- Runs schema creation then GE2025 constituency data migration.
-- Idempotent — safe to re-run on every container start.
-- =============================================================

\i /migrations/schema.sql
\i /migrations/seed_constituencies.sql
