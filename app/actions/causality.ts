'use server';
// =============================================================
// MPS Connect — Causality Engine Server Action
//
// Calls mps-ai-proxy:3103/api/ai/causality server-side.
// The AI proxy is only reachable on the Docker internal network —
// browser fetch calls will always fail ("Failed to fetch").
// This action runs inside the mps-connect container, where
// AI_PROXY_URL resolves correctly.
//
// Pipeline:
//   1. Validate input + auth
//   2. Look up session user + constituency for letter context
//   3. POST to mps-ai-proxy with correct { conversation } format
//   4. Persist causal_graph to cases table
//   5. Persist documentRequirements to document_requirements table
//   6. Persist assembled letters to letters table
// =============================================================

import { requireAuth }    from '@/lib/auth';
import { can }            from '@/lib/rbac';
import { dbOne }          from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { persistCausalityResult } from '@/lib/causality-persist';

const AI_PROXY = process.env.AI_PROXY_URL ?? 'http://mps-ai-proxy:3103';

export interface CausalityResult {
  causalGraph: Record<string, unknown>;
  lettersCreated: number;
  documentRequirementsSaved: number;
}

export async function runCausalityEngine(
  caseId:     number,
  transcript: string
): Promise<{ ok: true; data: CausalityResult } | { ok: false; error: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'cases:update')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  if (!transcript.trim()) {
    return { ok: false, error: 'Transcript is empty.' };
  }

  // Look up user name and constituency for letter assembly
  const userRow = await dbOne<{ name: string; constituency_name: string | null }>(
    `SELECT u.name, c.name AS constituency_name
     FROM users u
     LEFT JOIN constituencies c ON c.id = u.constituency_id
     WHERE u.id = $1`,
    [session.userId]
  );

  const mpName       = userRow?.name ?? 'The Member of Parliament';
  const constituency = userRow?.constituency_name ?? '';

  // Format transcript as conversation array (what the AI proxy expects)
  const conversation = [{ role: 'user', content: transcript.trim() }];

  let proxyResponse: Response;
  try {
    proxyResponse = await fetch(`${AI_PROXY}/api/ai/causality`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation,
        mpName,
        constituency,
        writerName: mpName,
      }),
      // 3-stage pipeline — can take up to 3 min on slower hardware
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[causality] AI proxy unreachable:', msg);
    return { ok: false, error: `AI proxy unreachable: ${msg}` };
  }

  if (!proxyResponse.ok) {
    const body = await proxyResponse.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, error: String(body.error ?? `Proxy error ${proxyResponse.status}`) };
  }

  const payload = await proxyResponse.json() as {
    causalGraph: Record<string, unknown>;
    letters:     Array<{ agency: string; agencyLabel?: string; content: string }>;
  };

  const { causalGraph, letters = [] } = payload;

  // Transactionally persist results using consolidated adapter
  const { lettersCreated, documentRequirementsSaved } = await persistCausalityResult(
    caseId,
    { causalGraph, letters },
    {
      id: session.userId,
      role: session.role,
      name: userRow?.name ?? 'Caseworker',
    }
  );

  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath('/dashboard/approvals');

  return {
    ok: true,
    data: { causalGraph, lettersCreated, documentRequirementsSaved },
  };
}
