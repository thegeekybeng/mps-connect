# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| Latest `main` | ✅ Yes |
| Older commits | ❌ No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in MPS-Connect, please report it responsibly:

1. **GitHub Private Vulnerability Reporting:** Use the [Security Advisories](https://github.com/mps-connect/mps-connect/security/advisories/new) feature to submit a private report
2. **Email:** Contact the maintainer directly.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgement:** Within 72 hours
- **Assessment:** Within 7 days
- **Fix (critical):** Within 14 days
- **Fix (non-critical):** Within 30 days

## Security Architecture

MPS-Connect handles constituency casework data and operates under Singapore's PDPA. The security model is documented in detail in the [README.md](./README.md#security) Security section, covering:

- OWASP LLM Top 10 compliance matrix
- 9-layer prompt injection defence
- Server-side PII masking (6 Singapore-specific patterns)
- Canary token detection
- Container security hardening
- Rate limiting (dual-layer: nginx + proxy)

## AI-Specific Concerns

Given the AI components in this project, we are particularly interested in reports related to:

- **Prompt injection** — bypassing the 9-layer sanitisation in `api/server.js`
- **PII leakage** — resident data appearing in AI responses or logs
- **Canary extraction** — system prompt retrieval attempts
- **Output manipulation** — forcing the AI to generate harmful content
- **Encoded payload bypass** — evading the morse/base64/hex detector

## Automated Scanning

- `npm audit --audit-level=high` runs on every push via GitHub Actions
- Weekly automated dependency audit (Sunday 02:00 SGT)
- Pipeline fails on any high or critical CVE

## Scope

The following are **in scope** for security reports:

- All code in this repository
- Docker container configurations
- AI proxy (`api/server.js`) security controls
- Authentication and RBAC implementation
- Database schema security

The following are **out of scope:**

- Ollama itself (report upstream)
- Third-party dependencies (report upstream, but do let us know)
- Social engineering attacks on contributors
