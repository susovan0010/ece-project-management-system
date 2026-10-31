'use client';

import { useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import {
  ParsedTopicRow,
  TopicCategoryType,
  TopicSourceType,
  processRawImportData,
} from '@/lib/import/parser';
import {
  getExistingCodesAndTitlesAction,
  importTopicsChunkAction,
} from '@/app/actions/topics';

export default function TopicImportWizardPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('');
  const [sourceType, setSourceType] = useState<TopicSourceType>('SIH');
  const [parsedRows, setParsedRows] = useState<ParsedTopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ingestion progress tracking
  const [importProgress, setImportProgress] = useState(0);
  const [committedCount, setCommittedCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // ----------------------------------------------------
  // Download Blank Excel Format Template (.xlsx)
  // ----------------------------------------------------
  async function handleDownloadBlankTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HITK ECE Project Committee';
    workbook.created = new Date();

    const sheetName = sourceType === 'SIH' ? 'SIH Topics Format' : 'UG Research Format';
    const sheet = workbook.addWorksheet(sheetName);

    const headers = [
      'Code',
      'Title',
      'Category',
      'Domain',
      'Organization',
      'Description',
      'Mapped SDG(s)',
      'Keywords',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    // Add 1 sample row (can be replaced or overwritten by the Admin)
    sheet.addRow([
      sourceType === 'SIH' ? 'SIH26901' : 'UGR-901',
      'Sample: FPGA-Based Real-Time Signal Processing for Smart Grid Monitoring',
      'Hardware',
      'Embedded Systems & VLSI',
      'HITK ECE Department',
      'Design and implement a low-latency FPGA acquisition and processing pipeline for harmonic distortion analysis in microgrids.',
      '7, 9',
      'FPGA, VLSI, Smart Grid, Signal Processing',
    ]);

    sheet.columns = [
      { width: 16 }, // Code
      { width: 42 }, // Title
      { width: 16 }, // Category (Hardware / Software / Both)
      { width: 24 }, // Domain
      { width: 24 }, // Organization
      { width: 55 }, // Description
      { width: 18 }, // Mapped SDG(s)
      { width: 28 }, // Keywords
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `HITK_ECE_Blank_Topic_Upload_Format_${sourceType}.xlsx`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

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
      let rawData: Record<string, unknown>[] = [];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'csv') {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = parsed.data as Record<string, unknown>[];
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Pick worksheet (defaults to first, or match SIH / UG research)
        let worksheet = workbook.worksheets[0];
        if (sourceType === 'UG_RESEARCH') {
          const ugSheet = workbook.worksheets.find((w) =>
            w.name.toLowerCase().includes('ug') || w.name.toLowerCase().includes('research')
          );
          if (ugSheet) worksheet = ugSheet;
        } else {
          const sihSheet = workbook.worksheets.find((w) =>
            w.name.toLowerCase().includes('sih')
          );
          if (sihSheet) worksheet = sihSheet;
        }

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip headers
          const rowObj: Record<string, unknown> = {};
          row.eachCell((cell, colNumber) => {
            const h = headers[colNumber];
            if (h) rowObj[h] = cell.value;
          });
          if (Object.keys(rowObj).length > 0) {
            rawData.push(rowObj);
          }
        });
      } else {
        throw new Error('Unsupported format. Please upload a .csv or .xlsx file.');
      }

      if (rawData.length === 0) {
        throw new Error('The uploaded file contains no data rows.');
      }

      // Fetch existing codes & titles to detect duplicate entries
      const existing = await getExistingCodesAndTitlesAction();
      const existingCodes = new Set(existing.codes);
      const existingTitles = new Set(existing.titles);

      const processed = processRawImportData(rawData, sourceType, existingCodes, existingTitles);
      setParsedRows(processed);
      setStep(3); // Advance straight to preview & edit
    } catch (err) {
      setError((err as Error).message || 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------
  // Inline Category Modification in Preview Grid
  // ----------------------------------------------------
  function handleCategoryChange(index: number, newCategory: TopicCategoryType) {
    const updated = [...parsedRows];
    updated[index].category = newCategory;
    setParsedRows(updated);
  }

  // ----------------------------------------------------
  // Step 4: Chunked Ingestion (100 rows per batch)
  // ----------------------------------------------------
  async function handleStartCommit() {
    setStep(4);
    setLoading(true);
    setImportProgress(0);
    setCommittedCount(0);
    setIsDone(false);

    const validRows = parsedRows.filter((r) => !r.isDuplicate);
    const total = validRows.length;

    if (total === 0) {
      setError('No valid, non-duplicate rows to import.');
      setLoading(false);
      return;
    }

    const chunkSize = 100;
    let committed = 0;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const res = await importTopicsChunkAction(chunk);

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      committed += res.count || chunk.length;
      setCommittedCount(committed);
      setImportProgress(Math.round((committed / total) * 100));
    }

    setLoading(false);
    setIsDone(true);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin/topics" className="hover:text-blue-600">
              Topic Bank
            </Link>
            <span>/</span>
            <span>Import Wizard</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Import &amp; Append Topics Wizard
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Download the blank Excel format, populate it with new project topics, and upload. New topics are automatically appended to the existing catalogue.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadBlankTemplate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Blank Excel Format (.xlsx)
        </button>
      </div>

      {/* Step Stepper */}
      <div className="grid grid-cols-4 gap-2 border-b border-slate-200 pb-4">
        {[
          { num: 1, label: '1. Select Source & File' },
          { num: 2, label: '2. Auto-Detection' },
          { num: 3, label: '3. Preview & Edit' },
          { num: 4, label: '4. Chunked Commit' },
        ].map((s) => (
          <div
            key={s.num}
            className={`text-xs font-semibold pb-1 border-b-2 transition ${
              step >= s.num ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
            }`}
          >
            {s.label}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
          {error}
        </div>
      )}

      {/* STEP 1: Upload and Configuration */}
      {step === 1 && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-8 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                Topic Source Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as TopicSourceType)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="SIH">Smart India Hackathon (SIH Sheet)</option>
                <option value="UG_RESEARCH">UG Research (Department Sheet)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {sourceType === 'SIH'
                  ? 'Uses PS Number / Code as topic code and maps themes to domains.'
                  : 'Generates sequential UGR-001.. codes and classifies Hardware/Software via keywords.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="text-xs font-bold text-emerald-900">
                Need the Standard Blank Excel Format?
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Any Admin can download the blank Excel format below, fill in new project topics, and upload it here. Newly uploaded topics are appended to the existing topic bank without overwriting existing entries.
              </p>
              <button
                type="button"
                onClick={handleDownloadBlankTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <span>Download Blank Format ({sourceType === 'SIH' ? 'SIH' : 'UG Research'})</span>
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition cursor-pointer">
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload-input"
            />
            <label htmlFor="file-upload-input" className="cursor-pointer">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Click to choose CSV or Excel file to upload
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Accepts SIH2026_and_UG_Research_SDG_Mapping_v2.xlsx or CSV exports
              </p>
            </label>
          </div>

          {loading && (
            <div className="text-center py-4 text-xs font-semibold text-blue-600 animate-pulse">
              Parsing workbook structure and matching headers...
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Preview, Classification & Inline Correction */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-900">
                File: {fileName} ({parsedRows.length} total rows)
              </span>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                <span className="text-emerald-700 font-semibold">
                  Valid: {parsedRows.filter((r) => !r.isDuplicate).length}
                </span>
                <span>•</span>
                <span className="text-amber-700 font-semibold">
                  Duplicates flagged: {parsedRows.filter((r) => r.isDuplicate).length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-lg"
              >
                Choose Different File
              </button>
              <button
                type="button"
                onClick={handleStartCommit}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Commit Valid Rows in Chunks &rarr;
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Project Title</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Category (Editable)</th>
                    <th className="p-3">Domain / Theme</th>
                    <th className="p-3">SDGs</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.slice(0, 100).map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.isDuplicate ? 'bg-amber-50/60' : 'hover:bg-slate-50/80'}
                    >
                      <td className="p-3 font-mono font-bold text-slate-900">{row.code}</td>
                      <td className="p-3 font-medium text-slate-900 max-w-xs truncate" title={row.title}>
                        {row.title}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                          {row.source}
                        </span>
                      </td>
                      <td className="p-3">
                        <select
                          value={row.category}
                          onChange={(e) =>
                            handleCategoryChange(idx, e.target.value as TopicCategoryType)
                          }
                          className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="Software">Software</option>
                          <option value="Hardware">Hardware</option>
                          <option value="Both">Both</option>
                        </select>
                      </td>
                      <td className="p-3 max-w-[150px] truncate">{row.domain || '—'}</td>
                      <td className="p-3">
                        {row.sdgIds.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {row.sdgIds.map((s) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800"
                              >
                                SDG {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="p-3">
                        {row.isDuplicate ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"
                            title={row.duplicateReason}
                          >
                            Duplicate
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 100 && (
              <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
                Showing first 100 of {parsedRows.length} rows in preview. All non-duplicate rows will be committed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: Chunked Ingestion Progress */}
      {step === 4 && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-8 shadow-sm text-center space-y-6">
          <h3 className="text-lg font-bold text-slate-900">
            {isDone ? 'Ingestion Completed Successfully!' : 'Ingesting Topics in 100-Row Chunks...'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Committed {committedCount} of {parsedRows.filter((r) => !r.isDuplicate).length} topics into the database catalogue.
          </p>

          <div className="w-full max-w-md mx-auto bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            ></div>
          </div>
          <div className="text-xs font-bold text-slate-700">{importProgress}% Completed</div>

          {isDone && (
            <div className="pt-4 flex justify-center gap-3">
              <Link
                href="/admin/topics"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm"
              >
                View Topic Bank &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
