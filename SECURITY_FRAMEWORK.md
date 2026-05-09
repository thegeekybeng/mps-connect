# Enterprise Security Framework
### PC2E Civic AI Platforms — MPS Connect · CWI · CodLabStudio

> **Status:** Production. Last audited: 2026-05-09.
> This document is the authoritative security standard for all development work on these platforms. Every new feature, endpoint, and AI integration must pass every applicable section before merging.

---

## 1. Governing Standard

All platforms are built against **OWASP LLM Top 10** compliance and OWASP Web Application Security best practice. This is not aspirational — every control listed here is already implemented in production. Future development must maintain and extend these controls, never regress them.

**Next external validation milestones:**
- Simulated red team exercise (canary efficacy + lockout bypass attempts)
- Formal OWASP LLM Top 10 certification audit

---

## 2. OWASP LLM Top 10 — Full Compliance Map

| # | Risk | Status | Primary Control |
|---|------|--------|-----------------|
| LLM01 | Prompt Injection | ✅ Mitigated | Server-side proxy, 7-layer input sanitization, canary tokens |
| LLM02 | Insecure Output Handling | ✅ Mitigated | HTML/script stripping, output schema enforcement, whitelist validation |
| LLM03 | Training Data Poisoning | ⚪ Not applicable | All inference is read-only against hosted models; no fine-tuning pipeline on these platforms |
| LLM04 | Model Denial of Service | ✅ Mitigated | Dual-layer rate limiting (nginx + proxy), request size caps, abort timeouts |
| LLM05 | Supply Chain Vulnerabilities | ✅ Mitigated | GitHub Actions weekly `npm audit --audit-level=high` on all platforms |
| LLM06 | Sensitive Information Disclosure | ✅ Mitigated | Server-side PII masking (5 SG-specific patterns) before Ollama sees any input |
| LLM07 | Insecure Plugin Design | ⚪ Not applicable | No plugin/tool-calling architecture in use |
| LLM08 | Excessive Agency | ✅ Mitigated | High-agency actions gated on server-authorised boolean flag, not AI text output |
| LLM09 | Overreliance | ✅ Mitigated | Mandatory AI disclosure in all resident-facing UI; human review required before any action |
| LLM10 | Model Theft | ✅ Mitigated | System prompt isolated in server-side proxy container; never transmitted to browser |

---

## 3. Prompt Injection Defence (OWASP LLM01)

**Threat:** An attacker crafts user input to override the system prompt, alter AI behaviour, extract confidential instructions, or trigger unintended actions.

### Layer 1 — Server-side AI proxy (primary defence)

All AI calls route through a dedicated server-side proxy container (`mps-ai-proxy`, `cwi-ai-proxy`). The system prompt is defined only in `api/server.js` — it never appears in a browser network tab, is never bundled into the frontend, and cannot be observed or overridden by a client.

### Layer 2 — Input sanitization (defence in depth)

Applied in the proxy `sanitize()` function to every piece of user-supplied text before it reaches Ollama.

| ID | Pattern blocked | Example |
|----|----------------|---------|
| PI-01 | System prompt extraction | System prompt never leaves the proxy |
| PI-02 | Ignore/disregard instructions | `ignore all previous instructions` |
| PI-03 | Persona hijacking | `you are now`, `act as`, `forget you are` |
| PI-04 | Structural injection | `[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>`, `<system>`, `</system>` |
| PI-05 | Code delimiter spoofing | Prompt boundary markers |
| PI-06 | History poisoning | Max 20 turns retained; all history turns sanitized individually |
| PI-07 | URGENT_BOOKING injection | `||URGENT_BOOKING||` stripped from all user input before Ollama sees it |

### Layer 3 — Canary token detection (extraction alerting)

A per-request UUID canary is embedded in the system prompt on every call. If the model echoes the canary in its response (indicating the system prompt was extracted), the proxy:
1. Redacts the canary from the output
2. Emits a `SECURITY_CANARY_TRIGGERED` audit log entry with a SHA-256 hash of the requester IP

### Requirement for new AI features

- All AI calls must route through the server-side proxy — no exceptions
- System prompt content must never appear in any file other than `api/server.js`
- All new input fields must pass through `sanitize()` before reaching any AI call
- Canary detection must be present in every endpoint that returns AI-generated text

---

## 4. Insecure Output Handling (OWASP LLM02)

**Threat:** AI-generated content contains injected scripts, malformed HTML, out-of-schema values, or fabricated data that reaches the UI or downstream business logic unchecked.

### Controls in place

**HTML/script sanitization** — `sanitizeOutput()` in proxy:
- All `<script>` tags stripped
- All HTML tags stripped
- `javascript:` URI schemes rewritten to `javascript-blocked:`
- `vbscript:` URI schemes rewritten to `vbscript-blocked:`

**Output schema enforcement** — applied to all structured AI responses:
- Category fields validated against hardcoded enum allowlists
- Urgency fields validated against `['Low', 'Medium', 'High', 'Critical']`
- Agency fields validated against a hardcoded list of known SG agencies
- All free-text fields capped at defined character limits
- All array fields capped at defined item counts
- Unknown fields discarded — response is reconstructed from validated fields only

**XSS/injection sanitization** — CodLabStudio `security.ts` middleware:
- `sanitizeInput()` strips XSS patterns and MongoDB operator injection from all request bodies and query params on every request
- Applied globally before any route handler runs

### Requirement for new AI features

- Any AI endpoint returning structured data must define an explicit server-side schema
- Enum fields must validate against a hardcoded allowlist — never pass the raw AI enum value
- Free-text fields must have a character limit applied
- All AI response text must pass through `sanitizeOutput()` before being returned to any client

---

## 5. Model Denial of Service (OWASP LLM04)

**Threat:** An attacker floods the AI proxy with expensive inference requests, exhausting Ollama GPU resources or blocking legitimate users.

### Controls in place

**Layer 1 — nginx rate limiting:**
- General requests: 60 req/min per IP
- AI endpoints: 20 req/min per IP, burst 5
- HTTP 429 returned immediately for excess requests

**Layer 2 — proxy rate limiting:**
- In-memory per-IP rate limiter in each proxy `server.js`
- `/api/ai/chat`: 30 req/min
- `/api/ai/categorize`: 10 req/min
- `/api/ai/letter`: 5 req/min
- `/api/ai/analyze`: 10 req/min

**Request size limit:** `express.json({ limit: '512kb' })` in proxy, `10mb` in CodLabStudio backend (code execution workload)

**Inference timeout:** `AbortSignal.timeout(30_000)` on chat/categorize calls, 45s on letter generation — runaway requests are killed

**Input length cap:** All user input truncated to a maximum character count before reaching Ollama

### Requirement for new AI features

Every new proxy endpoint must define a rate limit, apply an inference timeout, and cap input length. Unbounded inference calls are not permitted.

---

## 6. Supply Chain Vulnerabilities (OWASP LLM05)

**Threat:** A compromised or vulnerable npm dependency introduces a security flaw into the application.

### Controls in place

GitHub Actions security audit workflow runs on:
- Every push to `main`
- Every pull request targeting `main`
- Weekly on Sunday at 02:00 SGT (cron: `0 18 * * 0` UTC)

| Platform | Scope |
|----------|-------|
| MPS Connect | Frontend (`package.json`) + AI proxy (`api/package.json`) |
| CWI | Frontend (`package.json`) + AI proxy (`api/package.json`) |
| CodLabStudio | Frontend (`core-studio/frontend/`) + Backend (`core-studio/backend/`) |

Audit threshold: `--audit-level=high`. The pipeline fails on any high or critical CVE.

### Requirement for dependency changes

- Run `npm audit --audit-level=high` before committing any new dependency
- Packages with known high or critical CVEs must not be added without a documented mitigation in the PR
- `npm audit fix --force` changes must be reviewed manually — do not auto-merge

---

## 7. Sensitive Information Disclosure (OWASP LLM06)

**Threat:** Resident PII is sent to the AI model verbatim, logged in plaintext, or returned in AI output without masking.

### PII masking (server-side, pre-inference)

Runs in the proxy `maskPII()` function on all user-supplied text before it reaches Ollama. The model never sees raw PII.

| Pattern | Replacement | Regex basis |
|---------|-------------|-------------|
| Singapore NRIC/FIN | `[NRIC REDACTED]` | `[STFGM]\d{7}[A-Z]` |
| SG mobile — +65 format | `[PHONE REDACTED]` | `\+?65[\s-]?[689]\d{3}[\s-]?\d{4}` |
| SG mobile — local format | `[PHONE REDACTED]` | `\b[89]\d{7}\b` |
| Email address | `[EMAIL REDACTED]` | RFC-compliant pattern |
| SG postal code | `[POSTAL REDACTED]` | `\bS\d{6}[A-Z]\b` |
| Street address | `[ADDRESS REDACTED]` | Number + street type keyword |

### Telemetry and logging

- Nginx telemetry format omits client IP (`IP omitted` — PDPA compliance): logs PATH, Referer, User-Agent, and Status only
- AI audit logs record input/output character lengths, not content
- Lockout logs record SHA-256 hash of source IP, not plaintext IP

### No external data transmission

All inference runs against the local Ollama instance (Mac Mini M4 Pro on Tailscale). No resident data is sent to any external API, cloud service, or third-party model provider. There are no API keys for external AI services in any `.env` file.

### Requirement for new AI features

- Any new form field that may receive PII must be added to `maskPII()` before the field is wired to any AI call
- AI audit logs must not record the content of user messages — lengths only
- New logging must not capture plaintext IPs — use hashed equivalents where attribution is needed

---

## 8. Excessive Agency / Human-in-the-Loop (OWASP LLM08)

**Threat:** The AI model is coerced into triggering a real-world action (physical booking, alert dispatch, escalation) by injecting the trigger signal in user input.

### Control in place

**MPS Connect — urgent booking flow:**
- `||URGENT_BOOKING||` is stripped from all user input in `sanitize()` before Ollama sees it — it cannot be injected
- The proxy detects the tag in AI output server-side and strips it from the visible response text
- A boolean `isUrgent: true` is returned in the JSON response
- `ResidentView.tsx` checks `data.isUrgent` — not any text pattern — before showing the booking modal
- The booking modal requires explicit human confirmation before any action is taken

### Requirement for new high-agency actions

- Any action with a real-world consequence must be gated on a server-side boolean flag
- The flag must originate from server-side AI output parsing — never from a client-controlled value
- A human confirmation step is mandatory (modal with explicit wording of what will happen)
- The confirmation event must be logged

---

## 9. Overreliance Mitigation (OWASP LLM09)

**Threat:** Staff or residents treat AI output as authoritative without human review, resulting in incorrect decisions or letter content being actioned.

### Controls in place

**Mandatory AI disclosure in resident-facing UI:**
- Opening message in MPS Connect explicitly states: *"I am an AI assistant... I am not a human staff member. Responses are AI-generated and subject to human review before any action is taken on your case."*
- AI badge is visible in the chat header at all times

**Mandatory AI disclosure in staff-facing UI (CWI):**
- All generated letters carry an AI disclosure watermark
- Volunteers are reminded to review before sending anything

**Consent gate (MPS Connect):**
- Before any AI interaction, residents must explicitly consent to: (1) AI use, (2) data handling, (3) demo/non-official acknowledgement
- The gate is a hard block — no AI call is made until all three are confirmed

### Requirement for new resident- or staff-facing AI features

- Every new AI-generated output presented to a human must carry a visible AI disclosure
- If the output can trigger an action (letter sent, booking made, escalation raised), a human review step is mandatory
- Consent gate must remain the entry point for any resident-facing AI interaction

---

## 10. Model Theft Prevention (OWASP LLM10)

**Threat:** An attacker reads the system prompt from browser DevTools, reconstructs the AI's behaviour, and builds a competing or adversarial clone.

### Control in place

The system prompt is defined exclusively in `api/server.js` inside the proxy container. The browser calls `/api/ai/*` — it receives only the AI response. The system prompt, canary, MP name injection, safety instructions, urgency detection logic, and language mirroring rules are never transmitted to the client.

Previously, the `/ollama-api/` nginx proxy forwarded requests directly to Ollama — the system prompt was visible in browser network tabs. This proxy has been removed and replaced with the server-side proxy architecture.

---

## 11. Authentication and Brute-Force Protection

### Password storage

All passwords stored using bcrypt at cost factor 12. Plaintext passwords are never stored, logged, or transmitted.

**Admin password management (CodLabStudio):**
- Stored as `OWNER_PASSWORD_HASH` in `.env` — bcrypt hash only
- Hash generation: `node -e "require('bcrypt').hash('password',12).then(h=>console.log(h))"`
- The hash is set via the `set_admin_pass.sh` script — plaintext password never written to any file

### Persistent login lockout

Implemented in `loginLockout.ts` middleware (CodLabStudio), applied to all `/api/auth/login` POST requests.

| Parameter | Value |
|-----------|-------|
| Lockout threshold | 5 failed attempts per source IP |
| Lockout duration | 15 minutes |
| Progressive delay | 0s, 0s, 1s, 2s, 4s, 8s... (doubles per failure from attempt 3, max 16s) |
| State backend | JSON file at `/app/data/lockout.json` on host volume |
| State flush interval | Every 30 seconds + on SIGTERM and SIGINT |
| Restart behaviour | State loaded from disk on startup — container restart does not reset lockout |

**Why file-backed instead of in-memory:**
Standard in-memory rate limiters reset on container restart. Any attacker who can cause a restart (OOM, crash, graceful restart) gets a clean slate. The host-volume file persists across all container lifecycle events.

### JWT authentication (CodLabStudio)

All protected API endpoints require a valid JWT signed with `JWT_SECRET`. Refresh tokens are signed with `JWT_REFRESH_SECRET`. Both secrets are environment-variable only — never hardcoded.

### Requirement for new authenticated endpoints

- All new endpoints requiring authentication must apply the `authenticate` middleware
- Login-equivalent endpoints must be wrapped by `loginLockout`
- JWTs must use environment-variable secrets — no hardcoded values
- No credential may be stored in plaintext in any file, log, or environment variable

---

## 12. Input Validation and Request Hardening

### CodLabStudio `security.ts` middleware (global, all routes)

| Middleware | Function |
|------------|----------|
| `securityHeaders` | Sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Cache-Control: no-store` |
| `sanitizeInput` | Strips XSS patterns (`<script>`, `on*=`, `javascript:`) and MongoDB operator injection (`$where`, `$gt`, etc.) from all request body keys and query params |
| `validateRequestSize` | Rejects requests exceeding 10MB with HTTP 413 |

These run before any route handler — no user input reaches a route without first passing all three.

### CORS policy

**CodLabStudio backend:** Allowlist-based CORS via `CORS_ORIGIN` environment variable. Requests from unlisted origins are rejected. In production, `CORS_ORIGIN` is set to the exact frontend URL only.

**AI proxies:** No CORS headers — proxies are internal-only services called by nginx, never by browsers directly.

### Requirement for new routes

- All new Express routes must sit behind the global `sanitizeInput` and `validateRequestSize` middleware — do not bypass with `router.use()` scoping
- Any new route that accepts user input must have a Zod or equivalent schema validation layer
- New APIs must define `CORS_ORIGIN` allowlist entries before going to production

---

## 13. HTTP Security Headers

All nginx `server {}` blocks enforce the following on every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'` | Blocks external scripts, styles, and data sources |
| `X-Frame-Options` | `SAMEORIGIN` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter for older browsers |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=(), payment=(), usb=()` | Restricts device API access |
| `server_tokens off` | (nginx directive) | Suppresses nginx version disclosure |

**API-only containers** (no browser UI) use `default-src 'none'` — stricter than `'self'`.

### Requirement for new nginx blocks

- Copy the full security header block into every new `server {}` block
- Any deviation from `default-src 'self'` requires explicit inline justification
- `server_tokens off` must be set in every server block
- `unsafe-inline` and `unsafe-eval` in CSP are prohibited without a documented exception

---

## 14. Infrastructure Security

### Container hardening standards

| Standard | Implementation |
|----------|---------------|
| No privilege escalation | `security_opt: - no-new-privileges:true` on all containers |
| Non-root users | `aiproxy` user in `mps-ai-proxy` and `cwi-ai-proxy`; `70:70` in `workbench-db` |
| Resource limits | `deploy.resources.limits` with memory and CPU caps on every service |
| Restart policy | `restart: unless-stopped` — containers recover from crashes without manual intervention |

### Docker socket isolation

Only `cls-backend` has any Docker daemon access, and only via the Tecnativa socket proxy:
- `workbench-socket-proxy` container mounts `/var/run/docker.sock` (read-only)
- `cls-backend` connects to `tcp://socket-proxy:2375`
- Socket proxy network is `internal: true` — no external routing possible
- Only `CONTAINERS`, `EXEC_CREATE`, `EXEC_START`, `EXEC_INSPECT`, and `POST` API endpoints are exposed

### Network segmentation

| Network | Purpose | External? |
|---------|---------|-----------|
| `ai-bridge` | Shared AI inference network | External (owned by infrastructure compose) |
| `workbench-network` | CodLabStudio internal services | Internal bridge |
| `socket-proxy-network` | Docker socket access | Internal only |

### Requirement for new containers

- `no-new-privileges: true` — mandatory
- Non-root user — mandatory
- Memory and CPU limits — mandatory
- Join only the networks required for the service's function
- Raw `docker.sock` mounts are prohibited — use the socket proxy

---

## 15. AI Audit Logging

Every AI inference call emits a structured JSON log entry from the proxy. Log entries are written to stdout and captured by Docker's log driver.

### Log schema

```json
{
  "ts": "2026-05-09T01:23:00.000Z",
  "type": "CHAT | CATEGORIZE | LETTER | ANALYZE | EXPLAIN | SECURITY_CANARY_TRIGGERED | ERROR_CHAT | ERROR_CATEGORIZE | ERROR_LETTER | ERROR_ANALYZE",
  "inputLen": 42,
  "outputLen": 387,
  "isUrgent": false,
  "canaryDetected": false,
  "urgency": "Low",
  "category": "Housing"
}
```

### Accessing logs

```bash
# MPS Connect — all AI calls
docker logs mps-ai-proxy --follow

# Filter canary extraction attempts only
docker logs mps-ai-proxy | grep CANARY
docker logs cwi-ai-proxy | grep CANARY

# CodLabStudio — lockout events
docker logs cls-backend | grep LOCKOUT
```

### Requirement for new AI proxy endpoints

- `auditLog()` must be called on both the success path and every error path
- Canary detection (`aiText.includes(canary)`) must be present in every endpoint returning AI text
- Log entries must never include the content of user messages — lengths only

---

## 16. Privacy by Design

These controls apply to all resident-facing workflows across all platforms.

| Principle | Implementation |
|-----------|---------------|
| Data minimisation | Only information the resident chooses to share is processed |
| Local inference | No resident data transmitted to external APIs or cloud services |
| PII masking | Applied server-side before any AI inference |
| IP anonymisation | Nginx telemetry logs omit client IP; lockout logs use SHA-256 hashed IP |
| Consent gate | Explicit consent for AI use, data handling, and demo acknowledgement before any AI interaction |
| AI disclosure | Every AI interaction is visibly marked as AI-generated |
| Session scope | Case data lives only in session memory — no persistent server-side storage of resident conversations |

### Requirement for new resident-facing features

- Any new data collection must be disclosed in the consent gate
- No resident data may be transmitted to an external service without explicit legal basis and documented consent
- AI-generated content must be visibly labelled as such

---

## 17. Development Checklist

Complete this checklist for every pull request. Items marked `[BLOCK]` are merge blockers.

### AI and LLM features
- [ ] `[BLOCK]` All AI calls route through the server-side proxy — no direct browser-to-Ollama calls
- [ ] `[BLOCK]` System prompt defined only in `api/server.js` — not in any frontend file or environment variable
- [ ] `[BLOCK]` All user input passes through `sanitize()` before reaching Ollama
- [ ] `[BLOCK]` PII masking (`maskPII()`) applied to all user-supplied text fields
- [ ] `[BLOCK]` AI output passes through `sanitizeOutput()` before returning to client
- [ ] `[BLOCK]` Structured AI output validated against hardcoded schema (enum whitelist, length caps)
- [ ] `[BLOCK]` Canary detection present in the endpoint
- [ ] `[BLOCK]` `auditLog()` called on success and error paths
- [ ] Rate limit defined for the new endpoint
- [ ] Inference timeout defined (`AbortSignal.timeout`)
- [ ] Input length cap defined

### Human-in-the-loop
- [ ] `[BLOCK]` Any high-agency action gated on server-side boolean, not AI text
- [ ] Human confirmation modal present for any real-world consequence
- [ ] Confirmation event logged

### Authentication
- [ ] New authenticated endpoints apply `authenticate` middleware
- [ ] Login-equivalent endpoints apply `loginLockout`
- [ ] No credential stored in plaintext

### Input validation
- [ ] New Express routes sit behind global `sanitizeInput` and `validateRequestSize`
- [ ] Request body validated with Zod schema
- [ ] CORS origin allowlist updated if a new frontend origin is introduced

### Containers
- [ ] `no-new-privileges: true`
- [ ] Non-root user defined
- [ ] Memory and CPU limits defined
- [ ] Port exposure is minimum required
- [ ] No raw `docker.sock` mount

### HTTP
- [ ] Full security header block in nginx config
- [ ] `server_tokens off` present
- [ ] CSP does not include `unsafe-inline` or `unsafe-eval` without documented exception

### Privacy
- [ ] No new resident data collected without consent gate disclosure
- [ ] No external API calls with resident data
- [ ] New logs do not capture plaintext PII or IPs

### CI/CD
- [ ] `[BLOCK]` `npm audit --audit-level=high` passes cleanly
- [ ] No new high or critical CVEs introduced

---

## 18. Incident Response Reference

### Prompt extraction attempt (canary triggered)

```bash
docker logs mps-ai-proxy | grep CANARY
docker logs cwi-ai-proxy | grep CANARY
```

**Response:** The canary is already redacted in the output. Cross-reference the timestamp with nginx access logs to identify the source. If sustained, add a `deny` rule for the source IP in nginx:

```nginx
location /api/ai/ {
    deny <source_ip>;
    ...
}
```

Restart nginx: `docker compose -f infrastructure/docker-compose.nginx.yml restart master-nginx`

### Login brute force (lockout active)

```bash
# View all currently locked IPs
cat /volume1/compose/codlabstudio-ml/data/security/lockout.json | python3 -m json.tool

# Monitor live
docker logs cls-backend -f | grep LOCKOUT
```

To manually clear a lockout (legitimate admin locked out):
```bash
echo '[]' > /volume1/compose/codlabstudio-ml/data/security/lockout.json
docker compose -f /volume1/compose/codlabstudio-ml/docker-compose.yml restart studio-back
```

### Dependency vulnerability found

```bash
cd /volume1/compose/<platform>
npm audit --audit-level=high
npm audit fix            # conservative — only semver-compatible upgrades
npm audit fix --force    # breaking upgrades — review diff before committing
git diff package-lock.json   # verify what changed
npm test                 # run tests if available
```

### Credential drift (DB auth failure)

Symptom: `Authentication failed against database server` in container logs.

```bash
# Get password Prisma is using
DB_URL=$(docker exec cls-backend printenv DATABASE_URL)
PGPASS=$(echo "$DB_URL" | sed 's|postgresql://[^:]*:\([^@]*\)@.*|\1|')

# Reset Postgres to match (socket auth — no password required)
docker exec workbench-db psql -U workbench_admin -d codlabstudio \
  -c "ALTER USER workbench_admin WITH PASSWORD '$PGPASS';"

# Restart backend to re-run seed
docker compose -f /volume1/compose/codlabstudio-ml/docker-compose.yml restart studio-back
docker logs cls-backend --tail 10 | grep -E "seed|Admin|Error"
```

---

*Maintained by [@thegeekybeng](https://github.com/thegeekybeng). Update this document every time a security control is added, changed, or removed. Version this file in git — the commit history is the audit trail.*

---

## Appendix A — Per-Platform Audit Coverage Matrix

> **This table is the canonical definition of "audit-complete" for each platform.**
> Every development session must verify that the coverage below is maintained. Any new feature that touches a row marked ✅ must preserve that coverage before merging. Any row marked `n/a` for a platform must be re-evaluated if the platform architecture changes (e.g., adding an AI proxy to CodLabStudio would promote those rows from `n/a` to required).

| Audit Requirement | MPS-Connect | CWI | CodLabStudio |
|---|---|---|---|
| OWASP LLM Top 10 compliance table in README | ✅ All 10 with status | ✅ All 10 with status | ✅ All 10 with status |
| Prompt injection defence — all 7 layers documented | ✅ | ✅ | n/a (Express backend, sanitizeInput covers XSS/injection) |
| Output handling — schema + enum validation | ✅ | ✅ schema + enum detail | ✅ Zod validation |
| PII masking — all 6 SG patterns with regex | ✅ All 6 patterns | ✅ All 6 patterns | n/a |
| Human-in-the-loop gate | ✅ Full `isUrgent` boolean flow | ✅ AI disclosure mandate on all letters | ✅ Docker execution isolation via socket proxy |
| Rate limiting — per-endpoint detail | ✅ Per-endpoint limits | ✅ Per-endpoint limits | ✅ General + execution-specific limiters |
| Canary token detection | ✅ | ✅ | n/a |
| Authentication / brute-force hardening | ✅ Staff access code (deferred to server-side auth) | ✅ Same | ✅ bcrypt cost 12 + persistent lockout table |
| Input validation middleware | n/a | n/a | ✅ `security.ts` — sanitizeInput, validateRequestSize, securityHeaders |
| Container security — full standards table | ✅ | ✅ | ✅ Socket proxy + container standards table |
| HTTP security headers — all 8 headers | ✅ All 8 | ✅ All 8 | ✅ All 8 |
| Supply chain / CI/CD audit | ✅ Frontend + proxy | ✅ Frontend + proxy | ✅ Frontend + backend |
| Privacy / PDPA controls | ✅ Local inference, IP anonymisation, consent gate | ✅ Local inference, IP anonymisation | n/a |
| AI audit log + monitoring commands | ✅ | ✅ | n/a |
| Development checklist with `[BLOCK]` merge gates | ✅ | ✅ | ✅ |

### How to use this matrix

**On every PR that touches a ✅ row:** Verify the control is still in place after the change. Do not merge if the control regresses.

**On every PR that touches an `n/a` row:** Re-evaluate whether the platform change makes the control applicable. If yes, implement before merging.

**On every new platform or service added to the ecosystem:** Create a new column in this table before shipping. Every ✅ row must either be satisfied or explicitly justified as `n/a` with documented rationale.

**Audit cycle:** Review this matrix at the start of every new development milestone. Add rows when new control categories are introduced. Never remove rows — if a control is superseded, update the description but preserve the history.

*Matrix established: 2026-05-09. Last verified: 2026-05-09.*
