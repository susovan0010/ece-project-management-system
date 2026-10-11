import { Suspense } from 'react';
import AdminCapstoneClient from './capstone-client';

export default function AdminCapstonePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading Capstone Decision Board...</div>}>
      <AdminCapstoneClient />
    </Suspense>
  );
}
