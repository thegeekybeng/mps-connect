import type { Metadata } from 'next';
import { requireAuth, type UserRole } from '@/lib/auth';
import { getAgentPreferences } from '@/app/actions/agent';
import { can } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import AgentRunPanel from '@/components/agent/AgentRunPanel';
import { Bot, Settings, CheckCircle2, AlertTriangle, Cpu } from 'lucide-react';
import Link from 'next/link';
import AgentPrewarm from '@/components/agent/AgentPrewarm';

export const metadata: Metadata = { title: 'AI Agent — MPS Connect' };

export default async function AgentPage() {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) redirect('/dashboard');

  const bypass = can(session.role, 'constituencies:read_all');
  const [prefs, pendingCases] = await Promise.all([
    getAgentPreferences(session.userId),
    db<{ id: number; resident_name: string; category: string | null; urgency: string; summary: string | null }>(
      `SELECT id, resident_name, category, urgency, summary
       FROM cases
       WHERE status = 'pending_approval'
         ${session.constituencyId && !bypass ? 'AND constituency_id = $1' : ''}
       ORDER BY
         CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
         created_at DESC`,
      session.constituencyId && !bypass ? [session.constituencyId] : []
    ),
  ]);

  const enabled  = prefs?.enabled ?? false;
  const model    = prefs?.preferredModel ?? 'gemma4:e2b';
  const maxUrg   = prefs?.maxAutoUrgency ?? 'Medium';
  const cats     = prefs?.autoApproveCategories ?? [];

  return (
    <div className="space-y-5">
      <AgentPrewarm />
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
            <Bot size={22} style={{ color: 'var(--gov-primary-light)' }} />
            AI Approval Agent
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
            Auto-approves pending letters that meet your rules
          </p>
        </div>
        <Link href="/dashboard/settings/agent" className="gov-btn-secondary">
          <Settings size={14} /> Configure
        </Link>
      </div>

      {/* ── Compact preferences summary ───────────────────────── */}
      <div className="gov-card flex flex-wrap items-center gap-2 py-3 px-4">
        {/* Enabled status */}
        <span className={`gov-badge ${
          enabled
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : ''
        }`} style={!enabled ? { background: 'var(--gov-surface-alt)', color: 'var(--gov-text-muted)' } : {}}>
          {enabled ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {enabled ? 'Auto-Approval: Active' : 'Auto-Approval: Inactive'}
        </span>

        {/* Model */}
        <span className="gov-badge" style={{ background: 'var(--gov-primary-50)', color: 'var(--gov-primary)', borderColor: 'var(--gov-primary-100)' }}>
          <Cpu size={12} /> {model.split(':')[0]}:{model.split(':')[1]}
        </span>

        {/* Max urgency */}
        <span className="gov-badge" style={{ background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
          Max urgency: {maxUrg}
        </span>

        {/* Categories or "all" */}
        <span className="gov-badge">
          {cats.length > 0 ? cats.join(', ') : 'All categories'}
        </span>
      </div>

      {/* ── Queue panel — full width ──────────────────────────── */}
      <AgentRunPanel pendingCases={pendingCases} />
    </div>
  );
}
