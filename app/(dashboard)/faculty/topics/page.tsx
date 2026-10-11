import Link from 'next/link';

export default function FacultyTopicsPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Topic Bank & Selection
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Browse accredited SIH and UG Research project topics, or propose an original capstone project.
          </p>
        </div>
        <Link
          href="/faculty/topics/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition self-start"
        >
          <span>+ Propose Original Topic</span>
        </Link>
      </div>

      {/* Filter and Content Banner */}
      <div className="p-6 bg-white border border-slate-200/80 rounded-xl shadow-sm text-center py-12">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Topic Search & Selection Ready</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
          Phase 1 scaffold active. The full PostgreSQL full-text search, multi-select SDG chips, and detail drawer will populate from the catalogue in Phase 5.
        </p>
      </div>
    </div>
  );
}
