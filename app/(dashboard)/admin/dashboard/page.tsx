import { Suspense } from 'react';
import AdminDashboardClient from './dashboard-client';
import AdminSystemReadinessPanel from '@/components/admin-system-readiness-panel';
import { getActiveBatchDeadlinesAction } from '@/app/actions/system-health';

export default async function AdminDashboardPage() {
  const { batchId, deadlines } = await getActiveBatchDeadlinesAction();

  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading Project Committee Dashboard...</div>}>
        <AdminDashboardClient />
      </Suspense>
      <AdminSystemReadinessPanel activeBatchId={batchId} initialDeadlines={deadlines} />
    </div>
  );
}
