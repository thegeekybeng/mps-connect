'use client';
// =============================================================
// MPS Connect — Gate 2: Fact Verification Gate (HITL Gate 2)
//
// Submission blocker. Before a Writer can submit a case for
// MP review, every AI-extracted key fact must be explicitly
// confirmed via checkbox. The "Submit for Review" button is
// DISABLED until all facts are checked.
//
// Calls submitForReview server action which enforces the same
// gate server-side (cannot be bypassed by skipping the UI).
//
// Matches CaseApprovalBar.tsx styling patterns.
// =============================================================

import { useState, useTransition } from 'react';
import {
  CheckCircle2, Loader2, AlertTriangle, ClipboardCheck, Shield,
} from 'lucide-react';
import { submitForReview } from '@/app/actions/cases';

interface Props {
  caseId:     number;
  keyFacts:   string[];
  caseStatus: string;
}

export default function FactVerificationGate({ caseId, keyFacts, caseStatus }: Props) {
  const [confirmed, setConfirmed] = useState<boolean[]>(
    () => new Array(keyFacts.length).fill(false)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError]          = useState<string | null>(null);
  const [submitted, setSubmitted]  = useState(false);

  // Only render for cases in new/drafting with key facts
  if (!['new', 'drafting'].includes(caseStatus) || keyFacts.length === 0) {
    return null;
  }

  const allConfirmed = confirmed.every(Boolean);
  const confirmedCount = confirmed.filter(Boolean).length;

  function toggleFact(index: number) {
    setConfirmed(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  function handleSubmit() {
    if (!allConfirmed) return;
    setError(null);

    startTransition(async () => {
      const indices = Array.from({ length: keyFacts.length }, (_, i) => i);
      const result = await submitForReview(caseId, indices);
      if (result.ok) {
        setSubmitted(true);
        // Page will revalidate via server action
        window.location.reload();
      } else {
        setError(result.error ?? 'Failed to submit for review.');
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <p className="font-bold text-sm text-emerald-800">Submitted for Review</p>
        </div>
        <p className="text-xs text-emerald-700 mt-1">
          All {keyFacts.length} facts verified. Case is now pending MP approval.
        </p>
      </div>
    );
  }

  return (
    <div
      id="hitl-gate-2-fact-verification"
      className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-indigo-600" />
        <p className="font-bold text-sm text-indigo-800">
          HITL Gate 2 — Fact Verification
        </p>
        <span className="ml-auto text-xs font-semibold text-indigo-600">
          {confirmedCount}/{keyFacts.length} confirmed
        </span>
      </div>

      <p className="text-xs text-indigo-700 leading-relaxed">
        Review each AI-extracted fact below. You must confirm <strong>every fact</strong>{' '}
        before this case can be submitted for MP review. Unchecked facts will block submission.
      </p>

      {/* Fact checkboxes */}
      <div className="space-y-2">
        {keyFacts.map((fact, i) => (
          <label
            key={i}
            className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
              confirmed[i]
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-white border border-indigo-100 hover:border-indigo-300'
            }`}
          >
            <input
              type="checkbox"
              checked={confirmed[i]}
              onChange={() => toggleFact(i)}
              disabled={pending}
              className="mt-0.5 w-4 h-4 shrink-0 accent-emerald-600"
            />
            <div className="flex-1">
              <span className={`text-sm leading-relaxed ${
                confirmed[i] ? 'text-emerald-800' : 'text-slate-700'
              }`}>
                {fact}
              </span>
              {confirmed[i] && (
                <span className="ml-2 text-[10px] text-emerald-600 font-semibold uppercase">
                  ✓ Verified
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Gate enforcement notice */}
      {!allConfirmed && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <Shield size={13} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>Submission blocked:</strong> {keyFacts.length - confirmedCount} fact{keyFacts.length - confirmedCount !== 1 ? 's' : ''}{' '}
            still require verification. Review and confirm each fact to proceed.
          </span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      {/* Submit button — BLOCKED until all confirmed */}
      <button
        id="submit-for-review-btn"
        onClick={handleSubmit}
        disabled={!allConfirmed || pending}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold
                    transition-colors shadow-sm
                    ${allConfirmed
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    } disabled:opacity-50`}
      >
        {pending ? (
          <><Loader2 size={14} className="animate-spin" /> Submitting…</>
        ) : (
          <><ClipboardCheck size={14} /> Submit for Review ({confirmedCount}/{keyFacts.length} verified)</>
        )}
      </button>
    </div>
  );
}
