# Graph Report - .  (2026-06-15)

## Corpus Check
- 86 files · ~64,767 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 504 nodes · 791 edges · 42 communities (32 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent & Approval Actions|Agent & Approval Actions]]
- [[_COMMUNITY_Authentication Flow|Authentication Flow]]
- [[_COMMUNITY_Chat & Case Submission|Chat & Case Submission]]
- [[_COMMUNITY_AI Proxy Server|AI Proxy Server]]
- [[_COMMUNITY_Document Management|Document Management]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Approvals UI|Approvals UI]]
- [[_COMMUNITY_Agent Intelligence|Agent Intelligence]]
- [[_COMMUNITY_Proxy Dependencies|Proxy Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Case Intelligence Panel|Case Intelligence Panel]]
- [[_COMMUNITY_Analytics Dashboard|Analytics Dashboard]]
- [[_COMMUNITY_Dashboard Overview|Dashboard Overview]]
- [[_COMMUNITY_Letter Generation Pipeline|Letter Generation Pipeline]]
- [[_COMMUNITY_Voice Trail Accordion|Voice Trail Accordion]]
- [[_COMMUNITY_AI System Registry|AI System Registry]]
- [[_COMMUNITY_Causality Engine|Causality Engine]]
- [[_COMMUNITY_Security Defence Layer|Security Defence Layer]]
- [[_COMMUNITY_Audit Infrastructure|Audit Infrastructure]]
- [[_COMMUNITY_Governance & Compliance|Governance & Compliance]]
- [[_COMMUNITY_Platform Core|Platform Core]]
- [[_COMMUNITY_HITL Review Gates|HITL Review Gates]]
- [[_COMMUNITY_Queue Management|Queue Management]]
- [[_COMMUNITY_RBAC Role System|RBAC Role System]]
- [[_COMMUNITY_Job Queue Infrastructure|Job Queue Infrastructure]]
- [[_COMMUNITY_Case Lifecycle|Case Lifecycle]]
- [[_COMMUNITY_Privacy & Routing|Privacy & Routing]]
- [[_COMMUNITY_Letter Assembly|Letter Assembly]]
- [[_COMMUNITY_App Layout|App Layout]]
- [[_COMMUNITY_Inference Architecture|Inference Architecture]]
- [[_COMMUNITY_Proxy Database|Proxy Database]]
- [[_COMMUNITY_Landing Page|Landing Page]]
- [[_COMMUNITY_Chat Layout|Chat Layout]]
- [[_COMMUNITY_Constituency Routing|Constituency Routing]]
- [[_COMMUNITY_Login Layout|Login Layout]]
- [[_COMMUNITY_PII & Sanitisation|PII & Sanitisation]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_GE2025 Data|GE2025 Data]]

## God Nodes (most connected - your core abstractions)
1. `requireAuth()` - 42 edges
2. `db()` - 38 edges
3. `can()` - 37 edges
4. `dbOne()` - 22 edges
5. `compilerOptions` - 16 edges
6. `runApprovalAgent()` - 11 edges
7. `getDocumentRequirements()` - 8 edges
8. `CaseDetailPage()` - 8 edges
9. `MPS Connect Platform` - 8 edges
10. `3-Stage Causality Engine` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Local Inference Rationale` --rationale_for--> `PDPA Compliance`  [INFERRED]
  README.md → docs/AI_GOVERNANCE_POLICY.md
- `ChatPage()` --calls--> `connection`  [INFERRED]
  app/chat/page.tsx → api/queue.js
- `DashboardLayout()` --calls--> `requireAuth()`  [EXTRACTED]
  app/dashboard/layout.tsx → lib/auth.ts
- `NavItem` --references--> `can()`  [EXTRACTED]
  components/layout/Sidebar.tsx → lib/rbac.ts
- `MPS-AI-002 Causality Engine` --implements--> `3-Stage Causality Engine`  [EXTRACTED]
  docs/AI_SYSTEM_INVENTORY.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Layer Security Defence** — prompt_injection_defence, pii_masking, canary_token, encoded_payload_detection, rate_limiting, container_security [EXTRACTED 0.95]
- **AI Governance Framework** — pdpa_compliance, imda_aigf, owasp_llm_top10, iso_42001, hitl_governance, ai_kill_switch, accountability_chain [EXTRACTED 0.95]
- **Causality Analysis Pipeline** — foundation_stage, reasoning_stage, action_stage, causal_graph, multi_agency_correspondence, agency_template_registry [EXTRACTED 1.00]

## Communities (42 total, 10 thin omitted)

### Community 0 - "Agent & Approval Actions"
Cohesion: 0.07
Nodes (44): getAgentPreferences(), overrideAgentDecision(), saveAgentPreferences(), approveCase(), returnCase(), CreateCaseResult, createCaseWithAnalysis(), deriveCategory() (+36 more)

### Community 1 - "Authentication Flow"
Cohesion: 0.08
Nodes (25): demoResidentLoginAction(), demoStaffLoginAction(), logoutAction(), UserRow, DashboardLayout(), RESIDENT_PERSONAS, STAFF_ROLES, MORE_NAV (+17 more)

### Community 2 - "Chat & Case Submission"
Cohesion: 0.08
Nodes (24): ChatResponse, sendMessage(), submitCase(), SubmitCaseResult, SynthesizeResult, synthesizeSpeech(), transcribeAudio(), TranscribeResult (+16 more)

### Community 3 - "AI Proxy Server"
Cohesion: 0.06
Nodes (22): AGENCY_TMPLS, ALLOWED_AGENCIES, ALLOWED_CATEGORIES, ALLOWED_ORIGINS, ALLOWED_URGENCY, app, { causalityQueue }, cookieParser (+14 more)

### Community 4 - "Document Management"
Cohesion: 0.11
Nodes (23): CaseDocument, DocumentRequirement, getUploadToken(), issueUploadToken(), markRequirementFulfilled(), markTokenUsed(), UploadTokenRecord, DocumentsCard() (+15 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, bcryptjs, ioredis, jose, lucide-react, next, pg, react (+21 more)

### Community 6 - "Approvals UI"
Cohesion: 0.09
Nodes (19): AgentDecision, AIAnalysisTab(), ApprovalCase, CaseCard(), CausalGraph, DocumentRequirement, LETTER_STATUS_PILL, LetterRow (+11 more)

### Community 7 - "Agent Intelligence"
Cohesion: 0.11
Nodes (17): AgentPreferences, AgentResult, buildPrompt(), callModel(), dryRunAgent(), MODEL_CASCADE, ModelDecision, modelResult() (+9 more)

### Community 8 - "Proxy Dependencies"
Cohesion: 0.10
Nodes (19): dependencies, better-sqlite3, bullmq, clamscan, cookie-parser, express, form-data, ioredis (+11 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Case Intelligence Panel"
Cohesion: 0.13
Nodes (16): AgencyRoute, CausalGraph, PRIORITY_COLOUR, Props, URGENCY_COLOUR, CaseDetailPage(), EVENT_LABEL, fetchCase() (+8 more)

### Community 11 - "Analytics Dashboard"
Cohesion: 0.15
Nodes (11): AnalyticsPage(), CategoryBucket, fetchByCategory(), fetchByStatus(), fetchByUrgency(), fetchMonthly(), fetchSummaryStats(), metadata (+3 more)

### Community 12 - "Dashboard Overview"
Cohesion: 0.23
Nodes (8): DashboardPage(), fetchKPIs(), fetchRecentCases(), firstName(), metadata, STATUS_CLASS, tod(), URGENCY_CLASS

### Community 13 - "Letter Generation Pipeline"
Cohesion: 0.20
Nodes (10): 18-Agency Template Registry, CausalGraph Data Structure, ClamAV File Scanning, Copy to Gather Bridge, Demand-Driven Document Collection, DocumentRequirement Schema, G2G Document Requests (Phase 3), gather.gov.sg (+2 more)

### Community 14 - "Voice Trail Accordion"
Cohesion: 0.25
Nodes (5): EVENT_ICONS, EVENT_LABELS, LANG_FLAGS, Props, VoiceEvent

### Community 15 - "AI System Registry"
Cohesion: 0.33
Nodes (7): Accountability Chain (IMDA Dim.2), AI Kill Switch (IMDA Dim.1), AI System Inventory Document, IMDA Agentic AI Framework 2026, MPS-AI-001 Chat Agent, MPS-AI-002 Causality Engine, MPS-AI-003 Approval Agent

### Community 16 - "Causality Engine"
Cohesion: 0.29
Nodes (7): Action Stage (Agency Routing), Async Job Queue (BullMQ + Redis), 3-Stage Causality Engine, Foundation Stage (Entity Extraction), HITL-RAG Continuous Learning (Phase 4), Reasoning Stage (Causal Graph), Scale-Out Architecture Path

### Community 17 - "Security Defence Layer"
Cohesion: 0.33
Nodes (7): Express AI Proxy (mps-ai-proxy), Container Security Hardening, Encoded Payload Detection (Morse/Base64/Hex), OWASP LLM Top 10 Compliance, PII Masking (maskPII), 9-Layer Prompt Injection Defence, Dual-Layer Rate Limiting

### Community 18 - "Audit Infrastructure"
Cohesion: 0.29
Nodes (5): crypto, Database, path, writeAuditEvent(), auditLog()

### Community 19 - "Governance & Compliance"
Cohesion: 0.29
Nodes (7): Cryptographic Audit Chain (SHA-256), Canary Token Detection, PDPA Consent Gate, Data Breach Response Plan, AI Governance Policy Document, ISO 42001 Compliance, PDPA Compliance

### Community 20 - "Platform Core"
Cohesion: 0.33
Nodes (7): Case Management System, Digital Twin of MPS, Meet-the-People Session, MPS Connect Platform, Next.js Migration Rationale, Resident AI Intake, Wyoming Whisper STT / Piper TTS

### Community 21 - "HITL Review Gates"
Cohesion: 0.29
Nodes (7): HITL Gate 1 — Low Confidence Warning, HITL Gate 2 — Fact Verification, HITL Gate 3 — Agency Override, HITL Gate 4 — Causality Opt-in, HITL Gate 5 — MP Approval, HITL Gate 6 — AI Rule-Engine Pre-check, Human-in-the-Loop Governance

### Community 22 - "Queue Management"
Cohesion: 0.29
Nodes (4): Props, QueueEntry, SessionSummary, STATUS_STYLE

### Community 23 - "RBAC Role System"
Cohesion: 0.33
Nodes (6): RBAC (5 Roles), Admin Role, Approver Role, MP Role, Registry Role, Writer Role

### Community 24 - "Job Queue Infrastructure"
Cohesion: 0.40
Nodes (4): causalityQueue, connection, { Queue }, Redis

### Community 25 - "Case Lifecycle"
Cohesion: 0.40
Nodes (5): Case Lifecycle State Machine, Case Number Format (MPS-BRANCH-YYYYMM-P-SEQ), Case Lifecycle Status Codes, SLA Tracking per Agency, Urgency Classification (P1-P4)

### Community 27 - "Letter Assembly"
Cohesion: 0.50
Nodes (4): assembleLetter(), buildCrossRef(), getAgencyTmpl(), selectFacts()

### Community 29 - "Inference Architecture"
Cohesion: 0.50
Nodes (4): Gemma Model (gemma3n:e2b), Local Inference Rationale, Ollama Local Inference, Sovereign Infrastructure (Edge Storage Node)

### Community 33 - "Constituency Routing"
Cohesion: 0.67
Nodes (3): GE2025 97-Branch Constituency Registry, OneMap Geocoding Routing (Phase 2), Postal Sector → Constituency Routing

## Knowledge Gaps
- **225 isolated node(s):** `Database`, `crypto`, `path`, `name`, `version` (+220 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db()` connect `Agent & Approval Actions` to `Authentication Flow`, `Chat & Case Submission`, `Document Management`, `Approvals UI`, `Agent Intelligence`, `Case Intelligence Panel`, `Analytics Dashboard`, `Dashboard Overview`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `ChatPage()` connect `Chat & Case Submission` to `Job Queue Infrastructure`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `connection` connect `Job Queue Infrastructure` to `Chat & Case Submission`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `requireAuth()` (e.g. with `AgentPage()` and `AgentSettingsPage()`) actually correct?**
  _`requireAuth()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `db()` (e.g. with `AgentPage()` and `AgentSettingsPage()`) actually correct?**
  _`db()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `can()` (e.g. with `AgentPage()` and `AgentSettingsPage()`) actually correct?**
  _`can()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Database`, `crypto`, `path` to the rest of the system?**
  _227 weakly-connected nodes found - possible documentation gaps or missing edges._