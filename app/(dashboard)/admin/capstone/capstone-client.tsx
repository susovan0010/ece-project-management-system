'use client';

import { useState, useEffect } from 'react';
import {
  getAdminCapstoneEvaluationAction,
  confirmCapstoneDecisionAction,
  saveComplexityDeclarationAction,
  AdminGroupCapstoneEvaluation,
} from '@/app/actions/capstone';

export default function AdminCapstoneClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [groups, setGroups] = useState<AdminGroupCapstoneEvaluation[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    qualified: 0,
    pending: 0,
    failed: 0,
    confirmedDecisions: 0,
  });

  // Modal State for Review & Endorsement
  const [selectedGroup, setSelectedGroup] = useState<AdminGroupCapstoneEvaluation | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Modal State for Complexity Declaration Sign-off
  const [declarationGroup, setDeclarationGroup] = useState<AdminGroupCapstoneEvaluation | null>(null);
  const [attributeCode, setAttributeCode] = useState('WP5');
  const [justification, setJustification] = useState('');
  const [savingDeclaration, setSavingDeclaration] = useState(false);

  async function loadData(batch = selectedBatch) {
    setLoading(true);
    setError(null);
    const res = await getAdminCapstoneEvaluationAction(batch);

    if (res.error) {
      setError(res.error);
    } else {
      setGroups(res.groups || []);
      setBatches(res.batches || []);
      if (res.summary) setSummary(res.summary);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  // Open Review Modal
  function handleOpenReview(g: AdminGroupCapstoneEvaluation) {
    setSelectedGroup(g);
    setDecisionNotes(g.decision?.notes || '');
  }

  // Submit Committee Endorsement
  async function handleConfirmDecision(status: 'CONFIRMED' | 'HOLD' | 'PENDING') {
    if (!selectedGroup) return;
    setSubmittingDecision(true);
    setError(null);
    setSuccessMsg(null);

    const res = await confirmCapstoneDecisionAction({
      topicId: selectedGroup.topicId,
      status,
      step1Qualify: selectedGroup.evaluation.step1.passed,
      step2Panel: selectedGroup.evaluation.step2.passed,
      step3External: selectedGroup.evaluation.step3.passed,
      step4Declared: selectedGroup.evaluation.step4.passed,
      isCapstone: selectedGroup.evaluation.isCapstone,
      notes: decisionNotes,
    });

    setSubmittingDecision(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Decision recorded: Group ${selectedGroup.groupNumber} marked as ${status}.`);
      setSelectedGroup(null);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Save/Confirm Complexity Declaration
  async function handleSaveDeclaration() {
    if (!declarationGroup) return;
    setSavingDeclaration(true);
    setError(null);

    const res = await saveComplexityDeclarationAction({
      topicId: declarationGroup.topicId,
      attributeCode,
      justification: justification.trim() || 'Complexity confirmed per project scope.',
      confirmed: true,
    });

    setSavingDeclaration(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Declaration confirmed for ${attributeCode}!`);
      setDeclarationGroup(null);
      setJustification('');
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
              Project Committee Admin
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              NBA SAR Criterion 2.2
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Washington Accord 4-Step Rules
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Capstone Project Identification &amp; Decision Board
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automated 4-Step validation pipeline evaluating complex engineering problem scorecards, panel averages, external marks, and complexity sign-offs.
          </p>
        </div>

        {/* Batch Filter Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs font-semibold text-slate-600">Batch:</label>
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
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Projects</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</div>
          <span className="text-[11px] text-slate-400">Enrolled groups</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Qualified Capstone</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.qualified}</div>
          <span className="text-[11px] text-slate-400">Passed all 4 steps</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Evaluation Pending</span>
          <div className="text-2xl font-bold text-amber-600 mt-1">{summary.pending}</div>
          <span className="text-[11px] text-slate-400">Incomplete marks/sign-off</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Non-Qualifying</span>
          <div className="text-2xl font-bold text-rose-600 mt-1">{summary.failed}</div>
          <span className="text-[11px] text-slate-400">Failed threshold cut-off</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Committee Endorsed</span>
          <div className="text-2xl font-bold text-purple-700 mt-1">{summary.confirmedDecisions}</div>
          <span className="text-[11px] text-slate-400">Decision records in DB</span>
        </div>
      </div>

      {/* 4-Step Rules Explanatory Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
            HITK B.Tech ECE 4-Step Capstone Validation Architecture
          </h3>
          <span className="text-xs text-slate-400 font-mono">Pure Engine Rules</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
            <span className="font-bold text-blue-400 uppercase tracking-wider text-[10px]">Step 1: Scorecard</span>
            <p className="font-semibold text-slate-200">Topic Qualification Rule</p>
            <p className="text-slate-400 text-[11px]">
              WP1 ≥ 2, at least 3 of WP2..7 ≥ 2, at least 2 of EA1..5 ≥ 2, &amp; at least 1 SDG target named.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
            <span className="font-bold text-indigo-400 uppercase tracking-wider text-[10px]">Step 2: Sem 7 Panel</span>
            <p className="font-semibold text-slate-200">Internal Rubric D Averaging</p>
            <p className="text-slate-400 text-[11px]">
              Average across examiner slots: Novelty ≥ 5.0/7, Realistic Problem ≥ 5.0/7, Societal Impact ≥ 2.0/3.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
            <span className="font-bold text-purple-400 uppercase tracking-wider text-[10px]">Step 3: Sem 8 External</span>
            <p className="font-semibold text-slate-200">Rubric F External Defense</p>
            <p className="text-slate-400 text-[11px]">
              External examiner: Novelty ≥ 6.0/8, Realistic Problem ≥ 6.0/8, Societal Impact ≥ 2.0/3.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
            <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">Step 4: Declarations</span>
            <p className="font-semibold text-slate-200">Supervisor Complexity Sign-off</p>
            <p className="text-slate-400 text-[11px]">
              Supervisor confirms unassessed complexity attributes (WP5 Modern Tool Limitations, WP7 Interdependence).
            </p>
          </div>
        </div>
      </div>

      {/* Main Groups Capstone Evaluation Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Department Capstone Evaluation &amp; Decision Grid</h3>
            <p className="text-xs text-slate-500">
              Live evaluation state across all project groups. Missing semester marks automatically hold status in PENDING.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Group &amp; Topic</th>
                <th className="px-6 py-3">Supervisor</th>
                <th className="px-4 py-3 text-center">Step 1 (Scorecard)</th>
                <th className="px-4 py-3 text-center">Step 2 (Sem 7 Panel)</th>
                <th className="px-4 py-3 text-center">Step 3 (Sem 8 External)</th>
                <th className="px-4 py-3 text-center">Step 4 (Complexity)</th>
                <th className="px-4 py-3 text-center">Engine Result</th>
                <th className="px-4 py-3 text-center">Committee Decision</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    No project groups found for selected batch.
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const ev = g.evaluation;
                  const dec = g.decision;

                  return (
                    <tr key={g.groupId} className="hover:bg-slate-50/60 transition">
                      {/* Group & Topic */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">Group {g.groupNumber}</span>
                          <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            {g.topicCode}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-700 line-clamp-1 mt-0.5 max-w-xs">
                          {g.topicTitle}
                        </p>
                        <span className="text-[10px] text-slate-400">Batch {g.batchId}</span>
                      </td>

                      {/* Supervisor */}
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{g.supervisorName}</div>
                        <div className="text-[10px] text-slate-400">{g.supervisorEmail}</div>
                      </td>

                      {/* Step 1 */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.step1.passed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                          title={ev.step1.details}
                        >
                          {ev.step1.passed ? 'QUALIFIES' : 'FAILS'}
                        </span>
                      </td>

                      {/* Step 2 */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.step2.pending
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : ev.step2.passed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                          title={ev.step2.details}
                        >
                          {ev.step2.pending ? 'PENDING' : ev.step2.passed ? 'MET' : 'BELOW'}
                        </span>
                        {g.dScoresSummary && (
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                            N:{g.dScoresSummary.avgNovelty} P:{g.dScoresSummary.avgRealistic}
                          </div>
                        )}
                      </td>

                      {/* Step 3 */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.step3.pending
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : ev.step3.passed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                          title={ev.step3.details}
                        >
                          {ev.step3.pending ? 'PENDING' : ev.step3.passed ? 'MET' : 'BELOW'}
                        </span>
                        {g.fScoreSummary && (
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                            N:{g.fScoreSummary.novelty} P:{g.fScoreSummary.realistic}
                          </div>
                        )}
                      </td>

                      {/* Step 4 */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.step4.passed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                          title={ev.step4.details}
                        >
                          {ev.step4.passed ? 'CONFIRMED' : 'PENDING'}
                        </span>
                        <div className="mt-0.5">
                          <button
                            onClick={() => {
                              setDeclarationGroup(g);
                              setAttributeCode('WP5');
                              setJustification('');
                            }}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            Manage
                          </button>
                        </div>
                      </td>

                      {/* Overall Engine Result */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                            ev.status === 'QUALIFIED'
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : ev.status === 'PENDING'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-rose-500 text-white shadow-sm'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>

                      {/* Committee Endorsement */}
                      <td className="px-4 py-4 text-center">
                        {dec ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              dec.status === 'CONFIRMED'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : dec.status === 'HOLD'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {dec.status}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Unreviewed</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenReview(g)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                        >
                          Review &amp; Endorse
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Endorsement Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-slate-900">
                    Group {selectedGroup.groupNumber} Capstone Evaluation
                  </span>
                  <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {selectedGroup.topicCode}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{selectedGroup.topicTitle}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Supervisor: {selectedGroup.supervisorName} ({selectedGroup.supervisorEmail})
                </p>
              </div>

              <button
                onClick={() => setSelectedGroup(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* 4-Step Breakdown Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Detailed 4-Step Verification Analysis
              </h4>

              {/* Step 1 */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">Step 1: Topic Qualification Scorecard</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      selectedGroup.evaluation.step1.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {selectedGroup.evaluation.step1.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{selectedGroup.evaluation.step1.details}</p>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">
                    Step 2: Semester 7 Internal Panel Evaluation (Rubric D)
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      selectedGroup.evaluation.step2.pending
                        ? 'bg-amber-100 text-amber-800'
                        : selectedGroup.evaluation.step2.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {selectedGroup.evaluation.step2.pending
                      ? 'PENDING'
                      : selectedGroup.evaluation.step2.passed
                      ? 'PASSED'
                      : 'BELOW CUT-OFF'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{selectedGroup.evaluation.step2.details}</p>
                {selectedGroup.dScoresSummary && (
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    Examiners: {selectedGroup.dScoresSummary.examinerCount} | Novelty Avg:{' '}
                    {selectedGroup.dScoresSummary.avgNovelty}/7 | Realistic Problem Avg:{' '}
                    {selectedGroup.dScoresSummary.avgRealistic}/7 | Societal Impact Avg:{' '}
                    {selectedGroup.dScoresSummary.avgImpact}/3
                  </p>
                )}
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">
                    Step 3: Semester 8 External Examiner Evaluation (Rubric F)
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      selectedGroup.evaluation.step3.pending
                        ? 'bg-amber-100 text-amber-800'
                        : selectedGroup.evaluation.step3.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {selectedGroup.evaluation.step3.pending
                      ? 'PENDING'
                      : selectedGroup.evaluation.step3.passed
                      ? 'PASSED'
                      : 'BELOW CUT-OFF'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{selectedGroup.evaluation.step3.details}</p>
                {selectedGroup.fScoreSummary && (
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    Novelty: {selectedGroup.fScoreSummary.novelty}/8 | Realistic Problem:{' '}
                    {selectedGroup.fScoreSummary.realistic}/8 | Societal Impact:{' '}
                    {selectedGroup.fScoreSummary.impact}/3
                  </p>
                )}
              </div>

              {/* Step 4 */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">
                    Step 4: Complexity Declaration Sign-off
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      selectedGroup.evaluation.step4.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedGroup.evaluation.step4.passed ? 'CONFIRMED' : 'PENDING'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{selectedGroup.evaluation.step4.details}</p>
              </div>
            </div>

            {/* Committee Notes */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Project Committee Notes &amp; Rationale:</label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                rows={3}
                placeholder="Enter committee comments, endorsement remarks, or condition notes..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            {/* Decision Buttons */}
            <div className="flex flex-col sm:flex-row justify-end items-center gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleConfirmDecision('HOLD')}
                disabled={submittingDecision}
                className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                Place on Hold
              </button>

              <button
                type="button"
                onClick={() => handleConfirmDecision('CONFIRMED')}
                disabled={submittingDecision}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {submittingDecision ? 'Saving...' : 'Endorse & Confirm Capstone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Complexity Declaration Modal */}
      {declarationGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Supervisor Complexity Declaration (Step 4)
                </h4>
                <p className="text-xs text-slate-500">Group {declarationGroup.groupNumber} - {declarationGroup.topicCode}</p>
              </div>
              <button
                onClick={() => setDeclarationGroup(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Attributes that rubrics do not assess (e.g. WP5 Modern Tool Limitations, WP7 Interdependent Engineering Problems) require complexity declaration sign-off for Washington Accord compliance.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Attribute:</label>
                <select
                  value={attributeCode}
                  onChange={(e) => setAttributeCode(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                >
                  <option value="WP5">WP5: Modern Tool Limitations &amp; Resources</option>
                  <option value="WP7">WP7: Interdependence &amp; Consequence of Sub-problems</option>
                  <option value="WP6">WP6: Depth of Analysis &amp; Societal Significance</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Complexity Justification:</label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  placeholder="Describe technical complexity, engineering constraints, or simulation tools used..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setDeclarationGroup(null)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDeclaration}
                disabled={savingDeclaration}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {savingDeclaration ? 'Signing...' : 'Sign & Confirm Declaration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
