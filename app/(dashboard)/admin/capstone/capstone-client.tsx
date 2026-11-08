'use client';

import { useState, useEffect } from 'react';
import {
  getAdminCapstoneEvaluationAction,
  confirmCapstoneDecisionAction,
  saveComplexityDeclarationAction,
  checkSemester8CompletionAction,
  closeBatchSessionAction,
  unlockBatchSessionAction,
  archiveBatchAction,
  getCapstoneCatalogueAction,
  getCapstoneProjectDetailReportAction,
  AdminGroupCapstoneEvaluation,
  Semester8Status,
  CapstoneCatalogueItem,
  CapstoneDetailReport,
} from '@/app/actions/capstone';
import { getBatchArchiveConfirmationSentence } from '@/lib/engine/archive-report-generator';

export default function AdminCapstoneClient() {
  const [activeTab, setActiveTab] = useState<'DECISION_BOARD' | 'CATALOGUE' | 'CLOSE_SESSION'>('DECISION_BOARD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [batches, setBatches] = useState<{ id: string; active: boolean; isLocked?: boolean; isArchived?: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [groups, setGroups] = useState<AdminGroupCapstoneEvaluation[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    qualified: 0,
    pending: 0,
    failed: 0,
    confirmedDecisions: 0,
  });

  // Modal State for Review & Endorsement (Decision Board)
  const [selectedGroup, setSelectedGroup] = useState<AdminGroupCapstoneEvaluation | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Modal State for Complexity Declaration Sign-off (Decision Board)
  const [declarationGroup, setDeclarationGroup] = useState<AdminGroupCapstoneEvaluation | null>(null);
  const [attributeCode, setAttributeCode] = useState('WP5');
  const [justification, setJustification] = useState('');
  const [savingDeclaration, setSavingDeclaration] = useState(false);

  // ==========================================
  // Tab 2: Capstone Catalogue State
  // ==========================================
  const [catalogueItems, setCatalogueItems] = useState<CapstoneCatalogueItem[]>([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [catalogueBatchFilter, setCatalogueBatchFilter] = useState('ALL');
  const [detailReport, setDetailReport] = useState<CapstoneDetailReport | null>(null);
  const [loadingDetailReport, setLoadingDetailReport] = useState(false);
  const [reportDetailTab, setReportDetailTab] = useState<'OVERALL' | 'SEM6' | 'SEM7' | 'SEM8'>('OVERALL');

  // ==========================================
  // Tab 3: Close Session & Archival State
  // ==========================================
  const [closeSessionBatch, setCloseSessionBatch] = useState<string>('');
  const [sem8Status, setSem8Status] = useState<Semester8Status | null>(null);
  const [loadingSem8Status, setLoadingSem8Status] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [archivingBatch, setArchivingBatch] = useState(false);

  // Password Unlock Modal
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Secure Batch Archival Verification Modal
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveStep, setArchiveStep] = useState<'WARNING' | 'VERIFY'>('WARNING');
  const [archivePassword, setArchivePassword] = useState('');
  const [archiveSentenceInput, setArchiveSentenceInput] = useState('');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [copiedSentence, setCopiedSentence] = useState(false);

  // 1. Load Decision Board Data
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

      if (!closeSessionBatch && res.batches && res.batches.length > 0) {
        setCloseSessionBatch(res.batches[0].id);
      }
    }
    setLoading(false);
  }

  // 2. Load Capstone Catalogue Data
  async function loadCatalogue() {
    setLoadingCatalogue(true);
    setError(null);
    const res = await getCapstoneCatalogueAction();
    if (res.error) {
      setError(res.error);
    } else {
      setCatalogueItems(res.data || []);
    }
    setLoadingCatalogue(false);
  }

  // 3. Load Semester 8 Completion Status
  async function loadSem8Status(batchId: string) {
    if (!batchId) return;
    setLoadingSem8Status(true);
    setError(null);
    const res = await checkSemester8CompletionAction(batchId);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSem8Status(res.data);
    }
    setLoadingSem8Status(false);
  }

  useEffect(() => {
    loadData(selectedBatch);
  }, [selectedBatch]);

  useEffect(() => {
    if (activeTab === 'CATALOGUE') {
      loadCatalogue();
    } else if (activeTab === 'CLOSE_SESSION' && closeSessionBatch) {
      loadSem8Status(closeSessionBatch);
    }
  }, [activeTab, closeSessionBatch]);

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

  // Open Full Detail Report for a Capstone Project
  async function handleOpenDetailReport(topicId: string) {
    setLoadingDetailReport(true);
    setError(null);
    setReportDetailTab('OVERALL');
    const res = await getCapstoneProjectDetailReportAction(topicId);
    setLoadingDetailReport(false);

    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setDetailReport(res.data);
    }
  }

  // Close Session Action
  async function handleCloseSession() {
    if (!closeSessionBatch) return;
    const confirmed = window.confirm(
      `Are you sure you want to close and lock the session for Batch ${closeSessionBatch}?\n\nThis will make all marks and group records read-only. Unlocking will require your Admin login password.`
    );
    if (!confirmed) return;

    setClosingSession(true);
    setError(null);
    setSuccessMsg(null);

    const res = await closeBatchSessionAction(closeSessionBatch);
    setClosingSession(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Batch session closed successfully.');
      loadSem8Status(closeSessionBatch);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  // Unlock Session Action
  async function handleUnlockSession() {
    if (!closeSessionBatch || !unlockPassword) {
      setUnlockError('Please enter your admin login password.');
      return;
    }

    setUnlocking(true);
    setUnlockError(null);

    const res = await unlockBatchSessionAction(closeSessionBatch, unlockPassword);
    setUnlocking(false);

    if (res.error) {
      setUnlockError(res.error);
    } else {
      setSuccessMsg(res.message || 'Batch session unlocked successfully.');
      setUnlockModalOpen(false);
      setUnlockPassword('');
      loadSem8Status(closeSessionBatch);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  // 1. Initiate Secure Archival Flow (Open Warning Modal)
  function handleInitiateArchive() {
    if (!closeSessionBatch) return;
    setArchiveStep('WARNING');
    setArchivePassword('');
    setArchiveSentenceInput('');
    setArchiveError(null);
    setCopiedSentence(false);
    setArchiveModalOpen(true);
  }

  // 2. Confirm Archival with Password & Copy-Pasted Safety Sentence
  async function handleConfirmArchive() {
    if (!closeSessionBatch) return;

    const expectedSentence = getBatchArchiveConfirmationSentence(closeSessionBatch);
    if (archiveSentenceInput.trim().toUpperCase() !== expectedSentence.toUpperCase()) {
      setArchiveError(`Confirmation sentence mismatch. Please copy and paste: "${expectedSentence}"`);
      return;
    }

    if (!archivePassword) {
      setArchiveError('Please enter your Admin login password.');
      return;
    }

    setArchivingBatch(true);
    setArchiveError(null);
    setError(null);
    setSuccessMsg(null);

    const res = await archiveBatchAction({
      batchId: closeSessionBatch,
      adminPassword: archivePassword,
      confirmationSentence: archiveSentenceInput.trim(),
    });

    setArchivingBatch(false);

    if (res.error) {
      setArchiveError(res.error);
    } else {
      setSuccessMsg(res.message || 'Batch archived and backed up to Google Drive successfully.');
      setArchiveModalOpen(false);
      loadSem8Status(closeSessionBatch);
      loadData(selectedBatch);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
  }

  // Filter catalogue items
  const filteredCatalogue = catalogueItems.filter((item) => {
    if (catalogueBatchFilter !== 'ALL' && item.batchId !== catalogueBatchFilter) {
      return false;
    }
    if (!catalogueSearch.trim()) return true;
    const q = catalogueSearch.toLowerCase();
    const titleMatch = item.projectTitle.toLowerCase().includes(q);
    const codeMatch = item.projectCode.toLowerCase().includes(q);
    const domainMatch = item.domain.toLowerCase().includes(q);
    const supMatch = item.supervisor.name.toLowerCase().includes(q);
    const studentMatch = item.students.some(
      (s) => s.name.toLowerCase().includes(q) || s.roll.toLowerCase().includes(q)
    );
    return titleMatch || codeMatch || domainMatch || supMatch || studentMatch;
  });

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
            Capstone Management &amp; Decision Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automated 4-Step Capstone validation, permanent Capstone Catalogue, and permanent 8th Semester Close Session &amp; Archival retention.
          </p>
        </div>

        {/* Global Batch Filter (used in Decision Board) */}
        {activeTab === 'DECISION_BOARD' && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label className="text-xs font-semibold text-slate-600">Batch:</label>
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-purple-500 shadow-sm"
            >
              <option value="ALL">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} {b.active ? '(Active)' : ''} {b.isLocked ? '🔒' : ''} {b.isArchived ? '🗄️' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('DECISION_BOARD')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'DECISION_BOARD'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📌</span> 4-Step Decision Board
        </button>

        <button
          onClick={() => setActiveTab('CATALOGUE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'CATALOGUE'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🏛️</span> Capstone Catalogue ({catalogueItems.length})
        </button>

        <button
          onClick={() => setActiveTab('CLOSE_SESSION')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'CLOSE_SESSION'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🔒</span> Close Session &amp; Archival
        </button>
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

      {/* ==================================================== */}
      {/* TAB 1: 4-STEP DECISION BOARD */}
      {/* ==================================================== */}
      {activeTab === 'DECISION_BOARD' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">Evaluated Groups</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</p>
            </div>
            <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 shadow-sm">
              <span className="text-xs text-emerald-700 font-semibold">Fully Qualified</span>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{summary.qualified}</p>
            </div>
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-sm">
              <span className="text-xs text-amber-700 font-semibold">Pending / In Progress</span>
              <p className="text-2xl font-bold text-amber-700 mt-1">{summary.pending}</p>
            </div>
            <div className="bg-red-50/60 p-4 rounded-xl border border-red-200 shadow-sm">
              <span className="text-xs text-red-700 font-semibold">Criteria Not Met</span>
              <p className="text-2xl font-bold text-red-700 mt-1">{summary.failed}</p>
            </div>
            <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 shadow-sm">
              <span className="text-xs text-purple-700 font-semibold">Confirmed Capstones</span>
              <p className="text-2xl font-bold text-purple-700 mt-1">{summary.confirmedDecisions}</p>
            </div>
          </div>

          {/* 4-Step Rules Banner */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-purple-950 mb-2">
              Washington Accord Capstone Criteria (HITK ECE Standard)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-slate-700">
              <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
                <span className="font-bold text-purple-800 block mb-1">Step 1: Topic Screening</span>
                <span>WP1 ≥ 2, 3+ other WPs ≥ 2, 2+ EAs ≥ 2, and SDG target named.</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
                <span className="font-bold text-purple-800 block mb-1">Step 2: Sem 7 Panel Average</span>
                <span>Rubric D average: Novelty ≥ 5/7, Realistic ≥ 5/7, Impact ≥ 2/3.</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
                <span className="font-bold text-purple-800 block mb-1">Step 3: Sem 8 External Defense</span>
                <span>Rubric F external: Novelty ≥ 6/8, Realistic ≥ 6/8, Impact ≥ 2/3.</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
                <span className="font-bold text-purple-800 block mb-1">Step 4: Complexity Sign-off</span>
                <span>Supervisor declaration confirmed for unassessed WP/EA attributes.</span>
              </div>
            </div>
          </div>

          {/* Groups Evaluation Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-sm text-slate-800">
                Evaluation Scorecard &amp; Decision Records
              </h3>
              <span className="text-xs text-slate-500 font-medium">{groups.length} Groups Evaluated</span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2" />
                Loading capstone evaluations...
              </div>
            ) : groups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No project groups found for this batch.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Group / Batch</th>
                      <th className="py-3 px-4">Topic &amp; Supervisor</th>
                      <th className="py-3 px-4 text-center">Step 1 (Qualify)</th>
                      <th className="py-3 px-4 text-center">Step 2 (Sem 7 Panel)</th>
                      <th className="py-3 px-4 text-center">Step 3 (Sem 8 External)</th>
                      <th className="py-3 px-4 text-center">Step 4 (Declared)</th>
                      <th className="py-3 px-4 text-center">Engine Status</th>
                      <th className="py-3 px-4 text-center">Admin Decision</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groups.map((g) => {
                      const evalRes = g.evaluation;
                      const isDecisionConfirmed = g.decision?.status === 'CONFIRMED';
                      const isHold = g.decision?.status === 'HOLD';

                      return (
                        <tr key={g.groupId} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            <div>Group {g.groupNumber}</div>
                            <span className="text-[10px] text-slate-500 font-normal">Batch {g.batchId}</span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900 truncate" title={g.topicTitle}>
                              {g.topicTitle}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {g.topicCode} • {g.supervisorName}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {evalRes.step1.passed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Qualifies
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800" title={evalRes.step1.details}>
                                ✕ No
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {evalRes.step2.passed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Passed
                              </span>
                            ) : g.dScoresSummary ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800" title={evalRes.step2.details}>
                                ✕ Below
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Pending Marks</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {evalRes.step3.passed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Passed
                              </span>
                            ) : g.fScoreSummary ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800" title={evalRes.step3.details}>
                                ✕ Below
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Pending Marks</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {evalRes.step4.passed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Confirmed
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeclarationGroup(g)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                              >
                                Sign off
                              </button>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {evalRes.isCapstone ? (
                              <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-emerald-600 text-white shadow-xs">
                                🌟 Capstone
                              </span>
                            ) : evalRes.status === 'PENDING' ? (
                              <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                                Pending
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                                Standard
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isDecisionConfirmed ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                Endorsed Capstone
                              </span>
                            ) : isHold ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                                On Hold
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Not Endorsed</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleOpenReview(g)}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                            >
                              Review &amp; Endorse
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: PERMANENT CAPSTONE CATALOGUE */}
      {/* ==================================================== */}
      {activeTab === 'CATALOGUE' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-800/80 text-purple-200 border border-purple-700">
                  Permanent Capstone Archive (Kept Forever)
                </span>
                <h2 className="text-xl font-bold mt-2">Department Capstone Project Catalogue</h2>
                <p className="text-xs text-purple-200 mt-1 max-w-2xl">
                  Curated repository of all validated Capstone Projects across graduating batches. These records are permanently preserved and exempt from 4-year archival purge.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search by title, student, supervisor..."
                  value={catalogueSearch}
                  onChange={(e) => setCatalogueSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white/10 text-white placeholder-purple-300 border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-400 w-full md:w-64"
                />
                <select
                  value={catalogueBatchFilter}
                  onChange={(e) => setCatalogueBatchFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white text-slate-800 border border-slate-300 focus:outline-none"
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
          </div>

          {loadingCatalogue ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
              <div className="animate-spin w-7 h-7 border-3 border-purple-600 border-t-transparent rounded-full mx-auto mb-2" />
              Loading permanent capstone catalogue...
            </div>
          ) : filteredCatalogue.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
              No capstone projects found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCatalogue.map((item) => (
                <div
                  key={item.topicId}
                  className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                          {item.projectCode}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                          Batch {item.batchId} • Group {item.groupNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          🏛️ Decided: {item.decisionYear}
                        </span>
                      </div>
                      <h3
                        onClick={() => handleOpenDetailReport(item.topicId)}
                        className="font-bold text-slate-900 text-base mt-2 hover:text-purple-600 cursor-pointer transition-colors"
                        title="Click to view full attainment detail report"
                      >
                        {item.projectTitle}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{item.domain}</p>
                    </div>
                  </div>

                  {/* Supervisor & Students */}
                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="font-semibold text-slate-500">Supervisor:</span>
                      <span className="font-medium">{item.supervisor.name}</span>
                      <span className="text-slate-400 text-[11px]">({item.supervisor.email})</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="font-semibold text-slate-500">Team:</span>
                      {item.students.map((s) => (
                        <span
                          key={s.roll}
                          className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[11px] font-medium"
                        >
                          {s.name} ({s.roll})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Proposal Attributes & SDGs */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Proposal Attributes (WA Levels)
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {item.proposalAttributes.map((a) => (
                          <span
                            key={a.code}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                            title={a.reason || a.title}
                          >
                            {a.code}: Level {a.level}
                          </span>
                        ))}
                      </div>
                    </div>

                    {item.proposalSdgs.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Mapped SDGs
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.proposalSdgs.map((s) => (
                            <span
                              key={s.code}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                              title={`${s.target} - ${s.reason || ''}`}
                            >
                              🌍 {s.code}: {s.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action */}
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => handleOpenDetailReport(item.topicId)}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <span>📊 View Full Attainment Report</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: CLOSE SESSION & BATCH ARCHIVAL */}
      {/* ==================================================== */}
      {activeTab === 'CLOSE_SESSION' && (
        <div className="space-y-6">
          {/* Batch Selector & Actions Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Batch Close Session &amp; Archival Protocol</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Once all 8th semester marks are submitted by faculty, lock the batch session and archive it permanently to optimized cold storage with zero expiration.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">Select Batch:</label>
                <select
                  value={closeSessionBatch}
                  onChange={(e) => setCloseSessionBatch(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-purple-500"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Batch {b.id} {b.isLocked ? '🔒 [Locked]' : ''} {b.isArchived ? '🗄️ [Archived]' : ''}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => loadSem8Status(closeSessionBatch)}
                  disabled={loadingSem8Status}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  {loadingSem8Status ? 'Checking...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Semester 8 Marks Status Banner */}
            {sem8Status && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-xs text-slate-500 font-medium">Total Groups in Batch</span>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{sem8Status.totalGroups}</p>
                  </div>
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                    <span className="text-xs text-emerald-700 font-semibold">Sem 8 Marks Completed</span>
                    <p className="text-2xl font-bold text-emerald-800 mt-1">
                      {sem8Status.completedGroups} / {sem8Status.totalGroups}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50">
                    <span className="text-xs text-purple-700 font-semibold">Batch Lock Status</span>
                    <p className="text-xl font-bold text-purple-900 mt-1">
                      {sem8Status.isLocked ? '🔒 Locked (Read-Only)' : '🔓 Open (Editable)'}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5 font-semibold">
                    <span className="text-slate-700">Semester 8 Faculty Marks Progress</span>
                    <span className="text-purple-700">
                      {sem8Status.totalGroups > 0
                        ? Math.round((sem8Status.completedGroups / sem8Status.totalGroups) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          sem8Status.totalGroups > 0
                            ? (sem8Status.completedGroups / sem8Status.totalGroups) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* Status Notice */}
                {sem8Status.isComplete ? (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3">
                    <span className="text-base">✓</span>
                    <div>
                      <strong className="block text-sm">All 8th Semester Marks Completed!</strong>
                      All faculty have submitted external and supervisor evaluations. You may now close and lock the batch session.
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
                    <div className="font-bold flex items-center gap-2 text-sm">
                      <span>⚠️</span> Pending 8th Semester Marks ({sem8Status.pendingGroups.length} Groups)
                    </div>
                    <p>
                      The following groups are still awaiting 8th semester mark entries from supervisors or external examiners:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {sem8Status.pendingGroups.map((p) => (
                        <div
                          key={p.groupNumber}
                          className="bg-white p-2.5 rounded-lg border border-amber-200 text-[11px]"
                        >
                          <strong>Group {p.groupNumber}</strong>: {p.topicTitle}
                          <div className="text-slate-500 mt-0.5">
                            Supervisor: {p.supervisorName} ({p.supervisorEmail})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions: Close Session / Unlock Session / Archive Batch */}
            {sem8Status && (
              <div className="pt-6 border-t border-slate-100 space-y-6">
                {/* 1. Close / Unlock Session Action */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      {sem8Status.isLocked ? '🔒 Session Locked' : '🔓 Session Open'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      {sem8Status.isLocked
                        ? `Locked on ${
                            sem8Status.lockedAt ? new Date(sem8Status.lockedAt).toLocaleDateString() : 'N/A'
                          }. All marks are frozen. Unlocking requires your Admin login password.`
                        : 'Initiating Close Session locks all marks, group allocations, and rubrics for this batch into read-only mode.'}
                    </p>
                  </div>

                  <div>
                    {sem8Status.isLocked ? (
                      <button
                        onClick={() => {
                          setUnlockPassword('');
                          setUnlockError(null);
                          setUnlockModalOpen(true);
                        }}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
                      >
                        <span>🔑 Unlock Batch Session</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleCloseSession}
                        disabled={closingSession}
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-2"
                      >
                        <span>🔒 {closingSession ? 'Closing...' : 'Close Session & Lock Batch'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Archive Batch & Google Drive Cold Storage Action */}
                <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-200 space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h4 className="font-bold text-sm text-purple-950 flex items-center gap-2">
                        <span>🗄️</span> Permanent Session Archival &amp; Google Drive Cold Storage
                      </h4>
                      <ul className="text-xs text-purple-800 mt-1.5 space-y-1 list-disc list-inside">
                        <li>
                          <strong>Permanent Retention:</strong> All project dossiers and student rolls are <strong>retained permanently</strong> with zero expiration (no 4-year deletion).
                        </li>
                        <li>
                          <strong>Google Drive Archive:</strong> Standalone static Academic Report uploaded to <strong>ECE Committee Drive</strong> (15 GB free space).
                        </li>
                        <li>
                          <strong>Student Accounts:</strong> Graduating student login credentials are <strong>permanently deleted</strong> to eliminate unused accounts.
                        </li>
                        <li>
                          <strong>Faculty Retention:</strong> All faculty supervisor accounts and directory records are <strong>strictly preserved</strong>.
                        </li>
                        <li>
                          <strong>Database Space:</strong> Granular database operational rows purged, optimizing DB space by <strong>~98%</strong>.
                        </li>
                      </ul>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 self-start md:self-auto items-start sm:items-center">
                      {sem8Status.archiveDriveFileUrl && (
                        <a
                          href={sem8Status.archiveDriveFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
                        >
                          <span>📁 Open Drive Archive Report</span>
                        </a>
                      )}

                      {/* Archive Button with strict enablement */}
                      {(() => {
                        const canArchive = !!(sem8Status && sem8Status.isComplete && sem8Status.isLocked && !sem8Status.isArchived);
                        return (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={handleInitiateArchive}
                              disabled={!canArchive || archivingBatch}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 ${
                                canArchive
                                  ? 'bg-purple-700 hover:bg-purple-800 text-white cursor-pointer ring-2 ring-purple-400'
                                  : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-75'
                              }`}
                              title={
                                !canArchive
                                  ? sem8Status.isArchived
                                    ? 'Batch is already archived.'
                                    : !sem8Status.isComplete
                                    ? 'All 8th semester marks must be submitted by supervisors first.'
                                    : !sem8Status.isLocked
                                    ? 'Admin must first confirm marks by clicking "Close Session & Lock Batch" above.'
                                    : 'Archive option locked.'
                                  : 'Archive batch and backup report to Google Drive'
                              }
                            >
                              <span>
                                {sem8Status.isArchived
                                  ? '✓ Batch Archived'
                                  : canArchive
                                  ? '🗄️ Archive Batch to Drive'
                                  : '🔒 Archive Option Locked'}
                              </span>
                            </button>

                            {/* Helper Explanation why button is disabled */}
                            {!canArchive && !sem8Status.isArchived && (
                              <span className="text-[10px] text-purple-900 font-semibold max-w-xs">
                                {!sem8Status.isComplete
                                  ? `⚠️ Disabled: Waiting for all supervisors to submit 8th semester marks (${sem8Status.pendingGroups.length} pending).`
                                  : !sem8Status.isLocked
                                  ? '⚠️ Disabled: Admin must first click "Close Session & Lock Batch" above to confirm marks.'
                                  : ''}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {sem8Status.archiveDriveFileUrl && (
                    <div className="p-3 bg-white rounded-xl border border-purple-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                      <div className="text-purple-900">
                        <strong className="block text-[11px] text-purple-700 uppercase tracking-wider">Permanent Cold Storage Link:</strong>
                        <span className="text-[11px] font-mono text-slate-600 truncate max-w-md block">
                          {sem8Status.archiveDriveFileUrl}
                        </span>
                      </div>
                      <a
                        href={sem8Status.archiveDriveFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-purple-700 hover:text-purple-900 underline whitespace-nowrap"
                      >
                        View in Google Drive ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: PASSWORD UNLOCK BATCH */}
      {/* ==================================================== */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>🔑</span> Admin Password Required
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unlock Batch {closeSessionBatch} to re-enable mark editing.
                </p>
              </div>
              <button
                onClick={() => setUnlockModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              To prevent accidental tampering of finalized academic records, please verify your Project Committee Admin login password:
            </p>

            <div className="space-y-2">
              <input
                type="password"
                placeholder="Enter your Admin login password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockSession()}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />

              {unlockError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                  {unlockError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setUnlockModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlockSession}
                disabled={unlocking}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {unlocking ? 'Verifying...' : 'Unlock Batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: SECURE BATCH ARCHIVAL PROTOCOL (2-STEP VERIFICATION) */}
      {/* ==================================================== */}
      {archiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-100 text-purple-800 text-base">
                  🗄️
                </span>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {archiveStep === 'WARNING'
                      ? 'Confirm Session Archival & Cold Storage'
                      : 'Security Verification: Admin Authorization'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Graduating Batch {closeSessionBatch} • Permanent Archive Protocol
                  </p>
                </div>
              </div>
              <button
                onClick={() => setArchiveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {archiveStep === 'WARNING' ? (
              /* Step 1: Warning & Notification */
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-sm text-amber-950">
                    <span>⚠️</span> Permanent Archival Decision Notice
                  </div>
                  <p>
                    Archiving a batch is an irreversible and critical operation. Please review the following impacts carefully:
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 pt-1 text-amber-800">
                    <li>
                      <strong>Permanent Academic Dossier:</strong> A standalone, printable NBA SAR Academic Archive dossier will be saved permanently to the ECE Project Committee Google Drive (<span className="font-mono">ece.project.committee@heritageit.edu</span>).
                    </li>
                    <li>
                      <strong>Permanent Retention (No 4-Year Deletion):</strong> All project dossiers, student names, roll numbers, attributes, badges, and PO attainments are retained <strong>permanently with zero expiration</strong>.
                    </li>
                    <li>
                      <strong>Student Accounts Deleted:</strong> Login credentials of graduating students from Batch {closeSessionBatch} will be <strong>permanently purged</strong> to eliminate unused login accounts.
                    </li>
                    <li>
                      <strong>Faculty Accounts Retained:</strong> All faculty supervisor profiles, committee records, and directories are <strong>strictly preserved</strong>.
                    </li>
                    <li>
                      <strong>Capstone Projects Preserved:</strong> Confirmed Capstone projects will remain permanently accessible in the <strong>Capstone Catalogue</strong> and <strong>Archived Projects</strong> repository.
                    </li>
                    <li>
                      <strong>Database Optimization:</strong> Historical granular marks, members, and forum rows are cleaned up, freeing database quota.
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setArchiveModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setArchiveStep('VERIFY');
                      setArchiveError(null);
                    }}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    I Understand &amp; Agree (Proceed to Verification) &rarr;
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2: Security Challenge (Copy-Paste Sentence + Admin Password) */
              <div className="space-y-4 text-xs">
                <p className="text-slate-600">
                  To prevent unauthorized or accidental archival, please complete the dual-factor authorization below:
                </p>

                {/* Safety Confirmation Sentence */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700">
                      1. Copy &amp; Paste the Generated Security Sentence:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const sentence = getBatchArchiveConfirmationSentence(closeSessionBatch);
                        navigator.clipboard.writeText(sentence);
                        setCopiedSentence(true);
                        setTimeout(() => setCopiedSentence(false), 2500);
                      }}
                      className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2.5 py-0.5 rounded-lg border border-purple-200 transition-colors flex items-center gap-1"
                    >
                      {copiedSentence ? '✓ Copied to Clipboard!' : '📋 Copy Sentence'}
                    </button>
                  </div>

                  <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl font-mono text-[11px] text-slate-900 select-all break-all">
                    {getBatchArchiveConfirmationSentence(closeSessionBatch)}
                  </div>

                  <input
                    type="text"
                    placeholder="Paste the sentence here exactly as shown above"
                    value={archiveSentenceInput}
                    onChange={(e) => setArchiveSentenceInput(e.target.value)}
                    className={`w-full text-xs p-2.5 border rounded-xl focus:outline-none focus:ring-2 ${
                      archiveSentenceInput.trim().toUpperCase() ===
                      getBatchArchiveConfirmationSentence(closeSessionBatch).toUpperCase()
                        ? 'border-emerald-400 bg-emerald-50/30 focus:ring-emerald-500'
                        : 'border-slate-300 focus:ring-purple-500'
                    }`}
                  />
                  {archiveSentenceInput.trim().toUpperCase() ===
                    getBatchArchiveConfirmationSentence(closeSessionBatch).toUpperCase() && (
                    <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      ✓ Confirmation sentence verified
                    </p>
                  )}
                </div>

                {/* Admin Password */}
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    2. Admin Login Password:
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your admin login password"
                    value={archivePassword}
                    onChange={(e) => setArchivePassword(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      archiveSentenceInput.trim().toUpperCase() ===
                        getBatchArchiveConfirmationSentence(closeSessionBatch).toUpperCase() &&
                      archivePassword &&
                      handleConfirmArchive()
                    }
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                {archiveError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                    {archiveError}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <button
                    onClick={() => setArchiveStep('WARNING')}
                    disabled={archivingBatch}
                    className="px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    &larr; Back
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setArchiveModalOpen(false)}
                      disabled={archivingBatch}
                      className="px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={handleConfirmArchive}
                      disabled={
                        archivingBatch ||
                        archiveSentenceInput.trim().toUpperCase() !==
                          getBatchArchiveConfirmationSentence(closeSessionBatch).toUpperCase() ||
                        !archivePassword
                      }
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {archivingBatch ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Archiving &amp; Uploading...
                        </>
                      ) : (
                        'Confirm & Execute Archival'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: FULL CAPSTONE PROJECT DETAIL REPORT */}
      {/* ==================================================== */}
      {detailReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                    🏛️ Capstone Catalogue Detail Report
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Decision Year: {detailReport.decisionYear}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    Batch {detailReport.batchId} • Group {detailReport.groupNumber}
                  </span>
                </div>
                <h3 className="font-bold text-xl text-slate-900 mt-2">
                  {detailReport.projectTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Code: {detailReport.projectCode} • Domain: {detailReport.domain}
                </p>
              </div>
              <button
                onClick={() => setDetailReport(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Team & Supervisor Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Faculty Supervisor
                </span>
                <p className="font-bold text-sm text-slate-900">{detailReport.supervisor.name}</p>
                <p className="text-xs text-slate-500">{detailReport.supervisor.email}</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Student Team Members &amp; Badges
                </span>
                <div className="space-y-1.5 mt-1">
                  {detailReport.students.map((st) => (
                    <div key={st.id} className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-800">
                        {st.name} <span className="text-slate-400">({st.roll})</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {st.badges.diamonds > 0 && <span title="Diamond Badges">💎×{st.badges.diamonds}</span>}
                        {st.badges.gold > 0 && <span title="Gold Badges">🥇×{st.badges.gold}</span>}
                        {st.badges.silver > 0 && <span title="Silver Badges">🥈×{st.badges.silver}</span>}
                        {st.badges.copper > 0 && <span title="Copper Badges">🥉×{st.badges.copper}</span>}
                        {st.badges.iron > 0 && <span title="Iron Badges">⚙️×{st.badges.iron}</span>}
                        {st.badges.totalBadgesCount === 0 && (
                          <span className="text-[10px] text-slate-400">0 badges</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Proposal Attributes & SDGs */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                Proposal Washington Accord &amp; SDG Profile
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                  <span className="font-bold text-blue-900 block">Proposal Attributes (WP, WK, EA)</span>
                  <div className="space-y-1">
                    {detailReport.proposalAttributes.map((a) => (
                      <div key={a.code} className="flex justify-between items-start text-[11px]">
                        <div>
                          <strong>{a.code}</strong>: {a.title}
                          {a.reason && <p className="text-slate-500 text-[10px] italic">{a.reason}</p>}
                        </div>
                        <span className="font-bold text-blue-800 ml-2">Level {a.level}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                  <span className="font-bold text-emerald-900 block">Mapped Sustainable Development Goals</span>
                  <div className="space-y-1.5">
                    {detailReport.proposalSdgs.map((s) => (
                      <div key={s.code} className="text-[11px]">
                        <strong>🌍 {s.code}: {s.title}</strong>
                        <p className="text-emerald-800 text-[10px]">Target: {s.target}</p>
                        {s.reason && <p className="text-slate-500 text-[10px] italic">{s.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Attainment Breakdown Tabs */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-sm text-slate-900">Attainment Evaluation Breakdown</h4>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setReportDetailTab('OVERALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      reportDetailTab === 'OVERALL'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Overall
                  </button>
                  <button
                    onClick={() => setReportDetailTab('SEM6')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      reportDetailTab === 'SEM6'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sem 6
                  </button>
                  <button
                    onClick={() => setReportDetailTab('SEM7')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      reportDetailTab === 'SEM7'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sem 7
                  </button>
                  <button
                    onClick={() => setReportDetailTab('SEM8')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      reportDetailTab === 'SEM8'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sem 8
                  </button>
                </div>
              </div>

              {/* Attainment Data Rendering */}
              {(() => {
                const currentData =
                  reportDetailTab === 'OVERALL'
                    ? detailReport.overallAttainments
                    : detailReport.semesterBreakdowns.find(
                        (b) =>
                          b.semester ===
                          (reportDetailTab === 'SEM6' ? 6 : reportDetailTab === 'SEM7' ? 7 : 8)
                      ) || detailReport.overallAttainments;

                return (
                  <div className="space-y-4">
                    {/* Program Outcomes (PO1 to PO11) */}
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-2">
                        Program Outcomes (PO1 to PO11)
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {currentData.pos.map((p) => (
                          <div
                            key={p.code}
                            className={`p-2.5 rounded-xl border text-xs ${
                              p.isAttained
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-center font-bold">
                              <span>{p.code}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  p.level >= 2
                                    ? 'bg-emerald-600 text-white'
                                    : p.level === 1
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-300 text-slate-700'
                                }`}
                              >
                                L{p.level}
                              </span>
                            </div>
                            <div className="text-base font-bold text-slate-800 mt-1">{p.percentage}%</div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  p.level >= 2
                                    ? 'bg-emerald-500'
                                    : p.level === 1
                                    ? 'bg-blue-500'
                                    : 'bg-slate-400'
                                }`}
                                style={{ width: `${Math.min(p.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Washington Accord WP, WK, EA */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="font-bold text-slate-800 block">Complex Problems (WP1-WP7)</span>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {currentData.wps.map((w) => (
                            <div key={w.code} className="flex justify-between items-center text-[11px]">
                              <span>{w.code}</span>
                              <span className="font-bold">{w.percentage}% (L{w.level})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="font-bold text-slate-800 block">Engineering Knowledge (WK1-WK9)</span>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {currentData.wks.map((w) => (
                            <div key={w.code} className="flex justify-between items-center text-[11px]">
                              <span>{w.code}</span>
                              <span className="font-bold">{w.percentage}% (L{w.level})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="font-bold text-slate-800 block">Engineering Activities (EA1-EA5)</span>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {currentData.eas.map((e) => (
                            <div key={e.code} className="flex justify-between items-center text-[11px]">
                              <span>{e.code}</span>
                              <span className="font-bold">{e.percentage}% (L{e.level})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                onClick={() => setDetailReport(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Endorse Modal (Decision Board) */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Project Committee Review &amp; Endorsement
                </h4>
                <p className="text-xs text-slate-500">Group {selectedGroup.groupNumber} - {selectedGroup.topicCode}</p>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <strong className="block text-slate-800">Title:</strong>
                <p className="text-slate-600">{selectedGroup.topicTitle}</p>
              </div>

              <div>
                <strong className="block text-slate-800">Automated 4-Step Engine Status:</strong>
                <p className="text-slate-600">
                  {selectedGroup.evaluation.isCapstone
                    ? '🌟 All 4 Washington Accord criteria passed.'
                    : `⚠️ Criteria pending: ${selectedGroup.evaluation.summary}`}
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Committee Endorsement Notes:</label>
                <textarea
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  rows={3}
                  placeholder="Add evaluation comments, external examiner remarks, or conditions..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setSelectedGroup(null)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDecision('HOLD')}
                disabled={submittingDecision}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
              >
                Put on Hold
              </button>
              <button
                onClick={() => handleConfirmDecision('CONFIRMED')}
                disabled={submittingDecision}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {submittingDecision ? 'Saving...' : 'Endorse & Confirm Capstone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complexity Declaration Modal */}
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
