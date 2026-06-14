import type { UserRole } from './auth';

// ── Permission definitions ─────────────────────────────────────
// Each action maps to the set of roles that may perform it.
// This is the single source of truth — never check roles inline elsewhere.

export const PERMISSIONS = {
  // Cross-constituency
  'constituencies:read_all':  ['superadmin'] as UserRole[],
  'analytics:cross_constituency': ['superadmin'] as UserRole[],

  // Case management
  'cases:read':               ['superadmin','mp','admin','writer'] as UserRole[],
  'cases:create':             ['superadmin','admin','writer'] as UserRole[],
  'cases:update':             ['superadmin','admin','writer'] as UserRole[],
  'cases:approve':            ['superadmin','mp'] as UserRole[],
  'cases:close':              ['superadmin','admin'] as UserRole[],

  // Letters
  'letters:generate':         ['superadmin','admin','writer'] as UserRole[],
  'letters:approve':          ['superadmin','mp'] as UserRole[],
  'letters:send':             ['superadmin','admin'] as UserRole[],

  // Queue / Registry
  'queue:read':               ['superadmin','mp','admin','writer','registry','volunteer','resident'] as UserRole[],
  'queue:register':           ['superadmin','admin','registry','volunteer'] as UserRole[],
  'queue:call_next':          ['superadmin','admin','registry'] as UserRole[],
  'queue:mark_done':          ['superadmin','admin','registry'] as UserRole[],

  // Sessions
  'sessions:create':          ['superadmin','mp','admin'] as UserRole[],
  'sessions:manage':          ['superadmin','admin','registry'] as UserRole[],

  // Analytics
  'analytics:read':           ['superadmin','mp','admin'] as UserRole[],

  // User management
  'users:manage':             ['superadmin'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ── Check a single permission ──────────────────────────────────
export function can(role: UserRole, action: Permission): boolean {
  return (PERMISSIONS[action] as UserRole[]).includes(role);
}

// ── Check multiple permissions (all must pass) ─────────────────
export function canAll(role: UserRole, actions: Permission[]): boolean {
  return actions.every(a => can(role, a));
}

// ── Constituency scope guard ───────────────────────────────────
// Returns true if the user may access data belonging to the given constituency.
export function canAccessConstituency(
  userRole: UserRole,
  userConstituencyId: number | null,
  targetConstituencyId: number
): boolean {
  if (userRole === 'superadmin') return true;  // superadmin sees all
  return userConstituencyId === targetConstituencyId;
}

// ── Dashboard redirect target per role ────────────────────────
export function defaultRoute(role: UserRole): string {
  switch (role) {
    // Role-specific landing pages will be built in later phases.
    // All roles land on /dashboard overview until then.
    case 'superadmin': return '/dashboard';
    case 'mp':         return '/dashboard';
    case 'admin':      return '/dashboard';
    case 'writer':     return '/dashboard/cases';
    case 'registry':   return '/dashboard';
    case 'volunteer':  return '/dashboard';
    case 'resident':   return '/enter-postal-code';
    default:           return '/auth/demo';
  }
}
