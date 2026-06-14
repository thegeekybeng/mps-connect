import type { Metadata }      from 'next';
import { requireAuth }         from '@/lib/auth';
import { can }                 from '@/lib/rbac';
import { db }                  from '@/lib/db';
import { notFound }            from 'next/navigation';
import { CheckSquare, Bot, ArrowRight, Clock } from 'lucide-react';
import Link                    from 'next/link';
import ApprovalsClient         from '@/components/approvals/ApprovalsClient';
import type { ApprovalCase }   from '@/components/approvals/ApprovalsClient';

export const metadata: Metadata  = { title: 'Approvals — MPS Connect' };
export const dynamic             = 'force-dynamic';

// ── Data fetching ─────────────────────────────────────────────

async function fetchPendingCases(constituencyId: number | null): Promise<ApprovalCase[]> {
  // Base case records
  const cases = await db<{
    id: number; resident_name: string; nric_masked: string | null;
    contact_phone: string | null; category: string | null;
    sub_category: string | null; urgency: string;
    summary: string | null; core_request: string | null;
    key_facts: string[] | null; suggested_agencies: string[] | null;
    causal_graph: Record<string, unknown> | null;
    case_number: string | null; updated_at: string;
  }>(
    `SELECT id, resident_name, nric_masked, contact_phone,
            category, sub_category, urgency, summary, core_request,
            key_facts, suggested_agencies, causal_graph, case_number, updated_at
     FROM cases
     WHERE status = 'pending_approval'
       ${constituencyId ? 'AND constituency_id = $1' : ''}
     ORDER BY
       CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
       updated_at DESC`,
    constituencyId ? [constituencyId] : []
  );

  if (cases.length === 0) return [];

  const ids = cases.map(c => c.id);

  // Fetch all related data in parallel
  const [letters, requirements, uploads, agentDecisions] = await Promise.all([
    db<{
      id: number; case_id: number; agency: string; agency_label: string | null;
      content: string; status: string; created_at: string;
    }>(
      `SELECT id, case_id, agency, agency_label, content, status, created_at
       FROM letters WHERE case_id = ANY($1) ORDER BY case_id, created_at`,
      [ids]
    ),

    db<{
      id: number; case_id: number; agency: string; document_type: string;
      reason: string; required: boolean; fulfilled: boolean; source_type: string;
    }>(
      `SELECT id, case_id, agency, document_type, reason, required, fulfilled, source_type
       FROM document_requirements WHERE case_id = ANY($1)`,
      [ids]
    ),

    db<{
      id: number; case_id: number; requirement_id: number | null;
      filename: string; mime_type: string; file_size_bytes: number;
      scan_status: string; uploaded_at: string;
    }>(
      `SELECT id, case_id, requirement_id, filename, mime_type,
              file_size_bytes, scan_status, uploaded_at
       FROM case_documents WHERE case_id = ANY($1)`,
      [ids]
    ),

    // Latest agent decision per case (DISTINCT ON)
    db<{
      case_id: number; decision: string; confidence: number;
      reasoning: string; model_used: string; created_at: string;
    }>(
      `SELECT DISTINCT ON (case_id) case_id, decision, confidence, reasoning, model_used, created_at
       FROM agent_decisions WHERE case_id = ANY($1)
       ORDER BY case_id, created_at DESC`,
      [ids]
    ),
  ]);

  // Index by case_id for fast lookup
  const lettersByCaseId      = groupBy(letters,       r => r.case_id);
  const reqsByCaseId         = groupBy(requirements,  r => r.case_id);
  const uploadsByCaseId      = groupBy(uploads,        r => r.case_id);
  const agentByCaseId        = Object.fromEntries(agentDecisions.map(a => [a.case_id, a]));

  return cases.map(c => ({
    ...c,
    causal_graph:   c.causal_graph as ApprovalCase['causal_graph'],
    letters:        lettersByCaseId[c.id]     ?? [],
    requirements:   reqsByCaseId[c.id]        ?? [],
    uploads:        uploadsByCaseId[c.id]     ?? [],
    agent_decision: agentByCaseId[c.id]       ?? null,
  }));
}

async function fetchRecentlyActioned(constituencyId: number | null) {
  return db<{ id: number; resident_name: string; category: string | null; urgency: string; case_number: string | null; updated_at: string; status: string }>(
    `SELECT id, resident_name, category, urgency, case_number, updated_at, status
     FROM cases
     WHERE status IN ('approved','sent')
       ${constituencyId ? 'AND constituency_id = $1' : ''}
       AND updated_at > NOW() - INTERVAL '14 days'
     ORDER BY updated_at DESC LIMIT 10`,
    constituencyId ? [constituencyId] : []
  );
}

function groupBy<T>(arr: T[], key: (item: T) => number): Record<number, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    acc[k] = acc[k] ?? [];
    acc[k].push(item);
    return acc;
  }, {} as Record<number, T[]>);
}

function relDays(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

const URGENCY_PILL: Record<string, string> = {
  Critical: 'urgency-critical',
  High:     'urgency-high',
  Medium:   'urgency-medium',
  Low:      'urgency-low',
};

// ── Page ──────────────────────────────────────────────────────

export default async function ApprovalsPage() {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) notFound();

  const [cases, recentlyActioned] = await Promise.all([
    fetchPendingCases(session.constituencyId),
    fetchRecentlyActioned(session.constituencyId),
  ]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
            <CheckSquare size={22} style={{ color: 'var(--gov-primary-light)' }} />
            Approvals
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
            {cases.length > 0
              ? `${cases.length} case${cases.length > 1 ? 's' : ''} awaiting your review — expand each card to read in full`
              : 'No cases pending approval'}
          </p>
        </div>
        <Link href="/dashboard/agent" className="gov-btn-secondary">
          <Bot size={14} /> AI Pre-screen <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: review workspace */}
        <div className="lg:col-span-2">
          <ApprovalsClient cases={cases} />
        </div>

        {/* Right: recently actioned + tips */}
        <div className="space-y-4">

          {/* Recently actioned */}
          <div className="gov-card overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
              <Clock size={14} style={{ color: 'var(--gov-text-muted)' }} />
              <h2 className="font-bold text-sm" style={{ color: 'var(--gov-text)' }}>Recently Actioned</h2>
              <span className="ml-auto text-xs" style={{ color: 'var(--gov-text-muted)' }}>14 days</span>
            </div>
            {recentlyActioned.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--gov-text-muted)' }}>
                No approvals in the last 14 days
              </div>
            ) : (
              <div>
                {recentlyActioned.map((c, i) => (
                  <Link key={c.id} href={`/dashboard/cases/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors group"
                    style={{ borderBottom: '1px solid var(--gov-border)', background: i % 2 === 1 ? 'var(--gov-surface-alt)' : 'var(--gov-surface)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate transition-colors" style={{ color: 'var(--gov-text)' }}>
                        {c.resident_name}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--gov-text-muted)' }}>{c.category}</p>
                    </div>
                    <div className="shrink-0 text-right space-y-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded block ${URGENCY_PILL[c.urgency] ?? ''}`}>
                        {c.urgency}
                      </span>
                      <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>{relDays(c.updated_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* How it works card */}
          <div className="gov-card p-5" style={{ background: 'var(--gov-primary-50)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--gov-primary-100)' }}>
                <Bot size={18} style={{ color: 'var(--gov-primary)' }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--gov-text)' }}>AI Pre-screening</p>
                <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Runs before your review</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--gov-text-secondary)' }}>
              The AI agent pre-screens cases against your approval rules. Cases above your urgency cap —
              or outside approved categories — are automatically escalated here for your personal sign-off.
              The AI can never approve on your behalf without your configuration allowing it.
            </p>
            <Link href="/dashboard/agent"
              className="text-xs font-bold flex items-center gap-1 transition-colors"
              style={{ color: 'var(--gov-primary)' }}>
              Configure AI Agent <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
