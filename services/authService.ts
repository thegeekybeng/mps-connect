// services/authService.ts
// Singpass FAPI v3 auth client.
// All token crypto is server-side. Browser only receives:
//   - an httpOnly session cookie (mps_session)
//   - the masked NRIC (S****567B) via /auth/session

export interface SingpassSession {
  authenticated: boolean;
  nricMasked?: string;
}

/**
 * Check current session state.
 * Reads the httpOnly session cookie via the proxy — browser never parses it.
 */
export async function checkSession(): Promise<SingpassSession> {
  try {
    const res = await fetch('/auth/session', { credentials: 'same-origin' });
    if (!res.ok) return { authenticated: false };
    return res.json() as Promise<SingpassSession>;
  } catch {
    return { authenticated: false };
  }
}

/**
 * Redirect the browser to /auth/singpass/start.
 * The proxy handles PAR, PKCE, and the MockPass redirect chain.
 * On success the browser lands back at /?singpass=success.
 */
export function startSingpassAuth(): void {
  window.location.href = '/auth/singpass/start';
}

/**
 * Clear the server-side session and the httpOnly cookie.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.href = '/';
  }
}
