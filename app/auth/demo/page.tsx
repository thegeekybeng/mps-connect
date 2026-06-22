'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield, Users, FileText, BarChart3, ClipboardList,
  Loader2, UserCircle, ArrowLeft, MapPin, Briefcase, ShieldCheck, Info,
} from 'lucide-react';
import { demoStaffLoginAction, demoResidentLoginAction } from '@/app/actions/auth';

// ── Staff Roles ───────────────────────────────────────────────
const STAFF_ROLES = [
  {
    id: 'superadmin',
    title: 'System Admin',
    desc: 'Full system access — all cases, settings, analytics, and user management.',
    icon: Shield,
    accent: '#EE2536',
  },
  {
    id: 'mp',
    title: 'MP Office',
    desc: 'Review AI analysis, approve or return letters, oversee all constituency cases.',
    icon: BarChart3,
    accent: '#1C3D5A',
  },
  {
    id: 'admin',
    title: 'Constituency Admin',
    desc: 'Manage cases, run AI causality analysis, assign writers, and view analytics.',
    icon: Users,
    accent: '#059669',
  },
  {
    id: 'writer',
    title: 'Case Writer',
    desc: 'Draft and edit appeal letters, run AI analysis, and manage assigned cases.',
    icon: FileText,
    accent: '#D97706',
  },
  {
    id: 'registry',
    title: 'Registry Counter',
    desc: 'Manage walk-in queue during Meet-the-People Sessions — register and call residents.',
    icon: ClipboardList,
    accent: '#2E5D8C',
  },
];

// ── Resident Personas ─────────────────────────────────────────
const RESIDENT_PERSONAS = [
  {
    id: 'mdm-tan',
    name: 'Mdm Tan Ah Lian',
    age: 72,
    situation: 'Retiree facing HDB lease issues',
    constituency: 'Ang Mo Kio GRC',
    initials: 'TL',
    accent: '#EE2536',
  },
  {
    id: 'mr-kumar',
    name: 'Mr Rajesh Kumar',
    age: 35,
    situation: 'Work permit holder with salary dispute',
    constituency: 'East Coast GRC',
    initials: 'RK',
    accent: '#D97706',
  },
  {
    id: 'ms-lim',
    name: 'Ms Lim Wei Ling',
    age: 28,
    situation: 'Single parent seeking financial assistance',
    constituency: 'Bishan-Toa Payoh GRC',
    initials: 'LW',
    accent: '#7C3AED',
  },
  {
    id: 'mr-ali',
    name: 'Mr Mohamed Ali',
    age: 45,
    situation: 'Business owner needing legal aid referral',
    constituency: 'MacPherson SMC',
    initials: 'MA',
    accent: '#059669',
  },
];

function DemoAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFlow = searchParams.get('flow') === 'staff' ? 'staff' : 'resident';

  const [flow, setFlow] = useState<'resident' | 'staff'>(initialFlow);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStaffLogin = async (roleId: string) => {
    setSelecting(roleId);
    setError(null);
    try {
      const result = await demoStaffLoginAction(roleId);
      if (result?.error) {
        setError(result.error);
        setSelecting(null);
      }
    } catch {
      // redirect() throws NEXT_REDIRECT — expected
    }
  };

  const handleResidentLogin = async (personaId: string) => {
    setSelecting(personaId);
    setError(null);
    try {
      const result = await demoResidentLoginAction(personaId);
      if (result?.error) {
        setError(result.error);
        setSelecting(null);
      }
    } catch {
      // redirect() throws NEXT_REDIRECT — expected
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gov-surface-alt)' }}>
      {/* Government masthead */}
      <div className="py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2"
        style={{ background: '#1C3D5A', color: '#FFFFFF' }}>
        <Info size={13} />
        DEMO — Not an official Singapore Government service
      </div>

      {/* Header bar */}
      <header style={{ background: 'var(--gov-surface)', borderBottom: '1px solid var(--gov-border)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--gov-primary)' }}>
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gov-text)' }}>MPS Connect</p>
              <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
                Case Management System
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: 'var(--gov-text-muted)' }}
          >
            <ArrowLeft size={14} /> Back to Home
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 pt-8 pb-16 flex-1">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--gov-text)' }}>
            Choose How to Explore
          </h1>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--gov-text-secondary)' }}>
            Select a persona to experience MPS Connect from different perspectives.
            No real identity data is used.
          </p>
        </div>

        {/* Flow toggle — segmented control */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--gov-border)' }}>
            <button
              onClick={() => { setFlow('resident'); setError(null); setSelecting(null); }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all"
              style={flow === 'resident' ? {
                background: 'var(--gov-primary)',
                color: '#FFFFFF',
              } : {
                background: 'var(--gov-surface)',
                color: 'var(--gov-text-secondary)',
              }}
            >
              <UserCircle size={16} /> Resident
            </button>
            <button
              onClick={() => { setFlow('staff'); setError(null); setSelecting(null); }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all"
              style={flow === 'staff' ? {
                background: 'var(--gov-primary)',
                color: '#FFFFFF',
              } : {
                background: 'var(--gov-surface)',
                color: 'var(--gov-text-secondary)',
              }}
            >
              <Briefcase size={16} /> Staff
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg px-4 py-3 mb-6 text-sm text-center"
            style={{ background: 'var(--gov-accent-50)', color: 'var(--gov-accent)', border: '1px solid var(--gov-accent-100)' }}>
            {error}
          </div>
        )}

        {/* ── Resident Flow ──────────────────────────────── */}
        {flow === 'resident' && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4 text-center"
              style={{ color: 'var(--gov-text-muted)' }}>
              Choose a Resident Persona
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {RESIDENT_PERSONAS.map((persona) => {
                const isLoading = selecting === persona.id;
                return (
                  <button
                    key={persona.id}
                    id={`persona-${persona.id}`}
                    onClick={() => handleResidentLogin(persona.id)}
                    disabled={selecting !== null}
                    className={`w-full text-left p-5 rounded-xl transition-all group ${
                      selecting === null
                        ? 'hover:shadow-md'
                        : isLoading
                          ? ''
                          : 'opacity-50 cursor-not-allowed'
                    }`}
                    style={{
                      background: 'var(--gov-surface)',
                      border: isLoading
                        ? '2px solid var(--gov-primary)'
                        : '1px solid var(--gov-border)',
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
                        style={{ background: persona.accent }}
                      >
                        {isLoading ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          persona.initials
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-bold text-base" style={{ color: 'var(--gov-text)' }}>
                          {persona.name}
                        </h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                          {persona.age} years old
                        </p>
                        <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                          {persona.situation}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--gov-primary-light)' }}>
                          <MapPin size={11} /> {persona.constituency}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs mt-6 leading-relaxed max-w-sm mx-auto"
              style={{ color: 'var(--gov-text-muted)' }}>
              Resident personas are fictional. No real NRIC or personal data is stored.
              You will be guided through the constituency matching flow.
            </p>
          </div>
        )}

        {/* ── Staff Flow ─────────────────────────────────── */}
        {flow === 'staff' && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4 text-center"
              style={{ color: 'var(--gov-text-muted)' }}>
              Choose a Staff Role
            </p>
            <div className="grid gap-3">
              {STAFF_ROLES.map((role) => {
                const Icon = role.icon;
                const isLoading = selecting === role.id;
                return (
                  <button
                    key={role.id}
                    id={`role-${role.id}`}
                    onClick={() => handleStaffLogin(role.id)}
                    disabled={selecting !== null}
                    className={`w-full flex items-start gap-4 p-5 rounded-xl transition-all text-left ${
                      selecting === null
                        ? 'hover:shadow-md'
                        : isLoading
                          ? ''
                          : 'opacity-50 cursor-not-allowed'
                    }`}
                    style={{
                      background: 'var(--gov-surface)',
                      border: isLoading
                        ? '2px solid var(--gov-primary)'
                        : '1px solid var(--gov-border)',
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: role.accent }}
                    >
                      {isLoading ? (
                        <Loader2 size={18} className="text-white animate-spin" />
                      ) : (
                        <Icon size={18} className="text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-base" style={{ color: 'var(--gov-text)' }}>
                        {role.title}
                      </h2>
                      <p className="text-sm mt-0.5 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                        {role.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs mt-6" style={{ color: 'var(--gov-text-muted)' }}>
              In production, your role is assigned by the constituency admin after SingPass verification.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-4 px-6 text-center" style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>
          MPS Connect Demo · Built by the MPS Connect Team · Not affiliated with any government body
        </p>
      </footer>
    </div>
  );
}

export default function DemoAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--gov-surface-alt)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--gov-primary)' }} />
      </div>
    }>
      <DemoAuthContent />
    </Suspense>
  );
}
