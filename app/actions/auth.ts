'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, dbOne } from '@/lib/db';
import { signSession, SESSION_COOKIE } from '@/lib/auth';
import { defaultRoute } from '@/lib/rbac';
import type { UserRole } from '@/lib/auth';

interface UserRow {
  id:              number;
  name:            string;
  email:           string;
  role:            UserRole;
  constituency_id: number | null;
  pw_hash:         string;
  active:          boolean;
  last_seen_at:    string | null;
}


// ── Demo Login — Staff ────────────────────────────────────────
// Looks up a seed user by role from the users table, signs JWT.
// No password required — demo only.
export async function demoStaffLoginAction(role: string): Promise<{ error?: string }> {
  const validRoles: UserRole[] = ['superadmin', 'mp', 'admin', 'writer', 'registry'];
  const safeRole = role.toLowerCase() as UserRole;
  if (!validRoles.includes(safeRole)) {
    return { error: `Invalid role: ${role}` };
  }

  const user = await dbOne<UserRow>(
    'SELECT id, name, email, role, constituency_id, pw_hash, active, last_seen_at FROM users WHERE role = $1 AND active = true LIMIT 1',
    [safeRole]
  );

  if (!user) {
    return { error: `No active ${role} user found in the database.` };
  }

  const token = await signSession({
    userId:         user.id,
    role:           user.role,
    constituencyId: user.constituency_id,
    name:           user.name,
    email:          user.email,
    lastSeenAt:     user.last_seen_at ?? null,
  });

  await dbOne('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);

  redirect(defaultRoute(user.role));
}

// ── Demo Login — Resident ─────────────────────────────────────
// Resolves constituency from DB by name+division, not hardcoded IDs.
// No DB user row — residents are identified by masked NRIC only.
export async function demoResidentLoginAction(personaId: string): Promise<{ error?: string }> {
  // Hardcoded demo personas — not real people
  // Constituency is resolved by (name, division) lookup at login time,
  // so it always matches the current DB regardless of row IDs.
  const personas: Record<string, {
    name: string;
    nricMasked: string;
    constituencyName: string;
    division: string;
  }> = {
    'mdm-tan': {
      name: 'Mdm Tan Ah Lian',
      nricMasked: 'S****567A',
      constituencyName: 'Ang Mo Kio GRC',
      division: 'Teck Ghee',
    },
    'mr-kumar': {
      name: 'Mr Rajesh Kumar',
      nricMasked: 'S****234B',
      constituencyName: 'East Coast GRC',
      division: 'Bedok',
    },
    'ms-lim': {
      name: 'Ms Lim Wei Ling',
      nricMasked: 'T****891C',
      constituencyName: 'Bishan\u2013Toa Payoh GRC',  // en-dash — matches ELD official name
      division: 'Toa Payoh Central',
    },
    'mr-ali': {
      name: 'Mr Mohamed Ali',
      nricMasked: 'S****456D',
      constituencyName: 'Marine Parade\u2013Braddell Heights GRC',
      division: 'MacPherson',
    },
  };

  const persona = personas[personaId];
  if (!persona) {
    return { error: 'Unknown persona.' };
  }

  // Resolve constituency ID from DB — never hardcoded
  const row = await dbOne<{ id: number }>(
    'SELECT id FROM constituencies WHERE name = $1 AND division = $2 LIMIT 1',
    [persona.constituencyName, persona.division]
  );

  if (!row) {
    return { error: `Constituency not found for ${persona.constituencyName} (${persona.division}). Run the GE2025 migration.` };
  }

  const token = await signSession({
    userId:         -1,   // synthetic — no DB user row
    role:           'resident',
    constituencyId: row.id,
    name:           persona.name,
    email:          '',   // residents have no email
    nricMasked:     persona.nricMasked,
    lastSeenAt:     null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);

  redirect('/enter-postal-code');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE.name);
  redirect('/auth/demo');
}
