import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MPS Connect — Staff Login',
  description: 'Secure login for MPS Connect constituency case management system.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
