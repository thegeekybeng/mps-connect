'use client';

import { useRouter } from 'next/navigation';

interface Props {
  href: string;
  even: boolean;
  children: React.ReactNode;
}

export function CaseTableRow({ href, even, children }: Props) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer transition-colors group"
      style={{
        background: even ? 'var(--gov-surface)' : 'var(--gov-surface-alt)',
        borderBottom: '1px solid var(--gov-border)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--gov-primary-50)')}
      onMouseLeave={e => (e.currentTarget.style.background = even ? 'var(--gov-surface)' : 'var(--gov-surface-alt)')}
      onClick={() => router.push(href)}
    >
      {children}
    </tr>
  );
}
