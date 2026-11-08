import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ArchivedProjectsClient from './archived-projects-client';

export const metadata = {
  title: 'Archived Projects & Academic Records | ECE Project Committee',
  description: 'Permanent NBA SAR Criterion 2.2 compliant project archives with Washington Accord attributes, student roll numbers, and PO attainment dossiers.',
};

export default async function AdminArchivedProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    redirect('/admin/dashboard');
  }

  return <ArchivedProjectsClient />;
}
