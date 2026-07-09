'use client';
// =============================================================
// MPS Connect — AI Agent Run Panel
// Renders pending-approval cases with full explainability:
//   source=rule  → slate card (deterministic pre-screen)
//   source=model → violet (escalated) or emerald (approved)
// Shows confidence only when a model ran (rules are binary).
// =============================================================

import { useState, useTransition } from 'react';
import { runApprovalAgent } from '@/app/actions/agent';
import type { AgentResult } from '@/app/actions/agent';
import {
  Bot, Play, CheckCircle2, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, ExternalLink,
  ShieldAlert, Filter, Cpu, List, BookOpen, Flag,
} from 'lucide-react';

interface PendingCase {
  id:            number;
  resident_name: string;
  category:      string | null;
  urgency:       string;
  summary:       string | null;
}

// ── Confidence bar ─────────────────────────────────────────────
function ConfidenceBar({ value, decision }: { value: number; decision: 'approved' | 'escalated' }) {
  const pct = Math.round(value * 100);
  const colour = decision === 'approved' ? 'bg-emerald-500' : 'bg-violet-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${colour} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-slate-500 w-9 text-right">{pct}%</span>
    </div>
  );
}

// ── Single result card ─────────────────────────────────────────
function ResultCard({ result }: { result: AgentResult }) {
  const isRule      = result.source === 'rule';
  const isFailed    = result.source === 'cascade-failed';
  const isApproved  = result.decision === 'approved';

  // Colour scheme: failed=amber, rule=slate (pre-screen), approved=emerald, escalated=violet
  const scheme = isFailed
    ? { bg: 'bg-amber-50',    border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100  text-amber-800',  icon: ShieldAlert, iconCls: 'text-amber-500' }
    : isRule
    ? { bg: 'bg-slate-50',    border: 'border-slate-200',  text: 'text-slate-700',  badge: 'bg-slate-100  text-slate-600',  icon: ShieldAlert, iconCls: 'text-slate-400' }
    : isApproved
    ? { bg: 'bg-emerald-50',  border: 'border-emerald-200',text: 'text-emerald-800',badge: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, iconCls: 'text-emerald-500' }
    : { bg: 'bg-violet-50',   border: 'border-violet-200', text: 'text-violet-800', badge: 'bg-violet-100  text-violet-700',  icon: AlertTriangle, iconCls: 'text-violet-500' };

  const StatusIcon = scheme.icon;

  const sourceLabel = isFailed
    ? 'Cascade Timeout'
    : isRule
    ? 'Pre-screen · Rule'
    : isApproved
    ? 'AI Approved'
    : 'AI · Needs Review';

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${scheme.bg} ${scheme.border}`}>

      {/* Status row */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${scheme.badge}`}>
          <StatusIcon size={12} className={scheme.iconCls} />
          {sourceLabel}
        </span>
        {/* Confidence — only shown for model decisions */}
        {!isRule && (
          <div className="w-36">
            <ConfidenceBar value={result.confidence} decision={result.decision} />
          </div>
        )}
      </div>

      {/* Summary */}
      <p className={`text-sm leading-relaxed ${scheme.text}`}>{result.summary}</p>

      {/* Key factors */}
      {result.keyFactors.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <List size={10} /> Key Factors
          </p>
          <ul className="space-y-0.5">
            {result.keyFactors.map((f, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Policy basis */}
      {result.policyBasis.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <BookOpen size={10} /> Policy Basis
          </p>
          <ul className="space-y-0.5">
            {result.policyBasis.map((p, i) => (
              <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5 font-mono">
                <span className="mt-1 w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Flags (concerns) — shown even when approved */}
      {result.flags.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1.5 flex items-center gap-1">
            <Flag size={10} /> Flags
          </p>
          <ul className="space-y-0.5">
            {result.flags.map((f, i) => (
              <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Model tag */}
      {!isRule && (
        <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
          <Cpu size={10} /> {result.model}
        </p>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────
export default function AgentRunPanel({ pendingCases }: { pendingCases: PendingCase[] }) {
  const [results,      setResults]     = useState<Record<number, AgentResult>>({});
  const [expanded,     setExpanded]    = useState<Record<number, boolean>>({});
  const [running,      setRunning]     = useState<Record<number, boolean>>({});
  const [batchPending, startBatch]     = useTransition();

  const runOne = async (caseId: number) => {
    setRunning(r => ({ ...r, [caseId]: true }));
    try {
      const result = await runApprovalAgent(caseId);
      setResults(r  => ({ ...r, [caseId]: result }));
      setExpanded(e => ({ ...e, [caseId]: true }));
    } finally {
      setRunning(r => ({ ...r, [caseId]: false }));
    }
  };

  const runAll = () => {
    startBatch(async () => {
      for (const c of pendingCases) {
        if (!results[c.id]) await runOne(c.id);
      }
    });
  };

  if (pendingCases.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">No cases pending approval</p>
        <p className="text-slate-400 text-xs mt-1">All caught up.</p>
      </div>
    );
  }

  const doneCount     = Object.keys(results).length;
  const approvedCount  = Object.values(results).filter(r => r.decision === 'approved').length;
  const ruleCount     = Object.values(results).filter(r => r.source === 'rule').length;
  const failedCount   = Object.values(results).filter(r => r.source === 'cascade-failed').length;
  const modelCount    = Object.values(results).filter(r => r.source === 'model').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Bot size={16} className="text-indigo-500" />
            Pending Approval Queue
          </h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {pendingCases.length} case{pendingCases.length > 1 ? 's' : ''} awaiting review
            {doneCount > 0 && (
              <> · <span className="text-emerald-600">{approvedCount} approved</span>
               {ruleCount > 0 && <> · <span className="text-slate-500">{ruleCount} rule-escalated</span></>}
               {failedCount > 0 && <> · <span className="text-amber-600">{failedCount} timed out</span></>}
               {modelCount > 0 && <> · <span className="text-violet-600">{modelCount - approvedCount > 0 ? modelCount - approvedCount : 0} AI-escalated</span></>}
              </>
            )}
          </p>
        </div>
        {pendingCases.length > 1 && (
          <button
            onClick={runAll}
            disabled={batchPending || doneCount === pendingCases.length}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                       bg-indigo-600 hover:bg-indigo-700 text-white transition-colors
                       disabled:opacity-50 shadow-sm"
          >
            {batchPending
              ? <><Loader2 size={14} className="animate-spin" /> Running…</>
              : <><Play size={14} /> Run All</>
            }
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-500">
          <ShieldAlert size={10} /> Pre-screen rule
        </span>
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={10} /> AI approved
        </span>
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 text-violet-600">
          <AlertTriangle size={10} /> AI escalated
        </span>
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-600">
          <Flag size={10} /> Flags / concerns
        </span>
      </div>

      {/* Case list */}
      <div className="space-y-2">
        {pendingCases.map(c => {
          const result     = results[c.id];
          const isRunning  = running[c.id];
          const isExpanded = expanded[c.id];

          return (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">

              {/* Case header row */}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`/dashboard/cases/${c.id}`}
                      className="font-semibold text-slate-900 text-sm hover:text-indigo-700 transition-colors
                                 inline-flex items-center gap-1 group"
                    >
                      {c.resident_name}
                      <ExternalLink size={11} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                    </a>

                    {/* Aligned Status & Confidence Badges */}
                    {result && (
                      <>
                        {result.source === 'rule' && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            Pre-screen Rule
                          </span>
                        )}
                        {result.source === 'cascade-failed' && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-250">
                            Timeout
                          </span>
                        )}
                        {result.source === 'model' && result.decision === 'approved' && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            AI Approved · Confidence: {Math.round(result.confidence * 100)}%
                          </span>
                        )}
                        {result.source === 'model' && result.decision === 'escalated' && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                            AI Escalated · Confidence: {Math.round(result.confidence * 100)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate mt-0.5">
                    <span className="font-semibold text-slate-500">{c.category ?? 'Uncategorised'}</span> · <span className="font-medium text-slate-500">{c.urgency}</span>
                    {result ? ` · ${result.summary}` : (c.summary && ` · ${c.summary.slice(0, 80)}…`)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {result && (
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}

                  {!result && (
                    <button
                      onClick={() => runOne(c.id)}
                      disabled={isRunning || batchPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors
                                 disabled:opacity-50"
                    >
                      {isRunning
                        ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                        : <><Bot size={12} /> Ask Agent</>
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded result */}
              {result && isExpanded && (
                <div className="border-t border-slate-200 p-3">
                  <ResultCard result={result} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
