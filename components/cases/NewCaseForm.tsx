'use client';
// =============================================================
// MPS Connect — New Case Form (with integrated Causality Engine)
//
// Flow:
//   1. Writer enters resident details + pastes interview notes
//   2. Submit triggers AI analysis (3-stage causality pipeline)
//   3. AI returns: urgency, agency routes, document requirements, draft letters
//   4. Case is created with all intelligence data pre-populated
//   5. Redirects to the case detail page
// =============================================================

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, User, Phone, CreditCard, FileText,
  BrainCircuit, Loader2, AlertTriangle, Sparkles,
} from 'lucide-react';
import { createCaseWithAnalysis, type CreateCaseResult } from '@/app/actions/cases';

// ── Agency quick-reference (18 agencies from CWI registry) ───────
const AGENCY_LIST = [
  { key: 'HDB',           label: 'Housing & Development Board' },
  { key: 'Town Council',  label: 'Town Council (S&CC / Estate)' },
  { key: 'CPF',           label: 'Central Provident Fund Board' },
  { key: 'MSF',           label: 'Ministry of Social & Family Dev' },
  { key: 'ComCare',       label: 'ComCare' },
  { key: 'FSC',           label: 'Family Service Centre' },
  { key: 'MOM',           label: 'Ministry of Manpower' },
  { key: 'MOH',           label: 'Ministry of Health' },
  { key: 'CHAS',          label: 'Community Health Assist Scheme' },
  { key: 'MOE',           label: 'Ministry of Education' },
  { key: 'ICA',           label: 'Immigration & Checkpoints Authority' },
  { key: 'SSO',           label: 'Social Service Office' },
  { key: 'CDC',           label: 'Community Development Council' },
  { key: 'LAB',           label: 'Legal Aid Bureau' },
  { key: 'Yellow Ribbon', label: 'Yellow Ribbon Project' },
  { key: 'SG Enable',     label: 'SG Enable' },
  { key: 'IMH',           label: 'Institute of Mental Health' },
  { key: 'SPF',           label: 'Singapore Police Force' },
];

export default function NewCaseForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showAgencyRef, setShowAgencyRef] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (prev: CreateCaseResult | null, formData: FormData) => {
      const result = await createCaseWithAnalysis(prev, formData);
      if (result.ok && result.caseId) {
        // Redirect client-side after successful creation
        router.push(`/dashboard/cases/${result.caseId}`);
      }
      return result;
    },
    null
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-6 animate-page">

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/cases"
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'var(--gov-text-muted)' }}
        >
          <ArrowLeft size={14} /> Cases
        </Link>
        <span className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>›</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--gov-text-secondary)' }}>
          New Case
        </span>
      </div>

      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
          <Sparkles size={22} style={{ color: 'var(--gov-primary-light)' }} />
          New Case — AI-Assisted Intake
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--gov-text-muted)' }}>
          Enter resident details and paste the interview notes. The AI will analyse the case, classify urgency,
          route to agencies, and generate draft letters automatically.
        </p>
      </div>

      {/* ── Error banner ────────────────────────────────────── */}
      {state?.error && (
        <div
          className="flex items-start gap-3 px-5 py-4 rounded-xl border"
          style={{ background: 'var(--gov-accent-50)', borderColor: 'var(--gov-accent-100)', color: 'var(--gov-accent)' }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Case creation failed</p>
            <p className="text-xs mt-0.5 opacity-80">{state.error}</p>
          </div>
        </div>
      )}

      {/* ── Resident Details Card ───────────────────────────── */}
      <section className="gov-card overflow-hidden">
        <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
          <User size={15} style={{ color: 'var(--gov-primary-light)' }} />
          <h2 className="font-bold" style={{ color: 'var(--gov-text)' }}>Resident Details</h2>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Name (required) */}
          <div className="sm:col-span-2">
            <label htmlFor="resident_name" className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--gov-text-muted)' }}>
              Full Name <span style={{ color: 'var(--gov-accent)' }}>*</span>
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gov-text-muted)' }} />
              <input
                id="resident_name"
                name="resident_name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Lim Ah Kow"
                disabled={isPending}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--gov-border)',
                  color: 'var(--gov-text)',
                  background: 'var(--gov-surface)',
                }}
              />
            </div>
          </div>

          {/* NRIC (masked) */}
          <div>
            <label htmlFor="nric_masked" className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--gov-text-muted)' }}>
              NRIC (masked)
            </label>
            <div className="relative">
              <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gov-text-muted)' }} />
              <input
                id="nric_masked"
                name="nric_masked"
                type="text"
                placeholder="S1234***A"
                maxLength={20}
                disabled={isPending}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--gov-border)',
                  color: 'var(--gov-text)',
                  background: 'var(--gov-surface)',
                }}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="contact_phone" className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--gov-text-muted)' }}>
              Contact Phone
            </label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gov-text-muted)' }} />
              <input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                placeholder="91234567"
                maxLength={20}
                disabled={isPending}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--gov-border)',
                  color: 'var(--gov-text)',
                  background: 'var(--gov-surface)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Interview Notes / Transcript Card ───────────────── */}
      <section className="gov-card overflow-hidden">
        <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
          <BrainCircuit size={15} className="text-violet-500" />
          <h2 className="font-bold" style={{ color: 'var(--gov-text)' }}>Interview Notes</h2>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold bg-violet-100 text-violet-700">
            AI-Analysed
          </span>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="transcript" className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--gov-text-muted)' }}>
              Resident Statement / Q&A Transcript <span style={{ color: 'var(--gov-accent)' }}>*</span>
            </label>
            <textarea
              id="transcript"
              name="transcript"
              required
              rows={12}
              disabled={isPending}
              placeholder={`Paste the resident's situation, intake notes, or Q&A transcript here.\n\nExample:\n"Mr Lim came in regarding his HDB flat rental arrears. He lost his job as a delivery rider 3 months ago and has been unable to pay rent. His wife is expecting their second child in 2 months. He mentioned he has some CPF savings but is unsure if he can use them. He has not applied for ComCare yet. His elderly mother who lives with them has diabetes and needs regular check-ups at the polyclinic."`}
              className="w-full text-sm border rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-300"
              style={{
                borderColor: 'var(--gov-border)',
                color: 'var(--gov-text)',
                background: 'var(--gov-surface)',
                minHeight: '220px',
              }}
            />
            <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--gov-text-muted)' }}>
              <BrainCircuit size={12} className="text-violet-400" />
              The AI will extract key facts, classify urgency, route to agencies, identify required documents, and generate draft letters.
            </p>
          </div>

          {/* Agency Reference Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAgencyRef(v => !v)}
              className="text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ color: 'var(--gov-primary-light)' }}
            >
              <FileText size={12} />
              {showAgencyRef ? 'Hide' : 'Show'} Agency Quick Reference ({AGENCY_LIST.length} agencies)
            </button>
            {showAgencyRef && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AGENCY_LIST.map(a => (
                  <div
                    key={a.key}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
                  >
                    <span className="font-bold" style={{ color: 'var(--gov-text)' }}>{a.key}</span>
                    <span className="block mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>{a.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Submit ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          id="submit-new-case"
          type="submit"
          disabled={isPending}
          className="gov-btn-primary flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Running AI Analysis…</span>
            </>
          ) : (
            <>
              <BrainCircuit size={16} />
              <span>Create Case & Run AI Analysis</span>
            </>
          )}
        </button>

        <Link
          href="/dashboard/cases"
          className="text-sm font-medium transition-colors"
          style={{ color: 'var(--gov-text-muted)' }}
        >
          Cancel
        </Link>
      </div>

      {/* Processing indicator */}
      {isPending && (
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-xl border"
          style={{ background: 'var(--gov-primary-50)', borderColor: 'var(--gov-primary-100)' }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--gov-primary)' }} />
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--gov-primary)' }}>
              AI Causality Engine Processing
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
              Running 3-stage pipeline: Foundation → Reasoning → Action. This may take 30–90 seconds.
              Draft letters will be generated for each routed agency.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
