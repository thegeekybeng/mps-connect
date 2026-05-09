# MPS-Connect

A constituent case management tool built to cut down the time it takes to log, triage, and follow up on cases received at Meet-the-People Sessions (MPS).

Before this, everything was manual — residents had to repeat themselves, staff had to transcribe on the spot, and nothing was structured enough to action quickly. This changes that.

---

## What it does

Residents arrive, type out their concern in a chat interface (or speak it — STT is supported), and an AI assistant helps them articulate the full picture. By the time a case worker picks it up, the case is already structured, categorised, and assigned an urgency level.

Staff get a clean dashboard with all cases in one view — no sticky notes, no scribbled forms.

**Key capabilities:**

- AI-assisted resident intake in natural language (English, Mandarin, Malay, Tamil, Singlish)
- Automatic case categorisation and urgency classification
- Staff dashboard with full case history
- Consent gate before any AI interaction (privacy and demo disclosure)
- Reference number generated per case — no more lost submissions

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| AI proxy | Node.js + Express (server-side, internal only) |
| AI inference | Ollama — `gemma4:e2b` (local network, via server-side proxy) |
| Speech-to-text | Wyoming Whisper via FastAPI bridge |
| Text-to-speech | Wyoming Piper via FastAPI bridge |
| Containerisation | Docker Compose |

---

## Security

This platform is built to OWASP LLM Top 10 compliance standards. The authoritative requirements document is [`SECURITY_FRAMEWORK.md`](./SECURITY_FRAMEWORK.md). This section captures the full audit posture for this platform specifically.

### OWASP LLM Top 10 — Compliance Status

| # | Risk | Status | Control |
|---|------|--------|---------|
| LLM01 | Prompt Injection | ✅ Mitigated | Server-side proxy, 7-layer input sanitization, canary tokens |
| LLM02 | Insecure Output Handling | ✅ Mitigated | HTML/script stripping, output schema enforcement, whitelist validation |
| LLM03 | Training Data Poisoning | ⚪ N/A | Read-only inference; no fine-tuning pipeline |
| LLM04 | Model Denial of Service | ✅ Mitigated | Dual-layer rate limiting (nginx + proxy), request size caps, 30s timeout |
| LLM05 | Supply Chain Vulnerabilities | ✅ Mitigated | GitHub Actions weekly `npm audit --audit-level=high` |
| LLM06 | Sensitive Information Disclosure | ✅ Mitigated | Server-side PII masking on 5 SG-specific patterns before inference |
| LLM07 | Insecure Plugin Design | ⚪ N/A | No plugin/tool-calling architecture |
| LLM08 | Excessive Agency | ✅ Mitigated | `isUrgent` boolean gated server-side; tag injection stripped at proxy |
| LLM09 | Overreliance | ✅ Mitigated | Mandatory AI disclosure in chat UI; consent gate; human review before action |
| LLM10 | Model Theft | ✅ Mitigated | System prompt isolated in proxy container; never sent to browser |

---

### Prompt Injection Defence (LLM01)

All AI calls route through `mps-ai-proxy` — a dedicated server-side Express container. The browser calls `/api/ai/chat` and `/api/ai/categorize` only. The system prompt, canary tokens, and PII masking logic live exclusively in `api/server.js` and are invisible to browser DevTools.

**7-layer sanitization applied to every user message before it reaches Ollama:**

| ID | Pattern blocked |
|----|----------------|
| PI-01 | System prompt isolated — never transmitted to browser |
| PI-02 | `ignore all previous instructions`, `disregard`, `override` |
| PI-03 | `you are now`, `act as`, `forget you are`, persona hijacking |
| PI-04 | `[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<system>`, `</system>` |
| PI-05 | Code delimiter spoofing — prompt boundary markers |
| PI-06 | History poisoning — max 20 turns; all turns individually sanitized |
| PI-07 | `||URGENT_BOOKING||` stripped from all user input before inference |

**Canary token detection:** A per-request UUID is embedded in the system prompt. If the model echoes the canary in its response (extraction attempt), the proxy redacts it and emits `SECURITY_CANARY_TRIGGERED` in the audit log.

---

### Output Handling (LLM02)

`sanitizeOutput()` runs on every AI response before it reaches the browser:
- All `<script>` tags stripped
- All HTML tags stripped
- `javascript:` → `javascript-blocked:`
- `vbscript:` → `vbscript-blocked:`

**Categorization schema enforcement:** AI-structured responses (category, urgency) are rebuilt from validated fields only. Unknown fields are discarded. Enum values are checked against hardcoded allowlists. Free-text fields are length-capped.

---

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

Nginx telemetry omits client IP (PDPA compliance). AI audit logs record character lengths, not message content.

---

### Human-in-the-Loop Gate (LLM08)

The urgent booking flow previously relied on client-side text scanning for `||URGENT_BOOKING||` — injectable via crafted user messages. This has been closed:

- `||URGENT_BOOKING||` is stripped from all user input in `sanitize()` — it cannot reach Ollama
- The proxy detects the tag in AI output server-side and strips it from visible response text
- A boolean `isUrgent: true` is returned in the JSON response
- `ResidentView.tsx` checks `data.isUrgent` — not any text pattern — before showing the booking modal
- The booking modal requires explicit human confirmation before any action is taken

---

### Overreliance Mitigation (LLM09)

- Opening chat message states explicitly: AI assistant, not a human staff member
- AI badge visible in the chat header at all times
- Consent gate: residents must confirm AI use, data handling, and demo acknowledgement before any AI interaction — hard block, not a notice
- All case outputs require staff review before action

---

### Model DoS Protection (LLM04)

**Layer 1 — nginx:**
- AI endpoints: 20 req/min per IP, burst 5
- HTTP 429 returned immediately for excess requests

**Layer 2 — proxy:**
- `/api/ai/chat`: 30 req/min
- `/api/ai/categorize`: 10 req/min
- Input length cap applied before reaching Ollama
- `AbortSignal.timeout(30_000)` on every inference call

---

### Authentication

Staff dashboard access is gated by `VITE_STAFF_ACCESS_CODE` (environment variable). Keep this strong in any deployment handling real resident data. Server-side auth is the right long-term fix — tracked as a deferred item.

---

### Container Security

| Standard | Implementation |
|----------|---------------|
| No privilege escalation | `security_opt: - no-new-privileges:true` on all containers |
| Non-root user | `aiproxy` user in `mps-ai-proxy` container |
| Resource limits | Memory and CPU caps on all services |
| Network isolation | Proxy reachable only from nginx on `ai-bridge` — not from browser or host |

---

### HTTP Security Headers

Enforced on every nginx response:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, geolocation, payment, USB denied |
| `server_tokens` | `off` — nginx version suppressed |

---

### Supply Chain (LLM05)

`.github/workflows/security-audit.yml` runs on every push, pull request, and weekly (Sunday 02:00 SGT). Audits both frontend (`package.json`) and AI proxy (`api/package.json`). Pipeline fails on any high or critical CVE.

---

### Privacy

- All inference runs locally via Ollama on the local network — no resident data transmitted externally
- No external API keys
- Nginx logs omit client IP
- Session-scoped only — no persistent server-side storage of resident conversations

---

### AI Audit Log

Every inference call emits a structured JSON log:

```json
{
  "ts": "2026-05-09T01:23:00.000Z",
  "type": "CHAT | CATEGORIZE | SECURITY_CANARY_TRIGGERED | ERROR_CHAT | ERROR_CATEGORIZE",
  "inputLen": 42,
  "outputLen": 387,
  "isUrgent": false,
  "canaryDetected": false
}
```

```bash
docker logs mps-ai-proxy | grep '"type"'      # all AI calls
docker logs mps-ai-proxy | grep CANARY        # extraction attempts only
```

---

### Development Checklist

Items marked `[BLOCK]` are merge blockers.

**AI and LLM**
- [ ] `[BLOCK]` All AI calls route through `mps-ai-proxy` — no direct browser-to-Ollama calls
- [ ] `[BLOCK]` System prompt defined only in `api/server.js`
- [ ] `[BLOCK]` All user input passes through `sanitize()` before Ollama
- [ ] `[BLOCK]` PII masking (`maskPII()`) applied to all user-supplied text
- [ ] `[BLOCK]` AI output passes through `sanitizeOutput()` before returning to client
- [ ] `[BLOCK]` Structured output validated against hardcoded schema
- [ ] `[BLOCK]` Canary detection present in every endpoint returning AI text
- [ ] `[BLOCK]` `auditLog()` called on success and error paths
- [ ] Rate limit defined for the new endpoint
- [ ] `AbortSignal.timeout` defined on every inference call

**Human-in-the-loop**
- [ ] `[BLOCK]` Any high-agency action gated on server-side boolean, not AI text
- [ ] Human confirmation modal present for real-world consequences

**Containers**
- [ ] `no-new-privileges: true`
- [ ] Non-root user defined
- [ ] Memory and CPU limits defined
- [ ] Port exposure is minimum required

**HTTP**
- [ ] Full security header block in nginx config
- [ ] `server_tokens off` present
- [ ] CSP does not include `unsafe-inline` or `unsafe-eval`

**CI/CD**
- [ ] `[BLOCK]` `npm audit --audit-level=high` passes cleanly for frontend and proxy

---

## Engineering notes

**Why a server-side AI proxy?**
The original architecture had the browser calling Ollama directly through an nginx proxy. That meant the system prompt was visible in DevTools network tabs and could be targeted for extraction or override. The proxy moves all security logic — system prompt, PII masking, canary tokens, injection sanitization, output validation — into a server container that the browser never contacts directly.

**Why local inference?**
Resident data is sensitive by nature. Running inference locally via Ollama means no case content ever leaves the network — no cloud API, no usage logs on a third-party server. It also eliminates per-session API costs at scale.

**Why `gemma4:e2b`?**
Tested against several models for this specific workload. It handles the colloquial, code-switching way residents actually speak well enough to extract structured case information reliably. Model selection here was empirical, not theoretical.

**Why the consent gate?**
Privacy by design. Before any resident data is processed by the AI, explicit consent is collected for three things: AI use, data handling, and demo acknowledgement. This is a gate, not a notice — nothing proceeds without all three checked.

**Why replace `alert()` with a persistent screen?**
A browser alert is dismissed and the reference number is gone. A resident asking "what was my number?" has no recourse. The CaseSubmitted screen holds the reference until the resident actively leaves — a small change with a meaningful UX impact.

---

## Setup

### Prerequisites

- Docker and Docker Compose
- Ollama running with `gemma4:e2b` pulled (or any OpenAI-compatible endpoint)
- `ai-bridge` Docker network created by `infrastructure/docker-compose.ai.yml`

### Environment

Copy `.env.example` to `.env` and set:

```env
VITE_STAFF_ACCESS_CODE=your-chosen-code
OLLAMA_ENDPOINT=http://100.x.x.x:11434/api/chat
AI_MODEL=gemma4:e2b
```

### Run

```bash
docker compose up -d
```

App available at `http://localhost:3080`. The `mps-ai-proxy` container starts first (healthcheck dependency).

---

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_STAFF_ACCESS_CODE` | Passcode required to access the staff portal |
| `OLLAMA_ENDPOINT` | Ollama chat API URL (server-side proxy only) |
| `AI_MODEL` | Model name (default: `gemma4:e2b`) |

Note: `VITE_OLLAMA_HOST` and `VITE_OLLAMA_MODEL` are no longer used — AI is fully server-side.

---

## Important notes

This is a **research and demonstration tool**. It is not an official government service, not affiliated with any government agency, and must not be presented as one. The consent gate displayed to residents makes this explicit.

Staff access is gated by an environment-variable access code. Do not use a weak code in any environment with real resident data.

---

Built by [@thegeekybeng](https://github.com/thegeekybeng)
