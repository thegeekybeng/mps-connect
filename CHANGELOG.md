# Changelog

All notable changes to MPS-Connect will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Next.js 15 Migration** — complete rewrite from Vite SPA to Next.js 15 App Router with server actions
- **PostgreSQL 15** — persistent data layer replacing in-memory state
- **RBAC** — 5 roles (admin, writer, approver, registry, mp) with granular permission control
- **Approvals Workspace** (`/dashboard/approvals`) — 4-tab accordion review interface for MP case review
- **Case Detail Approval Bar** — inline approve/return actions with two-step document override
- **AI Agent Panel** — structured explainability UI with confidence scoring, key factors, policy basis
- **Causality Engine** — 3-stage Ollama pipeline (Foundation → Reasoning → Action) via server actions
- **Multi-agency Correspondence** — per-agency letter generation from CausalGraph
- **Analytics Dashboard** (`/dashboard/analytics`) — monthly trends, category breakdown, 1M/3M/6M toggle
- **Queue Management** (`/dashboard/queue`) — walk-in session management with slot tracking
- **Agent Settings** (`/dashboard/settings/agent`) — AI approval preferences per user
- **Document Management** — file upload with ClamAV scanning, upload tokens, requirements tracking
- **Voice Interface** — Wyoming Whisper STT + Piper TTS integration
- **GE2025 Constituency Data** — full 97-branch post-election MP/constituency registry
- **PDPA Consent Gate** — hard-block privacy consent before any AI interaction
- **AI Kill Switch** — IMDA Agentic AI Framework Dim.1 compliance (emergency AI disable)
- **Accountability Tracking** — IMDA Dim.2 compliance with named operator chain
- **AI Governance Documentation** — AI System Inventory, Governance Policy, Data Breach Response Plan
- **9-layer Prompt Injection Defence** — including encoded payload detection (morse/base64/hex)
- **PII Masking** — 6 Singapore-specific patterns (NRIC, mobile, email, postal, address)
- **Canary Token Detection** — per-request UUID extraction monitoring
- **Cryptographic Audit Chain** — SHA-256 chained event log
- **Container Security** — no-new-privileges, non-root user, resource limits, network isolation
- **GitHub Actions CI** — automated `npm audit` on push and weekly schedule

### Removed

- Vite SPA frontend (archived, not shipped)
- MockPass OIDC provider (dormant — FAPI v3 code preserved for future NDI)
- In-memory state management (replaced by PostgreSQL)
- Direct browser-to-Ollama calls (replaced by server actions + AI proxy)

### Security

- All AI calls route exclusively through server-side proxy
- System prompt isolated in container — never sent to browser
- CORS locked to configured `APP_URL` only
- Hardcoded credentials and infrastructure IPs removed from source
