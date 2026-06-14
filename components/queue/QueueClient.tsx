'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Clock, CheckCircle2, PhoneCall, UserX,
  CalendarOff, Zap, Plus,
} from 'lucide-react';
import { startSession } from '@/app/actions/queue';

interface QueueEntry {
  id:            number;
  q_number:      number;
  resident_name: string;
  phone:         string | null;
  issue_summary: string | null;
  status:        string;
  checked_in_at: string | null;
  called_at:     string | null;
  done_at:       string | null;
}

interface SessionSummary {
  id:          number;
  session_date:string;
  status:      string;
  max_slots:   number;
  total:       number;
  waiting:     number;
  in_session:  number;
  done:        number;
  no_show:     number;
}

interface Props {
  session:    { id: number; session_date: string; status: string; max_slots: number } | null;
  entries:    QueueEntry[];
  stats:      SessionSummary | null;
  canStart:   boolean;
  todayLabel: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ElementType; dot: string }> = {
  waiting:    { bg: 'bg-slate-100',   text: 'text-slate-600',   icon: Clock,        dot: 'bg-slate-400' },
  called:     { bg: 'bg-blue-100',    text: 'text-blue-700',    icon: PhoneCall,    dot: 'bg-blue-500' },
  in_session: { bg: 'bg-indigo-100',  text: 'text-indigo-700',  icon: Users,        dot: 'bg-indigo-500' },
  done:       { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2, dot: 'bg-emerald-500' },
  no_show:    { bg: 'bg-slate-50',    text: 'text-slate-400',   icon: UserX,        dot: 'bg-slate-300' },
};

function timeAgo(ts: string | null) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function QueueClient({ session, entries, stats, canStart, todayLabel }: Props) {
  const router     = useRouter();
  const [pending, startTransition] = useTransition();

  /* 30-second auto-refresh of server data */
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const handleStartSession = () => {
    startTransition(async () => {
      await startSession();
      router.refresh();
    });
  };

  const activeEntries    = entries.filter(e => ['waiting','called','in_session'].includes(e.status));
  const completedEntries = entries.filter(e => ['done','no_show'].includes(e.status));

  /* ── No session state ─────────────────────────────────────────── */
  if (!session) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users size={22} className="text-indigo-500" /> Queue
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">{todayLabel}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <CalendarOff size={24} className="text-slate-400" />
          </div>
          <div>
            <p className="font-bold text-slate-800">No session scheduled for today</p>
            <p className="text-slate-400 text-sm mt-1">
              When a physical MPS session is opened, the registration desk<br />can check residents in here.
            </p>
          </div>
          {canStart && (
            <button
              onClick={handleStartSession}
              disabled={pending}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              <Plus size={15} />
              {pending ? 'Opening session…' : 'Open Today\'s Session'}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Session active ───────────────────────────────────────────── */
  const sessionOpen = session.status === 'open';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users size={22} className="text-indigo-500" /> Queue
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {todayLabel}
            {' · '}
            <span className={`font-semibold ${sessionOpen ? 'text-emerald-600' : 'text-slate-500'}`}>
              {sessionOpen ? '● Session open' : '○ Session closed'}
            </span>
            <span className="text-slate-300 ml-2">· refreshes every 30s</span>
          </p>
        </div>

        {/* Live pulse when session is open */}
        {sessionOpen && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            <Zap size={12} /> Live
          </div>
        )}
      </div>

      {/* Stats tiles */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Waiting',    value: stats.waiting,    icon: Clock,        bg: 'bg-slate-100',   text: 'text-slate-700', iconCol: 'text-slate-500' },
            { label: 'In Session', value: stats.in_session, icon: PhoneCall,    bg: 'bg-indigo-50',   text: 'text-indigo-800',iconCol: 'text-indigo-400' },
            { label: 'Done',       value: stats.done,       icon: CheckCircle2, bg: 'bg-emerald-50',  text: 'text-emerald-800',iconCol:'text-emerald-400' },
            { label: 'No Show',    value: stats.no_show,    icon: UserX,        bg: 'bg-slate-50',    text: 'text-slate-400', iconCol: 'text-slate-300' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={`${s.bg} rounded-2xl px-4 py-3.5 flex items-center gap-3`}>
                <div className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                  <Icon size={16} className={s.iconCol} />
                </div>
                <div>
                  <p className={`text-2xl font-black tabular-nums leading-none ${s.text}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slot usage bar */}
      {stats && stats.max_slots > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3.5 flex items-center gap-4">
          <p className="text-xs text-slate-500 shrink-0">
            Slot usage: <span className="font-bold text-slate-800">{stats.total} / {stats.max_slots}</span>
          </p>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all duration-500"
              style={{ width: `${Math.min((stats.total / stats.max_slots) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 shrink-0 tabular-nums">
            {Math.round((stats.total / stats.max_slots) * 100)}%
          </p>
        </div>
      )}

      {/* Queue list */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <Users size={28} className="text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No residents checked in yet</p>
          <p className="text-slate-400 text-xs mt-1">Registration desk can begin adding residents</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Active */}
          {activeEntries.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
                Active · {activeEntries.length}
              </p>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {activeEntries.map((entry, i) => {
                  const s    = STATUS_STYLE[entry.status] ?? STATUS_STYLE['waiting'];
                  const Icon = s.icon;
                  return (
                    <div key={entry.id}
                      className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-slate-50' : ''}`}>

                      {/* Q number badge */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        entry.status === 'in_session' ? 'bg-indigo-100' : 'bg-slate-100'
                      }`}>
                        <span className={`text-sm font-black tabular-nums ${
                          entry.status === 'in_session' ? 'text-indigo-700' : 'text-slate-700'
                        }`}>{entry.q_number}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">{entry.resident_name}</p>
                        {entry.issue_summary && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{entry.issue_summary}</p>
                        )}
                      </div>

                      {/* Wait time */}
                      {entry.checked_in_at && (
                        <p className="text-xs text-slate-400 shrink-0 tabular-nums">
                          {timeAgo(entry.checked_in_at)}
                        </p>
                      )}

                      {/* Status */}
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${s.bg} ${s.text}`}>
                        <Icon size={11} /> {entry.status.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed (faded) */}
          {completedEntries.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">
                Completed · {completedEntries.length}
              </p>
              <div className="bg-white/50 rounded-2xl border border-slate-100 overflow-hidden">
                {completedEntries.map((entry, i) => {
                  const s    = STATUS_STYLE[entry.status] ?? STATUS_STYLE['done'];
                  const Icon = s.icon;
                  return (
                    <div key={entry.id}
                      className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-slate-50' : ''} opacity-55`}>
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-slate-500">{entry.q_number}</span>
                      </div>
                      <p className="text-sm text-slate-600 flex-1">{entry.resident_name}</p>
                      {entry.done_at && (
                        <p className="text-xs text-slate-400 tabular-nums">{timeAgo(entry.done_at)}</p>
                      )}
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg ${s.bg} ${s.text}`}>
                        <Icon size={10} /> {entry.status.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
