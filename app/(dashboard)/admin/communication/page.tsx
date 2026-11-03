import { Suspense } from 'react';
import CommunicationClient from './communication-client';

export default function CommunicationPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-500 text-sm">
          Loading Department Communication Hub...
        </div>
      }
    >
      <CommunicationClient />
    </Suspense>
  );
}
