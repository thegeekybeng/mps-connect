import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import { BarChart3, TrendingUp, AlertTriangle, FolderOpen, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Analytics — MPS Connect' };

// ── Types ───────────────────────────────────────────────────────
interface MonthBucket { month: string; count: number; }
interface CategoryBucket { category: string; count: number; }
interface UrgencyBucket { urgency: string; count: number; }
interface StatusBucket { status: string; count: number; }

// ── Data fetchers ───────────────────────────────────────────────
async function fetchMonthly(constituencyId: number | null, months: number): Promise<MonthBucket[]> {
  const sc = constituencyId ? 'AND constituency_id = $2' : '';
  const params: (string | number)[] = [months];
  if (constituencyId) params.push(constituencyId);
  const rows = await db<{ month: string; count: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS month,
            COUNT(*)::text AS count
     FROM cases
     WHERE created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY DATE_TRUNC('month', created_at)`,
    params
  );
  return rows.map(r => ({ month: r.month, count: +r.count }));
}

async function fetchByCategory(constituencyId: number | null, months: number): Promise<CategoryBucket[]> {
  const sc = constituencyId ? 'AND constituency_id = $2' : '';
  const params: (string | number)[] = [months];
  if (constituencyId) params.push(constituencyId);
  const rows = await db<{ category: string; count: string }>(
    `SELECT COALESCE(category, 'Uncategorised') AS category, COUNT(*)::text AS count
     FROM cases
     WHERE created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}
     GROUP BY category ORDER BY count DESC LIMIT 8`,
    params
  );
  return rows.map(r => ({ category: r.category, count: +r.count }));
}

async function fetchByUrgency(constituencyId: number | null, months: number): Promise<UrgencyBucket[]> {
  const sc = constituencyId ? 'AND constituency_id = $2' : '';
  const params: (string | number)[] = [months];
  if (constituencyId) params.push(constituencyId);
  const rows = await db<{ urgency: string; count: string }>(
    `SELECT COALESCE(urgency, 'Unknown') AS urgency, COUNT(*)::text AS count
     FROM cases
     WHERE created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}
     GROUP BY urgency ORDER BY CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END`,
    params
  );
  return rows.map(r => ({ urgency: r.urgency, count: +r.count }));
}

async function fetchByStatus(constituencyId: number | null, months: number): Promise<StatusBucket[]> {
  const sc = constituencyId ? 'AND constituency_id = $2' : '';
  const params: (string | number)[] = [months];
  if (constituencyId) params.push(constituencyId);
  const rows = await db<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM cases
     WHERE created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}
     GROUP BY status ORDER BY count DESC`,
    params
  );
  return rows.map(r => ({ status: r.status, count: +r.count }));
}

async function fetchSummaryStats(constituencyId: number | null, months: number) {
  const sc = constituencyId ? 'AND constituency_id = $2' : '';
  const params: (string | number)[] = [months];
  if (constituencyId) params.push(constituencyId);
  const [total, resolved, critical, avgDays] = await Promise.all([
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}`, params),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE status IN ('approved','sent','closed') AND created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}`, params),
    db<{ n: string }>(`SELECT COUNT(*)::text AS n FROM cases WHERE urgency IN ('Critical','High') AND created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}`, params),
    db<{ avg: string }>(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400))::text AS avg FROM cases WHERE status IN ('approved','sent','closed') AND created_at > NOW() - ($1 || ' months')::INTERVAL ${sc}`, params),
  ]);
  return {
    total:    +(total[0]?.n    ?? 0),
    resolved: +(resolved[0]?.n ?? 0),
    critical: +(critical[0]?.n ?? 0),
    avgDays:  +(avgDays[0]?.avg ?? 0),
  };
}

// ── Page ────────────────────────────────────────────────────────
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requireAuth();
  const sp      = await searchParams;
  const months  = parseInt(sp.months ?? '3', 10);
  const validMonths = [1, 3, 6].includes(months) ? months : 3;

  const [monthly, byCategory, byUrgency, byStatus, stats] = await Promise.all([
    fetchMonthly(session.constituencyId, validMonths),
    fetchByCategory(session.constituencyId, validMonths),
    fetchByUrgency(session.constituencyId, validMonths),
    fetchByStatus(session.constituencyId, validMonths),
    fetchSummaryStats(session.constituencyId, validMonths),
  ]);

  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 animate-page">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--gov-text)' }}>
            <BarChart3 size={22} style={{ color: 'var(--gov-primary-light)' }} />
            Analytics
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>Case volume and trends across your constituency</p>
        </div>

        {/* Range toggle — segmented control */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--gov-border)' }}>
          {[1, 3, 6].map(m => (
            <Link
              key={m}
              href={`/dashboard/analytics?months=${m}`}
              className="px-4 py-1.5 text-sm font-semibold transition-all"
              style={validMonths === m ? {
                background: 'var(--gov-primary)',
                color: 'var(--gov-text-inverse)',
              } : {
                background: 'var(--gov-surface)',
                color: 'var(--gov-text-secondary)',
              }}
            >
              {m}M
            </Link>
          ))}
        </div>
      </div>

      {/* ── Summary stats row ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Cases" value={stats.total} sub={`last ${validMonths} month${validMonths > 1 ? 's' : ''}`}
          icon={<FolderOpen size={15} />} accent="#2E5D8C" />
        <StatCard label="Resolved"    value={stats.resolved} sub={`${resolutionRate}% resolution rate`}
          icon={<CheckCircle2 size={15} />} accent="#059669" />
        <StatCard label="Critical/High" value={stats.critical} sub="escalated urgency"
          icon={<AlertTriangle size={15} />} accent="#EE2536" />
        <StatCard label="Avg. Resolution" value={stats.avgDays} unit="days"
          sub="new → approved/sent"
          icon={<TrendingUp size={15} />} accent="#D97706" />
      </div>

      {/* ── Monthly volume bar chart ─────────────────────────── */}
      <div className="gov-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-bold" style={{ color: 'var(--gov-text)' }}>Monthly Case Volume</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>Cases opened per month</p>
          </div>
        </div>
        {monthly.length === 0 ? (
          <EmptyChart />
        ) : (
          <BarChart data={monthly.map(m => ({ label: m.month, value: m.count }))} height={180} color="#1C3D5A" />
        )}
      </div>

      {/* ── Category + Urgency row ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Category breakdown */}
        <div className="gov-card p-6">
          <h2 className="font-bold mb-1" style={{ color: 'var(--gov-text)' }}>By Category</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--gov-text-muted)' }}>Case distribution across service types</p>
          {byCategory.length === 0 ? <EmptyChart /> : (
            <HorizBars
              data={byCategory.map(c => ({ label: c.category, value: c.count }))}
              colors={['#1C3D5A','#2E5D8C','#3B7DBF','#059669','#D97706','#EE2536','#7C3AED','#64748B']}
            />
          )}
        </div>

        {/* Urgency distribution */}
        <div className="gov-card p-6">
          <h2 className="font-bold mb-1" style={{ color: 'var(--gov-text)' }}>By Urgency</h2>
          <p className="text-xs mb-5" style={{ color: 'var(--gov-text-muted)' }}>Proportion of cases by severity</p>
          {byUrgency.length === 0 ? <EmptyChart /> : (
            <UrgencyDonut data={byUrgency} />
          )}
        </div>
      </div>

      {/* ── Status pipeline ──────────────────────────────────── */}
      <div className="gov-card p-6">
        <h2 className="font-bold mb-1" style={{ color: 'var(--gov-text)' }}>Status Pipeline</h2>
        <p className="text-xs mb-5" style={{ color: 'var(--gov-text-muted)' }}>Cases in each workflow stage</p>
        {byStatus.length === 0 ? <EmptyChart /> : (
          <HorizBars
            data={byStatus.map(s => ({ label: s.status.replace('_', ' '), value: s.count }))}
            colors={['#2E5D8C','#7C3AED','#1C3D5A','#D97706','#059669','#047857','#64748B']}
          />
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function StatCard({ label, value, sub, unit, icon, accent }: {
  label: string; value: number; sub: string; unit?: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="gov-stat" style={{ borderLeftColor: accent }}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--gov-text-secondary)' }}>
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--gov-text)' }}>
        {value}{unit && <span className="text-lg font-semibold ml-1" style={{ color: 'var(--gov-text-muted)' }}>{unit}</span>}
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--gov-text-muted)' }}>{sub}</p>
    </div>
  );
}

function BarChart({ data, height, color }: { data: { label: string; value: number }[]; height: number; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(20, Math.floor(500 / data.length) - 8);
  const totalW = data.length * (barW + 8);

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(totalW, 500)} height={height + 40} viewBox={`0 0 ${Math.max(totalW, 500)} ${height + 40}`}>
        {data.map((d, i) => {
          const barH = Math.max(4, Math.round((d.value / max) * height));
          const x    = i * (barW + 8);
          const y    = height - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
              <text x={x + barW / 2} y={height + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">{d.label}</text>
              <text x={x + barW / 2} y={y - 4}      textAnchor="middle" fontSize={10} fill="#1E293B" fontWeight="600">{d.value}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HorizBars({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium capitalize" style={{ color: 'var(--gov-text-secondary)' }}>{d.label}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--gov-text)' }}>{d.value}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--gov-surface-inset)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, (d.value / max) * 100)}%`, background: colors[i % colors.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function UrgencyDonut({ data }: { data: UrgencyBucket[] }) {
  const COLORS: Record<string, string> = {
    Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e', Unknown: '#94a3b8',
  };
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = 60, cx = 80, cy = 80, stroke = 28;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-8">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--gov-surface-inset)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const pct  = d.count / total;
          const dash = pct * circumference;
          const currentOffset = data.slice(0, i).reduce((sum, prev) => sum + (prev.count / total) * circumference, 0);
          
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={COLORS[d.urgency] ?? '#94a3b8'}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-currentOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="round"
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="800" fill="var(--gov-text)">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="var(--gov-text-muted)">total</text>
      </svg>

      <div className="space-y-2 flex-1">
        {data.map(d => (
          <div key={d.urgency} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[d.urgency] ?? '#94a3b8' }} />
              <span className="text-sm" style={{ color: 'var(--gov-text-secondary)' }}>{d.urgency}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--gov-text)' }}>{d.count}</span>
              <span className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>{Math.round((d.count / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-28 text-sm" style={{ color: 'var(--gov-text-muted)' }}>
      No data for this period
    </div>
  );
}
