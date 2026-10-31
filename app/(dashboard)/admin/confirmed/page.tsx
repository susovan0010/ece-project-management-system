'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import {
  getAdminConfirmedTopicsAction,
  updateTopicStatusAction,
  exportStudentTopicsDataAction,
} from '@/app/actions/admin-confirmed';
import {
  getArchivedProjectsAction,
  completeAndArchiveTopicAction,
  reactivateArchivedTopicAction,
  getTopicDeleteRequestsAction,
  resolveTopicDeleteRequestAction,
  TopicDeleteRequestRecord,
  ArchivedProjectRecord,
} from '@/app/actions/project-lifecycle';

interface TopicRow {
  id: string;
  code: string;
  title: string;
  source: string;
  category: string;
  domain: string | null;
  organization: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'ALLOTTED' | 'ARCHIVED';
  description: string | null;
  proposer: { id: string; name: string; email: string } | null;
  sdgs: Array<{ sdgId: number; target: string | null; sdg: { title: string } }>;
  attributes: Array<{ level: number; attribute: { code: string; kind: string; title: string } }>;
  groups: Array<{ id: string; number: number }>;
}

export default function AdminConfirmedTopicsPage() {
  const [viewMode, setViewMode] = useState<'LEDGER' | 'ARCHIVE'>('LEDGER');
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProjectRecord[]>([]);
  const [deleteRequests, setDeleteRequests] = useState<TopicDeleteRequestRecord[]>([]);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState({ confirmed: 0, draft: 0, allotted: 0, archived: 0 });

  // Export progress
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);

  // Detail Modal
  const [viewingTopic, setViewingTopic] = useState<TopicRow | null>(null);

  async function loadTopics(currentPage = page) {
    setLoading(true);
    setError(null);
    const [res, archiveRes, reqRes] = await Promise.all([
      getAdminConfirmedTopicsAction({
        query,
        category,
        source,
        status,
        page: currentPage,
        pageSize: 20,
      }),
      getArchivedProjectsAction(),
      getTopicDeleteRequestsAction(),
    ]);

    if (res.error) {
      setError(res.error);
    } else {
      setTopics((res.topics || []) as unknown as TopicRow[]);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.totalCount || 0);
      if (res.counts) setCounts(res.counts as any);
    }

    if (!archiveRes.error && archiveRes.archivedProjects) {
      setArchivedProjects(archiveRes.archivedProjects);
    }
    if (!reqRes.error && reqRes.requests) {
      setDeleteRequests(reqRes.requests);
    }
    setLoading(false);
  }

  async function handleResolveDeleteRequest(
    topicId: string,
    supervisorId: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    const key = `${topicId}:${supervisorId}`;
    setResolvingKey(key);
    setError(null);
    const res = await resolveTopicDeleteRequestAction(topicId, supervisorId, decision);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        decision === 'APPROVE'
          ? `Approved: ${res.supervisorName} now has the "Final Delete" option enabled for topic ${res.topicCode}.`
          : `Declined delete request for topic ${res.topicCode} (${res.supervisorName}).`
      );
      await loadTopics(page);
    }
    setResolvingKey(null);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      loadTopics(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [query, category, source, status]);

  // Status toggle handler
  async function handleStatusChange(topicId: string, newStatus: any) {
    const res = await updateTopicStatusAction(topicId, newStatus);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Status updated for topic ${res.topic?.code} to ${newStatus}.`);
      loadTopics();
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  async function handleCompleteProject(topicId: string, code: string) {
    const res = await completeAndArchiveTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Project ${code} deactivated and archived as Completed with all supervisor, student, group, and multi-semester marks preserved.`
      );
      loadTopics();
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  async function handleReactivateProject(topicId: string, code: string) {
    const res = await reactivateArchivedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Project ${code} restored to Active status (${res.status}).`);
      loadTopics();
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  }

  // ----------------------------------------------------
  // Export 1: CSV Export (Sanitized with formula prevention)
  // ----------------------------------------------------
  async function handleExportCsv() {
    setExporting('csv');
    setError(null);
    const res = await exportStudentTopicsDataAction();
    if (res.error || !res.rows) {
      setError(res.error || 'Failed to export CSV');
      setExporting(null);
      return;
    }

    const csvData = Papa.unparse(res.rows);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `HITK_ECE_Confirmed_Capstone_Topics_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExporting(null);
  }

  // ----------------------------------------------------
  // Export 2: Excel (XLSX) Export (Styled with ExcelJS)
  // ----------------------------------------------------
  async function handleExportExcel() {
    setExporting('xlsx');
    setError(null);
    const res = await exportStudentTopicsDataAction();
    if (res.error || !res.rows) {
      setError(res.error || 'Failed to export Excel');
      setExporting(null);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HITK ECE Project Committee';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Confirmed Topics', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    // Title Row
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'HERITAGE INSTITUTE OF TECHNOLOGY, KOLKATA (HITK)';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Subtitle Row
    sheet.mergeCells('A2:I2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Department of Electronics & Communication Engineering — Approved Capstone Topic Catalogue (${new Date().getFullYear()})`;
    subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Column Headers
    const headers = [
      'Topic Code',
      'Project Title',
      'Category',
      'Source',
      'Assigned Supervisor',
      'Domain',
      'SDG Alignments',
      'WP Complexity',
      'Abstract Description',
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    // Populate data
    res.rows.forEach((r) => {
      sheet.addRow([
        r.code,
        r.title,
        r.category,
        r.source,
        r.supervisor,
        r.domain,
        r.sdgs,
        r.complexityWp,
        r.description,
      ]);
    });

    // Adjust column widths
    sheet.columns = [
      { width: 14 }, // Code
      { width: 35 }, // Title
      { width: 14 }, // Category
      { width: 14 }, // Source
      { width: 22 }, // Supervisor
      { width: 18 }, // Domain
      { width: 22 }, // SDGs
      { width: 16 }, // Complexity
      { width: 50 }, // Abstract
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `HITK_ECE_Capstone_Catalogue_${new Date().getFullYear()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExporting(null);
  }

  // ----------------------------------------------------
  // Export 3: Printable HTML / PDF Window
  // ----------------------------------------------------
  async function handlePrintCatalogue() {
    setExporting('pdf');
    setError(null);
    const res = await exportStudentTopicsDataAction();
    if (res.error || !res.rows) {
      setError(res.error || 'Failed to generate print catalogue');
      setExporting(null);
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      setError('Please allow popups to open the print catalogue.');
      setExporting(null);
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>HITK ECE Capstone Project Catalogue (${new Date().getFullYear()})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 30px; color: #1e293b; line-height: 1.4; font-size: 12px; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 18px; color: #0f172a; text-transform: uppercase; }
            .header h2 { margin: 4px 0 0; font-size: 14px; color: #3b82f6; }
            .header p { margin: 4px 0 0; font-size: 11px; color: #64748b; }
            .legend { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; font-size: 10px; margin-bottom: 20px; display: flex; justify-content: space-around; }
            .topic-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
            .topic-card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
            .code { font-weight: bold; font-family: monospace; color: #1d4ed8; font-size: 13px; }
            .category { font-weight: bold; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #e2e8f0; }
            .title { font-weight: bold; font-size: 13px; margin: 0 0 6px; color: #0f172a; }
            .meta { font-size: 10.5px; color: #475569; margin-bottom: 6px; }
            .desc { font-size: 11px; color: #334155; text-align: justify; margin: 6px 0; }
            .tags { font-size: 10px; font-weight: bold; color: #4338ca; }
            @media print {
              body { margin: 15mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 15px; text-align: right;">
            <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Print / Save as PDF</button>
          </div>
          <div class="header">
            <h1>Heritage Institute of Technology, Kolkata</h1>
            <h2>Department of Electronics and Communication Engineering</h2>
            <p>Official Approved Capstone Project Topic Catalogue — B.Tech ECE (${new Date().getFullYear()})</p>
          </div>
          <div class="legend">
            <div><strong>Total Topics:</strong> ${res.rows.length}</div>
            <div><strong>NBA Compliance:</strong> Washington Accord WP & WK Mapped</div>
            <div><strong>UN SDGs:</strong> Targets 1 through 17 Addressed</div>
          </div>
          ${res.rows
            .map(
              (r) => `
            <div class="topic-card">
              <div class="topic-card-header">
                <span class="code">${r.code}</span>
                <span class="category">${r.category} | ${r.source}</span>
              </div>
              <h3 class="title">${r.title}</h3>
              <div class="meta">
                <strong>Assigned Supervisor:</strong> ${r.supervisor} &nbsp;|&nbsp;
                <strong>Domain:</strong> ${r.domain}
              </div>
              <p class="desc">${r.description}</p>
              <div class="tags">
                <span><strong>Accreditation:</strong> ${r.complexityWp}</span> &nbsp;|&nbsp;
                <span><strong>SDG Alignment:</strong> ${r.sdgs}</span>
              </div>
            </div>
          `
            )
            .join('')}
        </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
    setExporting(null);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Project Committee Ledger
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Decision 3: Supervisor Attribution
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Confirmed Topics & Student Catalogues
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage approved capstone topics, verify supervisor attributions, and export student catalogues in CSV, Excel, or PDF.
          </p>
        </div>

        {/* Multi-Format Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCsv}
            disabled={exporting !== null}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exporting !== null}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-sm transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === 'xlsx' ? 'Building Excel...' : 'Export Excel (.xlsx)'}
          </button>

          <button
            onClick={handlePrintCatalogue}
            disabled={exporting !== null}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            {exporting === 'pdf' ? 'Preparing Print...' : 'Print Catalogue / PDF'}
          </button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Confirmed Topics
          </span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {counts.confirmed + counts.allotted}
          </div>
          <span className="text-[11px] text-slate-400">
            {counts.confirmed} Confirmed • {counts.allotted} Allotted
          </span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Draft Proposals</span>
          <div className="text-2xl font-bold text-amber-600 mt-1">{counts.draft}</div>
          <span className="text-[11px] text-slate-400">Available in Topic Bank</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Completed &amp; Archived
          </span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{counts.archived || 0}</div>
          <span className="text-[11px] text-slate-400">Post-8th Sem Completed Vault</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Export Security</span>
          <div className="text-sm font-bold text-slate-800 mt-2">Zero PII Leakage</div>
          <span className="text-[11px] text-slate-400">Sanitized against CSV injection</span>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setViewMode('LEDGER')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            viewMode === 'LEDGER'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Active &amp; Confirmed Topics Ledger ({counts.confirmed + counts.allotted})
        </button>
        <button
          type="button"
          onClick={() => setViewMode('ARCHIVE')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            viewMode === 'ARCHIVE'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Completed &amp; Archived Projects Vault ({archivedProjects.length})
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

      {/* Pending Supervisor Delete Requests Panel */}
      {deleteRequests.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-bold text-amber-900">
              Pending Supervisor Topic Delete Requests ({deleteRequests.length})
            </h3>
            <p className="text-xs text-amber-800 mt-0.5">
              Supervisors have requested to remove the following confirmed project topics. If you agree, the topic will be deleted from that supervisor&apos;s pool only.
            </p>
          </div>
          <div className="space-y-2">
            {deleteRequests.map((req) => {
              const key = `${req.topicId}:${req.supervisorId}`;
              return (
                <div
                  key={key}
                  className="p-3 bg-white border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">
                      <span className="font-mono text-blue-700 mr-1.5">{req.topicCode}</span>
                      {req.topicTitle}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Requested by Supervisor:{' '}
                      <strong className="text-slate-900">{req.supervisorName}</strong> (
                      {req.supervisorEmail})
                    </div>
                    {req.reason && (
                      <div className="text-[11px] text-slate-500 italic">
                        Note: &ldquo;{req.reason}&rdquo;
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      disabled={resolvingKey === key}
                      onClick={() =>
                        handleResolveDeleteRequest(req.topicId, req.supervisorId, 'APPROVE')
                      }
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    >
                      {resolvingKey === key
                        ? 'Processing...'
                        : "Agree (Delete from Supervisor's Pool)"}
                    </button>
                    <button
                      type="button"
                      disabled={resolvingKey === key}
                      onClick={() =>
                        handleResolveDeleteRequest(req.topicId, req.supervisorId, 'REJECT')
                      }
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'LEDGER' ? (
        <>
          {/* Filter and Search Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code, title, domain, or supervisor..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="md:col-span-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="ACTIVE">Status: Active (Confirmed &amp; Allotted)</option>
                <option value="CONFIRMED">Status: Confirmed</option>
                <option value="ALLOTTED">Status: Allotted</option>
                <option value="DRAFT">Status: Draft</option>
                <option value="ARCHIVED">Status: Completed / Archived</option>
                <option value="ALL">Status: All Records</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="ALL">All Categories</option>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Both">Both (Hybrid)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="ALL">All Sources</option>
                <option value="SIH">SIH 2026</option>
                <option value="UG_RESEARCH">UG Research</option>
                <option value="FACULTY">Faculty Propose</option>
              </select>
            </div>
          </div>

          {/* Confirmed Topics Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="font-semibold text-slate-900">Approved Topic Ledger ({totalCount})</h2>
                <p className="text-xs text-slate-500">
                  Active topics confirmed by supervisors are visible here and in each supervisor&apos;s portfolio.
                </p>
              </div>
              <button
                onClick={() => loadTopics()}
                className="text-xs text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg bg-white"
              >
                Refresh Ledger
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm">Loading ledger topics...</div>
            ) : topics.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">No topics match the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Topic Code</th>
                      <th className="px-6 py-3">Title &amp; Domain</th>
                      <th className="px-6 py-3">Type &amp; Source</th>
                      <th className="px-6 py-3">Supervisor Attribution</th>
                      <th className="px-6 py-3">SDG &amp; Complexity</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topics.map((t) => {
                      const wpAttrs = t.attributes.filter((a) => a.attribute.kind === 'WP');
                      const isActive = t.status === 'CONFIRMED' || t.status === 'ALLOTTED';

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-6 py-4">
                            <div className="font-mono font-bold text-xs text-blue-700">{t.code}</div>
                            {isActive && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ACTIVE
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 max-w-sm">
                            <div className="font-semibold text-slate-900 line-clamp-1">{t.title}</div>
                            {t.domain && <div className="text-xs text-slate-400 mt-0.5">{t.domain}</div>}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  t.category === 'Hardware'
                                    ? 'bg-amber-100 text-amber-800'
                                    : t.category === 'Software'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {t.category}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-semibold">
                                {t.source === 'UG_RESEARCH' ? 'UG Research' : t.source}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-800">
                              {t.proposer?.name || 'Department Committee'}
                            </div>
                            {t.proposer?.email && (
                              <div className="text-[11px] text-slate-400">{t.proposer.email}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {t.sdgs.map((s) => (
                                <span
                                  key={s.sdgId}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                >
                                  SDG {s.sdgId}
                                </span>
                              ))}
                              {wpAttrs.slice(0, 2).map((a) => (
                                <span
                                  key={a.attribute.code}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                >
                                  {a.attribute.code}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={t.status}
                              onChange={(e) => handleStatusChange(t.id, e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded font-semibold bg-white text-slate-700"
                            >
                              <option value="CONFIRMED">CONFIRMED (Active)</option>
                              <option value="ALLOTTED">ALLOTTED (Active)</option>
                              <option value="DRAFT">DRAFT</option>
                              <option value="ARCHIVED">ARCHIVED (Completed)</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {t.status !== 'ARCHIVED' && (
                                <button
                                  type="button"
                                  onClick={() => handleCompleteProject(t.id, t.code)}
                                  className="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition"
                                  title="Deactivate & Archive as Completed after 8th Semester"
                                >
                                  Deactivate / Archive
                                </button>
                              )}
                              <button
                                onClick={() => setViewingTopic(t)}
                                className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-slate-200 rounded bg-white hover:bg-slate-50 transition"
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600">
                <div>
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const p = Math.max(1, page - 1);
                      setPage(p);
                      loadTopics(p);
                    }}
                    disabled={page === 1}
                    className="px-3 py-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      const p = Math.min(totalPages, page + 1);
                      setPage(p);
                      loadTopics(p);
                    }}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* COMPLETED & ARCHIVED PROJECTS VAULT */
        <div className="space-y-6">
          {archivedProjects.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-xl text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                No Completed / Archived Projects Yet
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Once the 8th-semester assessment of an active project is completed, either the Supervisor or an Admin can click &ldquo;Deactivate / Archive&rdquo; to store the full historical record here.
              </p>
            </div>
          ) : (
            archivedProjects.map((proj) => (
              <div
                key={proj.topicId}
                className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden"
              >
                <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold bg-blue-500/20 text-blue-200 px-2.5 py-0.5 rounded border border-blue-400/30">
                        {proj.code}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                        COMPLETED &amp; ARCHIVED
                      </span>
                      <span className="text-xs text-slate-300">
                        {proj.category} • {proj.source}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white">{proj.title}</h3>
                    <p className="text-xs text-slate-300">
                      <strong>Supervisor(s):</strong>{' '}
                      {proj.supervisorsList.length > 0
                        ? proj.supervisorsList.join(', ')
                        : proj.proposerName || 'Department Committee'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReactivateProject(proj.topicId, proj.code)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg text-xs font-semibold transition self-start sm:self-auto"
                  >
                    Reactivate Project
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {proj.groups.length === 0 ? (
                    <div className="text-xs text-slate-500 italic">
                      Archived without an allotted student group.
                    </div>
                  ) : (
                    proj.groups.map((grp) => (
                      <div
                        key={grp.groupId}
                        className="border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 text-xs">
                          <div>
                            <span className="font-bold text-slate-900">
                              Group {grp.groupNumber}
                            </span>{' '}
                            <span className="text-slate-500">({grp.batchId})</span>
                          </div>
                          <div className="text-slate-600">
                            <strong>Supervisor:</strong> {grp.supervisorName} ({grp.supervisorEmail})
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-100/80 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2.5">Student Name</th>
                                <th className="px-4 py-2.5">Roll Number</th>
                                <th className="px-4 py-2.5">Sem 6 (A: 60 + B: 40)</th>
                                <th className="px-4 py-2.5">Sem 7 (C: 50 + D: 50)</th>
                                <th className="px-4 py-2.5">Sem 8 (E: 40 + F: 60)</th>
                                <th className="px-4 py-2.5 text-right">All-Semesters Total (/300)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {grp.students.map((st) => (
                                <tr key={st.studentId} className="hover:bg-slate-50/70">
                                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                                    {st.name}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-slate-700">
                                    {st.roll}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="font-bold text-slate-900">{st.sem6Total}</span>/100{' '}
                                    <span className="text-[11px] text-slate-400">
                                      (A:{st.sem6RubricA}, B:{st.sem6RubricB})
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="font-bold text-slate-900">{st.sem7Total}</span>/100{' '}
                                    <span className="text-[11px] text-slate-400">
                                      (C:{st.sem7RubricC}, D:{st.sem7RubricD})
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="font-bold text-slate-900">{st.sem8Total}</span>/100{' '}
                                    <span className="text-[11px] text-slate-400">
                                      (E:{st.sem8RubricE}, F:{st.sem8RubricF})
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                                    {st.grandTotal} / 300
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Detail Modal */}
      {viewingTopic && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {viewingTopic.code}
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-1">{viewingTopic.title}</h3>
              </div>
              <button onClick={() => setViewingTopic(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="text-xs space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg">
                <div>
                  <span className="font-semibold text-slate-500">Supervisor:</span>{' '}
                  <span className="font-bold text-slate-800">
                    {viewingTopic.proposer?.name || 'Department Committee'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Category:</span>{' '}
                  <span className="font-bold text-slate-800">{viewingTopic.category}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Source:</span>{' '}
                  <span className="font-bold text-slate-800">{viewingTopic.source}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Status:</span>{' '}
                  <span className="font-bold text-slate-800">{viewingTopic.status}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-1">
                  Project Abstract (500 Words)
                </h4>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg leading-relaxed whitespace-pre-line text-slate-800">
                  {viewingTopic.description || 'No description recorded.'}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-1">
                  Washington Accord Mappings
                </h4>
                <div className="space-y-1.5">
                  {viewingTopic.attributes.map((a) => (
                    <div key={a.attribute.code} className="p-2 border rounded bg-white flex justify-between">
                      <span className="font-semibold text-slate-800">
                        {a.attribute.code}: {a.attribute.title}
                      </span>
                      <span className="font-bold text-amber-700">Level {a.level}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-1">
                  SDG Alignment
                </h4>
                <div className="space-y-1.5">
                  {viewingTopic.sdgs.map((s) => (
                    <div key={s.sdgId} className="p-2 border border-indigo-100 bg-indigo-50/50 rounded flex justify-between">
                      <span className="font-semibold text-indigo-900">
                        Goal {s.sdgId}: {s.sdg.title}
                      </span>
                      <span className="font-bold text-indigo-700">Target {s.target || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewingTopic(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
