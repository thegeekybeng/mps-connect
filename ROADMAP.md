# MPS-Connect — Roadmap

> Last updated: 2026-05-09

---

## Phase summary

| Phase | Scope | Status |
| --- | --- | --- |
| **Pre-launch baseline** | 97-branch constituency registry, immutable audit DB, SLA tracking, secure document upload portal | 🔲 Planned |
| **Phase 1** | CWI causality engine (3-stage, Ollama-native), Case Writer Intelligence panel, multi-agency letter generation, Copy to Gather bridge, 7 HITL governance gates (Gate 0–6) | ✅ Implemented |
| **Phase 2** | Demand-driven document collection — `DocumentRequirement` schema, per-case upload checklist driven by causality engine output, case-ID token upload portal (no SingPass dependency) | 🔲 Next |
| **Phase 3** | G2G document requests to public institutions (SingHealth/NHG), inline letter annotation with hover tooltips, SingPass OIDC for high-assurance cases, OneMap precision routing | 🔲 Planned |
| **Phase 4** | HITL-RAG continuous learning pipeline, confidence-based case clustering, batch approval for routine cases | 🔲 Planned |

> **NDI registration note:** SingPass OIDC is a Phase 3 requirement, not Phase 2. The no-SingPass document portal (case ID token) unblocks Phase 2 without NDI approval. Begin NDI registration at <https://api.singpass.gov.sg> when Phase 2 is complete.
---

### Structured Constituency Routing

The current implementation maps postal sector prefixes (first two digits of a six-digit postal code) to constituency data using a client-side lookup table in the frontend bundle. This approach has two fundamental problems.

**Problem 1 — Postal sector prefixes are not reliable constituency boundary markers.**
A single two-digit prefix can plausibly span multiple GRC divisions or branches. Singapore's electoral boundaries follow planning area and street-level boundaries, not postal sector lines. A resident at postal code 32XXXX may belong to a different division than their neighbour at 32YYYY. The prefix cannot be the definitive routing key.

**Problem 2 — The data is incomplete, client-side, and not GE-resilient.**
Singapore's GE2025 (3 May 2025) returned 97 elected MPs, each serving one branch. A 4-member GRC has 4 branches within it — one per MP. The current mapping covers a subset of postal sectors, does not reflect post-GE2025 assignments, and requires a frontend rebuild to update after any General Election.

---

**Planned build — two phases:**

#### Phase 1 — Branch registry (lower complexity, do once)

Compile a complete, verified server-side registry of all 97 branches. Branch addresses are stable and rarely change outside of a GE or PAP branch restructuring. This replaces the client-side lookup entirely.

Each branch record follows this schema:

```json
{
  "branch": "Kolam Ayer",
  "grc": "Jalan Besar GRC",
  "division": "Kolam Ayer",
  "mp": "Dr. Wan Rizal",
  "primaryPostalSectors": ["33", "34"],
  "venues": [
    {
      "address": "Blk XXX Kolam Ayer [full address]",
      "schedule": "Every Monday, 7.30 PM",
      "frequency": "weekly"
    },
    {
      "address": "Blk YYY [full address]",
      "schedule": "Every alternate Wednesday, 7.30 PM",
      "frequency": "fortnightly"
    }
  ]
}
```

The `venues` array accommodates the real-world pattern where a single branch runs split sessions — different locations on different days, with different recurrence patterns (weekly at one venue, fortnightly at another). This is not an edge case; it is a documented operational pattern across multiple branches.

#### Phase 2 — Geocoding-based routing (medium complexity)

Replace prefix matching with precise geocoding via the OneMap API (Singapore Land Authority, official, free):

```text
Resident (postal code)
  → mps-ai-proxy: GET /api/constituency?postal={6-digit}
    → OneMap API: postal code → lat/lng + planning area
    → server-side branch registry: nearest branch lookup by planning area
  ← branch record with mp, venues[], and schedules
```

OneMap resolves the postal code to a planning area and coordinates. The branch registry maps planning area → branch. This eliminates the prefix ambiguity problem: a full six-digit postal code returns a precise planning area, which maps correctly to a branch even when two postal codes with the same prefix fall in different divisions.

After each General Election: update the server-side branch registry JSON, restart the proxy. No frontend rebuild required.

---

### Immutable Audit Infrastructure

The current audit log writes structured JSON to Docker stdout. This is sufficient for real-time monitoring but fails on three counts: it is not persistent across container recreation, not queryable, and not immutable — logs can be cleared or lost.

For a civic platform handling constituent data and AI interactions, the audit trail must survive deployments, support investigation, and be tamper-evident.

#### Planned implementation: SQLite with append-only enforcement

A volume-mounted SQLite database on `mps-ai-proxy`. No additional containers. Two tables:

```sql
-- Security and AI audit events (existing console.log events, persisted)
CREATE TABLE audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- CHAT | CATEGORIZE | BLOCKED_ORIGIN | CANARY_TRIGGERED | ERROR
  session_id  TEXT,
  ip_hash     TEXT,
  input_len   INTEGER,
  output_len  INTEGER,
  is_urgent   INTEGER,        -- 0 | 1
  canary_det  INTEGER,        -- 0 | 1
  detail      TEXT,           -- JSON blob for event-specific fields
  prev_hash   TEXT NOT NULL   -- SHA-256 of previous row for chain integrity
);

-- Case lifecycle events (see Case Traceability below)
CREATE TABLE case_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  case_ref    TEXT NOT NULL,
  status_code TEXT NOT NULL,
  actor       TEXT NOT NULL,  -- SYSTEM | MP_OFFICE | AGENCY | RESIDENT
  note        TEXT,
  prev_hash   TEXT NOT NULL
);
```

The `prev_hash` column implements a cryptographic chain: each row stores the SHA-256 of the previous row's content. Any retroactive modification to any row breaks the chain and is detectable on verification. No `UPDATE` or `DELETE` is ever issued on either table by application code.

---

### Case Traceability and Agency Accountability

#### The problem this solves

The MP correspondence ecosystem has an existing structured system — gather.gov.sg — that records case referrals to agencies and tracks agency responses. That system works. What it does not provide is an independent, tamper-evident record anchored to the resident's original submission timestamp.

MPS-Connect's immutable audit log is a parallel, independent layer. It records when the resident submitted, when the case was referred, and when each subsequent lifecycle event occurred. These timestamps cross-reference against gather.gov.sg records. If a gather.gov.sg entry logs an automated agency acknowledgement as a substantive response, the MPS-Connect record — which tracks `AGY-RCV` and `AGY-RSP` as distinct events — surfaces that discrepancy. An agency that takes 3 months to provide a substantive response while an automated receipt acknowledgement sits in the gather.gov.sg record has no cover when both records are held side by side.

#### Case number format

```text
MPS-{BRANCH}-{YYYYMM}-{PRIORITY}-{SEQ}
Example: MPS-JBKA-202505-P1-0042
```

| Segment | Meaning | Notes |
| --- | --- | --- |
| `MPS` | Platform prefix | Fixed |
| `JBKA` | Branch code (GRC + Division abbreviated) | Derived from constituency routing |
| `202505` | Year + Month of submission | Auto-generated |
| `P1–P4` | Case priority at intake | P1=Critical, P2=High, P3=Medium, P4=Low |
| `0042` | Monthly sequence per branch | Zero-padded, resets per branch per month |

The priority is set at intake by the AI categorisation engine, not by the resident. A P1 case number signals urgency to every downstream party from the moment it is created.

#### Case lifecycle status codes

| Code | Party responsible | Meaning | SLA clock |
| --- | --- | --- | --- |
| `SUBMITTED` | System | Resident submitted case | T0 — all clocks start |
| `MP-ACK` | MP Office | Case reviewed and acknowledged | T1 |
| `MP-REF` | MP Office | Referred to government agency with MP letter | T2 — agency SLA clock starts |
| `AGY-RCV` | Agency | Automated receipt acknowledgement logged | Recorded, **does not stop agency SLA clock** |
| `AGY-RSP` | Agency | First substantive human response received | T4 — agency first response = T4 − T2 |
| `AGY-ACT` | Agency | Agency took action or made a decision | T5 — agency resolution = T5 − T2 |
| `MP-FUP` | MP Office | MP office followed up with resident | T6 |
| `RES-CLO` | MP Office / Resident | Case closed, resident informed | T7 — end-to-end = T7 − T0 |
| `ESCALATED` | MP Office | Agency non-responsive — escalation triggered | Flags SLA breach |

Every status change is written as an immutable row in `case_events`. The full chain of events for any case is queryable at any time.

#### What the data enables

The SLA deltas are computable directly from the timestamps:

| Metric | Calculation | What it measures |
| --- | --- | --- |
| MP acknowledgement time | T1 − T0 | How fast the MP office picked up the case |
| Agency intake lag | T3 − T2 | How long the agency took to acknowledge a referral |
| Agency first response | T4 − T2 | How long to a substantive response |
| Agency resolution time | T5 − T2 | How long to a decision or action |
| End-to-end resolution | T7 − T0 | Total time from resident submission to close |

Aggregated across cases, this produces a factual performance record per agency. The expectation for civil servants is to respond to citizen queries in a timely fashion — that is their function. MPS-Connect creates the structured, immutable record that makes it possible to measure whether that is happening, and where it is not. The MP office retains full discretion on what to do with the data. The platform's role is to ensure the data exists and is accurate.

Response quality — whether agency responses contain sufficient information to actually resolve the resident's concern — is a separate dimension and a planned future addition.

---

### Case Writer Intelligence and Human-in-the-Loop Governance

#### Status: Phase 1 implemented

The causality engine is live as a 3-stage Ollama pipeline in `api/server.js`, accessible at `POST /api/ai/causality`. It runs server-side on demand from the staff Case Intelligence tab.

**Stage 1+2 — Foundation.** Extracts every distinct entity (person, condition, event, agency, resource, obligation) from the resident's conversation transcript and reconstructs a chronological timeline. Marks the earliest causal event as root cause versus the presenting complaint the resident described.

**Stage 3+4 — Reasoning.** Builds a typed causal graph: `root_cause`, `intermediate`, `presenting_problem`, `hidden_risk`, `consequence`. Every non-root node has at least one cause. Confidence scores (0.0–1.0) mark inferred versus evidenced links. Information gaps with severity (`blocking`, `important`, `nice_to_have`) and the exact question to ask the resident are surfaced.

**Stage 5+6+7 — Action.** Scores overall urgency (`Low`→`Critical`) with rationale and time-sensitive factors. Routes to Singapore agencies (18 agencies in the registry) with priority ordering (`primary`, `secondary`, `long_term`) and realistic processing day estimates. Generates a sequenced document queue for outbound correspondence.

**Case Intelligence panel (staff dashboard).** The `CaseDetail` component surfaces a dedicated **Case Intelligence** tab with a split panel:

- Left: urgency badge + rationale, root causes with confidence %, hidden risks, blocking information gaps (with exact questions to ask), agency routing table
- Right: per-agency letter tabs — editable, deterministically assembled from the `CausalGraph`, PDPA-compliant (`██` PII placeholders), with character count and AI disclosure banner
- **Copy to Gather** button: copies the selected letter to clipboard for paste into gather.gov.sg. Feedback state shows "fill `██` fields" reminder on copy.

**Multi-agency letter generation.** Letters are assembled in pure JavaScript (no LLM, deterministic) from the 18-agency template registry. Each letter is domain-weighted to the agency's mandate, cross-referential ("Concurrent letters sent to: HDB, MSF"), and sequenced by the document queue order.

**Seven human-in-the-loop gates (Gate 0–6, all enforced):**

| Gate | Type | Trigger | Status |
| --- | --- | --- | --- |
| 0 — PDPA consent | Entry blocker | Resident must tick 3 explicit consent checkboxes (privacy, AI use, data retention) before chat | Enforced |
| 1 — Low confidence warning | Display | Agency score < 0.6 at categorisation | Enforced |
| 2 — Fact verification | Submission blocker | Writer must confirm or dispute each AI-extracted fact before submitting for review | Enforced |
| 3 — Agency override | Action gate | Any agency add or remove requires a documented reason | Enforced |
| 4 — Causality opt-in | Action gate | Downstream scheme suggestions require explicit human action to add to the case | Enforced |
| 5 — MP approval acknowledgement | Approval gate | MP must confirm they have reviewed AI reasoning before approving the letter | Enforced |
| 6 — AI rule-engine pre-check | Automatic | AI agent evaluates case against configured approval preferences before auto-approve | Enforced |

Every gate produces an immutable audit event. The full chain — what the AI proposed, what the human confirmed or corrected, and why — is queryable per case.

**Inline letter annotation** (Phase 3). In review mode, hovering over any sentence in the generated letter surfaces a tooltip: the AI's reasoning for that sentence, the causal node it references, and the exact quote from the resident's account that the sentence is based on.

**Continuous learning via HITL corrections** (Phase 4). Every human override — a disputed fact, a corrected agency — is a supervised training signal. On MP approval, PII is stripped, the correction is embedded, and written to the vector store. Future categorisation calls retrieve similar past corrections as few-shot guidance.

---

### Document Collection

**The missing document problem.** A significant proportion of MPS cases arrive without the supporting documents needed to make the case. Residents currently bring excessive, irrelevant documents and miss the one critical item the agency actually requires — because no one tells them precisely what is needed and why. Static upload forms ask for the same documents regardless of case type. The resident ends up being the courier between agencies that do not communicate with each other.

#### Phase 2 — Demand-driven document collection (no SingPass dependency)

The causality engine's `CausalGraph` output determines exactly which documents are needed for each specific case — not from a static template, but from the causal chain it identified.

A `DocumentRequirement` is generated per agency route in Stage 3 alongside `agencyRoutes` and `documentQueue`:

```typescript
interface DocumentRequirement {
  agency: string;           // Which agency route this evidence supports
  documentType: string;     // e.g. "Rental Arrears Notice", "Last 3 Payslips"
  reason: string;           // The causal node this document evidences
  relatedNodeIds: string[]; // Low-confidence nodes that this document would verify
  required: boolean;        // true = blocking; false = strengthens case but not blocking
  sourceType: 'resident' | 'government_request';
  sourceInstitution?: string; // Public institution name if government_request
}
```

The Case Intelligence panel surfaces a **Documents Needed** card: residents are told exactly what to bring, per agency, with the reason linked to the causal node. A resident with a housing arrears case routed to HDB and MSF receives two distinct document lists — what HDB needs versus what MSF needs — because the causal graph knows which evidence maps to which agency mandate.

**Upload portal.** When documents are needed, the system issues a time-limited upload token (UUID, 48-hour expiry) linked to the case ID. The resident receives a direct upload link. No SingPass required for Phase 2 — identity is anchored to the case, not a separate OIDC flow. All uploaded files pass through zero-trust content validation before reaching case storage: MIME validation, PDF active content stripping, ClamAV scan.

#### Phase 3 — G2G document requests to public institutions

When `sourceType === 'government_request'` and the institution is a public hospital or polyclinic (SingHealth or NHG cluster), the system generates a **document request letter** addressed to the institution rather than asking the resident to obtain their own records.

The MP's formal authority is the mechanism — a resident requesting their own medical records from SGH through standard channels takes weeks. An MP's office writing to SGH on behalf of a constituent for a formal referral receives a materially different response.

**Hard constraints:**

- Resident explicit consent is non-negotiable and must be captured during the chat interaction before any G2G request is generated
- Public institutions only — SGH, NUH, TTSH, KKH, Alexandra, Changi General, KK Women's and Children's, and NHG polyclinics. Private GPs and private hospitals have no obligation to respond to MP letters
- The resident is informed: "We are writing to [institution] for your medical report on your behalf"
- Same HITL gates and Copy to Gather workflow as all other letters
- `documentQueue` gains a new type: `'document_request'`

**SingPass OIDC** (Phase 3). For high-assurance cases — immigration, legal proceedings — SingPass OIDC verifies the resident's identity against the case record. NDI developer registration: <https://api.singpass.gov.sg>. This is not required for Phase 2 document uploads.

#### What this resolves

Agencies do not talk to each other. The resident is currently the integration layer — carrying documents between silos, explaining the same situation repeatedly, following up individually with each agency. The MP letter was the original coordination mechanism. MPS-Connect systematises it: the causality engine sees the full case, multi-agency letters notify all agencies simultaneously, G2G document requests route evidence directly between institutions, and the audit trail makes agency response gaps visible. The demand-driven document list is the first time a resident is told precisely what is needed and why — not from a form, but from the specific causal logic of their case.

---

### Scale-out Path

MPS-Connect is intentionally scoped for single-branch to small-cluster deployment. This is a deliberate architectural decision. The load profile does not justify distributed systems complexity — adding it prematurely creates maintenance burden that prevents the platform from reaching deployment at all.

**Current architecture ceiling (single-branch deployment):**

- Concurrent users: 50–200 — adequate for any single constituency at full digital adoption
- Case submissions: ~1,000 per week per branch at 10× current physical MPS attendance
- Causality engine: 3 sequential Ollama calls, up to 120 seconds synchronously — adequate for <10 concurrent analyses

The stateless Express proxy scales horizontally trivially. The causality engine is the only non-trivial bottleneck in the current architecture — it is the sole item that is both long-running and synchronous.

**Scale triggers and required changes:**

| Load condition | Architectural change | Complexity |
| --- | --- | --- |
| >3 branches on one instance | SQLite → PostgreSQL with PgBouncer; partition audit tables by branch/month; read replica for analytics queries | Medium |
| >10 concurrent causality analyses | Sync HTTP → async job queue (BullMQ + Redis); client posts job, receives job ID, polls `/api/ai/causality/:jobId`; worker pool processes queue | Medium |
| National deployment (97 branches) | Multi-tenant branch isolation (row-level security by branch ID); Ollama horizontal inference cluster behind BullMQ; k3s or managed Kubernetes for container orchestration | High |
| High-availability requirement | Multiple stateless Express proxy instances behind nginx upstream block; zero stateful changes required — proxy holds no session state | Low |
| Cross-branch SLA analytics | Read replica + materialized views for aggregated SLA metrics across branches; no schema change to the append-only audit tables | Low |

**What the async causality job queue looks like:**

```text
POST /api/ai/causality          → { jobId: "cwi-abc123", status: "queued" }
GET  /api/ai/causality/cwi-abc123
  → { status: "running", stage: "reasoning" }   (poll every 5s)
  → { status: "done", causalGraph: {...}, letters: [...] }
```

The client-side `runCausalityEngine()` function absorbs this change transparently — the polling logic replaces the current 180s fetch timeout. No changes required to the Case Intelligence panel UI.

**What stays unchanged at national scale:**

- Security model — all LLM calls remain server-side; PII never reaches the browser
- HITL governance — gates are stateless checks against case data; scale has no effect
- Audit integrity — append-only tables with cryptographic chain; PostgreSQL preserves this via trigger enforcement on `UPDATE` and `DELETE`
- Local inference — Ollama scales by adding instances behind the queue; no external API dependency introduced
- PDPA compliance — `██` placeholder pattern and branch-scoped data isolation hold regardless of deployment size

---
