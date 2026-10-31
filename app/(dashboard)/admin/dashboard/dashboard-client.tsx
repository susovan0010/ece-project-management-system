'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAdminDirectoryDataAction,
  removeSupervisorAction,
  removeStudentAction,
  AdminUserItem,
  SupervisorUserItem,
  StudentGroupItem,
} from '@/app/actions/admin-directory';

export default function AdminDashboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'SUPERVISORS' | 'ADMINS'>('STUDENTS');

  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorUserItem[]>([]);
  const [students, setStudents] = useState<StudentGroupItem[]>([]);
  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [kpis, setKpis] = useState({
    totalTopics: 0,
    sihTopics: 0,
    ugTopics: 0,
    facultyTopics: 0,
    totalAdmins: 0,
    totalSupervisors: 0,
    totalGroups: 0,
    totalStudents: 0,
  });

  async function loadDirectory(batch = selectedBatch) {
    setLoading(true);
    setError(null);
    const res = await getAdminDirectoryDataAction(batch);
    if (res.error) {
      setError(res.error);
    } else {
      setAdmins(res.admins || []);
      setSupervisors(res.supervisors || []);
      setStudents(res.students || []);
      setBatches(res.batches || []);
      if (res.kpis) setKpis(res.kpis);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDirectory(selectedBatch);
  }, [selectedBatch]);

  async function handleRemoveSupervisor(supervisorId: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove supervisor "${name}"?`)) return;
    setRemovingId(supervisorId);
    setError(null);
    setSuccessMsg(null);
    const res = await removeSupervisorAction(supervisorId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || `Supervisor ${name} removed.`);
      await loadDirectory(selectedBatch);
    }
    setRemovingId(null);
  }

  async function handleRemoveStudent(studentId: string, name: string, roll: string) {
    if (!window.confirm(`Are you sure you want to remove student "${name}" (Roll: ${roll})?`)) return;
    setRemovingId(studentId);
    setError(null);
    setSuccessMsg(null);
    const res = await removeStudentAction(studentId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || `Student ${name} removed.`);
      await loadDirectory(selectedBatch);
    }
    setRemovingId(null);
  }

  const q = searchQuery.trim().toLowerCase();

  const filteredStudents = students.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.roll.toLowerCase().includes(q) ||
      (s.topicCode && s.topicCode.toLowerCase().includes(q)) ||
      (s.topicTitle && s.topicTitle.toLowerCase().includes(q)) ||
      (s.supervisorName && s.supervisorName.toLowerCase().includes(q)) ||
      (s.groupNumber !== null && `group ${s.groupNumber}`.includes(q))
    );
  });

  const filteredSupervisors = supervisors.filter((sup) => {
    if (!q) return true;
    return (
      sup.name.toLowerCase().includes(q) ||
      sup.email.toLowerCase().includes(q) ||
      sup.groups.some((g) => g.topicCode.toLowerCase().includes(q))
    );
  });

  const filteredAdmins = admins.filter((adm) => {
    if (!q) return true;
    return adm.name.toLowerCase().includes(q) || adm.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Project Committee Overview & Department Directory
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Monitor capstone topics, committee admins, faculty supervisors, and student project group allocations.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {/* Live Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Topic Bank
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{kpis.totalTopics}</div>
          <div className="text-xs text-slate-500 mt-1">
            {kpis.sihTopics} SIH • {kpis.ugTopics} UGR • {kpis.facultyTopics} FAC
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Committee Admins
          </div>
          <div className="text-3xl font-extrabold text-purple-700 mt-2">{kpis.totalAdmins}</div>
          <div className="text-xs text-slate-500 mt-1">Project Committee accounts</div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Faculty Supervisors
          </div>
          <div className="text-3xl font-extrabold text-blue-600 mt-2">{kpis.totalSupervisors}</div>
          <div className="text-xs text-slate-500 mt-1">Registered project guides</div>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Allotted Groups & Students
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-2">
            {kpis.totalGroups} <span className="text-sm font-semibold text-slate-400">({kpis.totalStudents} students)</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Active capstone teams</div>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Faculty & Admin Accounts</h3>
            <p className="text-xs text-slate-600 mb-4">
              Create supervisor or admin accounts with locked user names or generate invitation links.
            </p>
          </div>
          <Link
            href="/admin/faculty"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition self-start"
          >
            <span>Manage Accounts</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Topic Bank Management</h3>
            <p className="text-xs text-slate-600 mb-4">
              Upload CSV/Excel topic workbooks with automated column mapping and hardware/software classification.
            </p>
          </div>
          <Link
            href="/admin/topics/import"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition self-start"
          >
            <span>Import Topic Workbooks</span>
            <span>&rarr;</span>
          </Link>
        </div>

        <div className="p-5 bg-white border border-slate-200/80 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Student & Group Allocation</h3>
            <p className="text-xs text-slate-600 mb-4">
              Upload student allotment spreadsheets to form project groups and assign topics & supervisors.
            </p>
          </div>
          <Link
            href="/admin/allocation"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition self-start"
          >
            <span>Upload Student Allocations</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Department Directory Section (Students & Groups, Supervisors, Admins) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('STUDENTS')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'STUDENTS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Students & Corresponding Groups ({students.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SUPERVISORS')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'SUPERVISORS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Faculty Supervisors ({supervisors.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ADMINS')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'ADMINS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Project Committee Admins ({admins.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'STUDENTS' && (
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="ALL">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch {b.id}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, roll, email, topic..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Loading directory records...</div>
        ) : activeTab === 'STUDENTS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3">Group & Batch</th>
                  <th className="px-5 py-3">Student Roll No</th>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Assigned Project Topic</th>
                  <th className="px-5 py-3">Supervisor</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                      No students found. Upload a student allocation sheet in{' '}
                      <Link href="/admin/allocation" className="text-blue-600 underline font-semibold">
                        Student Allocation
                      </Link>{' '}
                      to populate student groups.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st, idx) => (
                    <tr key={`${st.studentId}-${st.groupId || idx}`} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5">
                        {st.groupNumber !== null ? (
                          <div>
                            <span className="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Group {st.groupNumber}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1 font-mono">{st.batchId}</div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{st.roll}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{st.name}</td>
                      <td className="px-5 py-3.5 text-slate-500">
                        <div>{st.email || '-'}</div>
                        {st.phone && <div className="text-[10px] font-mono text-slate-400">{st.phone}</div>}
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        {st.topicCode ? (
                          <div>
                            <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {st.topicCode}
                            </span>
                            <p className="text-xs text-slate-700 mt-1 line-clamp-1" title={st.topicTitle || ''}>
                              {st.topicTitle}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not allotted</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {st.supervisorName ? (
                          <div>
                            <div className="font-semibold text-slate-900">{st.supervisorName}</div>
                            <div className="text-[10px] text-slate-400">{st.supervisorEmail}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={removingId === st.studentId}
                          onClick={() => handleRemoveStudent(st.studentId, st.name, st.roll)}
                          className="px-2.5 py-1 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition disabled:opacity-50"
                        >
                          {removingId === st.studentId ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'SUPERVISORS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3">Supervisor Name</th>
                  <th className="px-6 py-3">Login Email</th>
                  <th className="px-6 py-3 text-center">Proposed Topics</th>
                  <th className="px-6 py-3">Allotted Groups & Topics</th>
                  <th className="px-6 py-3 text-center">Account Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSupervisors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      No faculty supervisors found.
                    </td>
                  </tr>
                ) : (
                  filteredSupervisors.map((sup) => (
                    <tr key={sup.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-3.5 font-bold text-slate-900">{sup.name}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">{sup.email}</td>
                      <td className="px-6 py-3.5 text-center font-mono font-bold text-slate-800">
                        {sup.proposedTopicsCount}
                      </td>
                      <td className="px-6 py-3.5">
                        {sup.groups.length === 0 ? (
                          <span className="text-slate-400 italic">No groups assigned yet</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {sup.groups.map((g) => (
                              <span
                                key={g.id}
                                title={`${g.topicTitle} (${g.batchId})`}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                              >
                                Grp {g.number} ({g.topicCode})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sup.mustChangePassword
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {sup.mustChangePassword ? 'FIRST LOGIN PENDING' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={removingId === sup.id}
                          onClick={() => handleRemoveSupervisor(sup.id, sup.name)}
                          className="px-2.5 py-1 rounded text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition disabled:opacity-50"
                        >
                          {removingId === sup.id ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3">Admin Name</th>
                  <th className="px-6 py-3">Login Email</th>
                  <th className="px-6 py-3 text-center">Role</th>
                  <th className="px-6 py-3 text-center">Security Status</th>
                  <th className="px-6 py-3 text-right">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAdmins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                      No committee admins found.
                    </td>
                  </tr>
                ) : (
                  filteredAdmins.map((adm) => (
                    <tr key={adm.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-3.5 font-bold text-slate-900">{adm.name}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">{adm.email}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          ADMIN
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            adm.mustChangePassword
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {adm.mustChangePassword ? 'INITIAL CREDENTIALS' : 'CUSTOMIZED'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-slate-500">
                        {new Date(adm.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
