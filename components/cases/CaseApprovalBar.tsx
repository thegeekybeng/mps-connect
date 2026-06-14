'use client';
// =============================================================
// MPS Connect — Case Approval Bar
// Shows on pending_approval cases for users with letters:approve.
// Documents are advisory — they NEVER block approval.
// The MP has full discretion to approve or return at any time.
// =============================================================

import { useState, useTransition } from 'react';
import { approveCase, returnCase } from '@/app/actions/approvals';
import {
  CheckCircle2, RotateCcw, Loader2, AlertTriangle,
  FileWarning, Info,
} from 'lucide-react';

interface Props {
  caseId:                  number;
  unfulfilledRequiredDocs: number;  // count — informational only, never blocking
}

function ReturnDialog({ caseId, onClose }: { caseId: number; onClose: () => void }) {
  const [reason, setReason]        = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError]          = useState<string | null>(null);

  const submit = () => {
    startTransition(async () => {
      const res = await returnCase(caseId, reason);
      if (res.success) {
        // Page will revalidate via server action → redirect naturally
        window.location.reload();
      } else {
        setError(res.error ?? 'Unknown error');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-md mx-4">
        <h3 className="font-bold text-slate-900 mb-1">Return to Drafting</h3>
        <p className="text-xs text-slate-500 mb-4">
          The case will move back to drafting. The writer will see your reason.
        </p>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm
                     text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          rows={3}
          placeholder="e.g. Letter needs to reference the specific regulation section, please add the MOE reference number…"
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

export default function CaseApprovalBar({ caseId, unfulfilledRequiredDocs }: Props) {
  const [showReturn,      setShowReturn]  = useState(false);
  const [approving,       startApprove]  = useTransition();
  const [approveError,    setApproveError] = useState<string | null>(null);
  const [showDocWarning,  setDocWarning] = useState(false);

  const handleApprove = () => {
    if (unfulfilledRequiredDocs > 0 && !showDocWarning) {
      // Show warning once — second click bypasses it
      setDocWarning(true);
      return;
    }
    setDocWarning(false);
    startApprove(async () => {
      const res = await approveCase(caseId);
      if (res.success) {
        window.location.reload();
      } else {
        setApproveError(res.error ?? 'Failed to approve.');
      }
    });
  };

  return (
    <>
      {showReturn && <ReturnDialog caseId={caseId} onClose={() => setShowReturn(false)} />}

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Info size={14} className="text-indigo-500 shrink-0" />
          <p className="text-xs font-bold text-indigo-800">Awaiting your approval</p>
        </div>

        {/* Document advisory — shown when there are unfulfilled required docs */}
        {unfulfilledRequiredDocs > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
            <FileWarning size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {unfulfilledRequiredDocs} required document{unfulfilledRequiredDocs > 1 ? 's' : ''} not yet uploaded
              </p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                Documents are advisory — you may still approve at your discretion.
                If the resident cannot provide them, you can approve or return the case.
              </p>
            </div>
          </div>
        )}

        {/* Confirmation prompt on first approve click when docs missing */}
        {showDocWarning && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-800">
              <strong>Confirm override:</strong> You are approving without all required documents.
              Click <strong>Approve</strong> again to confirm.
            </p>
          </div>
        )}

        {approveError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {approveError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowReturn(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold
                       border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw size={14} /> Return to Drafting
          </button>
          <button
            onClick={handleApprove}
            disabled={approving}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold
                        transition-colors disabled:opacity-50 shadow-sm
                        ${showDocWarning
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
          >
            {approving
              ? <><Loader2 size={14} className="animate-spin" /> Approving…</>
              : <><CheckCircle2 size={14} /> {showDocWarning ? 'Confirm Approve' : 'Approve'}</>
            }
          </button>
        </div>
      </div>
    </>
  );
}
