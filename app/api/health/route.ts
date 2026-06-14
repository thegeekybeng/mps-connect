import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Verify DB connectivity
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'connected' }, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
