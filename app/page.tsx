import type { Metadata } from 'next';
import { ShieldCheck, MessageCircle, FileText, Users, LogIn, ChevronRight, Globe, Info } from 'lucide-react';

export const metadata: Metadata = {
  title: 'MPS Connect — The Digital Twin of Meet The People Session',
  description: 'Connecting Singapore residents to their Elected Member of Parliament wherever, whenever they need. 24/7, all year round. Powered by AI.',
};

export default async function LandingPage() {

  return (
    <div className="min-h-screen" style={{ background: 'var(--gov-surface-alt)' }}>

      {/* ── Government masthead ─────────────────────────────── */}
      <div className="py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2"
        style={{ background: '#1C3D5A', color: '#FFFFFF' }}>
        <Info size={13} />
        DEMO — Not an official Singapore Government service
      </div>

      {/* ── Header bar ─────────────────────────────────────── */}
      <header className="border-b" style={{ background: 'var(--gov-surface)', borderColor: 'var(--gov-border)' }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--gov-primary)' }}
            >
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gov-text)' }}>MPS Connect</p>
              <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
                Case Management System
              </p>
            </div>
          </div>

          {/* Language indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            <Globe size={13} />
            <span>EN</span>
          </div>
        </div>
      </header>

      {/* ── Hero — clean, authoritative ────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8 sm:pt-16 sm:pb-12 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={{ color: 'var(--gov-text)' }}>
          The Digital Twin of<br />
          Meet The People Session
        </h1>

        <p className="text-base mt-4 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
          Connecting Singapore residents to their Elected Member of Parliament.
          Submit your case online — 24/7, any language.
        </p>

        {/* Primary CTA — Login buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/auth/demo?flow=resident"
            className="inline-flex items-center gap-2.5 font-semibold px-7 py-3.5 rounded-lg text-base transition-all"
            style={{
              background: 'var(--gov-accent)',
              color: '#FFFFFF',
              border: '1px solid var(--gov-accent)',
            }}
          >
            <LogIn size={18} /> Submit a Case
          </a>
          <a
            href="/auth/demo?flow=staff"
            className="gov-btn-secondary px-6 py-3 text-base"
          >
            <ShieldCheck size={16} /> Staff Login <ChevronRight size={14} />
          </a>
        </div>
      </div>

      {/* ── How it works — 3-step ──────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <p className="text-xs font-bold uppercase tracking-widest text-center mb-6" style={{ color: 'var(--gov-text-muted)' }}>
          How it works
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: MessageCircle,
              title: 'Describe Your Issue',
              desc: 'Tell us about your situation in your own words. Our system understands English, Mandarin, Malay, Tamil, and Singlish.',
              accent: 'var(--gov-primary)',
            },
            {
              icon: FileText,
              title: 'We Draft the Letter',
              desc: 'A formal appeal letter is drafted to the relevant agency — HDB, MOM, MSF, CPF, and more.',
              accent: 'var(--gov-primary-light)',
            },
            {
              icon: Users,
              title: 'Your MP Follows Up',
              desc: 'Your MP reviews and sends the letter on your behalf. The agency responds directly.',
              accent: '#059669',
            },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="gov-card p-6">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: step.accent, opacity: 0.1 }}
                />
                {/* Overlay the icon on top */}
                <div className="-mt-[52px] mb-4 w-10 h-10 flex items-center justify-center">
                  <Icon size={20} style={{ color: step.accent }} />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--gov-text-muted)' }}>
                  Step {i + 1}
                </p>
                <h3 className="font-bold text-base mb-1.5" style={{ color: 'var(--gov-text)' }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Language support strip ─────────────────────────── */}
      <div className="py-6 px-6" style={{ borderTop: '1px solid var(--gov-border)' }}>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            <Globe size={14} style={{ color: 'var(--gov-primary-light)' }} />
            Supported languages:
          </div>
          {['English', 'Singlish', '中文', 'Melayu', 'தமிழ்'].map(lang => (
            <span
              key={lang}
              className="text-xs px-3 py-1 rounded"
              style={{
                background: 'var(--gov-surface)',
                color: 'var(--gov-text-secondary)',
                border: '1px solid var(--gov-border)',
              }}
            >
              {lang}
            </span>
          ))}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="py-6 px-6" style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface)' }}>
        <div className="max-w-4xl mx-auto text-center space-y-2">
          <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            MPS Connect is a demonstration project. It is not affiliated with, endorsed by, or
            connected to any Singapore Government ministry or statutory board.
          </p>
          <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            Built by the MPS Connect Team · © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
