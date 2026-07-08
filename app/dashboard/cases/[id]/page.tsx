import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import {
  getDocumentRequirements,
} from '@/app/actions/documents';
import {
  AlertTriangle, Clock, FileText, ChevronRight, Bot,
  Mail, ArrowLeft, User, Calendar, Hash,
  Building2, BrainCircuit, Shield,
} from 'lucide-react';
import DocumentsCard from '@/components/documents/DocumentsCard';
import CaseIntelligencePanel from '@/components/cases/CaseIntelligencePanel';
import AgentReviewButton from '@/components/agent/AgentReviewButton';
import CaseApprovalBar from '@/components/cases/CaseApprovalBar';
import FactVerificationGate from '@/components/cases/FactVerificationGate';
import AgencyOverrideGate from '@/components/cases/AgencyOverrideGate';

export const metadata: Metadata = { title: 'Case Detail — MPS Connect' };

// Fetch full case record scoped to the session's constituency
async function fetchCase(id: number, constituencyId: number | null) {
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
       ${constituencyId ? 'AND constituency_id = $2' : ''}`,
    constituencyId ? [id, constituencyId] : [id]
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
    reasoning: string; model_used: string; overridden: boolean; created_at: string;
  }>(
    `SELECT id, decision, confidence, reasoning, model_used, overridden, created_at
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

  const [caseRecord, events, { requirements, documents }, agentDecision, letters] = await Promise.all([
    fetchCase(caseId, session.constituencyId),
    fetchCaseEvents(caseId),
    getDocumentRequirements(caseId),
    fetchLatestAgentDecision(caseId),
    fetchLetters(caseId),
  ]);

  if (!caseRecord) notFound();

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
    <div className="space-y-6 animate-page">

      {/* ── Breadcrumb + Back ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/cases"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'var(--gov-text-muted)' }}
        >
          <ArrowLeft size={14} />
          Cases
        </Link>
        <ChevronRight size={12} style={{ color: 'var(--gov-text-muted)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--gov-text-secondary)' }}>
          {caseRecord.case_number ?? `#${caseRecord.id}`}
        </span>
      </div>

      {/* ── Header Card ────────────────────────────────────── */}
      <div className="gov-card overflow-hidden">
        <div className="px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Left: Resident info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'var(--gov-primary-50)', color: 'var(--gov-primary)' }}
                >
                  {caseRecord.resident_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--gov-text)' }}>
                    {caseRecord.resident_name}
                  </h1>
                  <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{caseRecord.case_number ?? `#${caseRecord.id}`}</span>
                    <span>·</span>
                    <span>{caseRecord.category ?? 'Uncategorised'}</span>
                    {caseRecord.sub_category && <span>· {caseRecord.sub_category}</span>}
                  </p>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                {caseRecord.nric_masked && (
                  <span className="flex items-center gap-1"><User size={11} /> {caseRecord.nric_masked}</span>
                )}
                {caseRecord.contact_phone && (
                  <span className="flex items-center gap-1"><Hash size={11} /> {caseRecord.contact_phone}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {new Date(caseRecord.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Right: Status + urgency badges + agent review CTA */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${URGENCY_COLOUR[caseRecord.urgency] ?? ''}`}>
                {caseRecord.urgency}
              </span>
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${STATUS_COLOUR[caseRecord.status] ?? ''}`}>
                {caseRecord.status.replace('_', ' ')}
              </span>
              {caseRecord.status === 'pending_approval' && canApprove && !agentDecision && (
                <AgentReviewButton caseId={caseId} canApprove={canApprove} />
              )}
            </div>
          </div>
        </div>

        {/* ── Status Pipeline ──────────────────────────────── */}
        <div className="px-6 pb-5 sm:px-8">
          <div className="flex items-center gap-0">
            {STATUS_PIPELINE.map((step, i) => {
              const isCurrent = step === caseRecord.status;
              const isPast    = i < currentStatusIdx;
              const isFuture  = i > currentStatusIdx;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  {/* Step dot */}
                  <div className={`relative flex items-center justify-center shrink-0
                    ${isCurrent ? 'w-7 h-7 rounded-xl' : 'w-5 h-5 rounded-lg'}
                    ${isCurrent   ? 'text-white shadow-md' :
                      isPast      ? 'bg-emerald-500 text-white' :
                                    'text-slate-400'}`}
                    style={isCurrent ? { background: 'var(--gov-primary)', boxShadow: '0 2px 8px rgba(28,61,90,0.25)' } : !isPast ? { background: 'var(--gov-surface-inset)' } : {}}
                  >
                    {isPast ? (
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <span className={`text-[8px] font-bold ${isCurrent ? '' : 'opacity-60'}`}>{i + 1}</span>
                    )}
                  </div>
                  {/* Label */}
                  <span className={`ml-1.5 text-[10px] font-semibold whitespace-nowrap hidden sm:inline
                    ${isCurrent ? '' : isPast ? 'text-emerald-600' : ''}`}
                    style={isCurrent ? { color: 'var(--gov-primary)' } : !isPast ? { color: 'var(--gov-text-muted)' } : {}}
                  >
                    {STATUS_LABELS[step]}
                  </span>
                  {/* Connector line */}
                  {i < STATUS_PIPELINE.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded-full ${isPast ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left Column (2/3) ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Agent decision banner */}
          {agentDecision && (
            <section className={`rounded-xl border p-5 ${
              agentDecision.decision === 'approved'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Bot size={16} className={agentDecision.decision === 'approved' ? 'text-emerald-600' : 'text-amber-600'} />
                <span className={`font-bold text-sm ${
                  agentDecision.decision === 'approved' ? 'text-emerald-800' : 'text-amber-800'
                }`}>
                  {agentDecision.decision === 'approved' ? 'AI Auto-Approved' : 'AI Escalated for Review'}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/60 text-slate-600">
                  {Math.round(agentDecision.confidence * 100)}% confidence
                </span>
                {agentDecision.overridden && (
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Overridden</span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${
                agentDecision.decision === 'approved' ? 'text-emerald-900' : 'text-amber-900'
              }`}>{agentDecision.reasoning}</p>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                {agentDecision.model_used} · {new Date(agentDecision.created_at).toLocaleString('en-SG')}
              </p>
            </section>
          )}

          {/* Agent review CTA section */}
          {caseRecord.status === 'pending_approval' && canApprove && !agentDecision && (
            <section className="gov-card p-5">
              <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
                <Bot size={16} style={{ color: 'var(--gov-primary-light)' }} /> AI Agent Review
              </h2>
              <p className="text-slate-500 text-xs mb-4">
                Run the AI agent to evaluate this letter against your configured approval preferences.
              </p>
              <AgentReviewButton caseId={caseId} canApprove={canApprove} />
            </section>
          )}

          {/* Summary + Core Request */}
          {(caseRecord.summary || caseRecord.core_request) && (
            <section className="gov-card overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                <FileText size={15} className="text-slate-400" />
                <h2 className="font-bold text-slate-900">Case Summary</h2>
              </div>
              <div className="p-6 space-y-4">
                {caseRecord.summary && (
                  <p className="text-slate-700 text-sm leading-relaxed">{caseRecord.summary}</p>
                )}
                {caseRecord.core_request && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Core Request</p>
                    <p className="text-blue-900 text-sm leading-relaxed">{caseRecord.core_request}</p>
                  </div>
                )}
                {caseRecord.key_facts && caseRecord.key_facts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Key Facts</p>
                    <ul className="space-y-1">
                      {caseRecord.key_facts.map((fact, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-slate-300" />
                          {fact}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* HITL Gate 2 — Fact Verification (submission blocker) */}
          {canWrite && caseRecord.key_facts && caseRecord.key_facts.length > 0 && (
            <FactVerificationGate
              caseId={caseId}
              keyFacts={caseRecord.key_facts}
              caseStatus={caseRecord.status}
            />
          )}

          {/* AI Urgency Rationale */}
          {causalGraph?.urgency?.rationale && (
            <section className="gov-card overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                <AlertTriangle size={15} className="text-amber-500" />
                <h2 className="font-bold text-slate-900">AI Urgency Rationale</h2>
                <span className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-bold border ${URGENCY_COLOUR[causalGraph.urgency.overall ?? ''] ?? ''}`}>
                  {causalGraph.urgency.overall}
                </span>
              </div>
              <div className="p-6">
                <p className="text-slate-700 text-sm leading-relaxed">{causalGraph.urgency.rationale}</p>
              </div>
            </section>
          )}

          {/* Agency Routes */}
          {(causalGraph?.agencyRoutes?.length ?? 0) > 0 && (
            <section className="gov-card overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                <Building2 size={15} style={{ color: 'var(--gov-text-muted)' }} />
                <h2 className="font-bold text-slate-900">Agency Routes</h2>
                <span className="ml-auto text-xs text-slate-400 font-medium">
                  {causalGraph!.agencyRoutes!.length} {causalGraph!.agencyRoutes!.length === 1 ? 'agency' : 'agencies'}
                </span>
              </div>
              <div className="p-5 space-y-3">
                {causalGraph!.agencyRoutes!.map((route, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors" style={{ background: 'var(--gov-surface-alt)' }}>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${
                      route.priority === 'primary'   ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      route.priority === 'secondary' ? 'bg-violet-100 text-violet-800 border border-violet-200' :
                                                       'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}>{route.priority}</span>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{route.agency}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{route.specificAsk}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* HITL Gate 3 — Agency Override (action gate) */}
          {canWrite && caseRecord.suggested_agencies && (
            <AgencyOverrideGate
              caseId={caseId}
              suggestedAgencies={caseRecord.suggested_agencies}
              canWrite={canWrite}
            />
          )}

          {/* Letters Preview */}
          {letters.length > 0 && (
            <section className="gov-card overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                <Mail size={15} style={{ color: 'var(--gov-primary-light)' }} />
                <h2 className="font-bold text-slate-900">Letters</h2>
                <span className="ml-auto text-xs text-slate-400 font-medium">
                  {letters.length} {letters.length === 1 ? 'letter' : 'letters'}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {letters.map(letter => (
                  <details key={letter.id} className="group">
                    <summary className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors list-none">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gov-primary-50)' }}>
                          <Mail size={14} style={{ color: 'var(--gov-primary)' }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{letter.agency_label ?? letter.agency}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {letter.status} · {new Date(letter.created_at).toLocaleDateString('en-SG')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                        letter.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        letter.status === 'sent'     ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                                       'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {letter.status}
                      </span>
                    </summary>
                    <div className="px-6 pb-5">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                          {letter.content}
                        </pre>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Audit Trail */}
          <section className="gov-card overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
              <Shield size={15} style={{ color: 'var(--gov-text-muted)' }} />
              <h2 className="font-bold text-slate-900">Audit Trail</h2>
              <span className="ml-auto text-xs text-slate-400">{events.length} events</span>
            </div>
            <div className="p-6">
              {events.length === 0 ? (
                <p className="text-slate-400 text-sm">No events recorded yet.</p>
              ) : (
                <ol className="relative border-l-2 border-slate-100 space-y-5 ml-2">
                  {events.map(ev => (
                    <li key={ev.id} className="pl-5 relative">
                      <div className="absolute w-3 h-3 bg-white border-2 border-slate-300 rounded-full -left-[7px] top-1" />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-slate-900 text-sm font-medium flex items-center gap-1.5">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-secondary)' }}>{EVENT_LABEL[ev.action] ?? ev.action.replace(/_/g, ' ')}</span>
                            {ev.action.replace(/_/g, ' ')}
                          </p>
                          {ev.detail && (
                            <p className="text-slate-500 text-xs mt-0.5">
                              {typeof ev.detail === 'object' && 'reason' in ev.detail
                                ? String(ev.detail.reason)
                                : JSON.stringify(ev.detail).slice(0, 120)}
                            </p>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs shrink-0 tabular-nums">
                          {ev.actor_role ?? 'system'} · {new Date(ev.ts).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        {/* ── Right Column (1/3) ────────────────────────────── */}
        <div className="space-y-5">

          {/* Approval bar — shown only for pending_approval + letters:approve */}
          {caseRecord.status === 'pending_approval' && canApprove && (
            <CaseApprovalBar
              caseId={caseId}
              unfulfilledRequiredDocs={unfulfilledRequiredDocs}
            />
          )}

          {/* Documents */}
          <DocumentsCard
            caseId={caseId}
            initialRequirements={requirements}
            initialDocuments={documents}
            canWrite={canWrite}
          />

          {/* Case Intelligence Panel */}
          <CaseIntelligencePanel
            caseId={caseId}
            initialGraph={causalGraph}
            transcript={caseRecord.summary ?? ''}
          />

          {/* Metadata card */}
          <div className="gov-card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--gov-border)' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>Case Metadata</h3>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Case ID</span>
                <span className="font-mono text-slate-700 font-medium">{caseRecord.case_number ?? `#${caseRecord.id}`}</span>
              </div>
              {caseRecord.nric_masked && (
                <div className="flex justify-between">
                  <span className="text-slate-500">NRIC</span>
                  <span className="font-mono text-slate-700">{caseRecord.nric_masked}</span>
                </div>
              )}
              {caseRecord.contact_phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-mono text-slate-700">{caseRecord.contact_phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Submitted</span>
                <span className="text-slate-700">{new Date(caseRecord.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Updated</span>
                <span className="text-slate-700">{new Date(caseRecord.updated_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {caseRecord.suggested_agencies && caseRecord.suggested_agencies.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-slate-500 mb-1.5">Suggested Agencies</p>
                  <div className="flex flex-wrap gap-1">
                    {caseRecord.suggested_agencies.map((a, i) => (
                      <span key={i} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-medium">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
