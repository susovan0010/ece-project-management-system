'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getFacultyAttainmentAnalyticsAction,
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

const COLORS = ['#10B981', '#F59E0B']; // Green for Attained (>=65%), Amber for Below (<65%)

export default function FacultyAttainmentClient() {
  const searchParams = useSearchParams();
  const highlightGroupId = searchParams.get('group');

  const [loading, setLoading] = useState(true);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [groups, setGroups] = useState<any[]>([]);
  const [poAverages, setPoAverages] = useState<any[]>([]);
  const [overallRate, setOverallRate] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(65);

  async function loadData(batch = selectedBatch) {
    setLoading(true);
    setError(null);
    const res = await getFacultyAttainmentAnalyticsAction(batch);

    if (res.error) {
      setError(res.error);
    } else {
      setGroups(res.groups || []);
      setBatches(res.batches || []);
      setPoAverages(res.poAverages || []);
      setOverallRate(res.overallAttainmentRate || 0);
      setThreshold(res.targetThreshold || 65);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  // Recalculate group attainment action
  async function handleRecalculate(groupId: string) {
    setCalculatingId(groupId);
    setError(null);
    setSuccessMsg(null);

    const res = await calculateAndSnapshotGroupAttainmentAction(groupId);
    setCalculatingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Recalculated & cached ${res.count} attainment snapshots!`);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Prepare Pie Data (Attained vs Not Attained)
  const attainedCount = poAverages.filter((p) => p.isAttained).length;
  const notAttainedCount = poAverages.filter((p) => !p.isAttained).length;

  const pieData = [
    { name: 'Attained (≥65%)', value: attainedCount },
    { name: 'Below Target (<65%)', value: notAttainedCount },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              NBA Accreditation Engine
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Target Benchmark: {threshold}%
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Program Outcome (PO) Attainment Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Evaluate attainment ratios across your assigned groups for PO1–PO11, Washington Accord attributes, and SDGs.
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

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall PO Attainment</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{overallRate}%</div>
          <span className="text-[11px] text-slate-400">Share meeting ≥{threshold}% threshold</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Attained Outcomes</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{attainedCount} / 11</div>
          <span className="text-[11px] text-slate-400">POs achieving target</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Assigned Groups</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{groups.length}</div>
          <span className="text-[11px] text-slate-400">Supervised in selected batch</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Department Benchmark</span>
          <div className="text-2xl font-bold text-purple-700 mt-1">{threshold}%</div>
          <span className="text-[11px] text-slate-400">Locked target threshold</span>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">PO Attainment Percentage (PO1 to PO11)</h3>
              <p className="text-xs text-slate-500">Red dashed line marks the required 65% attainment threshold.</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={poAverages} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="po" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#64748B" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#64748B" unit="%" />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, 'Attainment']}
                  labelFormatter={(lbl) => `Program Outcome: ${lbl}`}
                />
                <ReferenceLine y={threshold} stroke="#EF4444" strokeDasharray="4 4" label={{ value: `Target ${threshold}%`, position: 'top', fill: '#EF4444', fontSize: 10, fontWeight: 'bold' }} />
                <Bar dataKey="attainment" radius={[4, 4, 0, 0]}>
                  {poAverages.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.attainment >= threshold ? '#10B981' : '#F59E0B'}
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
            <h3 className="font-bold text-slate-900 text-sm">Attainment Ratio Split</h3>
            <p className="text-xs text-slate-500">Proportion of POs meeting target benchmark</p>
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
              <span>Attained ({attainedCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span>Below Target ({notAttainedCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Group Breakdown Table & Snapshot Action */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-4">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Assigned Project Groups & Snapshot Engine</h3>
            <p className="text-xs text-slate-500">
              Click &quot;Calculate &amp; Cache Attainment&quot; to compute attainment ratios from Rubrics A–F marks.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {groups.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-8">No groups assigned.</p>
          ) : (
            groups.map((g) => {
              const isHighlighted = highlightGroupId === g.id;
              const isCalculating = calculatingId === g.id;

              const groupPos = g.snapshots.filter((s: any) => s.metric.startsWith('PO'));
              const groupWps = g.snapshots.filter((s: any) => s.metric.startsWith('WP'));

              return (
                <div
                  key={g.id}
                  className={`p-4 rounded-xl border transition ${
                    isHighlighted ? 'border-blue-500 bg-blue-50/20 shadow-sm' : 'border-slate-200 bg-slate-50/40'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">Group {g.number}</span>
                        <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {g.topic.code}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 truncate max-w-md">
                          {g.topic.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Batch: {g.batchId} | Snapshots recorded: {g.snapshots.length}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRecalculate(g.id)}
                        disabled={isCalculating}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {isCalculating ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Computing...
                          </>
                        ) : (
                          'Calculate & Cache Attainment'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Snapshots chips */}
                  {groupPos.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Calculated PO Scores (≥65% Target):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {groupPos.map((s: any) => (
                          <span
                            key={s.metric}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              s.isAttained
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {s.metric}: {Math.round(s.attainment * 100)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
