# Collapse Causality Database Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the duplicated database persistence logic for causality analysis into Next.js, making the AI Proxy completely stateless and securing database access boundaries.

**Architecture:** Move the BullMQ background worker into Next.js via a singleton initialization inside Next.js `instrumentation.ts`. Consolidate all database transaction writes into a single deep Next.js persistence module `lib/causality-persist.ts` called by both synchronous and asynchronous pipelines. Simplify the AI Proxy by deleting database, Redis, and worker logic.

**Tech Stack:** Next.js 16 (App Router), TypeScript, BullMQ, ioredis, pg, Express, Node.js.

---

### Task 1: Next.js Dependencies & Config

**Files:**
- Modify: [package.json](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/package.json)
- Modify: [next.config.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/next.config.ts)

- [ ] **Step 1: Add `bullmq` to Next.js dependencies**
  Modify [package.json](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/package.json) to add `"bullmq": "^5.7.8"` under `dependencies`.
  ```json
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "bullmq": "^5.7.8",
    "ioredis": "^5.4.1",
    "jose": "^5.9.6",
    ...
  }
  ```

- [ ] **Step 2: Add `bullmq` to `serverExternalPackages`**
  Modify [next.config.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/next.config.ts) to include `'bullmq'` in `serverExternalPackages` to avoid compilation errors on native dependencies.
  ```typescript
  serverExternalPackages: ['pg', 'ioredis', 'jose', 'bullmq'],
  ```

- [ ] **Step 3: Run npm install**
  Run: `npm install` in the project root to install the new dependency.
  Expected: Success without dependency conflicts.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add package.json package-lock.json next.config.ts
  git commit -m "chore: add bullmq dependency and next.config config external packages"
  ```

---

### Task 2: Create Causality Persistence Module

**Files:**
- Create: [lib/causality-persist.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/lib/causality-persist.ts)

- [ ] **Step 1: Write the persistence adapter implementation**
  Create [lib/causality-persist.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/lib/causality-persist.ts) to consolidate database updates, deleting/reinserting document requirements and draft letters, and logging audit events transactionally.
  ```typescript
  import { db, dbOne } from './db';

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
  ): Promise<{ lettersCreated: number; documentRequirementsSaved: number }> {
    const { causalGraph, letters = [] } = payload;

    // 1. Update causal graph on case
    await dbOne(
      `UPDATE cases SET causal_graph = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(causalGraph), caseId]
    );

    // 2. Clear and reinsert document requirements
    const docReqs = (causalGraph.documentRequirements ?? []) as Array<{
      agency: string;
      documentType: string;
      reason: string;
      relatedNodeIds?: string[];
      required?: boolean;
      sourceType?: string;
      sourceInstitution?: string;
    }>;

    await dbOne(`DELETE FROM document_requirements WHERE case_id = $1`, [caseId]);

    let documentRequirementsSaved = 0;
    for (const req of docReqs) {
      if (!req.documentType || !req.agency) continue;
      await dbOne(
        `INSERT INTO document_requirements
           (case_id, agency, document_type, reason, related_node_ids, required, source_type, source_institution)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          req.agency,
          req.documentType,
          req.reason ?? '',
          req.relatedNodeIds ?? [],
          req.required ?? true,
          req.sourceType === 'government_request' ? 'government_request' : 'resident',
          req.sourceInstitution ?? null,
        ]
      );
      documentRequirementsSaved++;
    }

    // 3. Clear and reinsert letters drafts
    await db(`DELETE FROM letters WHERE case_id = $1 AND status = 'draft'`, [caseId]);

    let lettersCreated = 0;
    for (const letter of letters) {
      if (!letter.agency || !letter.content) continue;
      await dbOne(
        `INSERT INTO letters (case_id, agency, agency_label, content, status, generated_by)
         VALUES ($1, $2, $3, $4, 'draft', $5)`,
        [caseId, letter.agency, letter.agencyLabel ?? null, letter.content, actor.id]
      );
      lettersCreated++;
    }

    // 4. Record case_events audit log
    await dbOne(
      `INSERT INTO case_events (case_id, actor_id, actor, actor_role, event_type, action, detail)
       VALUES ($1, $2, $3, $4, 'causality_run', 'causality_run', $5)`,
      [
        caseId,
        actor.id,
        actor.name,
        actor.role,
        JSON.stringify({
          lettersCreated,
          documentRequirementsSaved,
          urgency: (causalGraph.urgency as Record<string, unknown>)?.overall ?? 'Unknown',
          trigger: actor.role === 'system' ? 'async_chat_submit' : 'manual_rerun'
        }),
      ]
    );

    return { lettersCreated, documentRequirementsSaved };
  }
  ```

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add lib/causality-persist.ts
  git commit -m "feat: add unified causality database persistence module"
  ```

---

### Task 3: Create Next.js Queue & Worker Singleton

**Files:**
- Create: [lib/queue.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/lib/queue.ts)
- Create: [instrumentation.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/instrumentation.ts)

- [ ] **Step 1: Write `lib/queue.ts` singleton queue and worker**
  Create [lib/queue.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/lib/queue.ts) with singleton initialization for the Redis connection, the queue, and the background worker thread.
  ```typescript
  import { Queue, Worker } from 'bullmq';
  import Redis from 'ioredis';
  import { dbOne } from './db';
  import { persistCausalityResult } from './causality-persist';

  const REDIS_HOST = process.env.REDIS_HOST || 'mps-redis';
  const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
  const AI_PROXY = process.env.AI_PROXY_URL || 'http://mps-ai-proxy:3103';

  const globalForQueue = globalThis as unknown as {
    redisConnection?: Redis;
    causalityQueue?: Queue;
    causalityWorker?: Worker;
  };

  export const redisConnection =
    globalForQueue.redisConnection ??
    new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
    });

  export const causalityQueue =
    globalForQueue.causalityQueue ??
    new Queue('causality', { connection: redisConnection });

  // Only start the worker in server environments where execution is active
  export const causalityWorker =
    globalForQueue.causalityWorker ??
    new Worker(
      'causality',
      async (job) => {
        const { caseId, transcript, mpName, constituency, writerName } = job.data;
        console.log(`[Next.js Worker] Running background causality analysis for case ${caseId}`);

        // Verify case exists
        const checkCase = await dbOne('SELECT id FROM cases WHERE id = $1', [caseId]);
        if (!checkCase) {
          console.warn(`[Next.js Worker] Case ${caseId} does not exist. Skipping.`);
          return;
        }

        // Call the AI proxy stateless endpoint
        const response = await fetch(`${AI_PROXY}/api/ai/causality`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: [{ role: 'user', content: transcript }],
            mpName,
            constituency,
            writerName,
          }),
          signal: AbortSignal.timeout(180_000),
        });

        if (!response.ok) {
          throw new Error(`Causality API request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          causalGraph: Record<string, any>;
          letters: Array<{ agency: string; agencyLabel?: string; content: string }>;
        };

        // Transactionally persist results using consolidated adapter
        await persistCausalityResult(caseId, payload, {
          id: null,
          role: 'system',
          name: 'System Worker',
        });

        console.log(`[Next.js Worker] Background causality completed for case ${caseId}`);
      },
      { connection: redisConnection, concurrency: 1 }
    );

  if (process.env.NODE_ENV !== 'production') {
    globalForQueue.redisConnection = redisConnection;
    globalForQueue.causalityQueue = causalityQueue;
    globalForQueue.causalityWorker = causalityWorker;
  }
  ```

- [ ] **Step 2: Create `instrumentation.ts` to boot worker on start**
  Create [instrumentation.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/instrumentation.ts) at the root directory to import the queue/worker when the Node.js server starts.
  ```typescript
  export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // Warm up queue worker singleton
      await import('./lib/queue');
      console.log('[Instrumentation] Next.js queue worker initialized');
    }
  }
  ```

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add lib/queue.ts instrumentation.ts
  git commit -m "feat: implement next.js background worker and startup instrumentation hook"
  ```

---

### Task 4: Refactor Next.js Causality Server Action

**Files:**
- Modify: [app/actions/causality.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/app/actions/causality.ts)

- [ ] **Step 1: Simplify `runCausalityEngine` using the new persistence adapter**
  Modify [app/actions/causality.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/app/actions/causality.ts) to delegate database writes to `persistCausalityResult`.
  Replace lines 93-165 with:
  ```typescript
  // Transactionally persist utilizing unified module
  const { lettersCreated, documentRequirementsSaved } = await persistCausalityResult(
    caseId,
    { causalGraph, letters },
    { id: session.userId, role: session.role, name: userRow?.name ?? 'Caseworker' }
  );
  ```
  Ensure to import `persistCausalityResult` from `@/lib/causality-persist`.

- [ ] **Step 2: Run linter and tests**
  Run: `npm run lint` and `vitest run` to make sure changes compile.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add app/actions/causality.ts
  git commit -m "refactor: simplify causality server action using persistence adapter"
  ```

---

### Task 5: Refactor Next.js Chat Submission Action

**Files:**
- Modify: [app/actions/chat.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/app/actions/chat.ts)

- [ ] **Step 1: Enqueue directly from Next.js to Redis**
  Modify [app/actions/chat.ts](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/app/actions/chat.ts) in `submitCase` to add the task directly to the local Redis queue using `causalityQueue`, instead of calling the AI Proxy's enqueue endpoint.
  Replace lines 229-242 with:
  ```typescript
  import { causalityQueue } from '@/lib/queue';

  // Add job directly to local BullMQ queue
  await causalityQueue.add('causality-job', {
    caseId: caseRow.id,
    transcript,
    mpName: constRow?.mp_name || '',
    constituency: constRow?.name || '',
    writerName: 'System Worker',
  });
  console.log(`[submitCase] Enqueued background causality job for case ${caseRow.id}`);
  ```
  Ensure `causalityQueue` is imported at the top of the file.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add app/actions/chat.ts
  git commit -m "refactor: enqueue causality jobs directly to Redis from next.js"
  ```

---

### Task 6: Simplify AI Proxy Express Server

**Files:**
- Modify: [api/server.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/server.js)

- [ ] **Step 1: Strip PG/Redis connections and worker logic**
  Modify [api/server.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/server.js):
  * Remove `initDB` and `pool` imports (Line 18).
  * Remove `causalityQueue` and `connection` imports (Lines 19, 1389).
  * Remove `initDB();` call (Line 25).
  * Remove `/api/ai/causality/enqueue` route (Lines 1362-1384).
  * Remove `Worker` instantiation and fail handlers (Lines 1386-1499).

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add api/server.js
  git commit -m "refactor: remove database writes, redis, and worker from AI proxy"
  ```

---

### Task 7: Clean AI Proxy Dependencies & Files

**Files:**
- Modify: [api/package.json](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/package.json)
- Delete: [api/db.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/db.js)
- Delete: [api/queue.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/queue.js)

- [ ] **Step 1: Remove unneeded dependencies**
  Modify [api/package.json](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/package.json) to remove `pg`, `ioredis`, and `bullmq` from dependencies.

- [ ] **Step 2: Delete config files**
  Delete [api/db.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/db.js) and [api/queue.js](file:///Users/ymca/_dev_work_/Projects/deployed/app_mps-connect/api/queue.js).
  Run: `rm api/db.js api/queue.js`

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add api/package.json
  git rm api/db.js api/queue.js
  git commit -m "chore: clean up AI proxy dependencies and remove db/queue configurations"
  ```

---

### Task 8: Verification

- [ ] **Step 1: Run code linter**
  Run: `npm run lint`
  Expected: Success without linter warnings or errors.

- [ ] **Step 2: Run unit tests**
  Run: `npm run test`
  Expected: Success.
