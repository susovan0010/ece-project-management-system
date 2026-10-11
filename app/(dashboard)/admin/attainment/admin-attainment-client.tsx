'use client';

import { useState, useEffect } from 'react';
import {
  getAdminAttainmentAnalyticsAction,
  calculateAndSnapshotGroupAttainmentAction,
} from '@/app/actions/attainment';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const PO_DEFINITIONS: Record<string, string> = {
  PO1: 'Engineering Knowledge',
  PO2: 'Problem Analysis',
  PO3: 'Design & Development of Solutions',
  PO4: 'Conduct Investigations of Complex Problems',
  PO5: 'Modern Tool Usage',
  PO6: 'The Engineer and Society',
  PO7: 'Environment and Sustainability',
  PO8: 'Ethics',
  PO9: 'Individual and Team Work',
  PO10: 'Communication',
  PO11: 'Project Management and Finance',
};

export default function AdminAttainmentClient() {
  const [loading, setLoading] = useState(true);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [groups, setGroups] = useState<any[]>([]);
  const [totalGroups, setTotalGroups] = useState<number>(0);
  const [groupsWithSnapshots, setGroupsWithSnapshots] = useState<number>(0);
  const [poSummary, setPoSummary] = useState<any[]>([]);
  const [overallRate, setOverallRate] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(65);

  async function loadData(batch = selectedBatch) {
    setLoading(true);
    setError(null);
    const res = await getAdminAttainmentAnalyticsAction(batch);

    if (res.error) {
      setError(res.error);
    } else {
      setGroups(res.groups || []);
      setTotalGroups(res.totalGroups || 0);
      setGroupsWithSnapshots(res.groupsWithSnapshots || 0);
      setBatches(res.batches || []);
      setPoSummary(res.poSummary || []);
      setOverallRate(res.overallAttainmentRate || 0);
      setThreshold(res.targetThreshold || 65);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  async function handleRecalculate(groupId: string) {
    setCalculatingId(groupId);
    setError(null);
    setSuccessMsg(null);

    const res = await calculateAndSnapshotGroupAttainmentAction(groupId);
    setCalculatingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Successfully recalculated & cached snapshots for Group!`);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Calculate attained vs at-risk count
  const attainedPOs = poSummary.filter((p) => p.isAttained);
  const atRiskPOs = poSummary.filter((p) => !p.isAttained);

  const pieData = [
    { name: `Attained (≥${threshold}%)`, value: attainedPOs.length },
    { name: `At-Risk (<${threshold}%)`, value: atRiskPOs.length },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
              Project Committee Admin Audit
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Locked Target: {threshold}%
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Department-wide PO Attainment Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Aggregated Program Outcome attainment across all project groups for NBA SAR Criterion 2 &amp; 3 accreditation.
          </p>
        </div>

        {/* Batch Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs font-semibold text-slate-600">Batch Filter:</label>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} {b.active ? '(Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>{successMsg}</div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall PO Attainment</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{overallRate}%</div>
          <span className="text-[11px] text-slate-400">Department metrics meeting ≥{threshold}%</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Attained Program Outcomes</span>
          <div className="text-2xl font-bold text-purple-700 mt-1">{attainedPOs.length} / 11</div>
          <span className="text-[11px] text-slate-400">{atRiskPOs.length} at-risk outcome(s)</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Evaluated Groups</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{groupsWithSnapshots} / {totalGroups}</div>
          <span className="text-[11px] text-slate-400">Groups with calculated snapshots</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Benchmark Target</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{threshold}%</div>
          <span className="text-[11px] text-slate-400">Institutional threshold</span>
        </div>
      </div>

      {/* At-Risk Warning Box */}
      {atRiskPOs.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-bold">Attention: {atRiskPOs.length} Program Outcome(s) below target ({threshold}%):</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {atRiskPOs.map((p) => (
                <span
                  key={p.po}
                  className="px-2.5 py-1 rounded bg-amber-200/70 border border-amber-300 font-mono text-xs font-bold text-amber-900"
                >
                  {p.po} ({p.percentage}%): {PO_DEFINITIONS[p.po] || 'Outcome'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Department PO Attainment Distribution</h3>
              <p className="text-xs text-slate-500">Average attainment per outcome across all enrolled project groups.</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={poSummary} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="po" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#64748B" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#64748B" unit="%" />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, 'Department Attainment']}
                  labelFormatter={(lbl) => `${lbl} - ${PO_DEFINITIONS[lbl] || ''}`}
                />
                <ReferenceLine
                  y={threshold}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${threshold}%`, position: 'top', fill: '#EF4444', fontSize: 10, fontWeight: 'bold' }}
                />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {poSummary.map((entry, index) => (
                    <Cell
                      key={`admin-cell-${index}`}
                      fill={entry.percentage >= threshold ? '#10B981' : '#F59E0B'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Target Compliance Ratio</h3>
            <p className="text-xs text-slate-500">Program Outcomes meeting ≥{threshold}% threshold</p>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#F59E0B" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-around text-xs font-semibold pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span>Attained ({attainedPOs.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span>At-Risk ({atRiskPOs.length})</span>
            </div>
          </div>
        </div>
      </div>

      {/* PO Summary Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">NBA Accreditation Program Outcome (PO) Audit</h3>
            <p className="text-xs text-slate-500">
              Official attainment table for NBA Self Assessment Report (SAR).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">PO Code</th>
                <th className="px-6 py-3">Program Outcome Description</th>
                <th className="px-6 py-3 text-center">Evaluated Samples</th>
                <th className="px-6 py-3 text-center">Attainment %</th>
                <th className="px-6 py-3 text-center">Target</th>
                <th className="px-6 py-3 text-center">Accreditation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {poSummary.map((item) => (
                <tr key={item.po} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-3.5 font-bold font-mono text-slate-900">{item.po}</td>
                  <td className="px-6 py-3.5 font-medium text-slate-700">
                    {PO_DEFINITIONS[item.po] || 'Program Outcome'}
                  </td>
                  <td className="px-6 py-3.5 text-center font-mono">{item.count}</td>
                  <td className="px-6 py-3.5 text-center font-mono font-bold text-sm">
                    {item.percentage}%
                  </td>
                  <td className="px-6 py-3.5 text-center font-mono text-slate-500">{threshold}%</td>
                  <td className="px-6 py-3.5 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        item.isAttained
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {item.isAttained ? 'ATTAINED' : 'BELOW TARGET'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Groups Audit List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Department Project Groups Audit &amp; Snapshot Sync</h3>
            <p className="text-xs text-slate-500">
              Overview of all active groups, assigned supervisors, and cached attainment records.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {groups.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-8">No groups found for selected batch.</p>
          ) : (
            groups.map((g) => {
              const isCalculating = calculatingId === g.id;
              const hasSnapshots = g.snapshots && g.snapshots.length > 0;

              return (
                <div
                  key={g.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition flex flex-col sm:flex-row justify-between sm:items-center gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">Group {g.number}</span>
                      <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {g.topic.code}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-md">
                        {g.topic.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
                      <span>Batch: <strong className="text-slate-700">{g.batchId}</strong></span>
                      <span>•</span>
                      <span>Supervisor: <strong className="text-slate-700">{g.supervisor?.name || 'Unassigned'}</strong></span>
                      <span>•</span>
                      <span>
                        Snapshots: <strong className="text-slate-700">{g.snapshots?.length || 0}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        hasSnapshots
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {hasSnapshots ? 'COMPUTED' : 'PENDING MARKS'}
                    </span>

                    <button
                      onClick={() => handleRecalculate(g.id)}
                      disabled={isCalculating}
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isCalculating ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Syncing...
                        </>
                      ) : (
                        'Recalculate'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
