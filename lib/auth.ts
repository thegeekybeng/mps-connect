import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type UserRole = 'superadmin' | 'mp' | 'admin' | 'writer' | 'registry' | 'volunteer' | 'resident';

export interface SessionPayload extends JWTPayload {
  userId:         number;          // -1 for demo resident sessions (no DB user)
  role:           UserRole;
  constituencyId: number | null;   // null = superadmin (cross-constituency)
  name:           string;
  email:          string;          // empty string for demo resident sessions
  nricMasked?:    string;          // masked NRIC for resident sessions (demo)
  lastSeenAt:     string | null;   // ISO timestamp of previous login — used for "new since last visit"
}

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'change-this-in-production-must-be-32-chars-min'
);

const COOKIE_NAME = 'mps_session';
const TTL_SECONDS = 12 * 60 * 60; // 12 hours

// ── Sign ───────────────────────────────────────────────────────
export async function signSession(payload: Omit<SessionPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET);
}

// ── Verify (server-side — use in API routes and Server Components) ──
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ── Get current session from cookie (Server Component / Route Handler) ──
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

// ── Require auth — redirects to demo login if not authenticated ──
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/auth/demo');
  return session;
}

// ── Require specific role(s) ───────────────────────────────────
export async function requireRole(...roles: UserRole[]): Promise<SessionPayload> {
  const session = await requireAuth();
  if (!roles.includes(session.role)) redirect('/auth/demo');
  return session;
}

// ── Cookie helpers ─────────────────────────────────────────────
// COOKIE_SECURE=false allows session cookies over HTTP (dev/internal access).
// Defaults to true in production — must be set to false explicitly for HTTP.
export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure:   process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path:     '/',
    maxAge:   TTL_SECONDS,
  },
};
