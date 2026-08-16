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
  new Queue('causality', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

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
