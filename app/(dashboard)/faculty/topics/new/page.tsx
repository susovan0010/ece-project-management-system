import { Suspense } from 'react';
import ProposeTopicClient from './propose-client';

export default function ProposeTopicPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading proposal editor...</div>}>
      <ProposeTopicClient />
    </Suspense>
  );
}
