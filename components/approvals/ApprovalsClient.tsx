'use client';
// =============================================================
// MPS Connect — ApprovalsClient
// Accordion review workspace for pending-approval cases.
// Each card expands to show tabs: Overview | AI Analysis | Documents | Letters
// Approve / Return actions via server actions.
// =============================================================

import { useState, useTransition } from 'react';
import { approveCase, returnCase }  from '@/app/actions/approvals';
import {
  ChevronDown, ChevronUp,
  CheckCircle2, RotateCcw, Loader2,
  User, Phone, Tag, AlertTriangle,
  Bot, FileText, Files, Mail, BookOpen,
  ShieldCheck, ShieldAlert, Filter,
  List, Flag, Cpu,
  Paperclip, CheckSquare2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

export interface LetterRow {
  id:           number;
  agency:       string;
  agency_label: string | null;
  content:      string;
  status:       string;
  created_at:   string;
}

export interface DocumentRequirement {
  id:            number;
  agency:        string;
  document_type: string;
  reason:        string;
  required:      boolean;
  fulfilled:     boolean;
  source_type:   string;
}

export interface UploadedDocument {
  id:              number;
  requirement_id:  number | null;
  filename:        string;
  mime_type:       string;
  file_size_bytes: number;
  scan_status:     string;
  ocr_text?:       string | null;
  ocr_status?:     string;
  uploaded_at:     string;
}

export interface AgentDecision {
  decision:    string;
  confidence:  number;
  reasoning:   string;
  model:       string;
  created_at:  string;
}

export interface CausalGraph {
  urgency?: {
    overall:   string;
    rationale: string;
  };
  agencyRoutes?: Array<{
    agency:      string;
    priority:    string;
    specificAsk: string;
    letterType:  string;
  }>;
  documentRequirements?: unknown[];
}

export interface ApprovalCase {
  id:                 number;
  resident_name:      string;
  nric_masked:        string | null;
  contact_phone:      string | null;
  category:           string | null;
  sub_category:       string | null;
  urgency:            string;
  summary:            string | null;
  core_request:       string | null;
  key_facts:          string[] | null;
  suggested_agencies: string[] | null;
  causal_graph:       CausalGraph | null;
  case_number:        string | null;
  updated_at:         string;
  letters:            LetterRow[];
  requirements:       DocumentRequirement[];
  uploads:            UploadedDocument[];
  agent_decision:     AgentDecision | null;
}

// ── Helpers ───────────────────────────────────────────────────

const URGENCY_PILL: Record<string, string> = {
  Critical: 'bg-red-100 text-red-800 border border-red-200',
  High:     'bg-orange-100 text-orange-800 border border-orange-200',
  Medium:   'bg-yellow-100 text-yellow-800 border border-yellow-200',
  Low:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const LETTER_STATUS_PILL: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  sent:     'bg-indigo-100 text-indigo-700',
};

const SCAN_PILL: Record<string, string> = {
  clean:    'bg-emerald-100 text-emerald-700',
  pending:  'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
};

function relDays(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

function fmtBytes(b: number) {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

// ── Tab: Overview ─────────────────────────────────────────────

function OverviewTab({ c }: { c: ApprovalCase }) {
  return (
    <div className="space-y-5">
      {/* Resident info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <User size={10} /> Resident
          </p>
          <p className="text-sm font-bold text-slate-900">{c.resident_name}</p>
          {c.nric_masked && <p className="text-xs text-slate-500 font-mono">{c.nric_masked}</p>}
          {c.contact_phone && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {c.contact_phone}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <Tag size={10} /> Classification
          </p>
          <p className="text-sm font-bold text-slate-900">{c.category ?? 'Uncategorised'}</p>
          {c.sub_category && <p className="text-xs text-slate-500">{c.sub_category}</p>}
          <span className={`mt-1.5 inline-block text-xs font-bold px-2 py-0.5 rounded-lg ${URGENCY_PILL[c.urgency] ?? ''}`}>
            {c.urgency}
          </span>
        </div>
      </div>

      {/* Summary */}
      {c.summary && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Summary</p>
          <p className="text-sm text-slate-700 leading-relaxed">{c.summary}</p>
        </div>
      )}

      {/* Core request */}
      {c.core_request && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Core Request (Letter Body)</p>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.core_request}</p>
          </div>
        </div>
      )}

      {/* Key facts */}
      {c.key_facts && c.key_facts.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Key Facts</p>
          <ul className="space-y-1">
            {c.key_facts.map((f, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="mt-2 w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested agencies */}
      {c.suggested_agencies && c.suggested_agencies.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Suggested Agencies</p>
          <div className="flex flex-wrap gap-1.5">
            {c.suggested_agencies.map((a, i) => (
              <span key={i} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: AI Analysis ──────────────────────────────────────────

function AIAnalysisTab({ c }: { c: ApprovalCase }) {
  const graph = c.causal_graph;
  const agent = c.agent_decision;

  if (!graph && !agent) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
        <Bot size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-slate-500 text-sm font-medium">No AI analysis yet</p>
        <p className="text-slate-400 text-xs mt-1">Run the Causality Engine on this case to generate agency routes and urgency analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Causality engine output */}
      {graph && (
        <>
          {graph.urgency && (
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1.5">Urgency Assessment</p>
              <p className="text-sm font-bold text-violet-800">{graph.urgency.overall}</p>
              <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">{graph.urgency.rationale}</p>
            </div>
          )}

          {graph.agencyRoutes && graph.agencyRoutes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Agency Routes</p>
              <div className="space-y-2">
                {graph.agencyRoutes.map((route, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-bold text-slate-900">{route.agency}</p>
                      <div className="flex gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {route.priority}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600">
                          {route.letterType}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{route.specificAsk}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Agent decision */}
      {agent && (
        <div className={`rounded-xl border p-4 ${
          agent.decision === 'approved'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
            <Bot size={10} /> Agent Decision
          </p>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
              agent.decision === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {agent.decision === 'approved' ? 'Pre-approved' : 'Escalated for human review'}
            </span>
            {agent.confidence > 0 && (
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {Math.round(agent.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{agent.reasoning}</p>
          <p className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1">
            <Cpu size={10} /> {agent.model} · {relDays(agent.created_at)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Documents ────────────────────────────────────────────

function DocumentsTab({ c }: { c: ApprovalCase }) {
  const [expandedOcr, setExpandedOcr] = useState<Record<number, boolean>>({});
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  if (c.requirements.length === 0 && c.uploads.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
        <Paperclip size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-slate-500 text-sm font-medium">No document requirements set</p>
        <p className="text-slate-400 text-xs mt-1">The Causality Engine generates document requirements when it analyses a case.</p>
      </div>
    );
  }

  const handleCopy = (docId: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDocId(docId);
    setTimeout(() => setCopiedDocId(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Requirements checklist */}
      {c.requirements.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Required Documents</p>
          <div className="space-y-2">
            {c.requirements.map(req => (
              <div key={req.id}
                className={`rounded-xl border p-3 flex items-start gap-3 ${
                  req.fulfilled
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-white'
                }`}>
                <CheckSquare2
                  size={16}
                  className={`mt-0.5 shrink-0 ${req.fulfilled ? 'text-emerald-500' : 'text-slate-300'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{req.document_type}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{req.reason}</p>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      {req.agency}
                    </span>
                    {req.required && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                        Required
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded documents */}
      {c.uploads.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Uploaded Files ({c.uploads.length})
          </p>
          <div className="space-y-2">
            {c.uploads.map(doc => {
              const hasOcr = doc.ocr_status === 'completed' && doc.ocr_text;
              const isProcessing = doc.ocr_status === 'processing';
              const isFailed = doc.ocr_status === 'failed';
              const isExpanded = !!expandedOcr[doc.id];

              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{doc.filename}</p>
                        <p className="text-xs text-slate-400">{fmtBytes(doc.file_size_bytes)} · {relDays(doc.uploaded_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isProcessing && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-1 border border-blue-200">
                          <Loader2 size={10} className="animate-spin" /> OCR Processing
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                          OCR Failed
                        </span>
                      )}
                      {hasOcr && (
                        <button
                          onClick={() => setExpandedOcr(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1 border border-indigo-200 animate-fade-in"
                        >
                          <BookOpen size={10} />
                          {isExpanded ? 'Hide Extracted Text' : 'View Extracted Text'}
                        </button>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${SCAN_PILL[doc.scan_status] ?? ''}`}>
                        {doc.scan_status}
                      </span>
                    </div>
                  </div>

                  {/* OCR Extracted Text Display */}
                  {hasOcr && isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <Bot size={11} className="text-indigo-500" /> AI Extracted Text (GLM-OCR)
                        </span>
                        <button
                          onClick={() => handleCopy(doc.id, doc.ocr_text || '')}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          {copiedDocId === doc.id ? 'Copied!' : 'Copy Text'}
                        </button>
                      </div>
                      <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-60 overflow-y-auto leading-relaxed">
                        {doc.ocr_text}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Letters ──────────────────────────────────────────────

function LettersTab({ c }: { c: ApprovalCase }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (c.letters.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
        <Mail size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-slate-500 text-sm font-medium">No letters drafted yet</p>
        <p className="text-slate-400 text-xs mt-1">
          The AI generates one letter per agency route identified by the Causality Engine.
          Multiple letters may be created if several agencies need to be contacted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {c.letters.length} Letter{c.letters.length > 1 ? 's' : ''} — Review each before approving
      </p>
      {c.letters.map(letter => (
        <div key={letter.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => setExpanded(e => ({ ...e, [letter.id]: !e[letter.id] }))}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Mail size={14} className="text-indigo-400 shrink-0" />
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900">
                  {letter.agency_label ?? letter.agency}
                </p>
                <p className="text-xs text-slate-500">To: {letter.agency} · {relDays(letter.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${LETTER_STATUS_PILL[letter.status] ?? ''}`}>
                {letter.status}
              </span>
              {expanded[letter.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>
          {expanded[letter.id] && (
            <div className="border-t border-slate-100 px-5 py-4">
              <pre className="text-sm text-slate-700 font-sans whitespace-pre-wrap leading-relaxed">
                {letter.content}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Return dialog ─────────────────────────────────────────────

function ReturnDialog({
  caseId,
  onClose,
}: { caseId: number; onClose: () => void }) {
  const [reason, setReason]         = useState('');
  const [pending, startTransition]  = useTransition();
  const [error, setError]           = useState<string | null>(null);

  const submit = () => {
    startTransition(async () => {
      const res = await returnCase(caseId, reason);
      if (res.success) {
        onClose();
      } else {
        setError(res.error ?? 'Unknown error');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-900 mb-1">Return to Drafting</h3>
        <p className="text-xs text-slate-500 mb-4">The case will move back to drafting status. Provide a reason for the writer.</p>

        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={3}
          placeholder="e.g. Letter body needs to reference the specific regulation, additional detail required on dates…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                       bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Return Case
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Single case accordion card ────────────────────────────────

type Tab = 'overview' | 'ai' | 'documents' | 'letters';

function CaseCard({ c }: { c: ApprovalCase }) {
  const [open, setOpen]               = useState(false);
  const [tab, setTab]                 = useState<Tab>('overview');
  const [showReturn, setShowReturn]   = useState(false);
  const [approving, startApprove]     = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

  const handleApprove = () => {
    startApprove(async () => {
      const res = await approveCase(c.id);
      if (!res.success) setApproveError(res.error ?? 'Failed to approve.');
    });
  };

  const tabClass = (t: Tab) =>
    `px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
      tab === t
        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
        : 'text-slate-500 hover:text-slate-700'
    }`;

  const docAlert = c.requirements.filter(r => r.required && !r.fulfilled).length;

  return (
    <>
      {showReturn && (
        <ReturnDialog caseId={c.id} onClose={() => setShowReturn(false)} />
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header — always visible */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        >
          {/* Urgency + letters count */}
          <div className="flex flex-col gap-1.5 shrink-0 items-center">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${URGENCY_PILL[c.urgency] ?? ''}`}>
              {c.urgency}
            </span>
            {c.letters.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-600 flex items-center gap-1">
                <Mail size={9} /> {c.letters.length}
              </span>
            )}
          </div>

          {/* Case info */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900">{c.resident_name}</p>
            <p className="text-slate-500 text-sm truncate">
              {c.category ?? 'Uncategorised'}
              {c.sub_category ? ` · ${c.sub_category}` : ''}
            </p>
            {c.summary && (
              <p className="text-slate-400 text-xs mt-0.5 truncate">{c.summary}</p>
            )}
          </div>

          {/* Meta */}
          <div className="shrink-0 text-right flex flex-col items-end gap-1">
            <p className="text-xs text-slate-400 font-mono">{c.case_number ?? `#${c.id}`}</p>
            <p className="text-xs text-slate-400">{relDays(c.updated_at)}</p>
            {docAlert > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                {docAlert} doc{docAlert > 1 ? 's' : ''} missing
              </span>
            )}
          </div>

          {/* Chevron */}
          <div className="shrink-0 ml-2">
            {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>
        </button>

        {/* Expanded body */}
        {open && (
          <div className="border-t border-slate-100">

            {/* Tab bar */}
            <div className="flex gap-1 px-5 py-3 bg-slate-50 border-b border-slate-100">
              <button className={tabClass('overview')}
                onClick={() => setTab('overview')}>
                <span className="flex items-center gap-1"><FileText size={10} /> Overview</span>
              </button>
              <button className={tabClass('ai')}
                onClick={() => setTab('ai')}>
                <span className="flex items-center gap-1"><Bot size={10} /> AI Analysis</span>
              </button>
              <button className={tabClass('documents')}
                onClick={() => setTab('documents')}>
                <span className="flex items-center gap-1">
                  <Files size={10} /> Documents
                  {docAlert > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                </span>
              </button>
              <button className={tabClass('letters')}
                onClick={() => setTab('letters')}>
                <span className="flex items-center gap-1">
                  <Mail size={10} /> Letters
                  {c.letters.length > 0 && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 rounded px-1">
                      {c.letters.length}
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Tab content */}
            <div className="px-5 py-4">
              {tab === 'overview'   && <OverviewTab c={c} />}
              {tab === 'ai'         && <AIAnalysisTab c={c} />}
              {tab === 'documents'  && <DocumentsTab c={c} />}
              {tab === 'letters'    && <LettersTab c={c} />}
            </div>

            {/* Action bar */}
            <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck size={12} />
                <span>Your decision is final and will be logged.</span>
              </div>

              {approveError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={11} /> {approveError}
                </p>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <a
                  href={`/dashboard/cases/${c.id}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                             border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <BookOpen size={13} /> View Details
                </a>

                <button
                  onClick={() => setShowReturn(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                             border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <RotateCcw size={13} /> Return to Drafting
                </button>

                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold
                             bg-emerald-600 hover:bg-emerald-700 text-white transition-colors
                             disabled:opacity-50 shadow-sm"
                >
                  {approving
                    ? <><Loader2 size={14} className="animate-spin" /> Approving…</>
                    : <><CheckCircle2 size={14} /> Approve</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────

export default function ApprovalsClient({ cases }: { cases: ApprovalCase[] }) {
  if (cases.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-14 text-center">
        <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
        <p className="font-bold text-slate-700">All clear</p>
        <p className="text-slate-400 text-sm mt-1">No cases pending your approval.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cases.map(c => <CaseCard key={c.id} c={c} />)}
    </div>
  );
}
