import { Suspense } from 'react';
import AdminAttainmentClient from './admin-attainment-client';

export default function AdminAttainmentPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading department attainment audit...</div>}>
      <AdminAttainmentClient />
    </Suspense>
  );
}
