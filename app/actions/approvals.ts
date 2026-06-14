'use server';
// =============================================================
// MPS Connect — Approvals Server Actions
// approveCase: marks case + all pending letters approved
// returnCase:  sends case back to drafting with a reason
//
// RBAC: letters:approve — superadmin and mp only
// Both write an immutable case_event for audit trail.
// =============================================================

import { requireAuth }    from '@/lib/auth';
import { can }            from '@/lib/rbac';
import { dbOne, db }      from '@/lib/db';
import { revalidatePath } from 'next/cache';

// ── Approve ──────────────────────────────────────────────────
export async function approveCase(
  caseId: number
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) {
    return { success: false, error: 'Insufficient permissions.' };
  }

  // Guard: only approve cases that are pending_approval
  const row = await dbOne<{ status: string }>(
    'SELECT status FROM cases WHERE id = $1',
    [caseId]
  );
  if (!row) return { success: false, error: 'Case not found.' };
  if (row.status !== 'pending_approval') {
    return { success: false, error: `Cannot approve — case is '${row.status}'.` };
  }

  // Update case status
  await dbOne(
    `UPDATE cases SET status = 'approved', updated_at = NOW() WHERE id = $1`,
    [caseId]
  );

  // Mark all pending/draft letters as approved
  await db(
    `UPDATE letters SET status = 'approved', approved_by = $1
     WHERE case_id = $2 AND status IN ('draft','pending')`,
    [session.userId, caseId]
  );

  // Audit event
  await dbOne(
    `INSERT INTO case_events (case_id, actor_id, actor_role, action, detail)
     VALUES ($1, $2, $3, 'approved', $4)`,
    [caseId, session.userId, session.role, JSON.stringify({ approved_by: session.userId })]
  );

  revalidatePath('/dashboard/approvals');
  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath('/dashboard');

  return { success: true };
}

// ── Return to drafting ────────────────────────────────────────
export async function returnCase(
  caseId: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) {
    return { success: false, error: 'Insufficient permissions.' };
  }

  const row = await dbOne<{ status: string }>(
    'SELECT status FROM cases WHERE id = $1',
    [caseId]
  );
  if (!row) return { success: false, error: 'Case not found.' };
  if (row.status !== 'pending_approval') {
    return { success: false, error: `Cannot return — case is '${row.status}'.` };
  }

  await dbOne(
    `UPDATE cases SET status = 'drafting', updated_at = NOW() WHERE id = $1`,
    [caseId]
  );

  // Audit event with return reason
  await dbOne(
    `INSERT INTO case_events (case_id, actor_id, actor_role, action, detail)
     VALUES ($1, $2, $3, 'returned_to_drafting', $4)`,
    [
      caseId,
      session.userId,
      session.role,
      JSON.stringify({ reason: reason?.trim() || 'No reason given', returned_by: session.userId }),
    ]
  );

  revalidatePath('/dashboard/approvals');
  revalidatePath(`/dashboard/cases/${caseId}`);

  return { success: true };
}
