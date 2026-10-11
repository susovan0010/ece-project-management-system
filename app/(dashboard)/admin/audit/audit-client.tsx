'use client';

import { useState, useEffect } from 'react';
import { getAuditLogsAction } from '@/app/actions/audit';

export default function AdminAuditClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  async function loadData(action = selectedAction) {
    setLoading(true);
    setError(null);
    const res = await getAuditLogsAction(action);

    if (res.error) {
      setError(res.error);
    } else {
      setLogs(res.logs || []);
      setActions(res.actions || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedAction);
  }, [selectedAction]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
              Security &amp; Compliance Audit
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              Immutable Log Trail
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            System Operations &amp; Security Audit Trail
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tamper-evident record of administrative decisions, evaluation locks, capstone endorsements, and role actions for NBA inspection.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs font-semibold text-slate-600">Action Filter:</label>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All Actions</option>
            {actions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Recent System Operations (Last 100 Events)</h3>
            <p className="text-xs text-slate-500">
              Chronological log of modifications, authorization checks, and configuration updates.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">{logs.length} logged events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">User &amp; Role</th>
                <th className="px-6 py-3">Action Event</th>
                <th className="px-6 py-3">Target Entity</th>
                <th className="px-6 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No audit records found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const date = new Date(log.timestamp);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition group">
                      {/* Timestamp */}
                      <td className="px-6 py-3.5 font-mono text-slate-600 whitespace-nowrap">
                        <div>
                          {date.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {date.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* User */}
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900">{log.user?.name || 'System / Cron'}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{log.user?.email || 'N/A'}</span>
                          {log.user?.role && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                log.user.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {log.user.role}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action Event */}
                      <td className="px-6 py-3.5">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {log.action}
                        </span>
                      </td>

                      {/* Entity */}
                      <td className="px-6 py-3.5">
                        <div className="font-mono text-slate-800 font-semibold">{log.entity}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                          ID: {log.entityId}
                        </div>
                      </td>

                      {/* Payload Details */}
                      <td className="px-6 py-3.5 text-right">
                        {log.payload ? (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            {isExpanded ? 'Hide Payload' : 'View Payload'}
                          </button>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Payload Drawer / Viewer */}
        {expandedLogId && (
          <div className="p-4 bg-slate-900 border-t border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto">
            <div className="flex justify-between items-center mb-2 text-slate-400 text-[11px]">
              <span>Event Payload Inspector (JSON):</span>
              <button
                onClick={() => setExpandedLogId(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-lg text-emerald-400 overflow-x-auto text-[11px]">
              {JSON.stringify(logs.find((l) => l.id === expandedLogId)?.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
