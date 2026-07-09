'use client';

import { useState, useTransition } from 'react';
import { sendCaseLetters } from '@/app/actions/cases';
import { Send, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  caseId: number;
}

export default function CaseDispatchBar({ caseId }: Props) {
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSend = () => {
    setError(null);
    startSend(async () => {
      const res = await sendCaseLetters(caseId);
      if (res.ok) {
        window.location.reload();
      } else {
        setError(res.error ?? 'Failed to dispatch letters.');
      }
    });
  };

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
        <p className="text-xs font-bold text-teal-800">Ready for dispatch</p>
      </div>

      <p className="text-xs text-teal-700 leading-relaxed">
        The MP has approved all drafted letters for this case. You can now dispatch them to the respective government agencies.
      </p>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      {/* Action */}
      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold
                   bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
      >
        {sending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Send size={14} />
        )}
        Send Letters to Agencies
      </button>
    </div>
  );
}
