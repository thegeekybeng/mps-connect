import { pool } from './db';

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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update causal graph on case
    await client.query(
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

    await client.query(`DELETE FROM document_requirements WHERE case_id = $1`, [caseId]);

    let documentRequirementsSaved = 0;
    for (const req of docReqs) {
      if (!req.documentType || !req.agency) continue;
      await client.query(
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
    await client.query(`DELETE FROM letters WHERE case_id = $1 AND status = 'draft'`, [caseId]);

    let lettersCreated = 0;
    for (const letter of letters) {
      if (!letter.agency || !letter.content) continue;
      await client.query(
        `INSERT INTO letters (case_id, agency, agency_label, content, status, generated_by)
         VALUES ($1, $2, $3, $4, 'draft', $5)`,
        [caseId, letter.agency, letter.agencyLabel ?? null, letter.content, actor.id]
      );
      lettersCreated++;
    }

    // 4. Record case_events audit log
    await client.query(
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

    await client.query('COMMIT');
    return { lettersCreated, documentRequirementsSaved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
