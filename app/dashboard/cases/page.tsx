import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import {
  FolderOpen, ChevronRight,
  Search, X, Plus,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Cases — MPS Connect' };

// ── Types ─────────────────────────────────────────────────────
interface CaseRow {
  id:             number;
  case_number:    string | null;
  resident_name:  string;
  category:       string | null;
  sub_category:   string | null;
  urgency:        string;
  status:         string;
  created_at:     string;
  doc_total:      number;
  doc_fulfilled:  number;
}

// ── Data fetch ─────────────────────────────────────────────────
async function fetchCases(
  constituencyId: number | null,
  role: string,
  status: string,
  urgency: string,
  q: string,
  page: number
): Promise<{ cases: CaseRow[]; total: number }> {
  const PAGE_SIZE = 20;
  const offset    = (page - 1) * PAGE_SIZE;

  const conditions: string[] = [];
  const params: unknown[]    = [];
  let   idx = 1;

  if (constituencyId && role !== 'superadmin') {
    conditions.push(`c.constituency_id = $${idx++}`);
    params.push(constituencyId);
  }
  if (status && status !== 'all') {
    conditions.push(`c.status = $${idx++}`);
    params.push(status);
  }
  if (urgency && urgency !== 'all') {
    conditions.push(`c.urgency = $${idx++}`);
    params.push(urgency);
  }
  if (q.trim()) {
    conditions.push(`(c.resident_name ILIKE $${idx} OR c.case_number ILIKE $${idx} OR c.category ILIKE $${idx})`);
    params.push(`%${q.trim()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRows] = await Promise.all([
    db<CaseRow>(
      `SELECT c.id, c.case_number, c.resident_name, c.category, c.sub_category,
              c.urgency, c.status, c.created_at,
              COUNT(dr.id)::int                                    AS doc_total,
              COUNT(dr.id) FILTER (WHERE dr.fulfilled)::int       AS doc_fulfilled
       FROM cases c
       LEFT JOIN document_requirements dr ON dr.case_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY
         CASE c.status WHEN 'ESCALATED' THEN 0 ELSE 1 END,
         CASE c.urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
         c.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, PAGE_SIZE, offset]
    ),
    db<{ count: string }>(
      `SELECT COUNT(*) as count FROM cases c ${where}`,
      params
    ),
  ]);

  return { cases: rows, total: parseInt(countRows[0]?.count ?? '0', 10) };
}

// ── Badge helpers ──────────────────────────────────────────────
const URGENCY_CLASS: Record<string, string> = {
  Critical: 'urgency-critical',
  High:     'urgency-high',
  Medium:   'urgency-medium',
  Low:      'urgency-low',
};

const STATUS_CLASS: Record<string, string> = {
  new:              'status-new',
  triaged:          'status-triaged',
  drafting:         'status-drafting',
  pending_approval: 'status-pending-approval',
  approved:         'status-approved',
  sent:             'status-sent',
  closed:           'status-closed',
  ESCALATED:        'bg-red-100 text-red-900 border border-red-300 font-bold',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// ── Page ───────────────────────────────────────────────────────
export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requireAuth();
  if (!can(session.role, 'cases:read')) notFound();

  const sp      = await searchParams;
  const status  = sp.status  ?? 'all';
  const urgency = sp.urgency ?? 'all';
  const q       = sp.q       ?? '';
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10));

  const { cases, total } = await fetchCases(
    session.constituencyId, session.role, status, urgency, q, page
  );

  const totalPages = Math.ceil(total / 20);
  const canCreate  = can(session.role, 'cases:create');

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ status, urgency, q, page: String(page), ...overrides });
    return `/dashboard/cases?${p}`;
  };

  const hasFilters = status !== 'all' || urgency !== 'all' || q.trim().length > 0;

  return (
    <div className="space-y-5 animate-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
            <FolderOpen size={22} style={{ color: 'var(--gov-primary-light)' }} /> Cases
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
            {total.toLocaleString()} {status !== 'all' ? status.replace('_', ' ') : 'total'} case{total !== 1 ? 's' : ''}
            {hasFilters && <span style={{ color: 'var(--gov-primary-light)' }} className="ml-1">· filtered</span>}
          </p>
        </div>
        {canCreate && (
          <Link href="/dashboard/cases/new" id="new-case-btn" className="gov-btn-primary">
            <Plus size={15} /> New Case
          </Link>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="gov-card px-4 py-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gov-text-muted)' }} />
            <form method="GET">
              <input
                id="cases-search"
                name="q"
                defaultValue={q}
                placeholder="Search name, case no., category…"
                className="w-full pl-8 pr-4 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--gov-border)',
                  color: 'var(--gov-text)',
                  background: 'var(--gov-surface)',
                }}
              />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="urgency" value={urgency} />
            </form>
          </div>

          {/* Status label — filtering is done via the chip row below */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--gov-text-secondary)' }}>Status</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: 'var(--gov-primary-50)', color: 'var(--gov-primary)' }}>
              {status === 'all' ? 'All' : status.replace('_', ' ')}
            </span>
          </div>

          {/* Urgency chips — kept as pills, they're only 5 items */}
          <div className="flex items-center gap-1">
            {(['all','Critical','High','Medium','Low'] as const).map(u => (
              <Link
                key={u}
                href={buildUrl({ urgency: u, page: '1' })}
                className="px-2.5 py-1 rounded text-xs font-semibold transition-all"
                style={urgency === u ? {
                  background: 'var(--gov-primary)',
                  color: 'var(--gov-text-inverse)',
                } : {
                  background: 'var(--gov-surface-alt)',
                  color: 'var(--gov-text-secondary)',
                  border: '1px solid var(--gov-border)',
                }}
              >
                {u === 'all' ? 'Any' : u}
              </Link>
            ))}
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <Link
              href="/dashboard/cases"
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
              style={{ color: 'var(--gov-accent)', border: '1px solid var(--gov-accent-100)', background: 'var(--gov-accent-50)' }}
            >
              <X size={11} /> Clear filters
            </Link>
          )}
        </div>

        {/* Status filter chips (server-side navigation) */}
        <div className="flex flex-wrap gap-1 mt-3 pt-3" style={{ borderTop: '1px solid var(--gov-border)' }}>
          {(['all','new','triaged','drafting','pending_approval','approved','sent','ESCALATED'] as const).map(s => (
            <Link
              key={s}
              href={buildUrl({ status: s, page: '1' })}
              className="px-2.5 py-1 rounded text-xs font-semibold transition-all"
              style={status === s ? {
                background: 'var(--gov-primary)',
                color: 'var(--gov-text-inverse)',
              } : {
                background: 'var(--gov-surface-alt)',
                color: 'var(--gov-text-secondary)',
                border: '1px solid var(--gov-border)',
              }}
            >
              {s === 'all' ? 'All status' : s.replace('_', ' ')}
            </Link>
          ))}
        </div>
      </div>

      {/* Cases table */}
      <div className="gov-card overflow-hidden">
        {cases.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--gov-surface-alt)' }}>
              <FolderOpen size={22} style={{ color: 'var(--gov-text-muted)' }} />
            </div>
            {hasFilters ? (
              <>
                <p className="font-semibold" style={{ color: 'var(--gov-text)' }}>No cases match these filters</p>
                <Link href="/dashboard/cases" className="text-sm hover:underline" style={{ color: 'var(--gov-primary-light)' }}>
                  Clear filters
                </Link>
              </>
            ) : (
              <p className="font-semibold" style={{ color: 'var(--gov-text)' }}>No cases yet</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--gov-text-muted)', background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}>
                <th scope="col" className="px-5 py-3 text-left">Resident</th>
                <th scope="col" className="px-4 py-3 text-left">Category</th>
                <th scope="col" className="px-4 py-3 text-left">Urgency</th>
                <th scope="col" className="px-4 py-3 text-left">Status</th>
                <th scope="col" className="px-4 py-3 text-left">Documents</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <Link key={c.id} href={`/dashboard/cases/${c.id}`} legacyBehavior>
                  <tr
                    className="cursor-pointer transition-colors group"
                    style={{
                      background: i % 2 === 1 ? 'var(--gov-surface-alt)' : 'var(--gov-surface)',
                      borderBottom: '1px solid var(--gov-border)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--gov-primary-50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? 'var(--gov-surface-alt)' : 'var(--gov-surface)')}
                  >
                    {/* Resident */}
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-sm" style={{ color: 'var(--gov-text)' }}>{c.resident_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                        {c.case_number ?? `#${c.id}`} · {timeAgo(c.created_at)}
                      </p>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      <p className="text-sm truncate" style={{ color: 'var(--gov-text-secondary)' }}>{c.category ?? '—'}</p>
                      {c.sub_category && (
                        <p className="text-xs truncate" style={{ color: 'var(--gov-text-muted)' }}>{c.sub_category}</p>
                      )}
                    </td>

                    {/* Urgency */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${URGENCY_CLASS[c.urgency] ?? ''}`}>
                        {c.urgency}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${STATUS_CLASS[c.status] ?? ''}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Documents */}
                    <td className="px-4 py-3.5">
                      {c.doc_total > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--gov-surface-inset)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(c.doc_fulfilled / c.doc_total) * 100}%`, background: '#059669' }}
                            />
                          </div>
                          <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--gov-text-muted)' }}>
                            {c.doc_fulfilled}/{c.doc_total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Arrow */}
                    <td className="px-4 py-3.5">
                      <ChevronRight size={16} style={{ color: 'var(--gov-text-muted)' }} className="group-hover:translate-x-0.5 transition-transform" />
                    </td>
                  </tr>
                </Link>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p style={{ color: 'var(--gov-text-muted)' }}>
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildUrl({ page: String(page - 1) })} className="gov-btn-secondary">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildUrl({ page: String(page + 1) })} className="gov-btn-primary">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
