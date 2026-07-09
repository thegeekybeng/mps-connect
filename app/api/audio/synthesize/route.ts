import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/audio/synthesize
 *
 * Proxies TTS requests to the AI proxy and returns raw WAV bytes
 * directly to the browser. Avoids base64 encoding overhead and
 * server action payload limits.
 *
 * Accessible without JWT auth (resident chat is public), but
 * hardened with defence-in-depth:
 *  1. Origin/Referer validation — rejects cross-origin requests
 *  2. Per-IP rate limiting — 10 req/min (stricter than AI proxy's 30/min)
 *  3. Minimum text length — prevents trivial abuse
 */

const AI_PROXY = process.env.AI_PROXY_URL || 'http://mps-ai-proxy:3103';
const APP_URL  = process.env.NEXT_PUBLIC_APP_URL || '';

// ── Per-IP rate limiter (in-memory, resets on redeploy) ───────
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const TTS_RATE_LIMIT  = 10;          // max requests
const TTS_RATE_WINDOW = 60 * 1000;   // per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + TTS_RATE_WINDOW });
    return false;
  }
  bucket.count++;
  return bucket.count > TTS_RATE_LIMIT;
}

// ── Origin validation ─────────────────────────────────────────
// Accepts requests from our own domain only. Server-side calls
// (no Origin header) are also allowed since they come from
// internal fetch() within the same container.
function isAllowedOrigin(req: NextRequest): boolean {
  const origin  = req.headers.get('origin')  || '';
  const referer = req.headers.get('referer') || '';

  // Server-to-server (e.g. internal fetch) — no origin header
  if (!origin && !referer) return true;

  // Dynamically resolve self origin and proxy headers
  const selfOrigin = req.nextUrl.origin;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const inferredOrigin = host ? `${proto}://${host}` : '';

  // Build list of allowed origins
  const allowed: string[] = [
    'http://localhost:3000',
    'http://localhost:3080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3080',
    'https://mps-connect.example.com',
    'http://mps-connect.example.com',
    selfOrigin,
  ];
  if (APP_URL) allowed.push(APP_URL);
  if (inferredOrigin) allowed.push(inferredOrigin);

  // Check origin or referer starts with an allowed URL
  const originOk = origin && allowed.some(a => origin.startsWith(a));
  const refererOk = referer && allowed.some(a => referer.startsWith(a));

  if (originOk || refererOk) return true;

  console.warn(`[TTS CORS Blocked] origin="${origin}" referer="${referer}" allowedOrigins=${JSON.stringify(allowed)}`);
  return false;
}

export async function POST(req: NextRequest) {
  // Defence 1: Origin validation
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Forbidden.' },
      { status: 403 }
    );
  }

  // Defence 2: Per-IP rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '127.0.0.1';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Please wait before requesting speech again.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json(
        { error: 'Text is required.' },
        { status: 400 }
      );
    }

    // Defence 3: Minimum text length — block trivial/empty abuse
    const trimmed = body.text.trim();
    if (trimmed.length < 5) {
      return NextResponse.json(
        { error: 'Text too short.' },
        { status: 400 }
      );
    }

    // Cap at 2000 chars — same limit as the chat
    const text = trimmed.slice(0, 2000);
    const sessionId = typeof body.sessionId === 'string'
      ? body.sessionId.slice(0, 100)
      : undefined;

    const proxyResp = await fetch(`${AI_PROXY}/api/ai/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sessionId }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!proxyResp.ok) {
      const status = proxyResp.status;
      if (status === 429) {
        return NextResponse.json(
          { error: 'Please wait before requesting speech again.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'Speech synthesis unavailable.' },
        { status: 502 }
      );
    }

    // Return raw WAV bytes — no base64 conversion
    const audioBuffer = await proxyResp.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      return NextResponse.json(
        { error: 'Speech synthesis timed out.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Unable to generate speech.' },
      { status: 500 }
    );
  }
}

