'use client';
// =================================================================
// AgentReviewButton — triggers the AI approval agent for a case.
// Only renders when status = pending_approval + letters:approve role.
// Shows inline result after the agent runs.
// =================================================================

import { useState, useTransition } from 'react';
import { runApprovalAgent } from '@/app/actions/agent';
import { Bot, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  caseId:  number;
  canApprove: boolean;
}

interface AgentResult {
  decision:   'approved' | 'escalated';
  reasoning:  string;
  confidence: number;
  model:      string;
}

export default function AgentReviewButton({ caseId, canApprove }: Props) {
  const [result,      setResult]      = useState<AgentResult | null>(null);
  const [expanded,    setExpanded]    = useState(false);
  const [error,       setError]       = useState('');
  const [pending,     startTransition]= useTransition();

  if (!canApprove) return null;

  const run = () => {
    setError('');
    startTransition(async () => {
      try {
        const r = await runApprovalAgent(caseId);
        setResult(r);
        setExpanded(true);
        // Refresh page to reflect status change if approved
        if (r.decision === 'approved') {
          setTimeout(() => window.location.reload(), 1800);
        }
      } catch (e) {
        setError('Agent call failed. Please try again.');
        console.error(e);
      }
    });
  };

  return (
    <div className="space-y-3">
      {!result && (
        <button
          onClick={run}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all
                     bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 shadow-sm"
        >
          {pending
            ? <><Loader2 size={15} className="animate-spin" /> Agent reviewing…</>
            : <><Bot size={15} /> Ask Agent to Review</>
          }
        </button>
      )}

      {error && <p className="text-rose-600 text-xs">{error}</p>}

      {result && (
        <div className={`rounded-2xl border p-4 ${
          result.decision === 'approved'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {/* Decision header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.decision === 'approved'
                ? <CheckCircle2 size={18} className="text-emerald-600" />
                : <AlertTriangle size={18} className="text-amber-600" />
              }
              <span className={`font-bold text-sm ${
                result.decision === 'approved' ? 'text-emerald-800' : 'text-amber-800'
              }`}>
                {result.decision === 'approved' ? 'AI Auto-Approved' : 'Escalated to You'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 font-mono text-slate-600">
                {Math.round(result.confidence * 100)}% confidence
              </span>
            </div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-slate-400 hover:text-slate-700 transition-colors"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Reasoning (collapsible) */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-black/5">
              <p className={`text-xs leading-relaxed ${
                result.decision === 'approved' ? 'text-emerald-900' : 'text-amber-900'
              }`}>
                {result.reasoning}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                Model: {result.model}
              </p>
              {result.decision === 'approved' && (
                <p className="text-xs text-emerald-700 mt-2 font-medium">
                  Status updated → approved. Refreshing…
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
