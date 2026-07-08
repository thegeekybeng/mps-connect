# MPS Connect — AI Governance Policy

> IMDA Model AIGF 2nd Ed · IMDA Agentic AI Framework 2026 · PDPA 2012
> ISO 42001 Clause 5 — Top-level governance commitment
> Updated: 2026-06-15

## 1. Commitment

MPS Connect is committed to the responsible use of AI in constituency casework. All AI systems operate under human oversight, with transparency, fairness, and accountability as core principles. This policy aligns with the Singapore Model AI Governance Framework (2nd Edition), the IMDA Agentic AI Framework (2026), and the Personal Data Protection Act (2012, amended 2020).

## 2. Governance Principles

### 2.1 Human-Centricity

- AI assists staff — it does not replace human judgement
- Every AI-generated output is reviewed by a human officer before action
- Citizens are informed when AI is used in their case processing
- Human oversight is enforced through **7 defined HITL gates (Gate 0–6)**, spanning the full case lifecycle from resident consent to letter dispatch. Each gate is mapped to its applicable AI system in the [HITL Gate Mapping](AI_SYSTEM_INVENTORY.md#hitl-gate-mapping) section of `AI_SYSTEM_INVENTORY.md`

### 2.2 Transparency

- Citizens see an AI disclosure notice before interacting with the system
- AI-generated letters are marked as such
- Confidence scores and key factors are visible to staff on all AI recommendations
- The AI System Inventory documents every AI component

### 2.3 Accountability

- Named human accountable for every AI decision (`accountable_officer_id`)
- Immutable audit chain (SHA-256 linked) records all AI actions
- Override mechanism allows staff to reverse any AI recommendation

### 2.4 Fairness

- AI systems must not discriminate based on race, religion, language, age, gender, or nationality
- Bias testing to be conducted annually (not yet implemented — see roadmap)

### 2.5 Safety & Robustness

- Kill switch mechanism for emergency AI disable
- Multi-layer prompt injection defences (input sanitisation, canary tokens, encoded detection, output validation)
- Graceful degradation: AI failure → human review (never silent failure)
- Rate limiting prevents resource exhaustion
- Container security hardening (no-new-privileges, resource limits)

## 3. PDPA Compliance

| Requirement | Implementation |
| ----------- | -------------- |
| Privacy Notice (§20) | Displayed in `PrivacyConsentGate` component before case submission |
| Consent (§13) | Three-part explicit consent: data collection, AI processing, retention |
| Purpose Limitation | Data used only for case processing, agency referral, and letter drafting |
| Access Right (§21) | Contact constituency office to request data access |
| Correction Right (§22) | Contact constituency office to request corrections |
| Retention Limitation (§25) | 5-year retention; `retention_expires_at` tracked per case |
| Breach Notification (§26D) | 72-hour notification plan in `DATA_BREACH_RESPONSE_PLAN.md` |
| Data Protection Officer | Designated in `DATA_BREACH_RESPONSE_PLAN.md` §2 |

## 4. AI Risk Classification

All three AI systems (Chat Agent, Causality Engine, Approval Agent) are classified as **High Risk** under the IMDA framework due to:

- Processing citizen personal data in a government context
- Influencing access to government services
- Generating formal government correspondence

Full classification details: `AI_SYSTEM_INVENTORY.md`

## 5. Governance Documents

| Document | Purpose |
| -------- | ------- |
| `AI_SYSTEM_INVENTORY.md` | System registry, operational envelope, accountability chain, HITL gate mapping (Gate 0–6) |
| `DATA_BREACH_RESPONSE_PLAN.md` | PDPA §26D breach notification process |
| `AI_GOVERNANCE_POLICY.md` | This document — top-level governance commitment |
| `.ai-arch/07_ARCHITECTURE_DECISIONS.md` | ADRs documenting technology choices |
| `README.md` | 7-gate HITL framework definition (§ Case Lifecycle) |
| `ROADMAP.md` | Gate implementation status and trigger details (§ Case Writer Intelligence) |

## 6. Review Schedule

- **Quarterly:** Review governance policy against new IMDA/PDPC guidance
- **Annually:** Bias testing, breach response drill, policy update
- **Per-incident:** Update relevant governance rules per PC2E protocol
