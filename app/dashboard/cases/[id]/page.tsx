import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth, type UserRole } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import {
  getDocumentRequirements,
} from '@/app/actions/documents';
import CaseDetailView from '@/components/cases/CaseDetailView';

export const metadata: Metadata = { title: 'Case Detail — MPS Connect' };

// Fetch full case record scoped to the session's constituency
async function fetchCase(id: number, constituencyId: number | null, role: UserRole) {
  const bypass = can(role, 'constituencies:read_all');
  const rows = await db<{
    id: number; resident_name: string; nric_masked: string | null;
    contact_phone: string | null; category: string | null;
    sub_category: string | null; urgency: string; status: string;
    summary: string | null; core_request: string | null;
    key_facts: string[] | null; suggested_agencies: string[] | null;
    causal_graph: Record<string, unknown> | null; case_number: string | null;
    created_at: string; updated_at: string;
  }>(
    `SELECT id, resident_name, nric_masked, contact_phone, category,
            sub_category, urgency, status, summary, core_request,
            key_facts, suggested_agencies, causal_graph, case_number,
            created_at, updated_at
     FROM cases
     WHERE id = $1
       ${constituencyId && !bypass ? 'AND constituency_id = $2' : ''}`,
    constituencyId && !bypass ? [id, constituencyId] : [id]
  );
  return rows[0] ?? null;
}

async function fetchCaseEvents(caseId: number) {
  return db<{
    id: number; actor_role: string | null; action: string;
    detail: Record<string, unknown> | null; ts: string;
  }>(
    `SELECT ce.id, ce.actor_role, ce.action, ce.detail, ce.ts
     FROM case_events ce
     WHERE ce.case_id = $1
     ORDER BY ce.ts DESC
     LIMIT 20`,
    [caseId]
  );
}

async function fetchLatestAgentDecision(caseId: number) {
  const rows = await db<{
    id: number; decision: string; confidence: number;
    reasoning: string; model: string; overridden: boolean; created_at: string;
  }>(
    `SELECT id, decision, confidence, reasoning, model, overridden, created_at
     FROM agent_decisions WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [caseId]
  );
  return rows[0] ?? null;
}

async function fetchLetters(caseId: number) {
  return db<{
    id: number; agency: string; agency_label: string | null;
    content: string; status: string; created_at: string;
  }>(
    `SELECT id, agency, agency_label, content, status, created_at
     FROM letters WHERE case_id = $1
     ORDER BY created_at ASC`,
    [caseId]
  );
}

async function fetchCaseMessages(caseId: number) {
  return db<{
    id: number; role: string; content: string;
    is_stt: boolean; stt_duration_seconds: number | null;
    audio_url: string | null; created_at: string;
  }>(
    `SELECT id, role, content, is_stt, stt_duration_seconds, audio_url, created_at
     FROM case_messages WHERE case_id = $1 ORDER BY created_at ASC`,
    [caseId]
  );
}

import { fetchResidentVisitHistory } from '@/app/actions/cases';

const URGENCY_COLOUR: Record<string, string> = {
  Critical: 'bg-red-100 text-red-800 border-red-200',
  High:     'bg-orange-100 text-orange-800 border-orange-200',
  Medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  Low:      'bg-green-100 text-green-800 border-green-200',
};

const STATUS_COLOUR: Record<string, string> = {
  new:              'bg-blue-100 text-blue-700 border-blue-200',
  triaged:          'bg-violet-100 text-violet-700 border-violet-200',
  drafting:         'bg-indigo-100 text-indigo-700 border-indigo-200',
  pending_approval: 'bg-amber-100 text-amber-800 border-amber-200',
  approved:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  sent:             'bg-teal-100 text-teal-700 border-teal-200',
  closed:           'bg-slate-100 text-slate-500 border-slate-200',
  ESCALATED:        'bg-red-100 text-red-900 border-red-300',
};

// Status pipeline steps for visual display
const STATUS_PIPELINE = ['new', 'triaged', 'drafting', 'pending_approval', 'approved', 'sent', 'closed'] as const;
const STATUS_LABELS: Record<string, string> = {
  new: 'New', triaged: 'Triaged', drafting: 'Drafting',
  pending_approval: 'Review', approved: 'Approved', sent: 'Sent', closed: 'Closed',
};

const EVENT_LABEL: Record<string, string> = {
  causality_run: 'AI Analysis',
  status_changed: 'Status Change',
  approved: 'Approved',
  returned_to_drafting: 'Returned',
  letter_generated: 'Letter Generated',
  agent_decision: 'Agent Decision',
  sent_to_agencies: 'Dispatched',
  agency_response_received: 'Agency Reply',
  case_closed: 'Case Closed',
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const caseId = parseInt(idStr, 10);
  if (isNaN(caseId)) notFound();

  const session = await requireAuth();
  if (!can(session.role, 'cases:read')) notFound();

  const canApprove = can(session.role, 'letters:approve');
  const canWrite   = can(session.role, 'cases:update');

  const [caseRecord, events, { requirements, documents }, agentDecision, letters, caseMessages] = await Promise.all([
    fetchCase(caseId, session.constituencyId, session.role),
    fetchCaseEvents(caseId),
    getDocumentRequirements(caseId),
    fetchLatestAgentDecision(caseId),
    fetchLetters(caseId),
    fetchCaseMessages(caseId),
  ]);

  if (!caseRecord) notFound();

  // Fetch visit history using the name and NRIC of this case's resident
  const visitHistory = await fetchResidentVisitHistory(caseRecord.resident_name, caseRecord.nric_masked);

  const causalGraph = caseRecord.causal_graph as {
    urgency?: { overall: string; rationale: string };
    agencyRoutes?: { agency: string; priority: 'primary' | 'secondary' | 'support'; specificAsk: string; letterType?: string }[];
    documentRequirements?: unknown[];
  } | null;

  // Count unfulfilled required docs — advisory only, never blocks approval
  const unfulfilledRequiredDocs = requirements.filter(
    (r: { required: boolean; fulfilled: boolean }) => r.required && !r.fulfilled
  ).length;

  // Current status index for pipeline display
  const currentStatusIdx = STATUS_PIPELINE.indexOf(caseRecord.status as typeof STATUS_PIPELINE[number]);

  return (
    <CaseDetailView
      caseRecord={caseRecord}
      events={events}
      requirements={requirements}
      documents={documents}
      agentDecision={agentDecision}
      letters={letters}
      session={session}
      canApprove={canApprove}
      canWrite={canWrite}
      unfulfilledRequiredDocs={unfulfilledRequiredDocs}
      currentStatusIdx={currentStatusIdx}
      caseMessages={caseMessages}
      visitHistory={visitHistory}
    />
  );
}
