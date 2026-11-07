import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getAdminReportOptionsAction } from '@/app/actions/reports';
import { ReportsClient } from './reports-client';

export const metadata = {
  title: 'Evaluation & Attainment Reports | Project Committee Admin',
};

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    redirect('/admin/dashboard');
  }

  const res = await getAdminReportOptionsAction();
  const options = res.success && res.data ? res.data : { batches: [], semesters: [6, 7, 8], groups: [] };

  return <ReportsClient initialOptions={options} />;
}
