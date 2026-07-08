'use client';
// =============================================================
// MPS Connect — Case Intelligence Panel (Phase 2)
// Runs the causality engine on a case and persists the result.
// Staff paste/type the resident transcript → click Analyse →
// AI returns causal graph + documentRequirements.
// Results are saved to the DB via server action.
// =============================================================

import { useState, useTransition } from 'react';
import {
  BrainCircuit, AlertTriangle, FileText, Mail,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { runCausalityEngine } from '@/app/actions/causality';
import LowConfidenceWarning from '@/components/cases/LowConfidenceWarning';

interface AgencyRoute {
  agency:       string;
  priority:     'primary' | 'secondary' | 'support';
  specificAsk:  string;
  letterType?:  string;
}

interface CausalGraph {
  urgency?: {
    overall:   string;
    score?:    number;
    rationale: string;
  };
  agencyRoutes?: AgencyRoute[];
  documentRequirements?: unknown[];   // typed as unknown[] — cast at save site
  keyFacts?: string[];
  suggestedAgencies?: string[];
  nodes?: Array<{ id?: string; label?: string; confidence?: number; type?: string }>;
}

interface Props {
  caseId:       number;
  initialGraph: CausalGraph | null;
  transcript?:  string;  // pre-filled from case summary if available
  // aiProxyUrl removed — causality now runs server-side via server action
}

const URGENCY_COLOUR: Record<string, string> = {
  Critical: 'bg-red-100 text-red-800 border-red-200',
  High:     'bg-orange-100 text-orange-800 border-orange-200',
  Medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  Low:      'bg-green-100 text-green-800 border-green-200',
};

const PRIORITY_COLOUR: Record<string, string> = {
  primary:   'bg-blue-100 text-blue-800',
  secondary: 'bg-violet-100 text-violet-800',
  support:   'bg-slate-100 text-slate-600',
};

export default function CaseIntelligencePanel({
  caseId,
  initialGraph,
  transcript: initialTranscript = '',
}: Props) {
  const [transcript, setTranscript]   = useState(initialTranscript);
  const [graph, setGraph]             = useState<CausalGraph | null>(initialGraph);
  const [error, setError]             = useState<string | null>(null);
  const [lettersCreated, setLetters]  = useState<number | null>(null);
  const [showRaw, setShowRaw]         = useState(false);
  const [isPending, startTransition]  = useTransition();

  const runAnalysis = () => {
    if (!transcript.trim()) return;
    setError(null);
    setLetters(null);

    startTransition(async () => {
      const result = await runCausalityEngine(caseId, transcript);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGraph(result.data.causalGraph as CausalGraph);
      setLetters(result.data.lettersCreated);
    });
  };

  const hasGraph = !!graph && (
    !!graph.urgency ||
    (graph.agencyRoutes?.length ?? 0) > 0 ||
    (graph.documentRequirements?.length ?? 0) > 0
  );

  return (
    <div className="space-y-4">
      {/* Transcript input */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <BrainCircuit size={16} className="text-violet-500" />
          <h2 className="font-bold text-slate-900">Case Intelligence</h2>
          {lettersCreated !== null && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 size={13} /> Saved · {lettersCreated} letter{lettersCreated !== 1 ? 's' : ''} generated
            </span>
          )}
        </div>

        <div className="p-5 space-y-3">
          <label htmlFor="case-transcript" className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
            Case Transcript / Resident Statement
          </label>
          <textarea
            id="case-transcript"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste the resident's situation, intake notes, or Q&A transcript here. The AI will extract facts, classify urgency, route to agencies, and identify required documents."
            rows={8}
            className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700 placeholder:text-slate-300"
          />

          <button
            id="run-causality-btn"
            onClick={runAnalysis}
            disabled={isPending || !transcript.trim()}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all
              ${isPending || !transcript.trim()
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'}`}
          >
            {isPending
              ? <><RefreshCw size={15} className="animate-spin" /> Analysing…</>
              : <><BrainCircuit size={15} /> Run Causality Analysis</>}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {hasGraph && (
        <div className="space-y-4">

          {/* HITL Gate 1 — Low Confidence Warning */}
          <LowConfidenceWarning
            nodes={graph!.nodes ?? []}
            urgencyScore={graph!.urgency?.score}
          />

          {/* Urgency */}
          {graph!.urgency && (
            <div className={`rounded-2xl border p-5 ${URGENCY_COLOUR[graph!.urgency.overall] ?? 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide opacity-70">AI Urgency Assessment</span>
                <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${URGENCY_COLOUR[graph!.urgency.overall] ?? ''}`}>
                  {graph!.urgency.overall}
                  {graph!.urgency.score !== undefined && ` · ${graph!.urgency.score}/10`}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{graph!.urgency.rationale}</p>
            </div>
          )}

          {/* Agency routes */}
          {(graph!.agencyRoutes?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900 mb-3 text-sm">Agency Routes</h3>
              <div className="space-y-2.5">
                {graph!.agencyRoutes!.map((route, i) => (
                  <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${PRIORITY_COLOUR[route.priority] ?? ''}`}>
                      {route.priority}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{route.agency}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{route.specificAsk}</p>
                      {route.letterType && (
                        <span className="mt-1 inline-block text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {route.letterType}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document requirements */}
          {(graph!.documentRequirements?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900 mb-3 text-sm flex items-center gap-2">
                <FileText size={15} className="text-slate-400" />
                Documents Required
                <span className="ml-auto text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  {lettersCreated !== null && <><CheckCircle2 size={12} /> Saved to case</>}
                </span>
              </h3>
              <div className="space-y-2">
                {(graph!.documentRequirements! as Array<{ agency: string; documentType: string; reason: string; required: boolean }>).map((req, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
                    <span className={`shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded font-semibold ${
                      req.required ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {req.required ? 'Required' : 'Optional'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{req.documentType}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{req.agency} · {req.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON toggle */}
          <button
            onClick={() => setShowRaw(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showRaw ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showRaw ? 'Hide' : 'Show'} raw causal graph JSON
          </button>
          {showRaw && (
            <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-xl overflow-auto max-h-64 font-mono">
              {JSON.stringify(graph, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Placeholder when no graph yet */}
      {!hasGraph && !isPending && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <BrainCircuit size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">
            Paste a transcript above and click <strong>Run Causality Analysis</strong> to generate the AI assessment.
          </p>
        </div>
      )}
    </div>
  );
}
