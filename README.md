# MPS-Connect

A 24/7 digital twin of the Meet-the-People Session — built to extend constituency help services beyond the single weekly window that residents currently have access to.

The physical MPS happens once a week for a short window. Residents who cannot make it during that window — due to work, caregiving, or mobility constraints — have no equivalent option. The existing digital alternative is an online form: static, repetitive, and fundamentally incapable of helping a resident think through and articulate a complex problem. It gathers arbitrary information rather than the right information.

MPS-Connect addresses this. It translates one of the most physical and legacy constituency administrative workflows into a digital experience that a resident can access at any time, from anywhere. The intent is not to replace the face-to-face session — it is to complement it. A resident who has already engaged with MPS-Connect arrives at the physical session with a structured, categorised, and pre-triaged case. That creates time for what the physical session is actually for: a genuine, meaningful interaction between the resident and their elected Member of Parliament.

The broader vision is to demonstrate how AI can close the gap between civic need and civic response — enabling immediate action where the situation warrants it, and reducing the wait that currently sits between a resident identifying a problem and a case worker being in a position to help.

---

## What it does

Residents access MPS-Connect at any time. They describe their concern in natural language — typing or speaking — and the AI assistant helps them articulate the full picture across areas like housing, employment, healthcare, family support, and immigration. By the time the case reaches a staff member, it is already structured, categorised, and assigned an urgency level.

Staff get a unified dashboard with all incoming cases. Pre-session triage is done. The physical MPS can focus on conversations that matter rather than transcription.

**Key capabilities:**

- 24/7 resident access — not limited to the weekly session window
- AI-assisted intake in natural language (English, Mandarin, Malay, Tamil, Singlish)
- Automatic case categorisation and urgency classification
- Urgent case flagging — enabling immediate action before the next physical session
- **Branch locator and MP identifier** — routes each resident to the correct MP branch and session schedule based on their postal code, mapped against the full 97-branch post-GE2025 constituency registry
- Staff dashboard with full case view, case history, and document management
- PDPA-compliant consent gate before any AI interaction (privacy and demo disclosure)
- Reference number per submission — no lost cases
- **Case Writer Intelligence panel** — 3-stage causality engine (Foundation → Reasoning → Action) producing a structured `CausalGraph`: urgency assessment, root cause identification, hidden risk detection, information gap analysis, and agency routing with confidence scoring per causal node
- **Multi-agency correspondence** — per-agency appeal letters generated deterministically from the `CausalGraph`; each letter is domain-weighted, agency-specific, sequenced by the document queue, and PDPA-compliant (resident PII held as `██` placeholders, completed by the writer inside gather.gov.sg)
- **Copy to Gather bridge** — letters copied to clipboard for submission via gather.gov.sg; governance gate holds the copy action until MP or administrator approval is granted
- Human-in-the-loop governance — five mandatory review gates ensuring no AI decision reaches formal correspondence without verified human sign-off
- Immutable audit trail — cryptographically chained case event log with SLA tracking per agency; distinguishes automated receipt acknowledgement (`AGY-RCV`) from substantive response (`AGY-RSP`)
- **RBAC** — 5 roles (admin, writer, approver, registry, mp) with granular permission control

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router) + TypeScript |
| Database | PostgreSQL 15 with row-level audit trail |
| AI proxy | Node.js + Express (server-side, internal only) |
| AI inference | Ollama — `gemma4:e2b` (configurable via env var) |
| Speech-to-text | Wyoming Whisper via FastAPI bridge |
| Text-to-speech | Wyoming Piper via FastAPI bridge |
| File scanning | ClamAV daemon |
| Containerisation | Docker Compose |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Branch locator — postal code → constituency → MP |
| Resident Chat | `/chat` | AI-assisted case intake (voice + text) |
| Dashboard | `/dashboard` | KPI tiles, recent cases, queue summary |
| Cases List | `/dashboard/cases` | Urgency-sorted list, status filters, search |
| Case Detail | `/dashboard/cases/[id]` | Full case view, causality panel, approval bar |
| Approvals | `/dashboard/approvals` | 4-tab accordion workspace for MP review |
| AI Agent | `/dashboard/agent` | Structured AI explainability panel |
| Queue | `/dashboard/queue` | Walk-in session management |
| Analytics | `/dashboard/analytics` | Monthly bar chart, category breakdown, 1M/3M/6M toggle |
| Agent Settings | `/dashboard/settings/agent` | AI approval preferences |

---

## Setup

### Prerequisites

- Docker and Docker Compose
- Ollama running with `gemma4:e2b` pulled (or any OpenAI-compatible endpoint)
- `ai-bridge` Docker network (create with `docker network create ai-bridge` if it doesn't exist)

### Environment

Copy `.env.example` to `.env` and configure:

```env
POSTGRES_PASSWORD=your-db-password
JWT_SECRET=your-32-char-minimum-secret
VITE_STAFF_ACCESS_CODE=your-chosen-code
OLLAMA_ENDPOINT=http://<ollama-host>:11434/api/chat
AI_MODEL=gemma4:e2b
APP_URL=http://localhost:3080
```

### Run

```bash
docker compose up -d
```

App available at `http://localhost:3080`. Health checks:

```bash
curl http://localhost:3080/api/health     # {"status":"ok","db":"connected"}
curl http://localhost:3103/health         # {"status":"ok","service":"mps-ai-proxy"}
```

### Seed Data

```bash
# Load 97 GE2025 constituencies + 300 sample cases
docker exec -i mps-postgres psql -U mps -d mps_connect < ./db/seed_cases_300.sql
```

---

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL password | `mps_secret` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — |
| `VITE_STAFF_ACCESS_CODE` | Staff portal access code | — |
| `OLLAMA_ENDPOINT` | Ollama chat API URL (server-side proxy only) | `http://localhost:11434/api/chat` |
| `AI_MODEL` | Ollama model name | `gemma4:e4b` |
| `APP_URL` | Public URL for CORS and upload links | `http://localhost:3080` |
| `AI_KILL_SWITCH` | Emergency AI disable (IMDA Dim.1 compliance) | `false` |
| `NODE_ENV` | Node environment | `production` |

---

## Project Structure

```
mps-connect/
├── app/                    # Next.js App Router pages + server actions
│   ├── actions/            # Server actions (agent, approvals, auth, cases, etc.)
│   ├── api/                # API routes (health, upload, postal-lookup)
│   ├── dashboard/          # Staff dashboard pages
│   ├── chat/               # Resident chat interface
│   └── auth/               # Demo auth flow
├── components/             # React components by domain
│   ├── agent/              # AI agent panel
│   ├── approvals/          # Approval workspace
│   ├── cases/              # Case management
│   ├── chat/               # Chat UI + voice
│   ├── documents/          # Document upload/management
│   ├── layout/             # Sidebar + floating nav
│   └── queue/              # Queue management
├── lib/                    # Shared utilities (auth, db, rbac)
├── api/                    # Express AI proxy (separate container)
│   ├── server.js           # AI proxy with 9-layer sanitization
│   ├── audit.js            # Cryptographic audit chain
│   ├── db.js               # Proxy database access
│   └── queue.js            # Queue utilities
├── db/                     # Database schema + migrations
│   ├── schema.sql          # Full schema definition
│   ├── init.sql            # Docker entrypoint initializer
│   ├── migration_*.sql     # Incremental migrations
│   └── seed_cases_300.sql  # 300 sample cases across 8 categories
├── docs/                   # Governance + compliance documentation
│   ├── AI_GOVERNANCE_POLICY.md
│   ├── AI_SYSTEM_INVENTORY.md
│   ├── DATA_BREACH_RESPONSE_PLAN.md
│   └── GE2025_CONSTITUENCY_DATA.md
├── docker-compose.yml      # Full stack orchestration
├── HANDOFF.md              # Session resume guide
├── ROADMAP.md              # Development roadmap
└── PORTS.md                # Port allocation ledger
```

---

## Security

This platform is built to OWASP LLM Top 10 compliance standards.

### OWASP LLM Top 10 — Compliance Status

| # | Risk | Status | Control |
|---|------|--------|---------|
| LLM01 | Prompt Injection | ✅ Mitigated | Server-side proxy, 9-layer input sanitization (incl. encoded payload detection), scope-restricted single-purpose identity, canary tokens, output anomaly check |
| LLM02 | Insecure Output Handling | ✅ Mitigated | HTML/script stripping, output schema enforcement, whitelist validation |
| LLM03 | Training Data Poisoning | ⚪ N/A | Read-only inference; no fine-tuning pipeline |
| LLM04 | Model Denial of Service | ✅ Mitigated | Dual-layer rate limiting (nginx + proxy), request size caps, 30s timeout |
| LLM05 | Supply Chain Vulnerabilities | ✅ Mitigated | GitHub Actions weekly `npm audit --audit-level=high` |
| LLM06 | Sensitive Information Disclosure | ✅ Mitigated | Server-side PII masking on 5 SG-specific patterns before inference |
| LLM07 | Insecure Plugin Design | ⚪ N/A | No plugin/tool-calling architecture |
| LLM08 | Excessive Agency | ✅ Mitigated | `isUrgent` boolean gated server-side; tag injection stripped at proxy |
| LLM09 | Overreliance | ✅ Mitigated | Mandatory AI disclosure in chat UI; consent gate; human review before action |
| LLM10 | Model Theft | ✅ Mitigated | System prompt isolated in proxy container; never sent to browser |

### Prompt Injection Defence (LLM01)

All AI calls route through `mps-ai-proxy` — a dedicated server-side Express container. The browser calls `/api/ai/chat` and `/api/ai/categorize` only. The system prompt, canary tokens, and PII masking logic live exclusively in `api/server.js` and are invisible to browser DevTools.

**9-layer sanitization applied to every user message before it reaches Ollama:**

| ID | Pattern blocked |
|----|----------------|
| PI-01 | System prompt isolated — never transmitted to browser |
| PI-02 | `ignore all previous instructions`, `disregard`, `override` |
| PI-03 | `you are now`, `act as`, `forget you are`, persona hijacking |
| PI-04 | `[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<system>`, `</system>` |
| PI-05 | Code delimiter spoofing — prompt boundary markers |
| PI-06 | History poisoning — max 20 turns; all turns individually sanitized |
| PI-07 | `||URGENT_BOOKING||` stripped from all user input before inference |
| PI-08 | Encoded payload detection — morse code (5+ tokens), base64 (6+ groups), hex (8+ byte pairs) rejected at proxy before inference |
| PI-09 | Scope-restricted identity — model defined as single-purpose constituency assistant; explicit authorised/unauthorised task list; out-of-scope requests refused regardless of encoding or framing |

**Canary token detection:** A per-request UUID is embedded in the system prompt. If the model echoes the canary in its response (extraction attempt), the proxy redacts it and emits `SECURITY_CANARY_TRIGGERED` in the audit log.

### PII Masking (LLM06)

Applied in `maskPII()` before every Ollama call. The model never sees raw resident PII.

| Pattern | Replacement |
|---------|-------------|
| Singapore NRIC/FIN (`[STFGM]\d{7}[A-Z]`) | `[NRIC REDACTED]` |
| SG mobile — +65 format | `[PHONE REDACTED]` |
| SG mobile — local 8/9 prefix | `[PHONE REDACTED]` |
| Email address | `[EMAIL REDACTED]` |
| SG postal code | `[POSTAL REDACTED]` |
| Street address (number + street type) | `[ADDRESS REDACTED]` |

### Container Security

| Standard | Implementation |
|----------|---------------|
| No privilege escalation | `security_opt: - no-new-privileges:true` on all containers |
| Non-root user | `aiproxy` user in `mps-ai-proxy` container |
| Resource limits | Memory and CPU caps on all services |
| Network isolation | Proxy reachable only on `ai-bridge` — not from browser or host |

### Supply Chain (LLM05)

`.github/workflows/security-audit.yml` runs on every push, pull request, and weekly (Sunday 02:00 SGT). Audits both frontend (`package.json`) and AI proxy (`api/package.json`). Pipeline fails on any high or critical CVE.

### Privacy

- All inference runs locally via Ollama — no resident data transmitted externally
- No external API keys
- PDPA-compliant consent gate — hard block before any AI interaction
- PII masking before all inference calls
- Session-scoped conversations

---

## Governance

MPS-Connect is built in compliance with:

- **Singapore PDPA** (§13, §20, §25, §26D) — consent collection, purpose limitation, breach notification
- **IMDA Agentic AI Framework** (2nd Ed, 2026) — kill switch, accountability tracking, human oversight
- **OWASP LLM Top 10** — full compliance matrix above

Governance documentation lives in `docs/`:

| Document | Purpose |
|----------|---------|
| [AI_GOVERNANCE_POLICY.md](./docs/AI_GOVERNANCE_POLICY.md) | AI governance policy and principles |
| [AI_SYSTEM_INVENTORY.md](./docs/AI_SYSTEM_INVENTORY.md) | AI system registry with risk classification |
| [DATA_BREACH_RESPONSE_PLAN.md](./docs/DATA_BREACH_RESPONSE_PLAN.md) | Incident response playbook (PDPA §26D) |

---

## Engineering Notes

**Why a server-side AI proxy?**
The original architecture had the browser calling Ollama directly through an nginx proxy. That meant the system prompt was visible in DevTools network tabs and could be targeted for extraction or override. The proxy moves all security logic — system prompt, PII masking, canary tokens, injection sanitization, output validation — into a server container that the browser never contacts directly.

**Why Next.js 15?**
The project migrated from Vite SPA to Next.js 15 (App Router) to consolidate server actions, API routes, and SSR into a single framework. Server actions enabled the causality engine and document management to run server-side without a separate BFF layer, reducing container count and eliminating CORS complexity.

**Why local inference?**
Resident data is sensitive by nature. Running inference locally via Ollama means no case content ever leaves the network — no cloud API, no usage logs on a third-party server. It also eliminates per-session API costs at scale.

**Why `gemma4:e2b`?**
Tested against several models for this specific workload. It handles the colloquial, code-switching way residents actually speak well enough to extract structured case information reliably. Model selection here was empirical, not theoretical.

**Why the consent gate?**
Privacy by design. Before any resident data is processed by the AI, explicit consent is collected for three things: AI use, data handling, and demo acknowledgement. This is a gate, not a notice — nothing proceeds without all three checked.

---

## Architecture for Scale

MPS-Connect is scoped for single-branch to small-cluster deployment. A single constituency holds roughly 60,000 residents. Physical MPS sessions see 50–100 cases per week — even at 10× digital adoption that is ~1,000 submissions per week, or 6–8 concurrent users at any peak moment. Scaled to all 97 branches nationally, absolute peak is ~2,000–3,000 concurrent users system-wide. The current architecture handles this load correctly.

| Trigger | Architectural change |
|---|---|
| >3 branches on one deployment | PgBouncer connection pooling; row-level security by branch ID; read replica for analytics |
| >10 concurrent causality analyses | Sync HTTP → async job queue (BullMQ + Redis); resident submits, receives job ID, polls status |
| National deployment (97 branches) | Ollama inference cluster or inference queue behind BullMQ; multi-tenant branch isolation |
| High-availability requirement | Multiple stateless proxy instances behind nginx upstream; horizontally trivial |
| Cross-branch SLA analytics | Read replica + materialized views; no schema change to the append-only audit tables |

The full scale-out path is in [`ROADMAP.md`](./ROADMAP.md).

---

## Important Notes

This is a **research and demonstration tool**. It is not an official government service, not affiliated with any government agency, and must not be presented as one. The consent gate displayed to residents makes this explicit.

---

## Roadmap

Planned development is documented in [`ROADMAP.md`](./ROADMAP.md). **Phase 1 is implemented** — causality engine, Case Writer Intelligence panel, multi-agency letter generation, Copy to Gather, and HITL governance infrastructure are all live. Phase 2 targets demand-driven document collection. Phase 3 introduces G2G document requests to public institutions. Phase 4 covers continuous learning via HITL-RAG and confidence-based batch case approval.

---

Built by [@thegeekybeng](https://github.com/thegeekybeng)
