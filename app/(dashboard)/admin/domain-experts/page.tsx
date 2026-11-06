import { Suspense } from 'react';
import DomainExpertsClient from './domain-experts-client';

export default function DomainExpertsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-500 text-sm">
          Loading Department Domain Experts Mapping...
        </div>
      }
    >
      <DomainExpertsClient />
    </Suspense>
  );
}
