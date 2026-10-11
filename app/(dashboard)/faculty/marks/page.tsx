import { Suspense } from 'react';
import MarksClient from './marks-client';

export default function FacultyMarksPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading marks evaluation grid...</div>}>
      <MarksClient />
    </Suspense>
  );
}
