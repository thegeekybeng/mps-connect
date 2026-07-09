# Architecture Decision Records — MPS-Connect

ADR format: Context → Decision → Consequences (positive and negative).
Each entry is dated and never edited — superseded ADRs are marked [SUPERSEDED by ADR-XXX].

> **Manual scaffold note:** We scaffolded Next.js by hand instead of using `create-next-app`.
> This means some conventions (like the `public/` directory) must be created explicitly.
> The Dockerfile uses `mkdir -p public` as a guard. Any future developer must know this
> project was hand-scaffolded — `create-next-app` defaults do not apply.

---

## ADR-001 — Next.js 15 over React/Vite (2026-06-09)

**Context:**
The original system used Vite + React as a SPA. This meant:
- All data lived in React state (lost on refresh)
- No server-side logic for auth (JWT had to be sent to client)
- No API routes — required a separate Express server
- No SSR — SEO and first-load performance irrelevant (staff tool)

**Decision:** Migrate to Next.js 15 App Router.

**Consequences (+):**
- Server Components can query the DB directly without exposing credentials
- Server Actions replace REST calls for mutations (login, status changes)
- Middleware intercepts every request for auth before rendering starts
- Single deployable unit (frontend + API in one Next.js app)

**Consequences (−):**
- Larger bundle, more complex mental model than Vite
- "use client" / "use server" boundary requires discipline
- Longer build time in CI/CD

**Rejected alternatives:** Express + React SPA (two deployables), Remix (smaller ecosystem).

---

## ADR-002 — AI Proxy Kept as Separate Express Service (2026-06-09)

**Context:**
AI calls to Ollama contain sensitive logic: system prompts, PII masking, canary tokens,
injection sanitisation. All of this must stay server-side.

**Decision:** Keep the existing `api/` Express service as a separate Docker container
(`mps-ai-proxy`) rather than folding it into Next.js API routes.

**Consequences (+):**
- Attack surface for LLM injection is isolated in one container
- The AI proxy can be updated without rebuilding the frontend
- Memory limits (64MB) are enforced at the container level independently
- Security audit scope is one file: `api/server.js`

**Consequences (−):**
- Two containers to maintain
- Internal DNS routing: Next.js → nginx → mps-ai-proxy

**Rejected alternatives:** Next.js API route for AI calls (mixes AI attack surface with main app).

---

## ADR-003 — PostgreSQL as Operational Store (2026-06-09)

**Context:**
Previous system used React state — all data lost on page refresh or container restart.

**Decision:** PostgreSQL 15 as the single operational database.

**Consequences (+):**
- Cases persist across restarts and deployments
- Foreign keys enforce referential integrity (no orphaned queue entries)
- JSONB column for `causal_graph` — flexible AI output without schema migration
- `case_events` as append-only audit log (immutable history)

**Consequences (−):**
- Requires database migration management
- Backup responsibility — data loss risk if volume not backed up

**Rejected alternatives:** SQLite (no concurrent writes), MongoDB (JSONB in Postgres achieves same flexibility without schema-less risks), in-memory (lost on restart).

---

## ADR-004 — RBAC Centralised in /lib/rbac.ts (2026-06-09)

**Context:**
With 6 roles (superadmin, mp, admin, writer, registry, volunteer) and 15+ actions,
inline role checks scattered across components become unmaintainable.

**Decision:** Single `PERMISSIONS` object in `lib/rbac.ts`. Every permission check
calls `can(role, action)`. No inline `if (role === 'mp')` outside this file.

**Consequences (+):**
- One file to audit for security review
- Adding a new role or action is one edit, not a grep-and-replace
- Testable in isolation

**Consequences (−):**
- Requires discipline — developers must not bypass via inline checks

---

## ADR-005 — Redis for Live Queue State (2026-06-09)

**Context:**
The Registry Counter screen needs real-time queue updates. Multiple staff may be on
different browsers. PostgreSQL polling every second is wasteful.

**Decision:** Redis pub/sub for queue state changes. Queue display subscribes to a
channel per session. Status changes publish to Redis, SSE streams to browsers.

**Consequences (+):**
- Instant queue updates without polling
- Redis already in docker-compose for session storage
- Stateless Next.js — queue state not held in process memory

**Consequences (−):**
- Queue state lives in two places (Redis + Postgres) — Redis is the live view,
  Postgres is the record of truth. Must write to Postgres first, then publish to Redis.

---

## ADR-006 — Docker Compose over Kubernetes (2026-06-09)

**Context:**
Target deployment is a single Edge Storage Node (NAS).

**Decision:** Docker Compose.

**Consequences (+):**
- Zero control plane overhead (~500MB saved)
- Matches operator skill level (single `docker compose up`)
- Sufficient for single-node, low-concurrency civic tool

**Consequences (−):**
- No automatic failover if the NAS reboots mid-session
- Scaling requires manual config changes

**Kubernetes path:** Services are designed 12-factor (stateless, env-configured, health-probed).
A future K8s migration requires only a deployment YAML, no code changes.

---

## ADR-007 — gemma4:e4b as Default AI Model (2026-06-09)

**Context:**
The AI proxy calls a local Ollama instance on a Edge Compute Node (127.0.0.1).

**Decision:** Lock to `gemma4:e4b` — hardcoded in docker-compose, not env-overridable.

**Reasoning:**
- qwen3.6:27b tested and failed: thinking tokens went to `delta.reasoning_content`
  not `delta.content`, causing empty responses
- gemma4:e4b fits in M4 Pro unified memory, responds in <10s for chat
- Model changes require end-to-end testing of causality engine — not a config toggle

**To change the model:** Update docker-compose.yml, rebuild, and test the full
causality pipeline with the distressed family test case before deploying.

---

## ADR-008 — Legacy Staff Login Endpoint in AI Proxy (2026-06-09)

**Context:**
During the Vite-era architecture, `api/server.js` contained a `POST /api/staff/login`
route that authenticated users via a single shared `VITE_STAFF_ACCESS_CODE` environment
variable and issued a `staff_session` JWT. A companion `GET /api/staff/cases` route
(protected by this JWT) reads directly from the `case_events` table via the proxy's own
DB connection.

The Next.js migration introduced a fully RBAC-backed auth system: 6 roles, per-user
bcrypt credentials stored in PostgreSQL, `mps_session` JWT via `lib/auth.ts`, and
middleware enforcement via `middleware.ts`. These two auth systems now coexist in the same
deployment — the old `staff_session` cookie and the new `mps_session` cookie are both
active.

**Decision:** The legacy endpoint is left in place temporarily to avoid breaking any
remaining Vite-era client paths. It is flagged here as a known debt item — it is NOT
a feature and must be removed before production go-live.

**Consequences (+):**
- No immediate breakage to any path currently relying on the legacy route

**Consequences (−):**
- Two parallel auth systems in one deployment — security audit surface is wider
- `VITE_STAFF_ACCESS_CODE` must be set or the login route returns a silent comparison
  against `undefined`, making it always-fail (effectively dead) but still present
- `GET /api/staff/cases` reads the DB directly via the proxy connection, bypassing
  Next.js server actions and constituency-scoped RBAC — a data isolation risk

**Required action before production go-live:**
1. Remove `POST /api/staff/login`, `GET /api/staff/cases`, and `verifyStaff` middleware
   from `api/server.js`
2. Remove `VITE_STAFF_ACCESS_CODE` from all env files and compose configs
3. Verify no active client code calls either endpoint (grep: `/api/staff/`)

**Rejected alternatives:** Keeping both systems indefinitely (split-truth auth is a
security risk and violates the single-RBAC principle established in ADR-004).

---

## ADR-009 — All AI Proxy Calls Must Route Through Server Actions (2026-06-10)

**Context:**
`CaseIntelligencePanel` was a `'use client'` component that called
`fetch(aiProxyUrl + '/api/ai/causality')` directly from the browser. The `aiProxyUrl`
prop was set server-side from `process.env.AI_PROXY_URL = http://mps-ai-proxy:3103`.
This value was serialised into the page HTML as a prop and received by the browser —
which then tried to resolve `mps-ai-proxy` as a hostname. Docker internal hostnames do
not resolve from the browser. Every causality run returned "Failed to fetch".

Secondary issue: even if the hostname had been correct (e.g., using the NAS LAN IP),
the request format sent was wrong — `{ message, sessionId }` instead of the
`{ conversation: [{role, content}], mpName, constituency, writerName }` format the
proxy actually expects.

**Decision:** All calls to `mps-ai-proxy` (and to any other Docker-internal service)
MUST be made from Next.js server actions or Next.js API routes running inside the
`mps-connect` container. Never from client-side `fetch`. The `aiProxyUrl` prop was
removed entirely from `CaseIntelligencePanel`.

**Consequences (+):**
- Browser never receives internal Docker hostnames
- Server actions run inside the container where Docker DNS resolves correctly
- `AI_PROXY_URL` stays a server-side-only env var (never `NEXT_PUBLIC_`)
- Request format can be validated and corrected server-side before reaching the proxy

**Consequences (−):**
- Server actions introduce an extra network hop (browser → Next.js server → AI proxy)
- Long-running causality calls (up to 180s) hold a server action open — mitigated by
  `AbortSignal.timeout(180_000)` but still a risk if the connection drops

**Implementation:**
- `app/actions/causality.ts` — `runCausalityEngine(caseId, transcript)` server action
- `components/cases/CaseIntelligencePanel.tsx` — calls server action, no `aiProxyUrl` prop

**Rejected alternatives:**
- NEXT_PUBLIC_AI_PROXY_URL (exposes internal hostname to client — wrong)
- Next.js API route as proxy (would work, but server action is simpler and consistent with existing patterns)

---

## ADR-010 — Document Requirements Are Advisory, Never Blocking (2026-06-10)

**Context:**
After the causality engine runs, it generates a list of `documentRequirements` — e.g.,
medical certificates, scholarship agreements, discharge summaries. The question arose
whether the Approve button on a case should be blocked until all required documents
are uploaded.

**Decision:** Documents are advisory. Approval is never blocked by document status.
The MP or superadmin may approve at any time at their discretion. If unfulfilled required
documents exist at approval time, a **two-step confirmation** is required: the first click
on Approve shows a warning; the second click (now labelled "Confirm Approve") proceeds.

**Rationale:**
- Singapore MPS sessions deal with distressed residents, many of whom cannot immediately
  produce documents (elderly, low-income, ongoing hospital stays)
- Blocking approval would leave critical cases stuck indefinitely if a resident cannot
  comply — this would be worse than proceeding without documents
- The MP, as the elected representative, must retain final authority over approval
  regardless of document status
- The two-step confirmation ensures the override is deliberate, not accidental

**Consequences (+):**
- No case is ever stranded by a missing document
- MP retains full discretion — system is a tool, not a gatekeeper
- Two-step UX prevents accidental approval when documents are missing

**Consequences (−):**
- Letters may go out without all supporting documents — the MP owns that risk
- No automatic chase mechanism for outstanding documents (future: resident notification)

**Implementation:**
- `components/cases/CaseApprovalBar.tsx` — `unfulfilledRequiredDocs` count, `showDocWarning` state
- Document count is computed from `document_requirements WHERE required=TRUE AND fulfilled=FALSE`

**Rejected alternatives:**
- Hard block on approval until all docs uploaded (rejected — leaves critical cases stranded)
- No warning at all (rejected — removes signal that docs are missing)

---

## ADR-011 — Causality Engine Persists causal_graph + Letters Atomically (2026-06-10)

**Context:**
The original `CaseIntelligencePanel` called the causality proxy, received a `causalGraph`,
displayed it in the UI, then called a separate `saveDocumentRequirements` server action to
persist the requirements. Letters returned by the proxy (`assembleAllLetters`) were
discarded entirely — never persisted to the `letters` table.

This created two problems:
1. If the user navigated away after the AI call but before the save, data was lost
2. Letters assembled by the causality engine were invisible to the Approvals workspace

**Decision:** `runCausalityEngine` server action persists all three outputs in a single
server-side operation with no client round-trips:
1. `cases.causal_graph` — updated via `UPDATE cases SET causal_graph = $1`
2. `document_requirements` — deleted and reinserted (replace-on-rerun semantics)
3. `letters` — all `draft` letters deleted and reinserted (one per agency route)
4. `case_events` — audit record written with urgency + counts

**Consequences (+):**
- No data is lost between UI display and DB persistence
- Approvals workspace can immediately show generated letters after causality runs
- Rerunning causality replaces all three outputs atomically — no stale data
- Audit trail captures every causality run with its output shape

**Consequences (−):**
- If the server action is called twice simultaneously (e.g., double-click), the second
  run overwrites the first. Mitigated by disabling the button during `isPending`.
- No diff/history of multiple causality runs — only the latest graph is stored.
  Future improvement: append to `causal_graph_history` table.

**Implementation:**
- `app/actions/causality.ts` — single action, three DB writes + audit event

**Rejected alternatives:**
- Client-side persist after display (rejected — data loss risk, letters were never saved)
- Separate actions for graph vs. letters vs. requirements (rejected — creates inconsistency risk)

---

## ADR-012 — AI Agent Panel Shows Structured Explainability, Not Raw Reasoning (2026-06-10)

**Context:**
The original `AgentRunPanel` displayed a flat string `reasoning` field from the agent
decision. There was no confidence score visible, no distinction between what the AI
identified as facts vs. policy, and no flags for concerns even when approving. This was
described as "super ugly looking, lacking usable metrics."

The AI proxy returns a structured JSON object from the LLM containing `appropriate`,
`confidence`, `summary`, `keyFactors`, `policyBasis`, and `flags`. This structure was
being flattened into a single reasoning string before reaching the UI.

**Decision:** `runApprovalAgent` returns a typed `AgentResult` struct. The panel renders
each field distinctly with colour semantics and labelled sections:
- `slate` — rule-engine deterministic decision (no LLM confidence applies)
- `emerald` — model-approved (with confidence %)
- `violet` — model-escalated (with confidence %)

Sections shown: **Summary**, **Confidence** (%), **Key Factors** (bulleted), **Policy Basis**
(bulleted), **Flags** (amber, shown even for approved decisions).

Rule-escalated cases show a **"Review in Approvals →"** CTA instead of a confidence score
(rule decisions have no probabilistic confidence — showing 0% would be misleading).

**Consequences (+):**
- MP can immediately understand WHY the AI reached its decision
- Flags surface concerns even when the AI approved — preserving human oversight
- Colour semantics distinguish deterministic from probabilistic outcomes at a glance
- Rule-escalated cases are routed to the Approvals workspace, not treated as AI failures

**Consequences (−):**
- Structured prompt increases token count slightly
- LLM must be prompted to return valid JSON — fallback to plain-text parsing is needed
  if the model returns malformed output (currently: cascade-failed returns no-confidence result)

**Implementation:**
- `app/actions/agent.ts` — `AgentResult` type, structured JSON prompt
- `components/agent/AgentRunPanel.tsx` — full component rewrite

**Rejected alternatives:**
- Single reasoning string (rejected — no actionable explainability)
- Separate confidence endpoint (rejected — adds latency, one prompt is sufficient)

---

## ADR-013 — Synthetic Data Seeding for Demo Environment (2026-07-08)

**Context:**
MPS Connect needs populated dashboards for stakeholder demonstrations. The system has
800+ synthetic cases from `synthetic_mps_cases.csv` — generated with fake resident names,
invalid NRICs (3-char format, not real 9-char NRICs), and dummy contact details (random
phone numbers and `johndoe/janedoe/user@gmail.com` patterns). Without seeded data, the
Cases, Analytics, Queue, and Approvals dashboards appear empty and cannot demonstrate
the system's capabilities.

**PII assessment of synthetic dataset:**
- **Names:** Synthetic patterns combining common Singaporean surname/given name combinations.
  No real individuals. Names may coincidentally match real persons — this is statistically
  inevitable with common names. The dataset includes `SYNTHETIC DATA DISCLAIMER` header.
- **NRICs:** 3-character codes (e.g., `113H`). Real NRICs are 9 characters (`S1234567A`).
  These cannot be confused with or reverse-engineered to real NRICs.
- **Contact:** Random 9-digit numbers and generic email patterns. Not real contact details.
- **Ward names:** Real Singapore constituency names (Aljunied GRC, Marine Parade GRC, etc.)
  used for demo realism. These are public information.
- **Case text:** Generic templated strings (e.g., "I'm hoping the MP can help with a letter
  of support or appeal"). No real case content.

**Classification:** 🟢 Internal / Non-PII (synthetic data with no real-world identifiability).

**Decision:** Seed the database with synthetic data for demo mode. Enforce four governance
controls:

1. **`DEMO_MODE` env var** — defaults to `true` (safe-by-default). When true, dashboard
   shows amber DEMO banner. Set `DEMO_MODE=false` only for production deployments with
   real constituent data.
2. **Dashboard DEMO banner** — persistent amber bar at top of all dashboard pages:
   "DEMO ENVIRONMENT — All case data shown is synthetic and does not represent real
   residents or cases. Do not enter real PII."
3. **Chat DEMO banner** — navy bar already present: "DEMO — Not an official Singapore
   Government service."
4. **CSV gitignored** — `*.csv` in `.gitignore` prevents synthetic datasets from being
   committed to version control.

**Consequences (+):**
- Stakeholders can evaluate the full system without real case data
- PII risk is zero — synthetic data cannot identify real individuals
- DEMO banner prevents confusion between demo and production environments
- Safe-by-default: banner shows unless explicitly disabled

**Consequences (−):**
- Synthetic data may create unrealistic impressions (categories are evenly distributed;
  real MPS data is heavily skewed toward Housing and Financial Assistance)
- Staff may inadvertently enter real PII into the demo system if they ignore the banner
- No automated cleanup mechanism — synthetic data must be manually purged before
  switching to production mode

**Required action before production go-live:**
1. Set `DEMO_MODE=false` in production `.env`
2. Purge all synthetic cases: `DELETE FROM cases WHERE summary LIKE 'I%m hoping%' OR summary LIKE 'I%ve tried%' OR summary LIKE 'My CPF%' OR summary LIKE 'I just lost%' OR summary LIKE 'My family%' OR summary LIKE 'I was told%' OR summary LIKE 'I%m really%' OR summary LIKE 'I%m not sure%' OR summary LIKE 'I spoke to%';`
3. Verify: `SELECT COUNT(*) FROM cases;` should return 0 (or only real cases)

**Rejected alternatives:**
- Use real anonymised case data (rejected — even anonymised MPS data carries re-identification
  risk; PDPA requires explicit consent for any use beyond original purpose);
- No demo data at all (rejected — empty dashboards cannot demonstrate the system's value
  to MPs and constituency staff).

---

## ADR-014 — BullMQ Async Job Queue for Causality (2026-07-08)

**Context:**
The 3-stage causality pipeline (Foundation, Reasoning, Action) takes between 60 to 120 seconds to execute. Holding a Next.js Server Action open for this duration is brittle, blocking thread execution, and is highly prone to Cloudflare 524 gateway timeouts (which trigger at 100 seconds).

**Decision:** Offload causality processing to a BullMQ task queue using Redis. The Next.js chat action enqueues the job and returns immediately, and a background Node.js worker in `server.js` handles execution asynchronously.

**Consequences (+):**
- Chat submission completes instantly without waiting for Ollama pipeline execution.
- Eliminates 524 timeouts on Cloudflare tunnels.
- Built-in BullMQ retry logic handles transient Ollama failures automatically.
- Job queue status can be queried independently.

**Consequences (−):**
- Adds Redis dependency for task queue storage (requires dual Redis connection setup).
- Requires running a separate worker thread within `mps-ai-proxy`.

**Rejected alternatives:**
- Synchronous server action execution (rejected — timeout-prone and poor UX).
- Next.js API Route with background promise (rejected — no retry support, no persistence, risks thread termination on server reload).

---

## ADR-015 — Resident-Facing Fact-Finding Review and Consent Gate (2026-07-08)

**Context:**
Previously, the resident chat had a blind submission step where the resident typed their name and clicked submit. There was no closure or review of the AI's parsed facts, which could lead to wrong data entry or lack of user control.

**Decision:** Implement a multi-step submission flow with a dedicated "Fact-Finding & Case Review" layout that shows the AI-extracted facts,Proposed Case Summary, and agencies involved, gated by a mandatory check-box consent block.

**Consequences (+):**
- Residents get complete transparency over what facts the AI is submitting on their behalf.
- Resident acts as a human-in-the-loop (HITL) gate at the very start of the intake funnel, preventing incorrect facts from entering the MP's workspace.
- Checkbox ensures compliance with PDPA guidelines regarding explicit consent for case representation.

**Consequences (−):**
- Adds one extra click/step to the submission process for the resident.

**Rejected alternatives:**
- Auto-submission on message threshold (rejected — zero resident control, high risk of false submissions).
- Plain form submit (rejected — no transparency of AI-extracted facts).

---

## ADR-016 — TTS Dynamic Whitelisting and Domain CORS Support (2026-07-08)

**Context:**
The speech synthesis endpoint was restricted by static origin checks which failed when accessed via reverse proxies/tunnels (e.g. `mps-connect.Representative.com`).

**Decision:** Harden allowed origins list to support both hardcoded subdomain matching and dynamic reverse proxy headers (`X-Forwarded-Host`/`X-Forwarded-Proto`).

**Consequences (+):**
- Bulletproof CORS handling across local network and public domain routing.
- Restricts untrusted origins while ensuring valid public custom domain traffic works seamlessly.

**Consequences (−):**
- Relies on reverse proxy correctly forwarding the host and protocol headers.

**Rejected alternatives:**
- Permissive wildcard origin `*` (rejected — critical security flaw allowing cross-origin abuse of local TTS resources).
- Only static localhost/NAS IP checks (rejected — breaks custom subdomain access).

---

## ADR-017 — Increasing Ollama Context Window Size (`num_ctx`) to 8192 (2026-07-08)

**Context:**
Large system prompts (covering agency routing, compliance rules, and formatting directives) combined with long multi-turn conversation histories in non-English UTF-8 formats (Chinese/Tamil/Malay) easily exceed the default Ollama 2048-token context window. This resulted in premature model prediction cutoff (truncated responses mid-sentence) and caused LLM parsing failures.

**Decision:**
Explicitly set `num_ctx: 8192` in the options block of all Ollama API calls within the AI proxy (`api/server.js`), increasing the context window to support complete conversation histories.

**Consequences (+):**
- Prevents premature response truncation during multi-turn intake.
- Ensures complete, grammatically correct multilingual responses are generated.
- Enhances causality engine stability by letting it process the full case transcript.

**Consequences (−):**
- Increases maximum VRAM usage on the Ollama host (Edge Compute Node).
- Marginally increases inference time/latency for extremely long histories.

**Rejected alternatives:**
- Truncating system prompt guidelines (rejected — compromises agency routing accuracy and caseworker empathy rules).
- Shortening history turns to the last 2-3 messages (rejected — breaks causality reasoning and fact extraction).

---

## ADR-018 — Inline Parameter Constraint Mapping for Semantic Parsing (2026-07-08)

**Context:**
Smaller LLM models (such as `gemma4:e2b` 2B parameter) frequently repeated intake questions because required parameters were listed globally as `you MUST ask for:`, and the model failed to dynamically parse Singlish/colloquial responses (e.g. *"where got any income?"*, *"only me and daughter"*).

**Decision:**
Embed repetition avoidance constraints directly inline within the dynamic fact-finding parameter checklist, and instruct the model to parse Singlish/colloquial replies and relative references semantically rather than querying redundantly.

**Consequences (+):**
- Prevents redundant, duplicate questioning, respects Resident's implicit/colloquial answers, speeds up case intake.
- Improves semantic extraction of facts without needing rigid form fields.

**Consequences (−):**
- Marginally increases system prompt token length.

**Rejected alternatives:**
- Handcrafting regex-based slot filling on the frontend (rejected — cannot handle the semantic flexibility of multi-turn conversational Singlish).
- Explicitly asking for numeric inputs via a form (rejected — degrades the conversational, natural, low-friction intake experience for Residents).

---

## Future Development Roadmap (Decisions Pending)

These items are not yet ADRs because the decision has not been made — they require
discussion or technical spike before recording. They are listed here so the next session
can pick them up directly.

### FUTURE-001 — Redis SSE for Real-Time Queue Updates

**Current state:** `QueueClient` polls the server every N seconds.

**Decision required:** Wire `EventSource` (SSE) to a new `GET /api/queue/[sessionId]/stream`
route. Queue actions in `app/actions/queue.ts` publish to a Redis channel. The SSE route
subscribes and streams updates to connected browsers.

**Blocker:** Redis container is provisioned but `REDIS_URL` connection in Next.js has not
been tested for pub/sub. Confirm ioredis works from within the `mps-connect` container
before designing the SSE route.

---

### FUTURE-002 — AI Audit Log Persistence

**Current state:** All AI events (CHAT, CAUSALITY, CATEGORIZE, LETTER, CANARY_TRIGGERED)
are written to `console.log` in `api/server.js`. Lost on container recreation.

**Decision required:** Add `ai_audit_events` table. Replace `auditLog()` in `api/server.js`
with a DB insert. Schema:
```sql
CREATE TABLE ai_audit_events (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```
**PDPA note:** AI audit events may contain anonymised case summaries — classify as
Restricted and apply 7-year retention consistent with case records.

---

### FUTURE-003 — case_events SHA-256 Prev-Hash Chaining

**Current state:** `case_events` is append-only by convention. No cryptographic
guarantee of tamper-evidence.

**Decision required:** Add `prev_hash TEXT` column. On each INSERT, compute
`SHA256(prev_hash || action || actor_id || ts || detail)` and store. A trigger or
application-level function can enforce the chain. Verify the chain on demand via
admin endpoint.

---

### FUTURE-005 — Case Archival / Expiry Policy

**Current state:** Cases stay open indefinitely if a resident cannot provide documents
or does not follow up.

**Decision required:** Define the policy. Options:
- A. Auto-archive cases with no activity after N days (configurable per constituency)
- B. Manual close only — MP explicitly closes
- C. Hybrid: flag stale cases in the UI, but close requires MP action

This is a **domain/policy decision** for System Architect to make — not a technical one.

---

### FUTURE-006 — Remove Legacy Staff Auth Endpoint

**Ref:** ADR-008 — already flagged as required before production go-live.

**Action:** `grep -n "/api/staff/" /volume1/compose/mps-connect/api/server.js` to confirm
no active callers, then delete `POST /api/staff/login`, `GET /api/staff/cases`,
`verifyStaff` from `api/server.js`. Remove `VITE_STAFF_ACCESS_CODE` from all env files.

---

### FUTURE-007 — Resident Notification After Approval

**Current state:** When a case is approved and letters are sent, the resident receives
no automated notification. They must contact the office to follow up.

**Decision required:** Define notification channel (SMS via Twilio? Email via SendGrid?
WhatsApp Business API?). Trigger notification from the `approveCase` server action
after `cases.status = 'sent'`. PII implication: phone/email must be stored per-case
and classified Restricted.
