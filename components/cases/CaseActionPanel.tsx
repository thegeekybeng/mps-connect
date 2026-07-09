'use client';

import { useState, useTransition } from 'react';
import { logAgencyResponse, closeCase, simulateAutoClosure } from '@/app/actions/cases';
import { MailCheck, CheckSquare, Loader2, AlertTriangle, HelpCircle } from 'lucide-react';

interface Props {
  caseId: number;
  agencies: string[];
}

export default function CaseActionPanel({ caseId, agencies = [] }: Props) {
  // Agency Response State
  const [selectedAgency, setSelectedAgency] = useState(agencies[0] || 'HDB');
  const [outcome, setOutcome] = useState('Approved');
  const [notes, setNotes] = useState('');
  const [logging, startLog] = useTransition();
  const [logError, setLogError] = useState<string | null>(null);
  const [logSuccess, setLogSuccess] = useState(false);

  // Close Case State
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, startClose] = useTransition();
  const [closeError, setCloseError] = useState<string | null>(null);

  // Automated Simulation State
  const [simulating, startSimulate] = useTransition();
  const [simError, setSimError] = useState<string | null>(null);

  const handleSimulate = () => {
    setSimError(null);
    startSimulate(async () => {
      const res = await simulateAutoClosure(caseId);
      if (res.ok) {
        window.location.reload();
      } else {
        setSimError(res.error ?? 'Failed to run simulation.');
      }
    });
  };

  const handleLogResponse = (e: React.FormEvent) => {
    e.preventDefault();
    setLogError(null);
    setLogSuccess(false);

    if (!notes.trim()) {
      setLogError('Response details/notes are required.');
      return;
    }

    startLog(async () => {
      const res = await logAgencyResponse(caseId, selectedAgency, outcome, notes);
      if (res.ok) {
        setNotes('');
        setLogSuccess(true);
        window.location.reload();
      } else {
        setLogError(res.error ?? 'Failed to log agency response.');
      }
    });
  };

  const handleCloseCase = () => {
    setCloseError(null);

    if (closeNotes.trim().length < 5) {
      setCloseError('Please provide outcome details (minimum 5 characters).');
      return;
    }

    startClose(async () => {
      const res = await closeCase(caseId, closeNotes);
      if (res.ok) {
        window.location.reload();
      } else {
        setCloseError(res.error ?? 'Failed to close case.');
      }
    });
  };

  const agencyList = agencies.length > 0 ? agencies : ['HDB', 'MSF', 'MOM', 'ICA', 'MOH', 'CPF', 'MOE'];

  return (
    <div className="space-y-5">
      {/* ── Section 0: Automated Sim Pipeline ────────────────── */}
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className={`text-amber-600 shrink-0 ${simulating ? 'animate-spin' : 'animate-pulse'}`} />
          <h3 className="font-bold text-sm text-slate-900">Simulate Response & Closure</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Simulate the automated agency replies pipeline and formally close this case file.
        </p>

        {simError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {simError}
          </p>
        )}

        <button
          onClick={handleSimulate}
          disabled={simulating}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                     bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
        >
          {simulating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <span>⚡ Automated Reply & Close</span>
          )}
        </button>
      </div>

      {/* ── Section 1: Log Agency Response ────────────────────── */}
      <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <MailCheck size={16} className="text-indigo-600 shrink-0" />
          <h3 className="font-bold text-sm text-slate-900">Log Agency Response</h3>
        </div>
        <p className="text-xs text-slate-500">
          Record updates or replies received from government agencies regarding the dispatched letters.
        </p>

        <form onSubmit={handleLogResponse} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Agency</label>
              <select
                value={selectedAgency}
                onChange={e => setSelectedAgency(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {agencyList.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Outcome</label>
              <select
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Pending Info">Pending Info</option>
                <option value="Under Review">Under Review</option>
                <option value="Partially Granted">Partially Granted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Response Details</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={3}
              placeholder="e.g. HDB has agreed to grant a 6-month deferment of rental arrears..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {logError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={12} /> {logError}
            </p>
          )}

          {logSuccess && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckSquare size={12} /> Response logged successfully!
            </p>
          )}

          <button
            type="submit"
            disabled={logging}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                       bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
          >
            {logging ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <MailCheck size={12} />
            )}
            Log Agency Response
          </button>
        </form>
      </div>

      {/* ── Section 2: Close Case ────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <CheckSquare size={16} className="text-slate-600 shrink-0" />
          <h3 className="font-bold text-sm text-slate-900">Close Case File</h3>
        </div>
        <p className="text-xs text-slate-500">
          Mark this case as resolved and archive it. This is a final step in the casework audit trail.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Outcome Resolution Notes</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              rows={3}
              placeholder="e.g. MSF ComCare grant was approved ($450/month for 3 months), and HDB deferred rental arrears. Case successfully resolved..."
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
            />
          </div>

          {closeError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={12} /> {closeError}
            </p>
          )}

          <button
            onClick={handleCloseCase}
            disabled={closing}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                       bg-slate-700 hover:bg-slate-800 text-white transition-colors disabled:opacity-50"
          >
            {closing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckSquare size={12} />
            )}
            Close Case File
          </button>
        </div>
      </div>
    </div>
  );
}
