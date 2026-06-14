import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Force dynamic — DB query
export const dynamic = 'force-dynamic';

/**
 * GET /api/postal-lookup?code=310123
 *
 * Extracts first 2 digits of the 6-digit postal code,
 * looks up the postal_sector_map table to find the constituency,
 * returns the constituency details (name, division, MP).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: 'Invalid postal code. Must be exactly 6 digits.' },
      { status: 400 }
    );
  }

  const sector = code.substring(0, 2);

  try {
    const rows = await db<{
      constituency_id: number;
      name: string;
      division: string;
      mp_name: string;
      party: string;
      type: string;
      notes: string;
    }>(
      `SELECT
         c.id AS constituency_id,
         c.name,
         c.division,
         c.mp_name,
         c.party,
         c.type,
         p.notes
       FROM postal_sector_map p
       JOIN constituencies c ON c.id = p.constituency_id
       WHERE p.sector_prefix = $1`,
      [sector]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `No constituency mapped for postal sector ${sector}. This sector may not have residential areas.` },
        { status: 404 }
      );
    }

    const row = rows[0];
    return NextResponse.json({
      constituency_id: row.constituency_id,
      constituency: row.name,
      division: row.division,
      mp_name: row.mp_name,
      party: row.party,
      type: row.type,
      postal_sector: sector,
      area_description: row.notes,
    });
  } catch (err) {
    console.error('[postal-lookup] DB error:', err);
    return NextResponse.json(
      { error: 'Database error. Please try again.' },
      { status: 500 }
    );
  }
}
