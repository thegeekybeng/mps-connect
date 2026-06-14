// Thin JSON endpoint for the DocumentsCard 30-second poll.
// Returns current requirements + documents for a case.
// Requires valid session cookie — same auth as dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getDocumentRequirements } from '@/app/actions/documents';

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (!can(session.role, 'cases:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const caseId = parseInt(req.nextUrl.searchParams.get('caseId') ?? '', 10);
  if (isNaN(caseId)) {
    return NextResponse.json({ error: 'Invalid caseId' }, { status: 400 });
  }

  const { requirements, documents, error } = await getDocumentRequirements(caseId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ requirements, documents });
}
