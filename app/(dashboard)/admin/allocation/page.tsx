'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import {
  RawAllocationRow,
  ValidationReport,
  validateAllocationDataAction,
  commitAllocationChunkAction,
  getAllocationSummaryAction,
} from '@/app/actions/allocation';
import {
  getAdminDirectoryDataAction,
  StudentGroupItem,
} from '@/app/actions/admin-directory';

export default function AdminAllocationPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<RawAllocationRow[]>([]);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ingestion tracking
  const [commitProgress, setCommitProgress] = useState(0);
  const [committedCount, setCommittedCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // Summary Metrics & Student-Group Roster
  const [summary, setSummary] = useState<{
    totalGroups: number;
    totalBatches: number;
    totalStudents: number;
  }>({ totalGroups: 0, totalBatches: 0, totalStudents: 0 });
  const [studentRoster, setStudentRoster] = useState<StudentGroupItem[]>([]);
  const [batchesList, setBatchesList] = useState<{ id: string; active: boolean }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [rosterLoading, setRosterLoading] = useState<boolean>(true);

  async function loadSummary(batch = selectedBatch) {
    setRosterLoading(true);
    const [res, dirRes] = await Promise.all([
      getAllocationSummaryAction(),
      getAdminDirectoryDataAction(batch),
    ]);
    if (!res.error) {
      setSummary({
        totalGroups: res.totalGroups || 0,
        totalBatches: res.totalBatches || 0,
        totalStudents: res.totalStudents || 0,
      });
    }
    if (!dirRes.error) {
      setStudentRoster(dirRes.students || []);
      setBatchesList(dirRes.batches || []);
    }
    setRosterLoading(false);
  }

  useEffect(() => {
    loadSummary(selectedBatch);
  }, [selectedBatch]);

  // ----------------------------------------------------
  // Step 1: File Parsing (CSV or XLSX)
  // ----------------------------------------------------
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);
    setFileName(file.name);

    try {
      let rawData: Record<string, any>[] = [];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'csv') {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = parsed.data as Record<string, any>[];
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const rowObj: Record<string, any> = {};
          row.eachCell((cell, colNumber) => {
            const h = headers[colNumber];
            if (h) rowObj[h] = cell.value;
          });
          if (Object.keys(rowObj).length > 0) rawData.push(rowObj);
        });
      } else {
        throw new Error('Unsupported format. Please upload a .csv or .xlsx file.');
      }

      // Standardize headers
      const normalizedRows: RawAllocationRow[] = rawData.map((row) => {
        // Find fields case-insensitively
        const findField = (keys: string[]) => {
          for (const k of Object.keys(row)) {
            const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (keys.some((target) => clean.includes(target))) {
              return String(row[k] || '').trim();
            }
          }
          return '';
        };

        const grpVal = findField(['group', 'grp', 'groupno', 'team']);
        const batchVal = findField(['batch', 'session', 'batchid']) || '2023-2027';
        const topicVal = findField(['topic', 'topiccode', 'projectcode', 'code']);
        const supVal = findField(['supervisor', 'faculty', 'guide', 'supervisoremail']);
        const rollVal = findField(['roll', 'rollno', 'studentroll', 'univroll']);
        const nameVal = findField(['name', 'studentname', 'candidate']);
        const emailVal = findField(['email', 'studentemail', 'mail']);
        const phoneVal = findField(['phone', 'mobile', 'contact', 'whatsapp']);

        return {
          groupNumber: parseInt(grpVal, 10) || 0,
          batchId: batchVal,
          topicCode: topicVal,
          supervisorEmail: supVal,
          studentRoll: rollVal,
          studentName: nameVal,
          studentEmail: emailVal || undefined,
          studentPhone: phoneVal || undefined,
        };
      });

      setParsedRows(normalizedRows);
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------
  // Step 2: Pre-flight Foreign Key Validation
  // ----------------------------------------------------
  async function handleValidateData() {
    setLoading(true);
    setError(null);

    const report = await validateAllocationDataAction(parsedRows);
    setLoading(false);

    if ('error' in report) {
      setError(report.error);
    } else {
      setValidationReport(report);
      setStep(3);
    }
  }

  // ----------------------------------------------------
  // Step 3: Chunked Commit Ingestion (100 rows per call)
  // ----------------------------------------------------
  async function handleCommitAllocation() {
    if (!validationReport || validationReport.validRowsCount === 0) return;

    setStep(4);
    setLoading(true);
    setCommitProgress(0);
    setCommittedCount(0);

    // Filter valid rows only
    const validRows = parsedRows.filter(
      (_, idx) => !validationReport.invalidRows.some((inv) => inv.rowNumber === idx + 2)
    );

    const chunkSize = 100;
    const totalChunks = Math.ceil(validRows.length / chunkSize);
    let totalCommitted = 0;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = validRows.slice(i * chunkSize, (i + 1) * chunkSize);
      const res = await commitAllocationChunkAction(chunk);

      if (res.error) {
        setError(`Failed at chunk ${i + 1}: ${res.error}`);
        setLoading(false);
        return;
      }

      totalCommitted += res.count || chunk.length;
      setCommittedCount(totalCommitted);
      setCommitProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    setLoading(false);
    setIsDone(true);
    loadSummary();
  }

  // Sample CSV generator for admin convenience
  function handleDownloadTemplate() {
    const sample = `Group Number,Batch ID,Topic Code,Supervisor Email,Student Roll,Student Name,Student Email,Student Phone
1,2023-2027,SIH26001,soumyo.chatterjee@heritageit.edu,12623001001,Arijit Sen,arijit.sen@gmail.com,+919876543210
1,2023-2027,SIH26001,soumyo.chatterjee@heritageit.edu,12623001002,Priyanka Ghosh,priyanka.g@gmail.com,+919876543211
2,2023-2027,UGR-002,arindam.ray@heritageit.edu,12623001003,Debayan Das,debayan.das@gmail.com,+919876543212`;

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HITK_Capstone_Allocation_Template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Admin Allocation Engine
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Chunked (100 rows/batch)
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Student & Supervisor Allocation Wizard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload allotment spreadsheets matching student batches to approved topics and active faculty supervisors.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3.5 py-2 border border-blue-200 rounded-lg bg-blue-50/50 shadow-sm transition inline-flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download CSV Template
        </button>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Allocated Groups</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.totalGroups}</div>
          <span className="text-[11px] text-slate-400">Total project groups formed</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Enrolled Students</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{summary.totalStudents}</div>
          <span className="text-[11px] text-slate-400">Assigned across batches</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Batches</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.totalBatches}</div>
          <span className="text-[11px] text-slate-400">e.g. 2023-2027</span>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 text-xs font-semibold">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center border border-current">1</span>
          Upload File
        </div>
        <div className="w-12 h-px bg-slate-200" />
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center border border-current">2</span>
          Preview Data
        </div>
        <div className="w-12 h-px bg-slate-200" />
        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center border border-current">3</span>
          Validate Keys
        </div>
        <div className="w-12 h-px bg-slate-200" />
        <div className={`flex items-center gap-2 ${step >= 4 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center border border-current">4</span>
          Commit Batch
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4 hover:border-blue-400 transition">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">Drop your Allocation Spreadsheet Here</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Supports CSV, XLSX, and XLS formats. The parser auto-detects group numbers, batch sessions, topic codes, faculty guide emails, and student rolls.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer">
            Browse Computer
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      )}

      {/* Step 2: Data Preview */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">File Preview: {fileName}</h3>
              <p className="text-xs text-slate-500">
                Parsed <span className="font-semibold text-slate-800">{parsedRows.length}</span> student assignment rows.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Choose Another File
              </button>
              <button
                onClick={handleValidateData}
                disabled={loading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {loading ? 'Validating Foreign Keys...' : 'Validate Against DB →'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 sticky top-0">
                <tr>
                  <th className="px-4 py-2">Grp</th>
                  <th className="px-4 py-2">Batch</th>
                  <th className="px-4 py-2">Topic Code</th>
                  <th className="px-4 py-2">Supervisor Email</th>
                  <th className="px-4 py-2">Roll</th>
                  <th className="px-4 py-2">Student Name</th>
                  <th className="px-4 py-2">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {parsedRows.slice(0, 15).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-800">{r.groupNumber}</td>
                    <td className="px-4 py-2">{r.batchId}</td>
                    <td className="px-4 py-2 text-blue-700 font-bold">{r.topicCode}</td>
                    <td className="px-4 py-2 font-sans">{r.supervisorEmail}</td>
                    <td className="px-4 py-2">{r.studentRoll}</td>
                    <td className="px-4 py-2 font-sans font-semibold text-slate-800">{r.studentName}</td>
                    <td className="px-4 py-2 font-sans text-slate-400">{r.studentPhone || r.studentEmail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 15 && (
            <p className="text-[11px] text-slate-400 text-center">
              Showing first 15 of {parsedRows.length} rows. Click Validate to inspect foreign keys.
            </p>
          )}
        </div>
      )}

      {/* Step 3: Foreign Key Validation Report */}
      {step === 3 && validationReport && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Foreign Key Verification Report</h3>
              <p className="text-xs text-slate-500">
                Checks that every topic code exists and each supervisor is an active faculty member.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back to Preview
              </button>
              <button
                onClick={handleCommitAllocation}
                disabled={validationReport.validRowsCount === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                Commit Valid Allocations ({validationReport.validRowsCount} rows) →
              </button>
            </div>
          </div>

          {/* Validation Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Rows Scanned</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{validationReport.totalRows}</div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-xs font-semibold text-emerald-700 uppercase">Ready to Commit</span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{validationReport.validRowsCount}</div>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-xs font-semibold text-red-700 uppercase">Rejected Rows</span>
              <div className="text-2xl font-bold text-red-700 mt-1">{validationReport.invalidRowsCount}</div>
            </div>
          </div>

          {/* Discrepancies Breakdown */}
          {validationReport.invalidRowsCount > 0 ? (
            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-red-700">
                Orphaned Foreign Keys & Data Errors ({validationReport.invalidRowsCount})
              </h4>
              <div className="overflow-x-auto border border-red-200 rounded-xl max-h-60">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-red-50 text-[11px] uppercase font-semibold text-red-800 border-b border-red-200">
                    <tr>
                      <th className="px-4 py-2">Row</th>
                      <th className="px-4 py-2">Topic Code</th>
                      <th className="px-4 py-2">Supervisor</th>
                      <th className="px-4 py-2">Student Roll</th>
                      <th className="px-4 py-2">Error Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {validationReport.invalidRows.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-red-50/50">
                        <td className="px-4 py-2 font-mono font-bold text-red-600">Row {inv.rowNumber}</td>
                        <td className="px-4 py-2 font-mono">{inv.data.topicCode}</td>
                        <td className="px-4 py-2">{inv.data.supervisorEmail}</td>
                        <td className="px-4 py-2 font-mono">{inv.data.studentRoll}</td>
                        <td className="px-4 py-2 text-red-700 font-semibold">{inv.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Only valid rows will be committed. You can proceed with the valid set, or fix your spreadsheet and re-upload.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <span className="font-bold">✓ Complete Foreign Key Integrity:</span>
              <span>All topic codes match active topics and all supervisors match registered faculty.</span>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Chunked Ingestion Progress */}
      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-6 shadow-sm">
          {!isDone ? (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto animate-pulse">
                <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Committing Allocation Chunks...</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Creating project groups, enrolling student members, and updating topic status to ALLOTTED.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${commitProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-600 font-mono">
                  <span>Committed: {committedCount} rows</span>
                  <span>{commitProgress}%</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl">Allocation Ingestion Complete!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Successfully committed {committedCount} allocation rows. Topics have been flagged as ALLOTTED.
                </p>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setStep(1);
                    setIsDone(false);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Upload Another Sheet
                </button>
                <a
                  href="/admin/confirmed"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  View Confirmed Topics Ledger →
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {/* Enrolled Students & Corresponding Project Groups Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Enrolled Students & Corresponding Project Groups ({studentRoster.length})
            </h3>
            <p className="text-xs text-slate-500">
              Complete directory of students mapped to their project group number, batch, topic, and faculty supervisor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Batches</option>
              {batchesList.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch {b.id}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search student, roll, group, topic..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-3">Group & Batch</th>
                <th className="px-5 py-3">Roll Number</th>
                <th className="px-5 py-3">Student Name</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Project Topic</th>
                <th className="px-5 py-3">Supervisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rosterLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    Loading student-group roster...
                  </td>
                </tr>
              ) : (
                (() => {
                  const q = rosterSearch.trim().toLowerCase();
                  const filtered = studentRoster.filter((s) => {
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

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                          No allocated students found matching the criteria.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((st, idx) => (
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
                    </tr>
                  ));
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
