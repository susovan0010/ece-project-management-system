'use client';

import { useState } from 'react';
import {
  ReportFilterOptions,
  SemesterGroupReportData,
  SemesterOverallReportData,
  generateSemesterGroupReportAction,
  generateSemesterOverallReportAction,
} from '@/app/actions/reports';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

interface ReportsClientProps {
  initialOptions: ReportFilterOptions;
}

export function ReportsClient({ initialOptions }: ReportsClientProps) {
  const [reportMode, setReportMode] = useState<'GROUP' | 'OVERALL'>('GROUP');
  const [selectedBatch, setSelectedBatch] = useState<string>(
    initialOptions.batches[0]?.id || '2023-2027'
  );
  const [selectedSemester, setSelectedSemester] = useState<number>(7);

  // Group Report Filter
  const filteredGroups = initialOptions.groups.filter(
    (g) => g.batchId === selectedBatch
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    filteredGroups[0]?.id || initialOptions.groups[0]?.id || ''
  );

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupReport, setGroupReport] = useState<SemesterGroupReportData | null>(null);
  const [overallReport, setOverallReport] = useState<SemesterOverallReportData | null>(null);

  async function handleGenerateReport() {
    setLoading(true);
    setError(null);

    if (reportMode === 'GROUP') {
      if (!selectedGroupId) {
        setError('Please select a group to generate the report.');
        setLoading(false);
        return;
      }
      const res = await generateSemesterGroupReportAction(selectedGroupId, selectedSemester);
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to generate group report.');
      } else {
        setGroupReport(res.data);
      }
    } else {
      const res = await generateSemesterOverallReportAction(selectedBatch, selectedSemester);
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to generate overall report.');
      } else {
        setOverallReport(res.data);
      }
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Print Controls (Hidden on Print) */}
      <div className="no-print bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base">
              📊
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Project Committee Reports Hub
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Generate official NBA-aligned PO attainment summaries, Capstone evaluations, and supervisor badge records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(groupReport || overallReport) && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print / Save PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher & Filter Controls (Hidden on Print) */}
      <div className="no-print bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Format:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setReportMode('GROUP');
                  setOverallReport(null);
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  reportMode === 'GROUP'
                    ? 'bg-white text-blue-600 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📑</span>
                <span>Semester-wise Group Report</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportMode('OVERALL');
                  setGroupReport(null);
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  reportMode === 'OVERALL'
                    ? 'bg-white text-blue-600 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🌐</span>
                <span>Semester-wise Overall Batch Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Academic Batch:
            </label>
            <select
              value={selectedBatch}
              onChange={(e) => {
                const b = e.target.value;
                setSelectedBatch(b);
                const g = initialOptions.groups.filter((grp) => grp.batchId === b);
                if (g.length > 0) setSelectedGroupId(g[0].id);
              }}
              className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {initialOptions.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Semester:
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {initialOptions.semesters.map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>
          </div>

          {reportMode === 'GROUP' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Project Group:
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium truncate"
              >
                {filteredGroups.length > 0 ? (
                  filteredGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Group #{g.number}: {g.topicTitle} ({g.supervisorName})
                    </option>
                  ))
                ) : (
                  <option value="">No groups found in this batch</option>
                )}
              </select>
            </div>
          )}

          <div className="flex items-end sm:col-span-2 md:col-span-4">
            <button
              type="button"
              onClick={handleCreateReportClick}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 transition flex items-center gap-2"
            >
              {loading ? (
                <span>Generating Report...</span>
              ) : (
                <>
                  <span>⚡</span>
                  <span>
                    Generate {reportMode === 'GROUP' ? 'Group Report' : 'Overall Batch Report'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. SEMESTER-WISE GROUP REPORT VIEW                       */}
      {/* ======================================================== */}
      {reportMode === 'GROUP' && groupReport && (
        <div className="print-report bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-8 text-slate-900">
          {/* Institution Header (Visible on Screen & Print) */}
          <div className="border-b-2 border-slate-900 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Heritage Institute of Technology, Kolkata
              </h2>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mt-0.5">
                Department of Electronics &amp; Communication Engineering (NBA Accredited)
              </p>
              <h3 className="text-base font-bold text-blue-700 mt-2">
                Semester {groupReport.semester} Capstone Project &amp; Attainment Report
              </h3>
            </div>
            <div className="text-right text-xs text-slate-500 font-mono space-y-1">
              <div>Batch: <strong className="text-slate-900">{groupReport.group.batchId}</strong></div>
              <div>Group: <strong className="text-slate-900">#{groupReport.group.number}</strong></div>
              <div className="text-[11px]">Date: {new Date(groupReport.generatedAt).toLocaleDateString()}</div>
            </div>
          </div>

          {/* Section 1: Project Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center gap-2">
              <span>📌</span> Project Overview &amp; Specifications
            </h4>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md mr-2">
                    {groupReport.project.code}
                  </span>
                  <span className="font-bold text-base text-slate-900">{groupReport.project.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-slate-200 font-semibold text-slate-800 text-[11px]">
                    {groupReport.project.domain}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-100 font-semibold text-indigo-800 text-[11px]">
                    {groupReport.project.category}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                {groupReport.project.description}
              </p>
              <div className="pt-2 border-t border-slate-200/60 flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="font-semibold text-slate-700">Source:</span>{' '}
                  <span className="font-medium text-slate-600">{groupReport.project.source}</span>
                </div>
                {groupReport.project.sdgs.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-700">SDGs Addressed:</span>{' '}
                    <span className="font-medium text-emerald-700">
                      {groupReport.project.sdgs.map((s) => s.code).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Supervisor & Student Team Badges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Project Supervisor
              </h4>
              <div className="text-sm font-bold text-slate-900">{groupReport.supervisor.name}</div>
              <div className="text-xs text-slate-600 font-mono">{groupReport.supervisor.email}</div>
              <div className="text-[11px] text-blue-800 pt-1">Dept. of Electronics &amp; Communication Engg.</div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>👥 Student Members &amp; Earned Material Badges</span>
                <span className="text-[10px] text-slate-400 font-normal">Strictly Badges Only</span>
              </h4>
              <div className="space-y-2">
                {groupReport.students.map((st) => (
                  <div
                    key={st.id}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">{st.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Roll: {st.roll}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {st.badges.hasAnyBadge ? (
                        <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium">
                          {st.badges.diamonds > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-900" title="Diamond Badges">
                              💎 {st.badges.diamonds}
                            </span>
                          )}
                          {st.badges.gold > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900" title="Gold Badges">
                              🥇 {st.badges.gold}
                            </span>
                          )}
                          {st.badges.silver > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800" title="Silver Badges">
                              🥈 {st.badges.silver}
                            </span>
                          )}
                          {st.badges.copper > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-900" title="Copper Badges">
                              🥉 {st.badges.copper}
                            </span>
                          )}
                          {st.badges.iron > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700" title="Iron Badges">
                              ⚙️ {st.badges.iron}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono italic">No badges earned yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Percentage Attainment of POs with Visual Bar Chart */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <span>📈</span> Program Outcomes (PO) Attainment Profile (Semester {groupReport.semester})
              </h4>
              <span className="text-xs font-semibold text-blue-700">
                Attained: {groupReport.overallAttainedPOCount} of 11 POs (Threshold: 65%)
              </span>
            </div>

            {/* Recharts Bar Illustration */}
            <div className="h-64 w-full bg-slate-50 p-4 rounded-xl border border-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupReport.poAttainments} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="po" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                  <Tooltip
                    formatter={(val: number) => [`${val}%`, 'Attainment']}
                    labelStyle={{ fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                  />
                  <ReferenceLine y={65} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Target: 65%', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {groupReport.poAttainments.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.percentage >= 85 ? '#059669' : entry.percentage >= 75 ? '#2563eb' : entry.percentage >= 65 ? '#d97706' : '#cbd5e1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Detailed Table with Semester Improvement Tracking */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3">Attainment %</th>
                    <th className="py-2.5 px-3">Attainment Level</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Progression &amp; Improvement (vs Prev Sem)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                  {groupReport.poAttainments.map((po) => (
                    <tr key={po.po} className={po.hasImproved ? 'bg-emerald-50/50' : ''}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{po.po}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                po.percentage >= 85 ? 'bg-emerald-500' : po.percentage >= 75 ? 'bg-blue-500' : po.percentage >= 65 ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                              style={{ width: `${Math.min(po.percentage, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono">{po.percentage}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{po.levelDescription}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            po.isAttained ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {po.isAttained ? 'Attained' : 'Not Attained'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {po.improvementText ? (
                          <span className={`text-[11px] font-semibold ${po.hasImproved ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {po.hasImproved && '▲ '}
                            {po.improvementText}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Baseline semester</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Capstone Criteria Satisfaction & Actionable Requirements */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center justify-between">
              <span>🏆 Capstone Project Criteria Evaluation</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  groupReport.capstone.status === 'QUALIFIED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : groupReport.capstone.status === 'PENDING'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                {groupReport.capstone.status === 'QUALIFIED'
                  ? 'CAPSTONE QUALIFIED'
                  : groupReport.capstone.status === 'PENDING'
                  ? 'EVALUATION PENDING'
                  : 'CRITERIA NOT MET'}
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${groupReport.capstone.steps.step1.passed ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-red-50/60 border-red-200 text-red-900'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <span>{groupReport.capstone.steps.step1.passed ? '✓' : '✗'}</span>
                  <span>Step 1: Topic Scorecard Qualification</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-600">{groupReport.capstone.steps.step1.details}</p>
              </div>

              <div className={`p-3 rounded-xl border ${groupReport.capstone.steps.step2.passed ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : groupReport.capstone.steps.step2.pending ? 'bg-amber-50/60 border-amber-200 text-amber-900' : 'bg-red-50/60 border-red-200 text-red-900'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <span>{groupReport.capstone.steps.step2.passed ? '✓' : groupReport.capstone.steps.step2.pending ? '⏳' : '✗'}</span>
                  <span>Step 2: Sem 7 Panel Average (Rubric D)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-600">{groupReport.capstone.steps.step2.details}</p>
              </div>

              <div className={`p-3 rounded-xl border ${groupReport.capstone.steps.step3.passed ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : groupReport.capstone.steps.step3.pending ? 'bg-amber-50/60 border-amber-200 text-amber-900' : 'bg-red-50/60 border-red-200 text-red-900'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <span>{groupReport.capstone.steps.step3.passed ? '✓' : groupReport.capstone.steps.step3.pending ? '⏳' : '✗'}</span>
                  <span>Step 3: Sem 8 External Examiner (Rubric F)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-600">{groupReport.capstone.steps.step3.details}</p>
              </div>

              <div className={`p-3 rounded-xl border ${groupReport.capstone.steps.step4.passed ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-amber-50/60 border-amber-200 text-amber-900'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <span>{groupReport.capstone.steps.step4.passed ? '✓' : '⏳'}</span>
                  <span>Step 4: Supervisor Complexity Sign-off</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-600">{groupReport.capstone.steps.step4.details}</p>
              </div>
            </div>

            {/* Actionable List: What are to be attained to make their project capstone */}
            {groupReport.capstone.whatIsNeeded.length > 0 && (
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>Requirements to Attain to Qualify for Capstone Status:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-800">
                  {groupReport.capstone.whatIsNeeded.map((req, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SEMESTER-WISE OVERALL BATCH REPORT VIEW               */}
      {/* ======================================================== */}
      {reportMode === 'OVERALL' && overallReport && (
        <div className="print-report bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-8 text-slate-900">
          {/* Institution Header (Visible on Screen & Print) */}
          <div className="border-b-2 border-slate-900 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Heritage Institute of Technology, Kolkata
              </h2>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mt-0.5">
                Department of Electronics &amp; Communication Engineering (NBA Accredited)
              </p>
              <h3 className="text-base font-bold text-blue-700 mt-2">
                Semester {overallReport.semester} Departmental Overall Batch Attainment Report
              </h3>
            </div>
            <div className="text-right text-xs text-slate-500 font-mono space-y-1">
              <div>Batch: <strong className="text-slate-900">{overallReport.batchId}</strong></div>
              <div>Semester: <strong className="text-slate-900">Sem {overallReport.semester}</strong></div>
              <div className="text-[11px]">Date: {new Date(overallReport.generatedAt).toLocaleDateString()}</div>
            </div>
          </div>

          {/* Section 1: Summary Counts (No student detail, pure numbers) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center gap-2">
              <span>📊</span> Cohort Enrollment &amp; Capstone Summary
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Groups
                </span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {overallReport.totalGroups}
                </div>
                <span className="text-[10px] text-slate-500">Project groups allotted in batch</span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Students
                </span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {overallReport.totalStudents}
                </div>
                <span className="text-[10px] text-slate-500">Enrolled engineering students</span>
              </div>

              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Capstone Qualified Groups
                </span>
                <div className="text-2xl font-black text-emerald-700 font-mono">
                  {overallReport.totalCapstoneQualifiedGroups}{' '}
                  <span className="text-xs font-semibold text-emerald-600">
                    ({overallReport.capstonePercentage}%)
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700">Satisfying complex engineering criteria</span>
              </div>
            </div>
          </div>

          {/* Section 2: Batch PO Attainment Illustration with Bar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <span>📈</span> Batch Cumulative PO Attainment (NBA 60% Student Threshold Rule)
              </h4>
              <span className="text-xs font-semibold text-blue-700">
                Attained: {overallReport.overallAttainedPOCount} of 11 POs
              </span>
            </div>

            {/* Recharts Bar Illustration */}
            <div className="h-64 w-full bg-slate-50 p-4 rounded-xl border border-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overallReport.poAttainments} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="po" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} unit="%" />
                  <Tooltip
                    formatter={(val: number) => [`${val}% of Students`, 'Scored ≥ 65%']}
                    labelStyle={{ fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                  />
                  <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'NBA Rule: 60%', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                  <Bar dataKey="pctGte65" radius={[4, 4, 0, 0]}>
                    {overallReport.poAttainments.map((entry, index) => (
                      <Cell
                        key={`overall-cell-${index}`}
                        fill={entry.attainmentLevel === 3 ? '#059669' : entry.attainmentLevel === 2 ? '#2563eb' : entry.attainmentLevel === 1 ? '#d97706' : '#cbd5e1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Program Outcome</th>
                    <th className="py-2.5 px-3">% Students ≥ 65% (L1)</th>
                    <th className="py-2.5 px-3">% Students ≥ 75% (L2)</th>
                    <th className="py-2.5 px-3">% Students ≥ 85% (L3)</th>
                    <th className="py-2.5 px-3">NBA Attainment Level</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                  {overallReport.poAttainments.map((po) => (
                    <tr key={po.po}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{po.po}</td>
                      <td className="py-2.5 px-3 font-mono">{po.pctGte65}%</td>
                      <td className="py-2.5 px-3 font-mono">{po.pctGte75}%</td>
                      <td className="py-2.5 px-3 font-mono">{po.pctGte85}%</td>
                      <td className="py-2.5 px-3 font-semibold">{po.levelDescription}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            po.isAttained ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {po.isAttained ? 'Attained' : 'Not Attained'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Capstone Projects Showcase (Details of THOSE Projects ONLY) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center justify-between">
              <span>🏆 Capstone Projects Showcase (Qualifying Projects Only)</span>
              <span className="text-xs font-semibold text-emerald-700">
                {overallReport.capstoneProjects.length} Projects Listed
              </span>
            </h4>

            {overallReport.capstoneProjects.length > 0 ? (
              <div className="space-y-4">
                {overallReport.capstoneProjects.map((p) => (
                  <div
                    key={p.groupId}
                    className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Group #{p.groupNumber} • {p.projectCode}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{p.projectTitle}</span>
                        </div>
                      </div>
                      <div className="text-xs text-blue-900 font-medium">
                        Supervisor: <span className="font-bold text-slate-900">{p.supervisorName}</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="font-bold text-slate-700">Student Team:</span>{' '}
                      <span className="font-medium text-slate-800">{p.studentNames.join(', ')}</span>
                    </div>

                    {/* Attribute Attainments (WP, WK, EA) */}
                    {p.attributeAttainments.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Washington Accord Attributes Attained:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {p.attributeAttainments.map((a) => (
                            <span
                              key={a.code}
                              className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-mono"
                              title={`${a.code}: Level ${a.level}`}
                            >
                              <strong>{a.code}</strong>: {a.percentage}% (L{a.level})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PO Attainments */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Program Outcomes (PO) Attained:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.poAttainments
                          .filter((po) => po.percentage >= 65)
                          .map((po) => (
                            <span
                              key={po.po}
                              className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-mono"
                            >
                              <strong>{po.po}</strong>: {po.percentage}% (L{po.level})
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No capstone projects evaluated in this semester yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State before generating */}
      {!groupReport && !overallReport && !loading && (
        <div className="no-print p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
          <span className="text-3xl">📋</span>
          <div className="text-sm font-bold text-slate-700">No Report Generated Yet</div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Select your report format, academic batch, and semester above, then click <strong>Generate Report</strong> to inspect detailed attainment profiles and Capstone evaluations.
          </p>
        </div>
      )}
    </div>
  );

  function handleCreateReportClick() {
    handleGenerateReport();
  }
}
