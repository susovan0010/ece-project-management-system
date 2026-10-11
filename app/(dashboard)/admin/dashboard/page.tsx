import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Project Committee Overview
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Monitor capstone topics, supervisor invitations, marks progress, and NBA outcome attainment.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Topic Bank
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">298</div>
          <div className="text-xs text-slate-500 mt-1">233 SIH + 65 UG Research</div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Active Supervisors
          </div>
          <div className="text-3xl font-extrabold text-blue-600 mt-2">18</div>
          <div className="text-xs text-slate-500 mt-1">All accounts invite-only</div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Student Groups Allotted
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-2">32</div>
          <div className="text-xs text-slate-500 mt-1">Batches 2023–2027</div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Attainment Target
          </div>
          <div className="text-3xl font-extrabold text-amber-600 mt-2">65%</div>
          <div className="text-xs text-slate-500 mt-1">Locked committee baseline</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
        <div className="p-6 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-2">Faculty Onboarding</h3>
          <p className="text-xs text-slate-600 mb-4">
            Invite department teachers to sign in, search the topic bank, or draft original capstone topics.
          </p>
          <Link
            href="/admin/faculty"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition"
          >
            <span>Invite Faculty Supervisors</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="p-6 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-2">Topic Bank Management</h3>
          <p className="text-xs text-slate-600 mb-4">
            Upload CSV/Excel topic workbooks with automated column mapping and hardware/software classification.
          </p>
          <Link
            href="/admin/topics/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition"
          >
            <span>Import Topic Workbooks</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
