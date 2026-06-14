import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import type { SessionPayload } from './lib/auth';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'change-this-in-production-must-be-32-chars-min'
);

// Routes that do NOT require auth
const PUBLIC_PATHS = ['/login', '/chat', '/upload', '/auth/demo', '/api/auth/login', '/api/health', '/api/postal-lookup', '/enter-postal-code'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Root landing page is public
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Let public routes through (prefix match)
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Static assets and Next.js internals — never intercept
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const token = req.cookies.get('mps_session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/auth/demo', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as SessionPayload;

    // Clone request and inject identity headers for downstream Server Components
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id',         String(session.userId));
    requestHeaders.set('x-user-role',       session.role);
    requestHeaders.set('x-constituency-id', String(session.constituencyId ?? ''));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // Token expired or invalid — clear cookie and redirect
    const response = NextResponse.redirect(new URL('/auth/demo', req.url));
    response.cookies.delete('mps_session');
    return response;
  }
}

export const config = {
  // Run middleware on all routes except Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
