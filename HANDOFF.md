# MPS Connect — Session Handoff

> [!IMPORTANT]
> **READ THIS BEFORE TOUCHING ANY CODE.**  
> This file is the single source of truth for resuming work. Start at Section 6 (Next Steps).

> **Written:** 2026-06-10T08:09 SGT (updated 2026-06-13)
> **Reason:** MacOS update (26 → 27). Resume from here.  
> **Stack:** Next.js 15 + PostgreSQL + Express AI Proxy + Ollama (remote via Tailscale)

## 0. First 60 Seconds — Is the Stack Live?

```bash
# Run this before anything else
docker compose ps
curl -s http://localhost:3080/api/health   # expect: {"status":"ok","db":"connected"}
curl -s http://localhost:3103/health       # expect: {"status":"ok","service":"mps-ai-proxy"}

# If mps-connect is down:
docker compose up -d mps-connect

# Ollama — confirm your inference endpoint is reachable:
curl -s ${OLLAMA_ENDPOINT:-http://localhost:11434}/api/tags | grep -o '"name":"[^"]*"' | head -5
```

---

## 1. What Was Planned (from ADRs + Architecture Docs) — Status

The architecture docs were locked on **2026-06-09 PM** after the Vite → Next.js migration. At that point the following were explicitly marked as planned but not built:

| Planned Feature | ADR / Source | Status |
|-----------------|--------------|--------|
| MP Approval Portal (`/dashboard/approvals`) | `06_ARCHITECTURE_OVERVIEW.md` (D3) | ✅ **BUILT** |
| Analytics Dashboard (`/dashboard/analytics`) | `06_ARCHITECTURE_OVERVIEW.md` (D4) | ✅ **BUILT** |
| Redis SSE for real-time queue updates | ADR-005, `06_ARCHITECTURE_OVERVIEW.md` | ❌ Not built — Redis container exists, SSE subscription not wired |
| AI audit log → PostgreSQL | `06_ARCHITECTURE_OVERVIEW.md` (Data Persistence) | ❌ Not built — still console.log only (lost on container recreate) |
| `case_events` SHA-256 prev_hash chain | `06_ARCHITECTURE_OVERVIEW.md` (Data Persistence) | ❌ Not built — append-only by discipline, not by cryptographic trigger |
| BullMQ async job queue for causality timeout | `05_COMPLEXITY_ANALYSIS.md` (Risk Register) | ❌ Not built — causality still synchronous, 180s timeout risk remains |
| Remove legacy `/api/staff/login` | ADR-008 | ❌ Not removed — flagged as pre-production debt |
| Email notification to resident after approval | implied by workflow | ❌ Not built |
| Production Singpass (real NDI) | ADR-007, `02_PROJECT_CONTEXT.md` | ⏸️ **DORMANT** — MockPass dropped 2026-06-13, FAPI v3 code preserved in server.js (commented out). Re-enable when real NDI endpoints available. |
| PostgreSQL volume backup | `05_COMPLEXITY_ANALYSIS.md` (Risk Register) | ❌ No backup cron exists |

---

## 2. What Was Built This Session (Beyond the Original Plan)

These features were not in the original ADRs — they emerged from building and testing.

### ✅ Approvals Workspace (`/dashboard/approvals`)
**Full replacement of the flat list that existed.**  
- Accordion-based review workspace — expand any `pending_approval` case to review in full
- 4 tabs per case: **Overview** (summary, core request, key facts), **AI Analysis** (causality graph, agent decision with confidence + key factors + policy basis + flags), **Documents** (requirements checklist + uploads), **Letters** (all letters, one per agency, expandable)
- **Approve** and **Return to Drafting** server actions with audit trail
- Recently-actioned sidebar (14-day window)
- File: `app/dashboard/approvals/page.tsx`, `components/approvals/ApprovalsClient.tsx`, `app/actions/approvals.ts`

### ✅ Case Detail Page — Inline Approval Bar (`CaseApprovalBar`)
- Approve / Return to Drafting buttons appear directly on the case detail page for `letters:approve` users
- If unfulfilled required docs exist: shows advisory warning, requires a **second click to confirm** (two-step override)
- Documents are **never blocking** — MP has full discretion
- File: `components/cases/CaseApprovalBar.tsx`

### ✅ AI Agent Panel Redesign (`AgentRunPanel`)
**Complete rewrite from a plain result card to a structured explainability UI.**
- Colour semantics: `slate` = rule-engine deterministic, `emerald` = AI approved, `violet` = AI escalated
- Structured output sections: Summary, Confidence score, Key Factors, Policy Basis, Flags
- Rule-escalated cases show **"Review in Approvals →"** CTA directly
- File: `components/agent/AgentRunPanel.tsx`, `app/actions/agent.ts`

### ✅ Causality Engine — Architecture Fix (Critical)
**Root cause:** `CaseIntelligencePanel` was calling `fetch(aiProxyUrl)` from the browser. The browser cannot resolve `mps-ai-proxy` (Docker internal hostname) → "Failed to fetch".  
**Fix:** Created `runCausalityEngine` server action. All causality calls now run inside the `mps-connect` container, server-to-server over Docker network.  
**Also fixed:** Request format was wrong (`{ message, sessionId }` → correct: `{ conversation: [{role, content}], mpName, constituency, writerName }`).  
**Also fixed:** Letters were never persisted to the `letters` table. The server action now persists:
1. `causal_graph` JSONB to `cases`
2. All `documentRequirements` to `document_requirements` table
3. All assembled letters (one per agency route) to `letters` table
4. Audit event to `case_events`  
File: `app/actions/causality.ts`, `components/cases/CaseIntelligencePanel.tsx`

### ✅ API Reference Documentation
Complete surface-level documentation for every API:
- All Next.js REST routes (`/api/health`, `/api/upload/[token]`, `/api/documents/status`)
- All server actions (6 files: agent, approvals, causality, documents, queue, auth)
- All AI proxy routes (11 routes including Singpass FAPI v3)
- Page → data flow table
- RBAC quick reference
- Environment variables  
File: `.ai-arch/09_API_REFERENCE.md`

---

## 3. Known Issues / Deferred

These were identified but NOT fixed this session — the user's explicit instruction was "address layout later" and "focus on what goes into each page first."

| Issue | Where | Priority |
|-------|--------|----------|
| Individual case page layout is unprofessional | `/dashboard/cases/[id]/page.tsx` | High — deferred |
| Floating nav — CASES and APPROVALS nav links broken | `FloatingNav.tsx` | High — partially investigated, root cause not fixed |
| No case expiry / archival mechanism | `cases` table | Medium — policy question, needs decision: auto-archive after N days? |
| Queue page real-time updates use polling, not SSE | `QueueClient` + Redis | Medium |
| AI audit events go to console.log only | `api/server.js` | Medium — pre-production |
| Legacy `/api/staff/login` still in proxy | `api/server.js:497` | High — pre-production security debt (ADR-008) |
| `case_events` append-only is by discipline, not trigger | `db/schema.sql` | Low — add `block_update_delete` trigger if not present |
| No `case_number` column on cases | Confirmed missing in DB | **Confirmed bug** — appears in queries but column doesn't exist; queries that reference it will fail |

---

## 4. Pages — Current State

| Page | Route | State | What's In It |
|------|-------|-------|--------------|
| Dashboard | `/dashboard` | ✅ Live | KPI tiles, recent cases, queue summary, agent shortcut |
| Cases List | `/dashboard/cases` | ✅ Live | Urgency-sorted list, status filters, search |
| Case Detail | `/dashboard/cases/[id]` | ✅ Live | Summary, core request, AI urgency rationale, agency routes, audit trail, documents card, causality panel, **approval bar (new)** |
| Approvals | `/dashboard/approvals` | ✅ Live | Full 4-tab accordion workspace, approve/return actions, recently actioned sidebar |
| AI Agent | `/dashboard/agent` | ✅ Live | AgentRunPanel with structured output, per-case run button, agent preferences link |
| Queue | `/dashboard/queue` | ✅ Live | Session management, real-time-ish (polling), call next/mark done |
| Analytics | `/dashboard/analytics` | ✅ Live | Monthly bar chart, category breakdown, urgency donut, status pipeline, 1M/3M/6M toggle |
| Agent Settings | `/dashboard/settings/agent` | ✅ Live | Approval preferences, urgency cap, category allowlist |

---

## 5. Data Layer — What's in the DB

```
cases               — case records, causal_graph JSONB, status state machine
case_events         — append-only audit log (causality_run, approved, returned_to_drafting, etc.)
agent_decisions     — AI agent runs with confidence, reasoning, model_used
letters             — one per agency route, generated by causality engine, status: draft→approved→sent
document_requirements — generated by causality engine, one per doc per agency
case_documents      — uploaded files (BYTEA), ClamAV scan status
upload_tokens       — single-use, 48-hour tokens for resident uploads
mps_sessions        — MPS session records (date, status, max_slots)
queue_entries       — physical queue walk-ins linked to a session
users               — staff accounts (bcrypt password, role, constituency_id)
constituencies      — 97 Singapore constituencies + MP metadata
agent_preferences   — per-user AI agent approval configuration
```

---

## 6. Exact Next Steps (When You Resume)

In priority order:

### 6.1 Fix `case_number` bug — CONFIRMED, DO THIS FIRST

**Status:** Column confirmed missing. Queries that reference `case_number` will silently return NULL or error.

```bash
# Confirm the column is missing:
docker exec mps-postgres psql -U mps -d mps_connect -c "\d cases" | grep case_number

# Fix — run this migration:
docker exec mps-postgres psql -U mps -d mps_connect -c \
  "ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_number TEXT GENERATED ALWAYS AS ('MPS-' || LPAD(id::text, 4, '0')) STORED;"

# Verify:
docker exec mps-postgres psql -U mps -d mps_connect -c "SELECT id, case_number FROM cases LIMIT 3;"
```

### 6.2 Fix Floating Nav — CASES and APPROVALS links
User reported these were broken. File: `components/layout/FloatingNav.tsx`. Check href values and RBAC conditions that control visibility.

### 6.3 Redesign Individual Case Page
User noted it is "very unprofessional." The layout is a single-column left + narrow right column. Needs:
- Proper header section with status pill
- Structured information hierarchy
- Better use of whitespace
- Letter preview/expand inline (not buried)

### 6.4 Wire Redis SSE for Queue
File: `components/queue/QueueClient.tsx`. Currently polls. Wire `EventSource` to a new `/api/queue/[sessionId]/stream` SSE route. Publish to Redis channel on every queue status change in `app/actions/queue.ts`.

### 6.5 Persist AI Audit Log to PostgreSQL
In `api/server.js`, replace `auditLog()` console.log calls with writes to a new `ai_audit_events` table. Schema:
```sql
CREATE TABLE ai_audit_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,  -- CHAT, CAUSALITY, CATEGORIZE, LETTER, CANARY_TRIGGERED
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.6 Remove Legacy Auth Endpoint (Pre-Production)
Per ADR-008: remove `POST /api/staff/login`, `GET /api/staff/cases`, `verifyStaff` from `api/server.js`. Grep first: `grep -n "/api/staff/" api/server.js`.

### 6.7 Auth Architecture (Updated 2026-06-13)
**MockPass dropped.** Email/password login removed. Auth is now unified:
- **Demo auth page:** `/auth/demo` — resident persona picker + staff role picker
- **Session:** JWT cookie via `lib/auth.ts` (same mechanism for residents and staff)
- **Server actions:** `demoStaffLoginAction(role)`, `demoResidentLoginAction(personaId)` in `app/actions/auth.ts`
- **Singpass FAPI v3 code:** Commented out in `api/server.js` (search: `SINGPASS_FAPI_V3_START`)
- **MockPass container:** Commented out in `docker-compose.yml`
- **Nginx:** `/auth/` proxy block removed; all auth routes served by Next.js

---

## 7. Service Health Reference

Check on resume:
```bash
# All containers
docker compose ps

# App health
curl http://localhost:3080/api/health

# AI proxy
curl http://localhost:3103/health

# Postgres
docker exec mps-postgres psql -U mps -d mps_connect -c "SELECT COUNT(*) FROM cases;"
```

**Ollama:** Confirm your Ollama endpoint (configured via `OLLAMA_ENDPOINT` in `.env` / `docker-compose.yml`) is reachable before running causality.

---

## 8. ADR Updates Needed (Next Session)

The following new decisions were made this session that are NOT yet recorded as ADRs:

| Decision | What to record |
|----------|---------------|
| Causality calls must be server actions only | Browser cannot reach Docker-internal services. All AI proxy calls must go through Next.js server actions or API routes. Add as ADR-009. |
| Documents are advisory, never blocking approval | Policy decision: MP has full discretion to approve with or without documents. Two-step UI override pattern. Add as ADR-010. |
| Letters are generated and persisted atomically with causality | The causality engine returns and stores both causal_graph AND letters in one server action. Separation would create inconsistency. Add as ADR-011. |
| MockPass dropped; demo auth replaces OIDC for demo | MockPass caused UX friction ("has its own brains"). Replaced with built-in `/auth/demo` page. FAPI v3 code dormant for future NDI. Email/password login removed. Add as ADR-012. |
