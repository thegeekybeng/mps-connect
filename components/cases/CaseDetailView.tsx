'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Clock, FileText, ChevronRight, Bot,
  Mail, ArrowLeft, User, Calendar, Hash, Building2, Shield,
  Eye, EyeOff, ExternalLink
} from 'lucide-react';
import DocumentsCard from '@/components/documents/DocumentsCard';
import CaseIntelligencePanel from '@/components/cases/CaseIntelligencePanel';
import AgentReviewButton from '@/components/agent/AgentReviewButton';
import CaseApprovalBar from '@/components/cases/CaseApprovalBar';
import CaseDispatchBar from '@/components/cases/CaseDispatchBar';
import CaseActionPanel from '@/components/cases/CaseActionPanel';
import FactVerificationGate from '@/components/cases/FactVerificationGate';
import AgencyOverrideGate from '@/components/cases/AgencyOverrideGate';

interface Props {
  caseRecord: any;
  events: any[];
  requirements: any[];
  documents: any[];
  agentDecision: any;
  letters: any[];
  session: any;
  canApprove: boolean;
  canWrite: boolean;
  unfulfilledRequiredDocs: number;
  currentStatusIdx: number;
  caseMessages: any[];
  visitHistory: any[];
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

export default function CaseDetailView({
  caseRecord,
  events,
  requirements,
  documents,
  agentDecision,
  letters,
  session,
  canApprove,
  canWrite,
  unfulfilledRequiredDocs,
  currentStatusIdx,
  caseMessages = [],
  visitHistory = []
}: Props) {
  const [unmaskPII, setUnmaskPII] = useState(false);

  // Mask NRIC helper (e.g. S1234567A -> S••••567A)
  const maskNRIC = (nric: string) => {
    if (!nric || nric.length < 9) return nric;
    return nric[0] + '••••' + nric.slice(5);
  };

  // Mask Phone helper (e.g. 91234567 -> 9••••567)
  const maskPhone = (phone: string) => {
    if (!phone || phone.length < 8) return phone;
    return phone.slice(0, 2) + '••••' + phone.slice(6);
  };

  // Mask Name helper (e.g. Tan Kok Seng -> T•• K•• S•••)
  const maskName = (name: string) => {
    if (!name) return '';
    return name.split(' ').map(part => {
      if (part.length <= 1) return part;
      const lower = part.toLowerCase();
      if (lower === 'bin' || lower === 'binte' || lower === 's/o' || lower === 'd/o') return part;
      return part[0] + '•'.repeat(part.length - 1);
    }).join(' ');
  };

  const getDisplayName = () => {
    return unmaskPII ? caseRecord.resident_name : maskName(caseRecord.resident_name);
  };

  const getDisplayNRIC = () => {
    return unmaskPII ? caseRecord.nric_masked : maskNRIC(caseRecord.nric_masked);
  };

  const getDisplayPhone = () => {
    return unmaskPII ? caseRecord.contact_phone : maskPhone(caseRecord.contact_phone);
  };

  // Dynamically replace PII placeholders in letters when unmasked
  const formatLetterContent = (content: string) => {
    if (!content) return '';
    if (!unmaskPII) return content;
    return content
      .replaceAll('██ RESIDENT NAME ██', caseRecord.resident_name)
      .replaceAll('██ NRIC ██', caseRecord.nric_masked);
  };

  const causalGraph = caseRecord.causal_graph as {
    urgency?: { overall: string; rationale: string };
    agencyRoutes?: { agency: string; priority: 'primary' | 'secondary' | 'support'; specificAsk: string; letterType?: string }[];
    documentRequirements?: unknown[];
  } | null;

  return (
    <div className="space-y-6 animate-page">

      {/* ── Breadcrumb + Back ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
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

        {/* Global PII Unmask Toggle Button */}
        <button
          onClick={() => setUnmaskPII(!unmaskPII)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors shadow-sm
                     ${unmaskPII 
                       ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' 
                       : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'}`}
        >
          {unmaskPII ? <EyeOff size={13} /> : <Eye size={13} />}
          {unmaskPII ? 'Mask PII Details' : 'Unmask PII Details'}
        </button>
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
                  {caseRecord.resident_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
                    {getDisplayName()}
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
                  <span className="flex items-center gap-1"><User size={11} /> {getDisplayNRIC()}</span>
                )}
                {caseRecord.contact_phone && (
                  <span className="flex items-center gap-1"><Hash size={11} /> {getDisplayPhone()}</span>
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
                <AgentReviewButton caseId={caseRecord.id} canApprove={canApprove} />
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
                {agentDecision.model} · {new Date(agentDecision.created_at).toLocaleString('en-SG')}
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
              <AgentReviewButton caseId={caseRecord.id} canApprove={canApprove} />
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
                      {caseRecord.key_facts.map((fact: string, i: number) => (
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

          {/* Intake Chat Transcript Audit */}
          {caseMessages && caseMessages.length > 0 && (
            <section className="gov-card overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                <Shield size={15} className="text-slate-400" />
                <h2 className="font-bold text-slate-900">Intake Conversation Transcript Audit</h2>
                <span className="ml-auto text-xs text-slate-400 font-medium">
                  {caseMessages.length} messages
                </span>
              </div>
              <div className="p-6 bg-slate-50/50">
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Review the raw intake session to audit the AI&apos;s understanding, summarisation accuracy, and any voice inputs.
                </p>
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                  {caseMessages.map((msg: any) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">
                            {isUser ? 'Resident' : 'AI Intake Assistant'}
                          </span>
                          {msg.is_stt && (
                            <span className="bg-blue-100 text-blue-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                              🎙️ Voice ({msg.stt_duration_seconds ? `${msg.stt_duration_seconds}s` : 'STT'})
                            </span>
                          )}
                        </div>
                        <div className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed max-w-[85%] shadow-sm
                          ${isUser 
                            ? 'bg-slate-700 text-white rounded-tr-none' 
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <span className="text-[9px] text-slate-400 mt-1 tabular-nums">
                          {new Date(msg.created_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* HITL Gate 2 — Fact Verification (submission blocker) */}
          {canWrite && caseRecord.key_facts && caseRecord.key_facts.length > 0 && (
            <FactVerificationGate
              caseId={caseRecord.id}
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
              caseId={caseRecord.id}
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
                  <details key={letter.id} className="group" open>
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
                          {formatLetterContent(letter.content)}
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
              caseId={caseRecord.id}
              unfulfilledRequiredDocs={unfulfilledRequiredDocs}
            />
          )}

          {/* Dispatch bar — shown only for approved cases */}
          {caseRecord.status === 'approved' && (
            <CaseDispatchBar caseId={caseRecord.id} />
          )}

          {/* Action panel — shown only for sent cases */}
          {caseRecord.status === 'sent' && (
            <CaseActionPanel
              caseId={caseRecord.id}
              agencies={letters.map(l => l.agency)}
            />
          )}

          {/* Documents */}
          <DocumentsCard
            caseId={caseRecord.id}
            initialRequirements={requirements}
            initialDocuments={documents}
            canWrite={canWrite}
          />

          {/* Case Intelligence Panel */}
          <CaseIntelligencePanel
            caseId={caseRecord.id}
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
                  <span className="font-mono text-slate-700">{getDisplayNRIC()}</span>
                </div>
              )}
              {caseRecord.contact_phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-mono text-slate-700">{getDisplayPhone()}</span>
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
                    {caseRecord.suggested_agencies.map((a: string, i: number) => (
                      <span key={i} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-medium">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resident Visit History Card */}
          <div className="gov-card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--gov-border)' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
                Resident Visit History
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <span className="text-xs text-slate-500 font-semibold">Total Cases Filed</span>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {visitHistory.length}
                </span>
              </div>

              {visitHistory.length <= 1 ? (
                <p className="text-slate-400 text-xs italic">No prior visit records found.</p>
              ) : (
                <div className="space-y-3 divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
                  {visitHistory
                    .filter((v: any) => v.id !== caseRecord.id) // Exclude current case from list of past cases
                    .map((visit: any) => (
                      <div key={visit.id} className="pt-3 first:pt-0 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/dashboard/cases/${visit.id}`}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            {visit.case_number ?? `#${visit.id}`}
                            <ExternalLink size={10} />
                          </Link>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            visit.status === 'closed' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                            visit.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            visit.status === 'sent' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {visit.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{visit.category ?? 'Uncategorised'}</span>
                          <span>{new Date(visit.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>

                        {/* Agency Outcomes */}
                        {visit.agency_outcomes && visit.agency_outcomes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {visit.agency_outcomes.map((ao: any, idx: number) => {
                              const isApp = ao.outcome === 'Approved';
                              const isRej = ao.outcome === 'Rejected';
                              const isPart = ao.outcome === 'Partially Granted';
                              return (
                                <span
                                  key={idx}
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    isApp  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    isRej  ? 'bg-red-50 text-red-700 border border-red-200' :
                                    isPart ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                             'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {ao.agency}: {ao.outcome}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
