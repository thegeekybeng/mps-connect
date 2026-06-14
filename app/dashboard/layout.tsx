import { requireAuth } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import FloatingNav from '@/components/layout/FloatingNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--gov-surface-alt)' }}>
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
  );
}
