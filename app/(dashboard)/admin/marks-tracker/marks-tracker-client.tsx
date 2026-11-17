'use client';

import { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import {
  getMarksTrackerAction,
  toggleMarkWindowLockAction,
  updateMarkWindowDeadlineAction,
  sendSupervisorReminderAction,
  sendBulkRemindersAction,
  getAdminSemesterMarksExportAction,
  RubricCompletionStat,
  SupervisorTrackerStat,
} from '@/app/actions/tracker';
import {
  generateSemesterMarksPdfBlob,
  MarksExportFormat,
} from '@/components/marks-export-pdf';

export default function AdminMarksTrackerClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [batches, setBatches] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [selectedSemester, setSelectedSemester] = useState<number | undefined>(undefined);

  const [windows, setWindows] = useState<any[]>([]);
  const [rubricStats, setRubricStats] = useState<RubricCompletionStat[]>([]);
  const [supervisorStats, setSupervisorStats] = useState<SupervisorTrackerStat[]>([]);
  const [recentReminders, setRecentReminders] = useState<any[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<MarksExportFormat>('EXISTING');
  const [exportingType, setExportingType] = useState<'xlsx' | 'pdf' | null>(null);

  async function loadData(batch = selectedBatch, semester = selectedSemester) {
    setLoading(true);
    setError(null);
    const res = await getMarksTrackerAction(batch, semester);

    if (res.error) {
      setError(res.error);
    } else {
      setBatches(res.batches || []);
      setWindows(res.windows || []);
      setRubricStats(res.rubricStats || []);
      setSupervisorStats(res.supervisorStats || []);
      setRecentReminders(res.recentReminders || []);
      setTotalGroups(res.totalGroups || 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedBatch, selectedSemester);
  }, [selectedBatch, selectedSemester]);

  // Toggle Window Lock
  async function handleToggleLock(windowId: string, currentLocked: boolean) {
    setActionLoadingId(windowId);
    setError(null);

    const res = await toggleMarkWindowLockAction(windowId, !currentLocked);
    setActionLoadingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Marking window ${!currentLocked ? 'LOCKED' : 'UNLOCKED'} successfully.`);
      loadData(selectedBatch, selectedSemester);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Update Deadline
  async function handleUpdateDeadline(windowId: string, newDateStr: string) {
    if (!newDateStr) return;
    setActionLoadingId(`date-${windowId}`);
    setError(null);

    const res = await updateMarkWindowDeadlineAction(windowId, newDateStr);
    setActionLoadingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg('Deadline updated successfully.');
      loadData(selectedBatch, selectedSemester);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Send Single Reminder
  async function handleSendReminder(supervisorId: string, semester: number, groupsCount: number) {
    setActionLoadingId(`rem-${supervisorId}`);
    setError(null);

    const res = await sendSupervisorReminderAction({ supervisorId, semester, groupsCount });
    setActionLoadingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Reminder sent!');
      loadData(selectedBatch, selectedSemester);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // Bulk Remind All
  async function handleBulkRemind() {
    const targetSem = selectedSemester || 6;
    setBulkLoading(true);
    setError(null);

    const res = await sendBulkRemindersAction(targetSem);
    setBulkLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Bulk reminders dispatched!');
      loadData(selectedBatch, selectedSemester);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  }

  async function handleDownloadSemesterMarks(fileType: 'xlsx' | 'pdf') {
    if (!selectedBatch || selectedBatch === 'ALL' || !selectedSemester) {
      setError('Please select a specific Batch and Semester (6, 7, or 8) to download marks.');
      return;
    }

    setExportingType(fileType);
    setError(null);

    const res = await getAdminSemesterMarksExportAction(selectedBatch, selectedSemester);
    if ('error' in res) {
      setError(res.error);
      setExportingType(null);
      return;
    }

    const formatTag =
      exportFormat === 'EXISTING'
        ? 'Existing_Format'
        : exportFormat === 'SCALE_100'
        ? 'Scale_100'
        : 'Scale_60_40';

    try {
      if (fileType === 'pdf') {
        const blob = await generateSemesterMarksPdfBlob(res, exportFormat);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Batch_${res.batchId}_Sem${res.semester}_Marks_${formatTag}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'HITK ECE Project Committee';
        const sheet = wb.addWorksheet(`Sem ${res.semester} Marks`);

        const headers =
          exportFormat === 'EXISTING'
            ? [
                'Group No',
                'Student Name',
                'College Roll',
                'University Roll',
                `Supervisor Marks (/${res.supMax})`,
                `Examiner Marks (/${res.examMax})`,
                `Total Marks (/${res.rawMax})`,
              ]
            : exportFormat === 'SCALE_100'
            ? [
                'Group No',
                'Student Name',
                'College Roll',
                'University Roll',
                'Combined Total Marks (Out of 100)',
              ]
            : [
                'Group No',
                'Student Name',
                'College Roll',
                'University Roll',
                'Total Marks (Out of 100)',
                '60% Component (Out of 60)',
                '40% Component (Out of 40)',
              ];

        const lastCol = String.fromCharCode(64 + headers.length);
        sheet.mergeCells(`A1:${lastCol}1`);
        sheet.getCell('A1').value = `HERITAGE INSTITUTE OF TECHNOLOGY, KOLKATA — ECE CAPSTONE SEMESTER ${res.semester} MARKS`;
        sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells(`A2:${lastCol}2`);
        sheet.getCell('A2').value = `Batch: ${res.batchId} | Format: ${formatTag.replace(/_/g, ' ')}`;
        sheet.getCell('A2').font = { italic: true, size: 10 };
        sheet.getCell('A2').alignment = { horizontal: 'center' };

        const headerRow = sheet.addRow(headers);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        });

        for (const r of res.rows) {
          if (exportFormat === 'EXISTING') {
            sheet.addRow([
              r.groupNumber,
              r.studentName,
              r.collegeRoll,
              r.universityRoll,
              r.supervisorMarks,
              r.examinerMarks,
              r.rawTotal,
            ]);
          } else if (exportFormat === 'SCALE_100') {
            sheet.addRow([
              r.groupNumber,
              r.studentName,
              r.collegeRoll,
              r.universityRoll,
              r.totalScale100,
            ]);
          } else {
            sheet.addRow([
              r.groupNumber,
              r.studentName,
              r.collegeRoll,
              r.universityRoll,
              r.totalScale100,
              r.scale60,
              r.scale40,
            ]);
          }
        }

        sheet.columns.forEach((col) => {
          col.width = 22;
        });
        if (sheet.getColumn(1)) sheet.getColumn(1).width = 12;

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Batch_${res.batchId}_Sem${res.semester}_Marks_${formatTag}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    } finally {
      setExportingType(null);
    }
  }

  // Calculate Overall Completion
  const overallAvgCompletion =
    rubricStats.length > 0
      ? Math.round(
          rubricStats.reduce((sum, r) => sum + r.completionRate, 0) / rubricStats.length
        )
      : 0;

  const pendingFacultyCount = supervisorStats.filter((s) => {
    if (selectedSemester === 6) return s.sem6Pending > 0;
    if (selectedSemester === 7) return s.sem7Pending > 0;
    if (selectedSemester === 8) return s.sem8Pending > 0;
    return s.sem6Pending > 0 || s.sem7Pending > 0 || s.sem8Pending > 0;
  }).length;

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
              NBA Criteria 2 &amp; 3
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Marks Completion Tracker &amp; Evaluation Windows
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor real-time evaluation submission across Semesters 6, 7 &amp; 8 (Rubrics A–F), control deadline locking, and dispatch automated reminders.
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall Completion</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{overallAvgCompletion}%</div>
          <span className="text-[11px] text-slate-400">Average across active rubrics</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Windows</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {windows.filter((w) => !w.isLocked).length} / {windows.length}
          </div>
          <span className="text-[11px] text-slate-400">Marking windows open</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Supervisors with Pending</span>
          <div className="text-2xl font-bold text-amber-600 mt-1">{pendingFacultyCount}</div>
          <span className="text-[11px] text-slate-400">Faculty with incomplete entries</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Enrolled Groups</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalGroups}</div>
          <span className="text-[11px] text-slate-400">Total project teams</span>
        </div>
      </div>

      {/* Semester Tab Switcher */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setSelectedSemester(undefined)}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            selectedSemester === undefined
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Semesters (Rubrics A–F)
        </button>
        <button
          onClick={() => setSelectedSemester(6)}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            selectedSemester === 6
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Semester 6 (Rubric A &amp; B)
        </button>
        <button
          onClick={() => setSelectedSemester(7)}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            selectedSemester === 7
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Semester 7 (Rubric C &amp; D)
        </button>
        <button
          onClick={() => setSelectedSemester(8)}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            selectedSemester === 8
              ? 'border-purple-600 text-purple-700 bg-purple-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Semester 8 (Rubric E &amp; F)
        </button>
      </div>

      {/* Rubric Completion Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rubricStats.map((r) => (
          <div key={r.code} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center">
                    {r.code}
                  </span>
                  <span className="text-xs font-bold text-slate-800 truncate max-w-[200px]" title={r.title}>
                    {r.title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Semester {r.semester} • Max {r.maxMarks} Marks
                </p>
              </div>
              <span className="text-base font-bold font-mono text-slate-900">{r.completionRate}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  r.completionRate >= 80
                    ? 'bg-emerald-500'
                    : r.completionRate >= 40
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${r.completionRate}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Completed: <strong className="text-slate-800">{r.completedGroups}</strong></span>
              <span>Partial: <strong className="text-slate-800">{r.partialGroups}</strong></span>
              <span>Pending: <strong className="text-slate-800">{r.pendingGroups}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Admin Semester Marks Download Panel (Excel / PDF in 3 Formats) */}
      {(() => {
        const canSelectSem = Boolean(selectedBatch && selectedBatch !== 'ALL' && selectedSemester);
        const semStats = selectedSemester
          ? rubricStats.filter((r) => r.semester === selectedSemester)
          : [];
        const isSemComplete =
          canSelectSem &&
          semStats.length >= 2 &&
          semStats.every((r) => r.totalGroups > 0 && r.pendingGroups === 0 && r.partialGroups === 0);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Download Semester Marks (Student Name, College Roll &amp; University Roll)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enabled once all supervisors &amp; examiners have submitted marks for the selected Batch &amp; Semester.
                </p>
              </div>
              {!canSelectSem ? (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  Select a specific Batch and Semester (6, 7, or 8) above
                </span>
              ) : isSemComplete ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ All Semester {selectedSemester} Marks Submitted — Ready to Download
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  ⏳ Waiting for all supervisors to submit Semester {selectedSemester} marks
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: 'EXISTING' as MarksExportFormat,
                  title: '1) Existing Format',
                  desc: 'Separated Supervisor marks and Examiner marks + Raw Total.',
                },
                {
                  id: 'SCALE_100' as MarksExportFormat,
                  title: '2) Scale of 100',
                  desc: 'Combined Supervisor + Examiner marks on a 100-point scale.',
                },
                {
                  id: 'SCALE_60_40' as MarksExportFormat,
                  title: '3) Scale of 60 / 40',
                  desc: 'Total (/100) plus two separate columns for 60% and 40% of total.',
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                    exportFormat === opt.id
                      ? 'bg-blue-50/70 border-blue-400 ring-1 ring-blue-300'
                      : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="marksExportFormat"
                    checked={exportFormat === opt.id}
                    onChange={() => setExportFormat(opt.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">{opt.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={!isSemComplete || exportingType !== null}
                onClick={() => handleDownloadSemesterMarks('xlsx')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exportingType === 'xlsx' ? 'Generating Excel...' : '📊 Download Excel (.xlsx)'}
              </button>
              <button
                type="button"
                disabled={!isSemComplete || exportingType !== null}
                onClick={() => handleDownloadSemesterMarks('pdf')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exportingType === 'pdf' ? 'Generating PDF...' : '📄 Download PDF (.pdf)'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Marking Windows Admin Control Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Evaluation Windows &amp; Deadline Lock Configuration</h3>
            <p className="text-xs text-slate-500">
              When locked, faculty members cannot submit or modify marks for that rubric.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Rubric Code</th>
                <th className="px-6 py-3">Semester</th>
                <th className="px-6 py-3">Current Deadline</th>
                <th className="px-6 py-3 text-center">Window State</th>
                <th className="px-6 py-3 text-right">Lock / Unlock Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {windows.map((w) => {
                const isActionLoading = actionLoadingId === w.id;
                const isDateLoading = actionLoadingId === `date-${w.id}`;
                const dDate = new Date(w.deadline);
                const isPast = dDate.getTime() < Date.now();
                const isoDateStr = !isNaN(dDate.getTime()) ? dDate.toISOString().split('T')[0] : '';

                return (
                  <tr key={w.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-3.5 font-bold font-mono text-slate-900">
                      Rubric {w.rubric}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-700">Semester {w.semester}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            key={isoDateStr}
                            defaultValue={isoDateStr}
                            disabled={isDateLoading}
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUpdateDeadline(w.id, e.target.value);
                              }
                            }}
                            className="px-2.5 py-1 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 shadow-sm hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer disabled:opacity-50"
                            title="Click to open calendar and set deadline"
                          />
                        </div>
                        {isDateLoading ? (
                          <span className="text-[10px] text-purple-600 font-semibold animate-pulse whitespace-nowrap">
                            Saving...
                          </span>
                        ) : isPast && !w.isLocked ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                            Deadline Passed
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          w.isLocked
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {w.isLocked ? 'LOCKED' : 'OPEN'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => handleToggleLock(w.id, w.isLocked)}
                        disabled={isActionLoading}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 ${
                          w.isLocked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                        }`}
                      >
                        {isActionLoading ? 'Updating...' : w.isLocked ? 'Unlock Window' : 'Lock Window'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supervisor Marks Submission Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Supervisor Marks Completion Matrix</h3>
            <p className="text-xs text-slate-500">
              Audit marks submission by faculty supervisor across allotted groups.
            </p>
          </div>

          <button
            onClick={handleBulkRemind}
            disabled={bulkLoading}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            {bulkLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Dispatching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Remind All Pending Faculty
              </>
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3">Supervisor</th>
                <th className="px-4 py-3 text-center">Groups</th>
                <th className="px-3 py-3 text-center">Rubric A</th>
                <th className="px-3 py-3 text-center">Rubric B</th>
                <th className="px-3 py-3 text-center">Rubric C</th>
                <th className="px-3 py-3 text-center">Rubric D</th>
                <th className="px-3 py-3 text-center">Rubric E</th>
                <th className="px-3 py-3 text-center">Rubric F</th>
                <th className="px-6 py-3 text-center">Last Reminder</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {supervisorStats.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-slate-400">
                    No supervisors found.
                  </td>
                </tr>
              ) : (
                supervisorStats.map((s) => {
                  const isReminding = actionLoadingId === `rem-${s.supervisorId}`;
                  const hasPending = s.sem6Pending > 0 || s.sem7Pending > 0 || s.sem8Pending > 0;

                  function getBadge(status: string) {
                    if (status === 'COMPLETE') {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">DONE</span>;
                    }
                    if (status === 'PARTIAL') {
                      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">PARTIAL</span>;
                    }
                    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">PENDING</span>;
                  }

                  return (
                    <tr key={s.supervisorId} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.email}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold font-mono text-slate-800">{s.groupCount}</span>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                          Grps: {s.groupNumbers.join(', ')}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.A)}</td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.B)}</td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.C)}</td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.D)}</td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.E)}</td>
                      <td className="px-3 py-4 text-center">{getBadge(s.rubricStatus.F)}</td>
                      <td className="px-6 py-4 text-center text-slate-500 font-mono text-[11px]">
                        {s.lastReminderSent
                          ? new Date(s.lastReminderSent).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {hasPending ? (
                          <button
                            onClick={() =>
                              handleSendReminder(s.supervisorId, selectedSemester || 6, s.groupCount)
                            }
                            disabled={isReminding}
                            className="px-3 py-1 bg-white hover:bg-slate-100 text-purple-700 border border-purple-300 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {isReminding ? 'Sending...' : 'Send Reminder'}
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-600">Complete</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
