# Contributing to MPS-Connect

Thank you for your interest in contributing to MPS-Connect. This project aims to modernise constituency casework in Singapore through AI-assisted case management. Every contribution — from bug fixes to documentation improvements — helps make this tool more useful.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Copy** `.env.example` to `.env` and configure your environment
4. **Run** `docker compose up -d` to start the full stack
5. **Verify** the app is running at `http://localhost:3080`

## Development Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development outside Docker)
- Ollama with local models pulled (e.g. `gemma4:e2b` and `gemma4:e4b`)

### Local Development

```bash
# Start dependencies (PostgreSQL, Redis, ClamAV, AI proxy)
docker compose up -d mps-postgres mps-redis mps-clamav mps-ai-proxy

# Run the Next.js dev server locally
npm install
npm run dev
```

## Making Changes

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/` — new functionality
- `fix/` — bug fixes
- `docs/` — documentation changes
- `refactor/` — code restructuring without behaviour change

### Commit Messages

- Use imperative mood: "Add feature" not "Added feature"
- Keep the first line under 50 characters
- Add a blank line then detailed description if needed

### Code Style

- TypeScript for all frontend code (strict mode)
- Server actions for all data mutations — no direct API calls from components
- Comments explain **why**, not what
- Remove commented-out code before committing

### Security Requirements

MPS-Connect handles constituency casework data. All contributions must maintain the existing security posture:

- **All AI calls** must route through `mps-ai-proxy` — no direct browser-to-Ollama calls
- **PII masking** must be applied to all text before inference
- **Input sanitisation** must cover all user-supplied content
- **Output validation** must run before returning AI responses to the client
- **RBAC checks** must gate all server actions appropriately

See the Security section in [README.md](./README.md) for the full OWASP LLM Top 10 compliance matrix.

## Submitting a Pull Request

1. Create your feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure TypeScript compiles cleanly: `npx tsc --noEmit`
4. Test your changes locally with the full Docker stack
5. Push to your fork and open a pull request
6. Describe what your change does and why

### PR Review Criteria

- Does it maintain the security posture?
- Does TypeScript compile without errors?
- Are server actions used for data mutations?
- Is PII handling correct?
- Does the RBAC model cover the new functionality?

## Reporting Issues

Use the issue templates provided:

- **Bug Report** — for broken functionality
- **Feature Request** — for new ideas

## Questions?

Open a GitHub Discussion or reach out via an issue. We're happy to help you get oriented in the codebase.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
