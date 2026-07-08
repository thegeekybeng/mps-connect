import { requireAuth } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import FloatingNav from '@/components/layout/FloatingNav';
import { AlertTriangle } from 'lucide-react';

const IS_DEMO = process.env.DEMO_MODE !== 'false'; // default: true (safe by default)

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gov-surface-alt)' }}>
      {/* DEMO banner — shown unless DEMO_MODE=false in env */}
      {IS_DEMO && (
        <div
          className="py-2 px-4 text-center text-xs font-bold flex items-center justify-center gap-2 shrink-0 z-50"
          style={{ background: '#FEF3C7', color: '#92400E', borderBottom: '2px solid #F59E0B' }}
          role="alert"
          aria-label="Demo environment notice"
        >
          <AlertTriangle size={14} />
          DEMO ENVIRONMENT — All case data shown is synthetic and does not represent real residents or cases.
          Do not enter real PII.
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — desktop only */}
        <div className="hidden lg:block">
          <Sidebar session={session} />
        </div>

        {/* Bottom tab bar — mobile/tablet only */}
        <div className="lg:hidden">
          <FloatingNav session={session} />
        </div>

        {/* Main content area — full width on mobile, inset on desktop */}
        <main className="flex-1 min-h-screen overflow-y-auto pb-20 lg:pb-0">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
