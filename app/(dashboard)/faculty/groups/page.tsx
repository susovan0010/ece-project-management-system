'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyFacultyGroupsAction } from '@/app/actions/faculty-groups';

interface StudentMember {
  id: string;
  name: string;
  roll: string;
  email: string | null;
  phone: string | null;
}

interface AssignedGroup {
  id: string;
  number: number;
  batchId: string;
  topic: {
    id: string;
    code: string;
    title: string;
    category: string;
    description: string | null;
    status: string;
  };
  students: StudentMember[];
  progress: {
    sem6: boolean;
    sem7: boolean;
    sem8: boolean;
  };
}

interface BatchOption {
  id: string;
  active: boolean;
}

export default function FacultyGroupsPage() {
  const [groups, setGroups] = useState<AssignedGroup[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadGroups(batchId = selectedBatch) {
    setLoading(true);
    setError(null);
    const res = await getMyFacultyGroupsAction(batchId);

    if (res.error) {
      setError(res.error);
    } else {
      setGroups((res.groups || []) as AssignedGroup[]);
      setBatches(res.batches || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadGroups();
  }, [selectedBatch]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Supervisor Workspace
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Mandatory Rule 1: Strict User Isolation
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">My Allotted Student Groups</h1>
          <p className="text-sm text-slate-500 mt-1">
            Assigned project teams, student rosters, contact information, and grading progress across semesters.
          </p>
        </div>

        {/* Batch Filter Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs font-semibold text-slate-600">Batch:</label>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading your assigned groups...</div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="font-bold text-slate-900 text-base">No Assigned Project Groups Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            You do not currently have any student groups assigned for this batch. Once the Project Committee commits allotments, they will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((g) => (
            <div
              key={g.id}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between border-t-4 border-t-blue-600"
            >
              <div className="space-y-4">
                {/* Header: Group Number & Batch */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                      G{g.number}
                    </span>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Group {g.number}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">Batch: {g.batchId}</p>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      g.topic.category === 'Hardware'
                        ? 'bg-amber-100 text-amber-800'
                        : g.topic.category === 'Software'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {g.topic.category}
                  </span>
                </div>

                {/* Topic Info */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-100/50 px-1.5 py-0.5 rounded">
                    {g.topic.code}
                  </span>
                  <h4 className="font-bold text-slate-900 text-xs mt-1.5 line-clamp-2">
                    {g.topic.title}
                  </h4>
                </div>

                {/* Student Roster Table */}
                <div>
                  <h5 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-2">
                    Enrolled Student Members ({g.students.length})
                  </h5>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-[10px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-1.5">Roll No</th>
                          <th className="px-3 py-1.5">Student Name</th>
                          <th className="px-3 py-1.5">Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {g.students.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{s.roll}</td>
                            <td className="px-3 py-1.5 font-semibold text-slate-800">{s.name}</td>
                            <td className="px-3 py-1.5 text-slate-400">
                              {s.phone || s.email || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Semester Progress Badges */}
                <div className="pt-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                    Marks Status:
                  </span>
                  <div className="flex gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        g.progress.sem6
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      Sem 6: {g.progress.sem6 ? 'Graded' : 'Pending'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        g.progress.sem7
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      Sem 7: {g.progress.sem7 ? 'Graded' : 'Pending'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        g.progress.sem8
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      Sem 8: {g.progress.sem8 ? 'Graded' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href={`/faculty/attainment?group=${g.id}`}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  View Attainment →
                </Link>

                <Link
                  href={`/faculty/marks?group=${g.id}`}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  Enter Marks (Rubrics)
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
