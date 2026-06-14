import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db, dbOne } from '@/lib/db';
import { notFound } from 'next/navigation';
import {
  Users, Clock, CheckCircle2, PhoneCall, UserX,
  CalendarOff, Zap,
} from 'lucide-react';
import QueueClient from '@/components/queue/QueueClient';

export const metadata: Metadata = { title: 'Queue — MPS Connect' };

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

async function fetchTodaySession(constituencyId: number | null) {
  return dbOne<{ id: number; session_date: string; status: string; max_slots: number }>(
    `SELECT id, session_date, status, max_slots FROM mps_sessions
     WHERE session_date = CURRENT_DATE
       ${constituencyId ? 'AND constituency_id = $1' : ''}
     ORDER BY id DESC LIMIT 1`,
    constituencyId ? [constituencyId] : []
  );
}

async function fetchQueue(sessionId: number): Promise<QueueEntry[]> {
  return db<QueueEntry>(
    `SELECT id, q_number, resident_name, phone, issue_summary, status,
            checked_in_at, called_at, done_at
     FROM queue_entries
     WHERE session_id = $1
     ORDER BY
       CASE status
         WHEN 'in_session' THEN 1 WHEN 'called' THEN 2
         WHEN 'waiting'    THEN 3 WHEN 'done'   THEN 4
         WHEN 'no_show'    THEN 5 END,
       q_number ASC`,
    [sessionId]
  );
}

async function fetchStats(sessionId: number): Promise<SessionSummary | null> {
  return dbOne<SessionSummary>(
    `SELECT s.id, s.session_date, s.status, s.max_slots,
            COUNT(q.id)::int                                          AS total,
            COUNT(q.id) FILTER (WHERE q.status = 'waiting')::int    AS waiting,
            COUNT(q.id) FILTER (WHERE q.status = 'in_session')::int AS in_session,
            COUNT(q.id) FILTER (WHERE q.status = 'done')::int       AS done,
            COUNT(q.id) FILTER (WHERE q.status = 'no_show')::int    AS no_show
     FROM mps_sessions s
     LEFT JOIN queue_entries q ON q.session_id = s.id
     WHERE s.id = $1
     GROUP BY s.id`,
    [sessionId]
  );
}

export default async function QueuePage() {
  const session    = await requireAuth();
  if (!can(session.role, 'queue:read')) notFound();

  const canStart   = can(session.role, 'sessions:create');
  const todaySess  = await fetchTodaySession(session.constituencyId);

  if (!todaySess) {
    return (
      <QueueClient
        session={null}
        entries={[]}
        stats={null}
        canStart={canStart}
        todayLabel={new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
      />
    );
  }

  const [entries, stats] = await Promise.all([
    fetchQueue(todaySess.id),
    fetchStats(todaySess.id),
  ]);

  return (
    <QueueClient
      session={todaySess}
      entries={entries}
      stats={stats}
      canStart={false}
      todayLabel={new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
    />
  );
}
