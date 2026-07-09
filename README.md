# MPS-Connect: AI-Powered Digital Twin for Meet-the-People Sessions (MPS)

![stack](https://img.shields.io/badge/stack-Next.js%20%7C%20PostgreSQL%20%7C%20Redis-1C3D5A?style=flat-square) ![deployment](https://img.shields.io/badge/deployment-Docker%20%7C%20BullMQ-2E5D8C?style=flat-square) ![security](https://img.shields.io/badge/security-OWASP%20LLM01%20%7C%20Canary%20%7C%20ClamAV-059669?style=flat-square) ![governance](https://img.shields.io/badge/governance-IMDA%20AI%20%7C%20PDPA%20%C2%A713%2F25-D97706?style=flat-square)

> **Vision:** To bridge the civic-response window by establishing a 24/7 sovereign-infrastructure digital twin of the weekly Meet-the-People Sessions (MPS) workflow. Combines a 3-stage LLM causality reasoning engine with granular human-in-the-loop audit controls to ensure accurate, private, and automated multi-agency drafting.

**GitHub Topics:** `digital-twin` · `civic-tech` · `agentic-ai` · `nextjs` · `postgresql` · `docker-orchestration` · `sovereign-ai` · `prompt-injection-defense` · `pdpa-compliance`

---

## The Problem Space

In modern civic environments, constituency help services face a recurring trilemma:

1. **Accessibility Constraints:** Physical Meet-the-People Sessions (MPS) happen once a week for a short window. Residents who cannot attend—due to work, caregiving, or mobility limitations—are effectively shut out from face-to-face representation.
2. **Static Intake Channels:** The existing digital alternative is typically an online form: static, repetitive, and fundamentally incapable of helping a resident think through and articulate a complex problem. It gathers arbitrary metadata rather than actionable root-cause details.
3. **Casework Congestion:** Case writers and Members of Parliament (MPs) spend significant time transcribing unstructured narratives and manual letter drafting, leaving less time for genuine face-to-face resident interactions and complex cases.

---

## The Solution: A Digital Twin for MPS

MPS-Connect functions as a digital twin that mirrors and extends the physical Meet-the-People Sessions workflow. By translating a legacy, location-bound administrative system into an always-on digital format, it operates in two symbiotic modes:

* **Online Triage & Intake:** Mirrors the resident intake counter. Residents describe their concern in natural language (typed or spoken). The AI assistant guides them through articulating the full picture, structuring, categorizing, and scoring the case's urgency before it reaches staff.
* **Physical Session Co-Pilot:** Mirrors the live case-writing experience. During live sessions, the Causality Engine works as a real-time casework analysis tool. It processes unstructured conversations to uncover cascading risks (e.g., how a lease expiry links to an underlying employment or medical gap) and suggests coordinated multi-agency response routes.

---

## Key Capabilities of the Digital Twin

* **24/7 Resident Access:** Resident-facing portals with dynamic multi-lingual AI intake guides (English, Mandarin, Malay, Tamil, and Singlish) acting as virtual reception desks.
* **Case Writer Intelligence Panel:** 3-stage causality engine (Foundation → Reasoning → Action) yielding a structured `CausalGraph` of root causes and information gaps.
* **Deterministic Multi-Agency Correspondence:** Uses a hybrid pipeline. The AI engine extracts facts, urgency, and routing asks into a structured causal graph, while a local deterministic compiler formats the letters using standardized agency templates to completely prevent LLM hallucinations and guarantee PII boundaries.
* **Human-in-the-Loop (HITL) Governance:** Seven mandatory review gates (Gates 0–6) ensuring no AI decision reaches formal correspondence without human sign-off.
* **Immutable Audit Trail:** Append-only case event log in PostgreSQL combined with a cryptographically chained SQLite transaction history.
* **RBAC & Compliance:** 5 distinct tenancy roles (`superadmin`, `mp`, `admin`, `writer`, `registry`) mapped to strict action policies.

---

## Architecture

MPS-Connect is designed for sovereign local or private-cloud deployments. No resident data ever leaves the local edge network.

### Layered Structure

Our architecture utilizes a strict 4-layer stack to separate business requirements from execution nodes:

1. **Business Layer:** Case guidelines, RACI mappings, and PDPA compliance mandates.
2. **Delivery Layer:** Next.js frontend pages and secure API endpoints.
3. **Intelligence Layer:** express-based AI Proxy enforcing prompt injection shields, system prompt isolation, and UUID canary tokens.
4. **Integration Layer (Enterprise-Ready):** Local high-throughput inference nodes, Redis pub/sub queue, and ClamAV file scanner.

```text
               ┌──────────────────────────────────────────────────┐
               │                  DELIVERY LAYER                  │
               │   Next.js 16 Web Dashboard & Resident Chat UI    │
               └────────────────────────┬─────────────────────────┘
                                        │ (JWT Authenticated)
               ┌────────────────────────▼─────────────────────────┐
               │                INTELLIGENCE LAYER                │
               │  Express AI Proxy (PII Masking & Sanitization)   │
               └────────────────────────┬─────────────────────────┘
                                        │ (Internal Bridge Network)
               ┌────────────────────────▼─────────────────────────┐
               │             ENTERPRISE INTEGRATION LAYER         │
               │ vLLM Inference Nodes / Load-Balanced GPU Cluster │
               └──────────────────────────────────────────────────┘
```

Detailed ERD schemas, network topologies, and all Architecture Decision Records (ADRs) are documented inside the [`docs/`](./docs/) directory:

| Document | Contents |
| --- | --- |
| [Architecture Overview](docs/charts/architecture-overview.html) | 4-layer conceptual model with full layer descriptions |
| [Context Diagram (C1)](docs/charts/context.html) | System boundary, external actors, dependency risks |
| [Container Diagram (C2)](docs/charts/containers.html) | Every service, port, protocol, ADR mapping |
| [Data Flow](docs/charts/dataflow.html) | 4 trust boundaries, PII masking chain, data at rest |
| [Deployment](docs/charts/deployment.html) | Physical hosting zones, VPN topology, data residency |
| [Auth Flow](docs/charts/auth_flow.html) | Demo auth, persona picker, JWT session lifecycle |
| [Case State Machine](docs/charts/state_case.html) | Full lifecycle with HITL gates and SLA mapping |
| [ERD](docs/charts/erd.html) | Database schema, PII classification, denormalisation |
| [Architecture Decisions](./docs/ARCHITECTURE_DECISIONS.md) | All ADRs with alternatives considered |

---

## Tech Stack

| Component | Technology | Description |
| --- | --- | --- |
| **Frontend** | Next.js 16 (App Router) | Core web application framework |
| **Database** | PostgreSQL 15 | Tenancy records and append-only audit trails |
| **Audit Chain** | SQLite 3 (`better-sqlite3`) | Cryptographically chained audit event logs |
| **Task Queue** | BullMQ + Redis | Asynchronous background causality processing |
| **Inference Engine** | **vLLM (Production)** / Ollama (Dev Fallback) | Local high-throughput LLM serving node |
| **Security** | ClamAV | Containerized file virus scanning |
| **Orchestration** | Docker Compose | Containerized stack isolation |

---

## Setup & Deployment

### Prerequisites

* Docker and Docker Compose installed.
* Production inference engine (vLLM running in a GPU-accelerated container) or a local development Ollama daemon.
* A Docker network named `ai-bridge` created:

  ```bash
  docker network create ai-bridge
  ```

### Quick Start

1. Copy the environment configuration template:

   ```bash
   cp .env.example .env
   ```

2. Configure credentials in `.env` (ensure `JWT_SECRET` is at least 32 characters).
3. Copy the Docker configurations:

   ```bash
   cp docker-compose.example.yml docker-compose.yml
   cp Dockerfile.example Dockerfile
   cp api/Dockerfile.example api/Dockerfile
   ```

4. Start the stack:

   ```bash
   docker compose up -d --build
   ```

5. Initialize the database schema and load synthetic test cases:

   ```bash
   docker exec -i mps-postgres psql -U mps -d mps_connect < ./db/seed_cases_300.sql
   ```

The dashboard will be available at `http://localhost:3080`.

---

## Security Compliance (OWASP Top 10 for LLMs)

MPS-Connect is engineered to satisfy the OWASP Top 10 for LLM Applications 2025:

| # | Risk | Status | Control |
| --- | --- | --- | --- |
| **LLM01** | Prompt Injection | ✅ Mitigated | Server-side proxy, 9-layer input sanitization (incl. encoded payload detection), scope-restricted single-purpose identity, canary tokens, output anomaly check |
| **LLM02** | Sensitive Information Disclosure | ✅ Mitigated | Server-side PII masking on 5 SG-specific patterns before inference; no PII in logs |
| **LLM03** | Supply Chain | ✅ Mitigated | GitHub Actions weekly `npm audit --audit-level=high`; pinned dependencies |
| **LLM04** | Data and Model Poisoning | ⚪ N/A | Read-only inference; no fine-tuning or training pipeline |
| **LLM05** | Improper Output Handling | ✅ Mitigated | HTML/script stripping, output schema enforcement, whitelist validation |
| **LLM06** | Excessive Agency | ✅ Mitigated | `isUrgent` boolean gated server-side; tag injection stripped at proxy |
| **LLM07** | System Prompt Leakage | ✅ Mitigated | System prompt isolated in proxy container; never sent to browser |
| **LLM08** | Vector and Embedding Weaknesses | ⚪ N/A | No RAG, vector store, or embedding pipeline |
| **LLM09** | Misinformation | ✅ Mitigated | Mandatory AI disclosure in chat UI; consent gate; human review before action |
| **LLM10** | Unbounded Consumption | ✅ Mitigated | Dual-layer rate limiting (nginx + proxy), request size caps, 30s timeout |

### Prompt Injection Defence (LLM01)

All AI calls route through `mps-ai-proxy` — a dedicated server-side Express container. The browser calls `/api/ai/chat` and `/api/ai/categorize` only. The system prompt, canary tokens, and PII masking logic live exclusively in `api/server.js` and are invisible to browser DevTools.

**9-layer sanitization applied to every user message before it reaches the inference backend:**

| ID | Pattern blocked |
| --- | --- |
| **PI-01** | System prompt isolated — never transmitted to browser |
| **PI-02** | `ignore all previous instructions`, `disregard`, `override` |
| **PI-03** | `you are now`, `act as`, `forget you are`, persona hijacking |
| **PI-04** | `[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<system>`, `</system>` |
| **PI-05** | Code delimiter spoofing — prompt boundary markers |
| **PI-06** | History poisoning — max 20 turns; all turns individually sanitized |
| **PI-07** | `\|\|URGENT_BOOKING\|\|` stripped from all user input before inference |
| **PI-08** | Encoded payload detection — morse code (5+ tokens), base64 (6+ groups), hex (8+ byte pairs) rejected at proxy before inference |
| **PI-09** | Scope-restricted identity — model defined as single-purpose constituency assistant; explicit authorised/unauthorised task list; out-of-scope requests refused regardless of encoding or framing |

**Canary token detection:** A per-request UUID is embedded in the system prompt. If the model echoes the canary in its response (extraction attempt), the proxy redacts it and emits `SECURITY_CANARY_TRIGGERED` in the audit log.

### PII Masking (LLM02)

Applied in `maskPII()` before every inference call. The model never sees raw resident PII.

| Pattern | Replacement |
| --- | --- |
| Singapore NRIC/FIN (`[STFGM]\d{7}[A-Z]`) | `[NRIC REDACTED]` |
| SG mobile — +65 format | `[PHONE REDACTED]` |
| SG mobile — local 8/9 prefix | `[PHONE REDACTED]` |
| Email address | `[EMAIL REDACTED]` |
| SG postal code | `[POSTAL REDACTED]` |
| Street address (number + street type) | `[ADDRESS REDACTED]` |

### Container Security

| Standard | Implementation |
| --- | --- |
| **No privilege escalation** | `security_opt: - no-new-privileges:true` on all containers |
| **Non-root user** | `nextjs` in mps-connect container, `aiproxy` in mps-ai-proxy container |
| **Resource limits** | Memory and CPU caps on all services |
| **Network isolation** | Proxy reachable only on `ai-bridge` — not from browser or host |

---

## Governance & Compliance

MPS-Connect is built in compliance with:

* **Singapore PDPA** (§13, §20, §25, §26D) — consent collection, purpose limitation, breach notification
* **IMDA Agentic AI Companion to the Model AI Governance Framework** (1st Ed, 2026) — kill switch, accountability tracking, human oversight
* **OWASP Top 10 for LLM Applications 2025** — full compliance matrix above

Governance documentation lives in `docs/`:

| Document | Purpose |
| --- | --- |
| [AI_GOVERNANCE_POLICY.md](./docs/AI_GOVERNANCE_POLICY.md) | AI governance policy and principles |
| [AI_SYSTEM_INVENTORY.md](./docs/AI_SYSTEM_INVENTORY.md) | AI system registry with risk classification |
| [DATA_BREACH_RESPONSE_PLAN.md](./docs/DATA_BREACH_RESPONSE_PLAN.md) | Incident response playbook (PDPA §26D) |

---

## Engineering Notes

* **Why a server-side AI proxy?**
  The original architecture had the browser calling the LLM directly through an nginx proxy. That meant the system prompt was visible in DevTools network tabs and could be targeted for extraction or override. The proxy moves all security logic — system prompt, PII masking, canary tokens, injection sanitization, output validation — into a server container that the browser never contacts directly.
* **Why Next.js 16?**
  The project migrated from Vite SPA to Next.js 16 (App Router) to consolidate server actions, API routes, and SSR into a single framework. Server actions enabled the causality engine and document management to run server-side without a separate BFF layer, reducing container count and eliminating CORS complexity.
* **Why local/sovereign inference?**
  Resident data is sensitive by nature. Running inference locally/on-premise means no case content ever leaves the network — no cloud API, no usage logs on a third-party server. It also eliminates per-session API costs at scale.
* **Why `gemma4:e2b`?**
  Tested against several models for this specific workload. It handles the colloquial, code-switching way residents speak well enough to extract structured case information reliably. Model selection here was empirical, not theoretical.
* **Why the consent gate?**
  Privacy by design. Before any resident data is processed by the AI, explicit consent is collected for three things: AI use, data handling, and demo acknowledgement. This is a gate, not a notice — nothing proceeds without all three checked.

---

## Architecture for Scale

MPS-Connect is designed to scale dynamically from a single edge node up to a load-balanced national cluster.

| Trigger | Architectural change |
| --- | --- |
| **>3 branches on one deployment** | PgBouncer connection pooling; row-level security by branch ID; read replica for analytics |
| **>10 concurrent causality analyses** | [IMPLEMENTED] Async job queue (BullMQ + Redis); offloads long-running inference requests |
| **National deployment (97 branches)** | Transition to high-throughput **vLLM inference runner nodes** behind an Envoy load balancer with GPU context caching. |
| **High-availability requirement** | Multiple stateless proxy instances behind Envoy/nginx upstream; horizontally trivial |
| **Cross-branch SLA analytics** | Read replica + materialized views; no schema change to the append-only audit tables |

---

## Disclaimer & Research Purpose

> [!IMPORTANT]
> **This project is not an official Singapore Government project and is purely independent research and development work.**
> It is aimed at creating a digital twin for the existing in-person Meet-the-People Sessions (MPS) format.
>
> This tool is **not** meant to replace existing in-person sessions, but to enhance the user experience (UX) for residents, case writers, administrators, and Members of Parliament (MPs) through a fully digitalized format powered by AI. Under strict human-in-the-loop governance, it ensures timely help is provided to residents while minimizing overall administrative effort for staff. This optimizes the quality of interactions during in-person sessions, giving constituency volunteers and MPs quality engagement focused directly on the needs of the residents.
