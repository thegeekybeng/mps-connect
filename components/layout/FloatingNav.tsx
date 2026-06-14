'use client';
// =================================================================
// MPS Connect — Mobile Bottom Tab Bar
// Standard government-style bottom navigation for mobile/tablet.
// Replaces the floating drag widget with institutional tab nav.
// =================================================================

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { can } from '@/lib/rbac';
import type { SessionPayload } from '@/lib/auth';
import {
  LayoutDashboard, FolderOpen, Users,
  CheckSquare, BarChart3, LogOut, Bot,
  Settings, MoreHorizontal, X,
} from 'lucide-react';

const PRIMARY_NAV = [
  { href: '/dashboard',           label: 'Overview',  icon: LayoutDashboard, perm: undefined         },
  { href: '/dashboard/cases',     label: 'Cases',     icon: FolderOpen,      perm: 'cases:read'      },
  { href: '/dashboard/queue',     label: 'Queue',     icon: Users,           perm: 'queue:read'      },
  { href: '/dashboard/approvals', label: 'Approvals', icon: CheckSquare,     perm: 'letters:approve' },
] as const;

const MORE_NAV = [
  { href: '/dashboard/analytics',      label: 'Analytics',      icon: BarChart3, perm: 'analytics:read'  },
  { href: '/dashboard/agent',          label: 'AI Agent',       icon: Bot,       perm: 'letters:approve' },
  { href: '/dashboard/settings/agent', label: 'Agent Settings', icon: Settings,  perm: 'letters:approve' },
] as const;

export default function FloatingNav({ session }: { session: SessionPayload }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const visiblePrimary = PRIMARY_NAV.filter(n => !n.perm || can(session.role, n.perm));
  const visibleMore = MORE_NAV.filter(n => !n.perm || can(session.role, n.perm));

  const isMoreActive = MORE_NAV.some(n =>
    pathname === n.href || pathname.startsWith(n.href)
  );

  return (
    <>
      {/* ── More sheet overlay ──────────────────────────────── */}
      {moreOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          {/* Scrim */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Sheet */}
          <div
            className="absolute bottom-[72px] left-0 right-0 mx-3 rounded-xl overflow-hidden safe-bottom"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--gov-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--gov-text)' }}>More</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X size={16} style={{ color: 'var(--gov-text-secondary)' }} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="p-2 space-y-0.5">
              {visibleMore.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all"
                    style={active ? {
                      background: 'var(--gov-primary-50)',
                      color: 'var(--gov-primary)',
                    } : {
                      color: 'var(--gov-text-secondary)',
                    }}
                  >
                    <Icon size={18} style={active ? { color: 'var(--gov-primary)' } : { color: 'var(--gov-text-muted)' }} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* User + sign out */}
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--gov-border)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: 'var(--gov-primary)' }}
                >
                  {session.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--gov-text)' }}>{session.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--gov-text-muted)' }}>{session.role}</p>
                </div>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-2 text-sm transition-colors"
                  style={{ color: 'var(--gov-accent)' }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom tab bar ──────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 safe-bottom"
        style={{
          background: 'var(--gov-surface)',
          borderTop: '1px solid var(--gov-border)',
          boxShadow: '0 -1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <nav className="flex items-stretch justify-around h-16">
          {visiblePrimary.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-center flex-1 gap-0.5 relative transition-colors"
                style={active ? { color: 'var(--gov-primary)' } : { color: 'var(--gov-text-muted)' }}
              >
                {/* Active top indicator */}
                {active && (
                  <span
                    className="absolute top-0 left-1/4 right-1/4 h-[3px] rounded-b"
                    style={{ background: 'var(--gov-accent)' }}
                  />
                )}
                <Icon size={20} />
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}

          {/* More tab */}
          {visibleMore.length > 0 && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 relative transition-colors"
              style={isMoreActive || moreOpen ? { color: 'var(--gov-primary)' } : { color: 'var(--gov-text-muted)' }}
            >
              {(isMoreActive) && (
                <span
                  className="absolute top-0 left-1/4 right-1/4 h-[3px] rounded-b"
                  style={{ background: 'var(--gov-accent)' }}
                />
              )}
              <MoreHorizontal size={20} />
              <span className="text-[10px] font-semibold">More</span>
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
