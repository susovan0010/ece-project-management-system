import { Suspense } from 'react';
import AdminAuditClient from './audit-client';

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading System Audit Trail...</div>}>
      <AdminAuditClient />
    </Suspense>
  );
}
