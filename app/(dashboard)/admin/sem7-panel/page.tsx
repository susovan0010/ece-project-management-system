import { Suspense } from 'react';
import Sem7PanelClient from './sem7-panel-client';

export default function Sem7PanelPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-500 text-sm">
          Loading 7th Semester Panel Allocation Hub...
        </div>
      }
    >
      <Sem7PanelClient />
    </Suspense>
  );
}
