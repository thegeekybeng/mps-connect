import { connection } from 'next/server';
import { db } from '@/lib/db';
import ChatClient from '@/components/chat/ChatClient';

/**
 * PUBLIC chat page — no authentication required.
 * Residents land here from the postal-code lookup to describe their issue.
 * Constituency data is fetched server-side for AI context.
 *
 * URL: /chat?c=<constituency_id>
 */

// Force dynamic rendering — DB queries + searchParams require it
export const dynamic = 'force-dynamic';

async function fetchConstituency(id: number) {
  const rows = await db<{
    id: number;
    name: string;
    mp_name: string;
    division: string | null;
  }>(
    'SELECT id, name, mp_name, division FROM constituencies WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export default async function ChatPage(props: {
  searchParams: Promise<{ c?: string }>;
}) {
  // Guarantee dynamic rendering — prevents Turbopack from
  // pre-evaluating this component at build time
  await connection();

  const params = await props.searchParams;
  const rawId = params.c;
  const constituencyId = rawId ? parseInt(rawId, 10) : NaN;

  if (!constituencyId || isNaN(constituencyId)) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--gov-text)' }}>No constituency specified</p>
          <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>
            Please <a href="/enter-postal-code" className="underline" style={{ color: 'var(--gov-primary-light)' }}>enter your postal code</a> to find your constituency.
          </p>
        </div>
      </div>
    );
  }

  const constituency = await fetchConstituency(constituencyId);

  if (!constituency) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--gov-text)' }}>Constituency not found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>Please contact the office directly.</p>
        </div>
      </div>
    );
  }

  return (
    <ChatClient
      mpName={constituency.mp_name}
      constituency={constituency.name}
      division={constituency.division || undefined}
      constituencyId={constituency.id}
    />
  );
}
