'use client';

import { useState, useEffect } from 'react';
import {
  getHodAuthorityDataAction,
  assignHodAction,
  requestHodRemovalAction,
  cancelHodRemovalRequestAction,
  HodAuthorityDataResponse,
} from '@/app/actions/hod-authority';

export default function AssignHodPage() {
  const [data, setData] = useState<HodAuthorityDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getHodAuthorityDataAction();
      setData(res);
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssignHod = async () => {
    if (!selectedUserId) {
      setFeedback({ type: 'error', message: 'Please select a faculty member or existing admin to assign as HOD.' });
      return;
    }
    const candidate = data?.candidates?.find((c) => c.id === selectedUserId);
    if (!confirm(`Are you sure you want to assign ${candidate?.name || 'this member'} as the Head of Department (HOD)?`)) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await assignHodAction(selectedUserId);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'HOD assigned successfully.' });
        setSelectedUserId('');
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRemoval = async () => {
    if (
      !confirm(
        'Are you sure you want to request removal of the current HOD? By department policy, the HOD must confirm agreement before this takes effect.'
      )
    ) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await requestHodRemovalAction();
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Removal request submitted.' });
        await loadData();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRemoval = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await cancelHodRemovalRequestAction();
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Removal request cancelled.' });
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-slate-600 font-medium">Loading HOD governance details...</span>
      </div>
    );
  }

  const isSuperAdmin = data?.callerAuthorityLevel === 'SUPER_ADMIN' || data?.callerAuthorityLevel === 'HOD';

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
          <h2 className="text-base font-bold mb-1">Access Restricted</h2>
          <p className="text-sm">
            Only the Project Committee Super Admin Type A has authority to view or assign the Head of Department (HOD).
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
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              Super Admin Type A Exclusive
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-2">Assign Head of Department (HOD)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Department governance authority. Super Admin can assign any faculty member or committee admin as HOD.
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

      {/* Current HOD Status Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🏛️</span> Current Head of Department (HOD) Details
          </h2>
          {data?.hodUser && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
              Supreme Priority
            </span>
          )}
        </div>

        <div className="p-6">
          {data?.hodUser ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Full Name
                  </span>
                  <span className="text-sm font-bold text-slate-900">{data.hodUser.name}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Official Email
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{data.hodUser.email}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Governance Priority
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                    👑 Highest Priority (HOD)
                  </span>
                </div>
              </div>

              {/* Removal Flow Status */}
              {data.hodRemovalRequested ? (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <span>⏳</span> HOD Removal Request Pending Mutual Agreement
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      A request to step down was sent on{' '}
                      {data.hodRemovalRequestedAt
                        ? new Date(data.hodRemovalRequestedAt).toLocaleString()
                        : 'recently'}
                      . Under department policy, the HOD must confirm agreement in their portal before removal takes effect.
                    </p>
                  </div>
                  <button
                    onClick={handleCancelRemoval}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition disabled:opacity-50 shrink-0"
                  >
                    Cancel Request
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    * The present Super Admin can remove the existing HOD if the HOD agrees.
                  </p>
                  <button
                    onClick={handleRequestRemoval}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {actionLoading ? 'Submitting...' : 'Remove HOD (Requires HOD Agreement)'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
                🏛️
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Admin does not assigned any one as HOD
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                No Head of Department has been designated yet. Select an eligible faculty supervisor or committee admin below to assign as HOD.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Assign HOD Selector */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {data?.hodUser ? 'Reassign / Transfer HOD Designation' : 'Assign New HOD'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any eligible member from the faculty supervisors or existing committee admins.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-2">
            <input
              type="text"
              placeholder="Filter candidates by name or email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Choose member to assign as HOD ({filteredCandidates.length} available) --</option>
              {filteredCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) — Currently {c.role === 'ADMIN' ? 'Admin' : 'Faculty'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAssignHod}
              disabled={actionLoading || !selectedUserId}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {actionLoading ? 'Assigning...' : 'Assign as HOD'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
