import { Suspense } from 'react';
import FacultyAttainmentClient from './attainment-client';

export default function FacultyAttainmentPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading attainment dashboard...</div>}>
      <FacultyAttainmentClient />
    </Suspense>
  );
}
