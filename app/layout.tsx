import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MPS Connect',
    template: '%s | MPS Connect',
  },
  description: 'AI-powered constituency case management system for Singapore Meet-the-People Sessions.',
  robots: { index: false, follow: false }, // Staff-only system — no public indexing
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased" style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text)' }}>
        {children}
      </body>
    </html>
  );
}
