import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { getAgentPreferences } from '@/app/actions/agent';
import { can } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import AgentPreferencesForm from '@/components/agent/AgentPreferencesForm';
import AgentRunPanel from '@/components/agent/AgentRunPanel';
import { Bot, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = { title: 'AI Agent Settings — MPS Connect' };

export default async function AgentSettingsPage() {
  const session = await requireAuth();
  if (!can(session.role, 'letters:approve')) redirect('/dashboard');

  const [prefs, pendingCases] = await Promise.all([
    getAgentPreferences(session.userId),
    db<{ id: number; resident_name: string; category: string | null; urgency: string; summary: string | null }>(
      `SELECT id, resident_name, category, urgency, summary
       FROM cases
       WHERE status = 'pending_approval'
         ${session.constituencyId ? 'AND constituency_id = $1' : ''}
       ORDER BY
         CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
         created_at DESC`,
      session.constituencyId ? [session.constituencyId] : []
    ),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard"
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Bot size={22} className="text-indigo-500" />
            AI Approval Agent
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Configure preferences and run the agent against pending cases
          </p>
        </div>
      </div>

      {/* Run panel — pending cases queue */}
      <AgentRunPanel pendingCases={pendingCases} />

      {/* Preferences form */}
      <AgentPreferencesForm
        initial={prefs}
        userName={session.name}
        userRole={session.role}
      />
    </div>
  );
}
