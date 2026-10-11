export default function FacultyGroupsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          My Allotted Groups
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Assigned student project batches, member rolls, contact details, and rubric grading status.
        </p>
      </div>

      <div className="p-8 bg-white border border-slate-200/80 rounded-xl shadow-sm text-center">
        <h3 className="text-base font-bold text-slate-900 mb-1">Supervisor Groups</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-2">
          Filtered strictly to the authenticated supervisor. Supervisor A cannot inspect Supervisor B groups.
        </p>
        <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Full student roster populated in Phase 8
        </span>
      </div>
    </div>
  );
}
