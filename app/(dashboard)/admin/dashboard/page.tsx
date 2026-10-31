import { Suspense } from 'react';
import AdminDashboardClient from './dashboard-client';

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading Project Committee Dashboard...</div>}>
      <AdminDashboardClient />
    </Suspense>
  );
}
