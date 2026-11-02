'use client';

import { useState, useEffect } from 'react';
import {
  getHodAuthorityDataAction,
  assignSuperAdminAction,
  hodTransferUserRoleAction,
  hodRemoveAdminAction,
  HodAuthorityDataResponse,
} from '@/app/actions/hod-authority';
import { getAdminDirectoryDataAction, AdminUserItem, SupervisorUserItem } from '@/app/actions/admin-directory';

export default function AssignSuperAdminPage() {
  const [data, setData] = useState<HodAuthorityDataResponse | null>(null);
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [authRes, dirRes] = await Promise.all([
        getHodAuthorityDataAction(),
        getAdminDirectoryDataAction('ALL'),
      ]);
      setData(authRes);
      if (dirRes.admins) setAdmins(dirRes.admins);
      if (dirRes.supervisors) setSupervisors(dirRes.supervisors);
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssignSuperAdmin = async (targetId: string) => {
    const candidate = data?.candidates?.find((c) => c.id === targetId);
    if (!confirm(`Are you sure you want to designate ${candidate?.name || 'this member'} as Super Admin Type A? The existing Super Admin will transition to standard admin.`)) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await assignSuperAdminAction(targetId);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Super Admin assigned successfully.' });
        setSelectedCandidateId('');
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferRole = async (userId: string, newRole: 'ADMIN' | 'FACULTY') => {
    const roleLabel = newRole === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor';
    if (!confirm(`Are you sure you want to transfer this member to ${roleLabel}?`)) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await hodTransferUserRoleAction(userId, newRole);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Role updated.' });
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAdmin = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the system? As HOD, this action will remove the account completely.`)) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await hodRemoveAdminAction(userId);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Admin removed.' });
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-sm text-slate-600 font-medium">Loading supreme governance panel...</span>
      </div>
    );
  }

  const isHod = data?.callerAuthorityLevel === 'HOD';

  if (!isHod) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
          <h2 className="text-base font-bold mb-1">Access Restricted</h2>
          <p className="text-sm">
            This governance workspace is exclusively available to the Head of Department (HOD).
          </p>
        </div>
      </div>
    );
  }

  const filteredCandidates = (data?.candidates || []).filter(
    (c) =>
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.email.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
              👑 Head of Department (Supreme Governance)
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-2">Assign Super Admin & Member Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            As HOD, you have supreme authority to designate Super Admin Type A, add or remove any admin member, and transfer members between Faculty and Admin.
          </p>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Super Admin Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🛡️</span> Current Super Admin Type A
          </h2>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            Priority Type A
          </span>
        </div>

        <div className="p-6">
          {data?.superAdminUser ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/40 p-4 rounded-lg border border-amber-200/60">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Full Name
                </span>
                <span className="text-sm font-bold text-slate-900">{data.superAdminUser.name}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Official Email
                </span>
                <span className="text-sm font-semibold text-slate-700">{data.superAdminUser.email}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Designation
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  👑 Super Admin (Type A)
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No Super Admin record found.</p>
          )}
        </div>
      </div>

      {/* Reassign Super Admin Selector */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Designate New Super Admin Type A</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any faculty supervisor or existing committee admin. The member will be granted Super Admin Type A status.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-2">
            <input
              type="text"
              placeholder="Search candidate name or email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Choose member to make Super Admin Type A --</option>
              {filteredCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) — Currently {c.role === 'ADMIN' ? 'Admin' : 'Faculty'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => handleAssignSuperAdmin(selectedCandidateId)}
              disabled={actionLoading || !selectedCandidateId}
              className="w-full py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {actionLoading ? 'Assigning...' : 'Assign Super Admin'}
            </button>
          </div>
        </div>
      </div>

      {/* Committee Admins Governance Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Project Committee Admins ({admins.length})
          </h2>
          <span className="text-xs text-slate-500">HOD Supreme Management</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Admin Name</th>
                <th className="py-3 px-4">Login Email</th>
                <th className="py-3 px-4">Current Priority</th>
                <th className="py-3 px-4 text-right">HOD Governance Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((adm) => {
                const isCurrentSuper = adm.id === data?.superAdminUserId;
                return (
                  <tr key={adm.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-900">{adm.name}</td>
                    <td className="py-3 px-4 text-slate-600">{adm.email}</td>
                    <td className="py-3 px-4">
                      {isCurrentSuper ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          👑 Priority Type A (Super Admin)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                          🛡️ Priority Type B (Admin)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {!isCurrentSuper && (
                        <button
                          onClick={() => handleAssignSuperAdmin(adm.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[11px] transition disabled:opacity-50"
                        >
                          Make Super Admin (A)
                        </button>
                      )}
                      <button
                        onClick={() => handleTransferRole(adm.id, 'FACULTY')}
                        disabled={actionLoading}
                        className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] transition disabled:opacity-50"
                      >
                        Transfer to Faculty
                      </button>
                      <button
                        onClick={() => handleRemoveAdmin(adm.id, adm.name)}
                        disabled={actionLoading}
                        className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-[11px] transition disabled:opacity-50"
                      >
                        Remove Admin
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Faculty Supervisors Quick Transfer Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Faculty Supervisors ({supervisors.length})
          </h2>
          <span className="text-xs text-slate-500">Elevate to Admin or Super Admin</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Faculty Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4 text-right">HOD Elevation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supervisors.slice(0, 10).map((sup) => (
                <tr key={sup.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-900">{sup.name}</td>
                  <td className="py-3 px-4 text-slate-600">{sup.email}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleAssignSuperAdmin(sup.id)}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[11px] transition disabled:opacity-50"
                    >
                      Make Super Admin (A)
                    </button>
                    <button
                      onClick={() => handleTransferRole(sup.id, 'ADMIN')}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-[11px] transition disabled:opacity-50"
                    >
                      Promote to Admin (B)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {supervisors.length > 10 && (
            <div className="p-3 text-center text-xs text-slate-500 bg-slate-50">
              Showing first 10 of {supervisors.length} faculty members. Use the dropdown above to select any member.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
