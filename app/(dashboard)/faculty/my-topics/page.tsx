import { Suspense } from 'react';
import MyTopicsClient from './my-topics-client';

export default function FacultyMyTopicsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading your confirmed topics...</div>}>
      <MyTopicsClient />
    </Suspense>
  );
}
