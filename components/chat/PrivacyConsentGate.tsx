'use client';

/**
 * PDPA §20 Privacy Notice + §13 Consent Gate
 * IMDA Model AIGF §4 — Stakeholder Communication
 * GOV-TD-002 — Citizen Notification (before AI-influenced decision)
 *
 * Displays before the resident proceeds to chat.
 * Consent timestamp is stored client-side and sent with the case.
 */

import { useState } from 'react';
import { ShieldCheck, Bot, Database, Clock, Mail, ChevronDown, ChevronUp } from 'lucide-react';

interface PrivacyConsentGateProps {
  onConsent: (consentedAt: string) => void;
  mpName?: string;
  constituency?: string;
}

export default function PrivacyConsentGate({ onConsent, mpName, constituency }: PrivacyConsentGateProps) {
  const [expanded, setExpanded] = useState(false);
  const [checks, setChecks] = useState({ privacy: false, ai: false, retention: false });

  const allChecked = checks.privacy && checks.ai && checks.retention;

  function handleConsent() {
    if (!allChecked) return;
    onConsent(new Date().toISOString());
  }

  function toggle(key: keyof typeof checks) {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      <div className="gov-card p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--gov-primary-50)' }}
          >
            <ShieldCheck size={24} style={{ color: 'var(--gov-primary)' }} />
          </div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--gov-text)' }}>
            Before You Begin
          </h2>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
            Please read and acknowledge the following before submitting your case
            {mpName ? ` to ${mpName}'s office` : ''}.
          </p>
        </div>

        {/* AI Disclosure — IMDA AIGF §4 */}
        <div
          className="rounded-lg px-4 py-3 mb-5 flex items-start gap-3"
          style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
          role="alert"
          aria-live="polite"
        >
          <Bot size={18} className="mt-0.5 shrink-0" style={{ color: '#2563EB' }} />
          <div className="text-sm leading-relaxed" style={{ color: '#1E40AF' }}>
            <strong>AI-Assisted Service</strong>
            <p className="mt-1">
              This service uses artificial intelligence to assist with case categorisation,
              urgency assessment, and letter drafting. AI recommendations are{' '}
              <strong>advisory only</strong> — your MP personally reviews and approves
              every decision before any action is taken.
            </p>
          </div>
        </div>

        {/* Privacy Notice — PDPA §20 (expandable) */}
        <div
          className="rounded-lg mb-5"
          style={{ border: '1px solid var(--gov-border)' }}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            style={{ color: 'var(--gov-text)' }}
            aria-expanded={expanded}
            id="privacy-notice-toggle"
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              <Database size={15} style={{ color: 'var(--gov-primary-light)' }} />
              Privacy Notice (PDPA)
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className="px-4 pb-4 text-xs leading-relaxed space-y-3" style={{ color: 'var(--gov-text-secondary)' }}>
              <div>
                <strong style={{ color: 'var(--gov-text)' }}>What we collect:</strong>
                <p>Your postal code, case description, and any documents you upload. We do not collect your NRIC, Singpass credentials, or biometric data.</p>
              </div>
              <div>
                <strong style={{ color: 'var(--gov-text)' }}>How we use it:</strong>
                <p>Your information is used solely to categorise your case, identify the relevant government agency, and draft a formal letter from your MP&apos;s office. AI processes your case description to assist staff — all AI outputs are reviewed by a human officer before any action is taken.</p>
              </div>
              <div>
                <strong style={{ color: 'var(--gov-text)' }}>Who processes it:</strong>
                <p>Your data is processed on infrastructure operated by{' '}
                  {constituency ? `the ${constituency} constituency office` : 'the MP\'s constituency office'}.
                  AI inference runs on a local server — your data is not sent to external cloud AI providers.</p>
              </div>
              <div>
                <strong style={{ color: 'var(--gov-text)' }}>How long we keep it:</strong>
                <p>Case records are retained for up to 5 years in line with public records requirements, after which they are securely deleted.</p>
              </div>
              <div>
                <strong style={{ color: 'var(--gov-text)' }}>Your rights:</strong>
                <p>Under the Personal Data Protection Act (PDPA), you have the right to access, correct, or request deletion of your personal data. Contact the constituency office to exercise these rights.</p>
              </div>
              <div className="flex items-start gap-2 pt-1" style={{ color: 'var(--gov-text-muted)' }}>
                <Mail size={13} className="mt-0.5 shrink-0" />
                <span>For data protection queries, contact your constituency office directly.</span>
              </div>
            </div>
          )}
        </div>

        {/* Consent checkboxes — PDPA §13 */}
        <div className="space-y-3 mb-6">
          <label
            className="flex items-start gap-3 cursor-pointer group"
            id="consent-privacy"
          >
            <input
              type="checkbox"
              checked={checks.privacy}
              onChange={() => toggle('privacy')}
              className="mt-1 w-4 h-4 shrink-0 accent-[var(--gov-primary)]"
            />
            <span className="text-sm leading-snug" style={{ color: 'var(--gov-text-secondary)' }}>
              I have read and understood the <strong style={{ color: 'var(--gov-text)' }}>Privacy Notice</strong> above
              and consent to my personal data being collected and used for case processing.
            </span>
          </label>

          <label
            className="flex items-start gap-3 cursor-pointer group"
            id="consent-ai"
          >
            <input
              type="checkbox"
              checked={checks.ai}
              onChange={() => toggle('ai')}
              className="mt-1 w-4 h-4 shrink-0 accent-[var(--gov-primary)]"
            />
            <span className="text-sm leading-snug" style={{ color: 'var(--gov-text-secondary)' }}>
              I understand that <strong style={{ color: 'var(--gov-text)' }}>AI is used</strong> to categorise my case
              and draft letters, and that all AI recommendations are reviewed by a human officer.
            </span>
          </label>

          <label
            className="flex items-start gap-3 cursor-pointer group"
            id="consent-retention"
          >
            <input
              type="checkbox"
              checked={checks.retention}
              onChange={() => toggle('retention')}
              className="mt-1 w-4 h-4 shrink-0 accent-[var(--gov-primary)]"
            />
            <span className="text-sm leading-snug" style={{ color: 'var(--gov-text-secondary)' }}>
              I understand my case data will be retained for up to <strong style={{ color: 'var(--gov-text)' }}>5 years</strong> and
              I can request access, correction, or deletion at any time.
            </span>
          </label>
        </div>

        {/* Data protection notice */}
        <div
          className="rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2"
          style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
        >
          <Clock size={14} style={{ color: 'var(--gov-text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            Data breach notification: In the unlikely event of a data breach, you will be notified within 3 calendar days as required by PDPA.
          </p>
        </div>

        {/* Proceed button */}
        <button
          onClick={handleConsent}
          disabled={!allChecked}
          className="w-full inline-flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-lg text-sm transition-all text-white"
          style={{
            background: allChecked ? 'var(--gov-accent)' : 'var(--gov-border)',
            cursor: allChecked ? 'pointer' : 'not-allowed',
            opacity: allChecked ? 1 : 0.6,
          }}
          id="consent-proceed"
        >
          I Agree — Proceed to Chat
        </button>
      </div>
    </div>
  );
}
