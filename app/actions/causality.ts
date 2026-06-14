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
import { dbOne, db }      from '@/lib/db';
import { revalidatePath } from 'next/cache';

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

  // 1. Persist causal graph to case
  await dbOne(
    `UPDATE cases SET causal_graph = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(causalGraph), caseId]
  );

  // 2. Persist document requirements (replace existing)
  const docReqs = (causalGraph.documentRequirements ?? []) as Array<{
    agency:             string;
    documentType:       string;
    reason:             string;
    relatedNodeIds?:    string[];
    required?:          boolean;
    sourceType?:        string;
    sourceInstitution?: string;
  }>;

  // Delete existing requirements for this case before reinserting
  await dbOne(`DELETE FROM document_requirements WHERE case_id = $1`, [caseId]);

  let documentRequirementsSaved = 0;
  for (const req of docReqs) {
    if (!req.documentType || !req.agency) continue;
    await dbOne(
      `INSERT INTO document_requirements
         (case_id, agency, document_type, reason, related_node_ids, required, source_type, source_institution)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
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

  // 3. Persist letters (replace existing drafts)
  await db(
    `DELETE FROM letters WHERE case_id = $1 AND status = 'draft'`,
    [caseId]
  );

  let lettersCreated = 0;
  for (const letter of letters) {
    if (!letter.agency || !letter.content) continue;
    await dbOne(
      `INSERT INTO letters (case_id, agency, agency_label, content, status, generated_by)
       VALUES ($1,$2,$3,$4,'draft',$5)`,
      [caseId, letter.agency, letter.agencyLabel ?? null, letter.content, session.userId]
    );
    lettersCreated++;
  }

  // 4. Write audit event
  await dbOne(
    `INSERT INTO case_events (case_id, actor_id, actor_role, action, detail)
     VALUES ($1,$2,$3,'causality_run',$4)`,
    [
      caseId,
      session.userId,
      session.role,
      JSON.stringify({
        lettersCreated,
        documentRequirementsSaved,
        urgency: (causalGraph.urgency as Record<string, unknown>)?.overall ?? 'Unknown',
      }),
    ]
  );

  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath('/dashboard/approvals');

  return {
    ok: true,
    data: { causalGraph, lettersCreated, documentRequirementsSaved },
  };
}
