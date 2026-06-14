'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { can } from '@/lib/rbac';
import type { SessionPayload } from '@/lib/auth';
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  BarChart3,
  CheckSquare,
  LogOut,
  ShieldCheck,
  Bot,
  Settings,
} from 'lucide-react';

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ElementType;
  permission?: Parameters<typeof can>[1];
}

const NAV: NavItem[] = [
  { href: '/dashboard',           label: 'Overview',   icon: LayoutDashboard },
  { href: '/dashboard/cases',     label: 'Cases',      icon: FolderOpen,   permission: 'cases:read' },
  { href: '/dashboard/queue',     label: 'Queue',      icon: Users,        permission: 'queue:read' },
  { href: '/dashboard/approvals', label: 'Approvals',  icon: CheckSquare,  permission: 'letters:approve' },
  { href: '/dashboard/agent',     label: 'AI Agent',   icon: Bot,          permission: 'letters:approve' },
  { href: '/dashboard/analytics', label: 'Analytics',  icon: BarChart3,    permission: 'analytics:read' },
];

const BOTTOM_NAV: NavItem[] = [
  { href: '/dashboard/settings/agent', label: 'Agent Settings', icon: Settings, permission: 'letters:approve' },
];

const ROLE_LABELS: Record<string, { bg: string; text: string; border: string }> = {
  superadmin: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  mp:         { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  admin:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  writer:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  registry:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  volunteer:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
};

export default function Sidebar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();

  const visibleNav = NAV.filter(item =>
    !item.permission || can(session.role, item.permission)
  );

  const visibleBottom = BOTTOM_NAV.filter(item =>
    !item.permission || can(session.role, item.permission)
  );

  const role = ROLE_LABELS[session.role] ?? { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'var(--gov-surface)',
        borderRight: '1px solid var(--gov-border)',
      }}
    >

      {/* Brand masthead */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--gov-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--gov-primary)' }}
          >
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gov-text)' }}>
              MPS Connect
            </p>
            <p className="text-[10px] font-medium uppercase tracking-widest mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
              Case Management System
            </p>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--gov-text-muted)' }}>
          Navigation
        </p>
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group
                ${active
                  ? ''
                  : 'hover:bg-slate-50'
                }`}
              style={active ? {
                background: 'var(--gov-primary-50)',
                color: 'var(--gov-primary)',
                borderLeft: '3px solid var(--gov-primary)',
                marginLeft: '-3px',
                paddingLeft: 'calc(0.75rem + 3px)',
              } : {
                color: 'var(--gov-text-secondary)',
              }}
            >
              <Icon
                size={16}
                style={active ? { color: 'var(--gov-primary)' } : { color: 'var(--gov-text-muted)' }}
                className={active ? '' : 'group-hover:text-slate-600'}
              />
              {label}
            </Link>
          );
        })}

        {/* Bottom nav items */}
        {visibleBottom.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--gov-text-muted)' }}>
                Settings
              </p>
            </div>
            {visibleBottom.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group
                    ${active
                      ? ''
                      : 'hover:bg-slate-50'
                    }`}
                  style={active ? {
                    background: 'var(--gov-primary-50)',
                    color: 'var(--gov-primary)',
                    borderLeft: '3px solid var(--gov-primary)',
                    marginLeft: '-3px',
                    paddingLeft: 'calc(0.75rem + 3px)',
                  } : {
                    color: 'var(--gov-text-secondary)',
                  }}
                >
                  <Icon
                    size={16}
                    style={active ? { color: 'var(--gov-primary)' } : { color: 'var(--gov-text-muted)' }}
                    className={active ? '' : 'group-hover:text-slate-600'}
                  />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid var(--gov-border)' }}>
        <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--gov-surface-alt)' }}>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--gov-text)' }}>{session.name}</p>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>{session.email}</p>
          <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${role.bg} ${role.text} ${role.border}`}>
            {session.role}
          </span>
        </div>
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-sm transition-all"
            style={{ color: 'var(--gov-text-secondary)' }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
