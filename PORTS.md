# Port Allocations

This file is the authoritative ledger for port assignments in the MPS-Connect project.
To prevent collisions, **do not** assign new ports without updating this ledger first.

| Service | Container Port | Host Port | Protocol | Purpose |
|---------|----------------|-----------|----------|---------|
| mps-connect | 3000 | 3080 | HTTP | Next.js 16 application server |
| mps-ai-proxy | 3103 | 3103 | HTTP | Express AI proxy (exposed for nginx /auth/ proxy) |
| mps-postgres | 5432 | — | TCP | PostgreSQL 15 database (internal) |
| mps-redis | 6379 | — | TCP | Redis for future BullMQ (internal) |
| mps-clamav | 3310 | — | TCP | ClamAV daemon for file scanning (internal) |

> **Note:** Host ports are only mapped for services that need external access. Internal services communicate via the `ai-bridge` Docker network.
