import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import {
  AlertTriangle, Clock, CheckCircle2, FolderOpen,
  Users, TrendingUp, ChevronRight, Info,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard — MPS Connect' };

async function fetchKPIs(constituencyId: number | null) {
  const p  = constituencyId ? [constituencyId] : [];
  const sc = constituencyId ? 'AND constituency_id = $1' : '';
  const [total, critical, pending, resolved, queueToday] = await Promise.all([
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE status != 'closed' ${sc}`, p),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE urgency IN ('Critical','High') AND status NOT IN ('approved','sent','closed') ${sc}`, p),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE status = 'pending_approval' ${sc}`, p),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE status IN ('approved','sent') AND updated_at > NOW() - INTERVAL '7 days' ${sc}`, p),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM queue_entries qe JOIN mps_sessions s ON s.id=qe.session_id WHERE s.session_date=CURRENT_DATE ${constituencyId ? 'AND s.constituency_id=$1' : ''}`, p),
  ]);
  return {
    total:      +( total[0]?.n      ?? 0),
    critical:   +( critical[0]?.n   ?? 0),
    pending:    +( pending[0]?.n    ?? 0),
    resolved:   +( resolved[0]?.n   ?? 0),
    queueToday: +( queueToday[0]?.n ?? 0),
  };
}

async function fetchRecentCases(constituencyId: number | null) {
  return db<{ id: number; resident_name: string; category: string; urgency: string; status: string; created_at: string }>(
    `SELECT id, resident_name, category, urgency, status, created_at
     FROM cases WHERE ${constituencyId ? 'constituency_id=$1 AND' : ''} status != 'closed'
     ORDER BY CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, created_at DESC
     LIMIT 6`,
    constituencyId ? [constituencyId] : []
  );
}

export default async function DashboardPage() {
  const session = await requireAuth();
  const [kpis, recent] = await Promise.all([fetchKPIs(session.constituencyId), fetchRecentCases(session.constituencyId)]);

  // Cases that arrived since the user's previous login
  const newSinceLastVisit = session.lastSeenAt
    ? await db<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM cases
         WHERE created_at > $1 ${session.constituencyId ? 'AND constituency_id = $2' : ''}`,
        session.constituencyId
          ? [session.lastSeenAt, session.constituencyId]
          : [session.lastSeenAt]
      ).then(r => +(r[0]?.n ?? 0))
    : null;

  return (
    <div className="space-y-6 animate-page">

      {/* ── Page header ───────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--gov-text-muted)' }}>
          {new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--gov-text)' }}>
          Good {tod()}, {firstName(session.name)}
        </h1>
        {newSinceLastVisit !== null && newSinceLastVisit > 0 && (
          <p className="text-xs font-medium mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--gov-primary-light)' }}>
            <Info size={13} />
            {newSinceLastVisit} new case{newSinceLastVisit > 1 ? 's' : ''} since your last visit
          </p>
        )}
      </div>

      {/* ── KPI stat cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FolderOpen size={16} />}
          label="Active Cases"
          value={kpis.total}
          accent="#2E5D8C"
          href="/dashboard/cases"
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          label="Critical / High"
          value={kpis.critical}
          accent="#EE2536"
          href="/dashboard/cases"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Pending Approval"
          value={kpis.pending}
          accent="#D97706"
          href="/dashboard/approvals"
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          label="Resolved (7d)"
          value={kpis.resolved}
          accent="#059669"
        />
      </div>

      {/* Queue card — conditional */}
      {kpis.queueToday > 0 && (
        <Link href="/dashboard/queue" className="block">
          <div
            className="gov-stat flex items-center gap-4"
            style={{ borderLeftColor: '#7C3AED' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#F5F3FF' }}>
              <Users size={18} style={{ color: '#7C3AED' }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--gov-text-secondary)' }}>
                In Queue Today
              </p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--gov-text)' }}>
                {kpis.queueToday}
              </p>
            </div>
            <ChevronRight size={16} className="ml-auto" style={{ color: 'var(--gov-text-muted)' }} />
          </div>
        </Link>
      )}

      {/* ── Quick actions ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/queue" className="gov-btn-primary">
          <Users size={14} /> View Queue
        </Link>
        {kpis.pending > 0 && (
          <Link
            href="/dashboard/approvals"
            className="gov-btn-primary"
            style={{ background: '#D97706', borderColor: '#D97706' }}
          >
            <Clock size={14} /> {kpis.pending} Pending Approval{kpis.pending > 1 ? 's' : ''}
          </Link>
        )}
        <Link href="/dashboard/analytics" className="gov-btn-secondary">
          <TrendingUp size={14} /> Analytics
        </Link>
      </div>

      {/* ── Recent cases table ────────────────────────────────── */}
      <div className="gov-card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--gov-border)' }}>
          <div className="flex items-center gap-2.5">
            <TrendingUp size={15} style={{ color: 'var(--gov-text-muted)' }} />
            <h2 className="font-bold" style={{ color: 'var(--gov-text)' }}>Recent Cases</h2>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-secondary)', border: '1px solid var(--gov-border)' }}
            >
              sorted by urgency
            </span>
          </div>
          <Link href="/dashboard/cases"
            className="text-xs font-semibold flex items-center gap-1 transition-colors"
            style={{ color: 'var(--gov-primary-light)' }}>
            View all <ChevronRight size={13} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--gov-surface-alt)' }}>
              <FolderOpen size={18} style={{ color: 'var(--gov-text-muted)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--gov-text-secondary)' }}>No active cases</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--gov-text-muted)', background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}>
                <th scope="col" className="px-6 py-3 text-left">Resident</th>
                <th scope="col" className="px-4 py-3 text-left">Category</th>
                <th scope="col" className="px-4 py-3 text-left">Urgency</th>
                <th scope="col" className="px-4 py-3 text-left">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Opened</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c, i) => (
                <Link key={c.id} href={`/dashboard/cases/${c.id}`} legacyBehavior>
                  <tr
                    className="cursor-pointer transition-colors group"
                    style={{ background: i % 2 === 1 ? 'var(--gov-surface-alt)' : 'var(--gov-surface)', borderBottom: '1px solid var(--gov-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--gov-primary-50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? 'var(--gov-surface-alt)' : 'var(--gov-surface)')}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: 'var(--gov-primary-50)', color: 'var(--gov-primary)' }}>
                          {initials(c.resident_name)}
                        </div>
                        <span className="font-medium transition-colors" style={{ color: 'var(--gov-text)' }}>
                          {c.resident_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5" style={{ color: 'var(--gov-text-secondary)' }}>{c.category ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold ${URGENCY_CLASS[c.urgency] ?? ''}`}>
                        {c.urgency === 'Critical' && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                        {c.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-1 rounded text-xs font-medium ${STATUS_CLASS[c.status] ?? ''}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs tabular-nums" style={{ color: 'var(--gov-text-muted)' }}>
                      {relDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <ChevronRight size={14} style={{ color: 'var(--gov-text-muted)' }} className="group-hover:translate-x-0.5 transition-transform" />
                    </td>
                  </tr>
                </Link>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


/* ── StatCard — government-style bordered card ───────────────── */
function StatCard({ icon, label, value, accent, href }: {
  icon:    React.ReactNode;
  label:   string;
  value:   number;
  accent:  string;
  href?:   string;
}) {
  const card = (
    <div className="gov-stat" style={{ borderLeftColor: accent }}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--gov-text-secondary)' }}>
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--gov-text)' }}>
        {value}
      </p>
    </div>
  );

  return href
    ? <Link href={href} className="block hover:shadow-md transition-shadow rounded-xl">{card}</Link>
    : card;
}


/* ── Constants ──────────────────────────────────────────────── */
const URGENCY_CLASS: Record<string, string> = {
  Critical: 'urgency-critical', High: 'urgency-high',
  Medium:   'urgency-medium',   Low:  'urgency-low',
};
const STATUS_CLASS: Record<string, string> = {
  new: 'status-new', triaged: 'status-triaged', drafting: 'status-drafting',
  pending_approval: 'status-pending-approval', approved: 'status-approved',
  sent: 'status-sent', closed: 'status-closed',
};

/* ── Helpers ────────────────────────────────────────────────── */
function tod() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
// Returns a friendly first name — strips generic role words like 'Admin', 'System'
function firstName(fullName: string) {
  const SKIP = new Set(['system','admin','superadmin','mp','officer','staff','user']);
  const parts = fullName.split(' ');
  const first = parts.find(p => !SKIP.has(p.toLowerCase()));
  return first ?? parts[0];
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function relDate(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60e3), h = Math.floor(d / 3.6e6), days = Math.floor(d / 86.4e6);
  return m < 60 ? `${m}m ago` : h < 24 ? `${h}h ago` : `${days}d ago`;
}
