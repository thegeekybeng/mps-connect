import type { Metadata } from 'next';
import { Info } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Chat with Your MP\'s Office — MPS Connect',
  description: 'Tell us about your issue in any language. The MP\'s office will follow up on your behalf.',
};

/**
 * Minimal layout for the resident chat page — no sidebar, no dashboard chrome.
 * Full-height chat interface with a clean background.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] flex flex-col" style={{ background: 'var(--gov-surface-alt)' }}>
      {/* Government masthead — consistent with all public pages */}
      <div className="py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 shrink-0"
        style={{ background: '#1C3D5A', color: '#FFFFFF' }}>
        <Info size={13} />
        DEMO — Not an official Singapore Government service
      </div>
      {children}
    </div>
  );
}
