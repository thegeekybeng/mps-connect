'use server';

import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dbOne } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/**
 * Opens a physical MPS (Meet-the-People Session) for today.
 * Creates an mps_sessions row so the registration desk can begin
 * checking residents in via the Queue page.
 *
 * RBAC: mp and superadmin only — writers/officers cannot open a session.
 */
export async function startSession(): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!can(session.role, 'sessions:create')) {
    return { success: false, error: 'Insufficient permissions to start a session.' };
  }

  // Idempotent — if a session already exists for today do not create a duplicate
  const existing = await dbOne<{ id: number }>(
    `SELECT id FROM mps_sessions
     WHERE session_date = CURRENT_DATE
       ${session.constituencyId ? 'AND constituency_id = $1' : ''}
     LIMIT 1`,
    session.constituencyId ? [session.constituencyId] : []
  );

  if (existing) {
    return { success: false, error: 'A session already exists for today.' };
  }

  await dbOne(
    `INSERT INTO mps_sessions (constituency_id, session_date, status, max_slots)
     VALUES ($1, CURRENT_DATE, 'open', 50)`,
    [session.constituencyId ?? 1]
  );

  revalidatePath('/dashboard/queue');
  revalidatePath('/dashboard');
  return { success: true };
}
