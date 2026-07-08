# MPS Connect — AI System Inventory

> ISO 42001 Clause 4 · IMDA Model AIGF 2nd Ed · Updated: 2026-06-15

## System Owner

- **Named Accountable Person:** System Administrator
- **Role:** System Developer & Operator
- **Contact:** Via github

---

## AI System Registry

### System 1: MPS Resident Chat Agent

| Field | Value |
| ------- | ------- |
| System ID | MPS-AI-001 |
| Purpose | Constituency casework — receives resident issue descriptions, identifies relevant agencies, and explains available help options |
| AI Model | Ollama gemma4:e2b (locally hosted) |
| IMDA Classification | Tool-Using Agentic AI |
| Human Involvement Level | HOTL (Human-on-the-Loop) — AI categorises, human approves (Gate 0, Gate 1) |
| Risk Tier | High (affects citizen access to government services) |
| Data Processed | Resident case descriptions (text/voice), postal codes |
| PII Handling | Masked before LLM transmission (NRIC, phone, email, address) |
| Decision Authority | Advisory only — all outputs reviewed by staff |
| Kill Switch | `AI_KILL_SWITCH=true` in environment → disables all AI endpoints |
| Audit Trail | Immutable SQLite chain (SHA-256 prev_hash) at `/data/audit.db` |

### System 2: MPS Causality Engine

| Field | Value |
| ------- | ------- |
| System ID | MPS-AI-002 |
| Purpose | 3-stage causal analysis pipeline — extracts entities/timeline, builds causal graph, routes to agencies, and generates letter templates |
| AI Model | Ollama gemma4:e4b (locally hosted, same instance) |
| IMDA Classification | Decision-Support AI |
| Human Involvement Level | HITL (Human-in-the-Loop) — MP must approve every letter (Gate 2, Gate 3, Gate 4, Gate 5) |
| Risk Tier | High (generates formal government correspondence) |
| Data Processed | Conversation transcripts, case metadata |
| PII Handling | Sanitized inputs; letters use placeholders (██ NRIC ██) for completion by staff |
| Decision Authority | Advisory — letters require MP approval before sending |
| Kill Switch | Same as MPS-AI-001 (shared proxy) |
| Audit Trail | `CAUSALITY` events in audit chain |

### System 3: MPS Approval Agent

| Field | Value |
| ------- | ------- |
| System ID | MPS-AI-003 |
| Purpose | Evaluates pending letters against MP preferences for auto-approval candidacy |
| AI Model | Ollama cascade: gemma4:e2b → gemma4:12b-mlx → qwen3.6:27b |
| IMDA Classification | Decision-Support AI |
| Human Involvement Level | HOTL — auto-approves within strict bounds; escalates outside bounds (Gate 6) |
| Risk Tier | High (makes pre-approval recommendations) |
| Data Processed | Case category, urgency, summary, core request |
| PII Handling | Operates on metadata only — no raw resident text |
| Decision Authority | Deterministic rules enforce hard boundaries (urgency cap, category allowlist); model handles content quality within those bounds |
| Kill Switch | Disable via agent preferences (per-user) |
| Audit Trail | `agent_decisions` table with `accountable_officer_id` |
| Hard Constraints (System Level) | Urgency > configured cap → escalate; Category not in allowlist → escalate; Excluded keyword hit → escalate; All models timeout → escalate |

---

## Operational Envelope — MPS-AI-001 (Chat Agent)

### Permitted Actions

- Respond to resident queries about constituency matters
- Identify relevant Singapore government agencies
- Provide agency hotlines from the approved routing table
- Flag urgent cases with `||URGENT_BOOKING||` tag (stripped server-side)
- Mirror the resident's language (EN, ZH, MS, TA, Singlish)

### Prohibited Actions

- Make binding commitments on behalf of the MP
- Access or modify case records in the database
- Process requests outside constituency casework scope
- Decode, translate, or act on encoded instructions
- Reference Malaysian or non-Singapore agencies

### Boundary Enforcement

| Mechanism | Level | Bypass Possible? |
| ----------- | ------- | ----------------- |
| System prompt persona constraints | Prompt | Yes (via injection) |
| Input sanitisation regex (12+ patterns) | Code | No |
| Encoded payload detector (morse/b64/hex) | Code | No |
| Canary token in every request | Code | No |
| Output sanitisation (XSS, script removal) | Code | No |
| Origin allowlist (nginx-only callers) | Network | No |
| Rate limiting (30 req/min per IP) | Code | No |
| Kill switch | Environment | No |

### Emergency Stop

- **Mechanism:** Set `AI_KILL_SWITCH=true` in `.env` and restart the `mps-ai-proxy` container
- **Effect:** All `/api/ai/*` endpoints return 503 immediately; `/health` remains operational
- **Recovery:** Set `AI_KILL_SWITCH=false` and restart
- **Who can trigger:** System administrator with Docker access

---

## Accountability Chain (IMDA Agentic AI Framework Dim.2)

```text
Resident submits case
    ↓
AI Agent processes (MPS-AI-001/002/003)
    ↓
Staff reviews AI output (writer/admin role)
    ↓ accountable_officer_id recorded
MP approves final decision (mp/superadmin role)
    ↓ approved_by recorded in letters table
Letter sent to agency
```

- **Agent Developer:** System Administrator
- **System Operator:** System Administrator
- **Decision Reviewer:** Staff user (writer/admin — `accountable_officer_id`)
- **Final Authority:** MP (`approved_by` in `letters` table)
- **Accountability Principle:** The AI cannot make final decisions. A human officer is always in the chain.

---

## HITL Gate Mapping

> Cross-reference: Gates are defined in `README.md` (§ Case Lifecycle) and `ROADMAP.md` (§ Case Writer Intelligence). All 7 gates produce immutable audit events.

| Gate | Name | Type | Applicable System(s) | Human Involvement | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | PDPA consent | Entry blocker | MPS-AI-001 (Chat Agent) | HOTL — resident must consent before AI interaction | Enforced |
| 1 | Low confidence warning | Display | MPS-AI-001 / MPS-AI-002 | HOTL — writer sees warning when node confidence < 0.6 | Enforced |
| 2 | Fact verification | Submission blocker | MPS-AI-002 (Causality Engine) | HITL — writer must confirm every AI-extracted fact | Enforced |
| 3 | Agency override | Action gate | MPS-AI-002 (Causality Engine) | HITL — agency add/remove requires documented reason | Enforced |
| 4 | Causality opt-in | Action gate | MPS-AI-002 (Causality Engine) | HITL — writer manually triggers causal analysis | Enforced |
| 5 | MP approval / sign-off | Approval gate | MPS-AI-002 (Causality Engine) | HITL — MP reviews AI reasoning before approving letters | Enforced |
| 6 | AI rule-engine pre-check | Automatic | MPS-AI-003 (Approval Agent) | HOTL — agent evaluates against MP preferences; escalates if outside bounds | Enforced |
