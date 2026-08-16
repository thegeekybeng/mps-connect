# Design Spec: Collapse Causality Database Seam

**Date:** 2026-08-17  
**Topic:** Collapse Causality Database Seam and Stateless AI Proxy  
**Status:** Approved (Brainstorming Complete)

---

## 1. Context & Motivation

The causality analysis pipeline (which extracts a causal graph, suggested letters, and document requirements from a resident transcript) runs in two modes:
1. **Synchronous Rerun:** caseworker clicks "Analyse" on Case Details. Runs via Next.js server action `runCausalityEngine`.
2. **Asynchronous Intake:** resident submits a case via chat. Enqueues a job that runs in the background.

Currently, database persistence is duplicated: both Next.js server actions and the Express AI Proxy container's background worker contain raw SQL transactions to update the case record, delete/reinsert document requirements, delete/reinserts draft letters, and write case events.

This duplication leaks the database seam into the AI Proxy, requiring it to:
* Hold direct write credentials to the Postgres database.
* Re-implement schema updates when Next.js models change.

---

## 2. Proposed Architecture

We will collapse this database seam by concentrating all database transaction knowledge in Next.js and making the AI Proxy container 100% stateless.

```
[Browser]
    |
    v
[Next.js Server Actions] <-----------------+
    |                                      |
    v                                      v
[CausalityPersistenceAdapter] <--- [Next.js Worker (BullMQ)]
    |                                      |
    | (SQL Writes)                         | (Stateless HTTP POST)
    v                                      v
[PostgreSQL]                         [AI Proxy Express]
                                           |
                                           v
                                     [Local Ollama]
```

### Components

1. **`lib/causality-persist.ts` (NEW):**
   A deep persistence adapter module in Next.js. Exposes a single interface `persistCausalityResult` that wraps the transaction of writing a causality run to the database.

2. **`lib/queue.ts` (NEW):**
   Handles the BullMQ Worker and Queue initialization inside Next.js. Uses a singleton cache on `globalThis` to prevent multiple worker registrations during development hot-reloads.

3. **`api/server.js` (MODIFIED):**
   Stripped of all Postgres (`pg` pool), Redis (`ioredis`), and background worker (`Worker`) imports and logic. Becomes a pure stateless router.

---

## 3. Interfaces & Implementation Details

### Next.js Persistence Adapter (`lib/causality-persist.ts`)
```typescript
export interface CausalityPayload {
  causalGraph: Record<string, any>;
  letters: Array<{
    agency: string;
    agencyLabel?: string;
    content: string;
  }>;
}

export interface PersistActor {
  id: number | null;
  role: string;
  name: string;
}

export async function persistCausalityResult(
  caseId: number,
  payload: CausalityPayload,
  actor: PersistActor
): Promise<{ lettersCreated: number; documentRequirementsSaved: number }>;
```

### Next.js Queue & Worker (`lib/queue.ts`)
```typescript
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

// Cached on globalThis for development safety
const globalForQueue = globalThis as unknown as {
  redisConnection?: Redis;
  causalityQueue?: Queue;
  causalityWorker?: Worker;
};
```
The Worker runs jobs by:
1. Fetching the case transcript from the database.
2. Posting the payload to the AI Proxy’s stateless `/api/ai/causality` route.
3. Invoking `persistCausalityResult(caseId, payload, { id: null, role: 'system', name: 'System Worker' })`.

---

## 4. Deletion Test & Security Benefits

* **Deletion Test:** Deleting the database connection inside the AI Proxy container concentrates all operational database schemas in Next.js. Rather than maintaining two database adapter setups, we have exactly one.
* **Security:** The AI Proxy container runs public-facing LLM proxying. Removing Postgres connection variables and access prevents credential leakage if the container is compromised via prompt injection or code execution.

---

## 5. Verification Plan

### Automated Tests
* Run `npm run lint` and `vitest run` on Next.js workspace.

### Manual Verification
1. Submit a case as a resident. Verify the background job is enqueued in Redis, processed by the Next.js Worker, and written to PostgreSQL.
2. Click "Run Causality Analysis" on the case detail view. Verify the synchronous action writes successfully.
3. Verify the AI Proxy container logs show no connection attempts to PostgreSQL or Redis.
