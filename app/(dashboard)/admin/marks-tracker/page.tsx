import { Suspense } from 'react';
import AdminMarksTrackerClient from './marks-tracker-client';

export default function AdminMarksTrackerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading Marks Completion Tracker...</div>}>
      <AdminMarksTrackerClient />
    </Suspense>
  );
}
