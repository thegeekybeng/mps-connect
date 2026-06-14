import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import NewCaseForm from '@/components/cases/NewCaseForm';

export const metadata: Metadata = { title: 'New Case — MPS Connect' };

export default async function NewCasePage() {
  const session = await requireAuth();
  if (!can(session.role, 'cases:create')) notFound();

  return <NewCaseForm />;
}
