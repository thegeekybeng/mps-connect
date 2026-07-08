'use client';
// =============================================================
// MPS Connect — Gate 3: Agency Override Gate (HITL Gate 3)
//
// Action gate. When a Writer adds or removes an agency from the
// AI-suggested list, a mandatory reason field (≥ 5 chars) must
// be provided. The add/remove action is BLOCKED until a reason
// is entered.
//
// Calls overrideAgency server action which enforces the same
// gate server-side (cannot be bypassed by skipping the UI).
//
// Matches CaseApprovalBar.tsx dialogue patterns.
// =============================================================

import { useState, useTransition } from 'react';
import {
  Building2, Plus, X, Loader2, AlertTriangle, Shield, CheckCircle2,
} from 'lucide-react';
import { overrideAgency } from '@/app/actions/cases';

// 18-agency registry — same as NewCaseForm.tsx
const AGENCY_REGISTRY = [
  'HDB', 'Town Council', 'CPF', 'MSF', 'ComCare', 'FSC',
  'MOM', 'MOH', 'CHAS', 'MOE', 'ICA', 'SSO',
  'CDC', 'LAB', 'Yellow Ribbon', 'SG Enable', 'IMH', 'SPF',
] as const;

interface Props {
  caseId:            number;
  suggestedAgencies: string[];
  canWrite:          boolean;
}

export default function AgencyOverrideGate({ caseId, suggestedAgencies: initialAgencies, canWrite }: Props) {
  const [agencies, setAgencies]    = useState<string[]>(initialAgencies);
  const [reason, setReason]        = useState('');
  const [addAgency, setAddAgency]  = useState('');
  const [showAdd, setShowAdd]      = useState(false);
  const [removing, setRemoving]    = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError]          = useState<string | null>(null);
  const [success, setSuccess]      = useState<string | null>(null);

  if (!canWrite) return null;

  const reasonValid = reason.trim().length >= 5;

  // Available agencies = registry minus already-selected
  const available = AGENCY_REGISTRY.filter(a => !agencies.includes(a));

  function handleRemove(agency: string) {
    if (removing === agency) {
      // Already showing — cancel
      setRemoving(null);
      setReason('');
      return;
    }
    setRemoving(agency);
    setShowAdd(false);
    setReason('');
    setError(null);
    setSuccess(null);
  }

  function handleShowAdd() {
    setShowAdd(v => !v);
    setRemoving(null);
    setReason('');
    setAddAgency('');
    setError(null);
    setSuccess(null);
  }

  function executeOverride(action: 'add' | 'remove', agency: string) {
    if (!reasonValid) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await overrideAgency(caseId, action, agency, reason);
      if (result.ok && result.agencies) {
        setAgencies(result.agencies);
        setReason('');
        setRemoving(null);
        setShowAdd(false);
        setAddAgency('');
        setSuccess(`Agency '${agency}' ${action === 'add' ? 'added' : 'removed'} successfully.`);
        // Clear success after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Override failed.');
      }
    });
  }

  return (
    <div
      id="hitl-gate-3-agency-override"
      className="gov-card overflow-hidden"
    >
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
        <Building2 size={15} style={{ color: 'var(--gov-text-muted)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--gov-text)' }}>Agency Routing</h3>
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
          HITL Gate 3
        </span>
      </div>

      <div className="p-5 space-y-3">
        {/* Current agencies */}
        {agencies.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No agencies assigned.</p>
        ) : (
          <div className="space-y-2">
            {agencies.map(agency => (
              <div
                key={agency}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--gov-surface-alt)' }}
              >
                <span className="flex-1 font-medium" style={{ color: 'var(--gov-text)' }}>
                  {agency}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(agency)}
                  disabled={pending}
                  className={`shrink-0 p-1 rounded-lg transition-colors ${
                    removing === agency
                      ? 'bg-red-100 text-red-600'
                      : 'hover:bg-red-50 text-slate-400 hover:text-red-500'
                  }`}
                  title={`Remove ${agency}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Remove confirmation — requires reason */}
        {removing && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-800">
              Remove &ldquo;{removing}&rdquo; — reason required
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Document your reason for removing this agency (min 5 characters)…"
              rows={2}
              className="w-full text-sm border border-red-200 bg-white rounded-lg px-3 py-2
                         text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
            {!reasonValid && reason.length > 0 && (
              <p className="text-[10px] text-red-500 flex items-center gap-1">
                <Shield size={10} /> Minimum 5 characters required ({reason.trim().length}/5)
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setRemoving(null); setReason(''); }}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold
                           border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeOverride('remove', removing)}
                disabled={!reasonValid || pending}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                            transition-colors ${
                  reasonValid
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Confirm Remove
              </button>
            </div>
          </div>
        )}

        {/* Add agency button */}
        <button
          type="button"
          onClick={handleShowAdd}
          disabled={pending || available.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                     border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300
                     hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors disabled:opacity-40"
        >
          <Plus size={13} />
          {showAdd ? 'Cancel Add' : 'Add Agency'}
        </button>

        {/* Add agency form — requires reason */}
        {showAdd && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-indigo-800">
              Add agency — reason required
            </p>
            <select
              value={addAgency}
              onChange={e => setAddAgency(e.target.value)}
              className="w-full text-sm border border-indigo-200 bg-white rounded-lg px-3 py-2
                         text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Select agency…</option>
              {available.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Document your reason for adding this agency (min 5 characters)…"
              rows={2}
              className="w-full text-sm border border-indigo-200 bg-white rounded-lg px-3 py-2
                         text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
            {!reasonValid && reason.length > 0 && (
              <p className="text-[10px] text-indigo-500 flex items-center gap-1">
                <Shield size={10} /> Minimum 5 characters required ({reason.trim().length}/5)
              </p>
            )}
            <button
              type="button"
              onClick={() => executeOverride('add', addAgency)}
              disabled={!reasonValid || !addAgency || pending}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                          transition-colors ${
                reasonValid && addAgency
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              } disabled:opacity-50`}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add Agency
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        {/* Success */}
        {success && (
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={12} /> {success}
          </p>
        )}

        {/* Gate info */}
        <p className="text-[10px] italic" style={{ color: 'var(--gov-text-muted)' }}>
          HITL Gate 3: All agency changes require a documented reason and produce an immutable audit event.
        </p>
      </div>
    </div>
  );
}
