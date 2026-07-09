-- =============================================================
-- MPS-Connect — PostgreSQL Schema v1.1
-- Run on every deploy. Idempotent (IF NOT EXISTS throughout).
-- =============================================================

-- ── Tenancy ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS constituencies (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,          -- e.g. "Ang Mo Kio GRC"
  division        VARCHAR(100),                    -- e.g. "Teck Ghee"
  mp_name         VARCHAR(100),
  party           VARCHAR(10),
  type            VARCHAR(5),
  branch_location TEXT,
  mps_schedule    VARCHAR(100),                    -- e.g. "Every Wednesday, 8.00 PM"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, division)
);

-- ── Identity ───────────────────────────────────────────────────
-- roles: superadmin | mp | admin | writer | registry | volunteer
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  constituency_id   INT REFERENCES constituencies(id),  -- NULL = superadmin
  name              VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  role              VARCHAR(20)  NOT NULL CHECK (role IN ('superadmin','mp','admin','writer','registry','volunteer')),
  pw_hash           VARCHAR(255) NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at      TIMESTAMPTZ,                          -- set on each successful login
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_constituency ON users(constituency_id);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);

-- ── MPS Sessions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mps_sessions (
  id                SERIAL PRIMARY KEY,
  constituency_id   INT NOT NULL REFERENCES constituencies(id),
  session_date      DATE NOT NULL,
  session_start     TIME,
  session_end       TIME,
  max_slots         INT NOT NULL DEFAULT 50,
  status            VARCHAR(20) NOT NULL DEFAULT 'upcoming'
                      CHECK (status IN ('upcoming','open','closed','cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_constituency ON mps_sessions(constituency_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date         ON mps_sessions(session_date);

-- ── Queue Entries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue_entries (
  id                SERIAL PRIMARY KEY,
  session_id        INT NOT NULL REFERENCES mps_sessions(id),
  q_number          INT NOT NULL,
  resident_name     VARCHAR(100) NOT NULL,
  phone             VARCHAR(20),
  postal_code       CHAR(6),
  issue_summary     TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','called','in_session','done','no_show')),
  pre_registered    BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at     TIMESTAMPTZ,
  called_at         TIMESTAMPTZ,
  in_session_at     TIMESTAMPTZ,
  done_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, q_number)
);

CREATE INDEX IF NOT EXISTS idx_queue_session ON queue_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_queue_status  ON queue_entries(status);

-- ── Cases ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id                SERIAL PRIMARY KEY,
  constituency_id   INT NOT NULL REFERENCES constituencies(id),
  queue_entry_id    INT REFERENCES queue_entries(id),
  resident_name     VARCHAR(100) NOT NULL,
  nric_masked       VARCHAR(20),
  contact_phone     VARCHAR(20),
  phone             VARCHAR(20),
  category          VARCHAR(100),
  sub_category      VARCHAR(100),
  urgency           VARCHAR(20) CHECK (urgency IN ('Low','Medium','High','Critical')),
  status            VARCHAR(30) NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','triaged','drafting','pending_approval','approved','sent','closed','ESCALATED')),
  case_number       VARCHAR(30) UNIQUE,
  summary           TEXT,
  core_request      TEXT,
  key_facts         TEXT[],
  suggested_agencies TEXT[],
  causal_graph      JSONB,
  consent_given_at  TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_constituency ON cases(constituency_id);
CREATE INDEX IF NOT EXISTS idx_cases_status       ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_urgency      ON cases(urgency);
CREATE INDEX IF NOT EXISTS idx_cases_retention    ON cases(retention_expires_at) WHERE retention_expires_at IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_updated_at ON cases;
CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate case_number on INSERT if not provided
CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'MPS-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('case_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_generate_number ON cases;
CREATE TRIGGER cases_generate_number
  BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION generate_case_number();

-- ── Case Events (append-only audit log) ────────────────────────
CREATE TABLE IF NOT EXISTS case_events (
  id          BIGSERIAL PRIMARY KEY,
  case_id     INT NOT NULL REFERENCES cases(id),
  actor_id    INT REFERENCES users(id),
  actor       VARCHAR(100),
  actor_role  VARCHAR(20),
  event_type  VARCHAR(100),
  action      VARCHAR(100) NOT NULL,
  detail      JSONB,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_case ON case_events(case_id);

-- Append-only enforcement: blocks any UPDATE or DELETE on case_events
CREATE OR REPLACE FUNCTION block_case_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'case_events is append-only. Mutation is not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_events_no_update ON case_events;
CREATE TRIGGER case_events_no_update
  BEFORE UPDATE OR DELETE ON case_events
  FOR EACH ROW EXECUTE FUNCTION block_case_event_mutation();

-- ── Messages (AI chat transcript) ──────────────────────────────
CREATE TABLE IF NOT EXISTS case_messages (
  id        BIGSERIAL PRIMARY KEY,
  case_id   INT NOT NULL REFERENCES cases(id),
  role      VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant','system')),
  content   TEXT NOT NULL,
  is_stt    BOOLEAN DEFAULT FALSE,
  stt_duration_seconds INTEGER,
  audio_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_case ON case_messages(case_id);

-- ── Letters ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS letters (
  id            SERIAL PRIMARY KEY,
  case_id       INT NOT NULL REFERENCES cases(id),
  agency        VARCHAR(100) NOT NULL,
  agency_label  VARCHAR(100),
  content       TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending','approved','sent')),
  generated_by  INT REFERENCES users(id),
  approved_by   INT REFERENCES users(id),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_letters_case ON letters(case_id);

-- ── Notifications ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  case_id     INT REFERENCES cases(id),
  channel     VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email')),
  recipient   VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Phase 2: Document Collection ─────────────────────────────
CREATE TABLE IF NOT EXISTS document_requirements (
  id                 SERIAL PRIMARY KEY,
  case_id            INT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  agency             VARCHAR(100) NOT NULL,
  document_type      VARCHAR(200) NOT NULL,
  reason             TEXT NOT NULL,
  related_node_ids   TEXT[],
  required           BOOLEAN NOT NULL DEFAULT TRUE,
  source_type        VARCHAR(20) NOT NULL
                       CHECK (source_type IN ('resident','government_request')),
  source_institution VARCHAR(100),
  fulfilled          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docreq_case ON document_requirements(case_id);

-- Upload tokens: UUID-based, 48h TTL, single-use
CREATE TABLE IF NOT EXISTS upload_tokens (
  id          SERIAL PRIMARY KEY,
  case_id     INT NOT NULL REFERENCES cases(id),
  token       UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by  INT NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_token ON upload_tokens(token);
CREATE INDEX IF NOT EXISTS idx_upload_case  ON upload_tokens(case_id);

-- Uploaded files stored as BYTEA
CREATE TABLE IF NOT EXISTS case_documents (
  id              SERIAL  PRIMARY KEY,
  case_id         INT     NOT NULL REFERENCES cases(id),
  requirement_id  INT     REFERENCES document_requirements(id),
  token_id        INT     REFERENCES upload_tokens(id),
  filename        VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_data       BYTEA   NOT NULL,
  file_size_bytes INT     NOT NULL,
  scan_status     VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (scan_status IN ('pending','clean','rejected')),
  scan_detail     TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_casdoc_case ON case_documents(case_id);

-- ── AI Agent ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_decisions (
  id              SERIAL PRIMARY KEY,
  case_id         INT NOT NULL REFERENCES cases(id),
  decision        VARCHAR(20) NOT NULL,
  reasoning       TEXT,
  confidence      NUMERIC(4,3),
  model           VARCHAR(50),
  source          VARCHAR(20),
  summary         TEXT,
  key_factors     TEXT[],
  policy_basis    TEXT[],
  flags           TEXT[],
  overridden      BOOLEAN NOT NULL DEFAULT FALSE,
  override_by     INT REFERENCES users(id),
  override_reason TEXT,
  accountable_officer_id INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentdec_case ON agent_decisions(case_id);

CREATE TABLE IF NOT EXISTS agent_preferences (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) UNIQUE,
  auto_approve    BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  preferred_model VARCHAR(50),
  excluded_categories TEXT[],
  max_urgency     VARCHAR(20) DEFAULT 'Medium',
  auto_approve_categories TEXT[] DEFAULT '{}',
  excluded_keywords TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit Events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  VARCHAR(50) NOT NULL,
  actor       VARCHAR(100),
  detail      JSONB,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed: superadmin only (constituency users seeded by migration) ──
INSERT INTO users (constituency_id, name, email, role, pw_hash) VALUES
  (NULL, 'System Admin', 'admin@mps-connect.gov.sg', 'superadmin',
   '$2b$10$sP9D7WGID65nopP4paK9Ee53xZytxZXTzL/9nFj76F9PfKWIf8vZ.')
ON CONFLICT (email) DO NOTHING;
