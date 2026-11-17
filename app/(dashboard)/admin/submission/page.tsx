'use client';

import { useState, useEffect } from 'react';
import { getAdminCompletedSubmissionsAction } from '@/app/actions/submission';

export default function AdminSubmissionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const [sortBy, setSortBy] = useState<'group' | 'supervisor' | 'extension'>('group');
  const [extensionFilter, setExtensionFilter] = useState<'ALL' | 'DOC' | 'PDF' | 'PPT'>('ALL');
  const [semesterFilter, setSemesterFilter] = useState<number | 'ALL'>('ALL');

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getAdminCompletedSubmissionsAction({
      sortBy,
      extensionFilter,
      semesterFilter,
    });
    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setSubmissions(res.submissions || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [sortBy, extensionFilter, semesterFilter]);

  function getExtBadgeStyle(ext: string) {
    if (ext === 'pdf') return 'bg-red-100 text-red-800 border-red-300';
    if (ext === 'ppt' || ext === 'pptx') return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            Committee Admin • Single-Source Drive Links
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Completed Student Submissions (Thumbnail Links)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Direct thumbnail links to supervisor-approved Progress Reports &amp; Presentations stored in Google Drive (no duplicate copies created).
          </p>
        </div>
      </div>

      {/* Sort & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Sort Documents By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800"
          >
            <option value="group">Group-wise (Batch &amp; Group No.)</option>
            <option value="supervisor">Supervisor-wise (A–Z)</option>
            <option value="extension">Extension-wise (doc/docx, pdf, ppt)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            File Extension
          </label>
          <select
            value={extensionFilter}
            onChange={(e) => setExtensionFilter(e.target.value as any)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800"
          >
            <option value="ALL">All Extensions</option>
            <option value="DOC">DOC / DOCX (Reports)</option>
            <option value="PDF">PDF Documents</option>
            <option value="PPT">PPT / PPTX (Presentations)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Semester
          </label>
          <select
            value={semesterFilter}
            onChange={(e) =>
              setSemesterFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
            }
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800"
          >
            <option value="ALL">All Semesters</option>
            <option value={6}>6th Semester</option>
            <option value={7}>7th Semester</option>
            <option value={8}>8th Semester</option>
          </select>
        </div>

        <div className="ml-auto text-xs font-semibold text-slate-500">
          Showing <strong className="text-slate-900">{submissions.length}</strong> completed document(s)
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading completed submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-500 text-sm">
          No supervisor-completed documents found matching the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3 hover:border-blue-300 transition"
            >
              {/* Thumbnail Link Header */}
              <a
                href={s.driveViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl border border-slate-200 bg-slate-50 overflow-hidden hover:border-blue-400 transition"
                title="Open single canonical file in Google Drive"
              >
                <div className="h-28 flex flex-col items-center justify-center p-3 bg-gradient-to-br from-slate-100 to-slate-200/70 relative">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-black uppercase border shadow-xs ${getExtBadgeStyle(
                      s.fileExtension
                    )}`}
                  >
                    .{s.fileExtension}
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 mt-2 truncate max-w-full px-2 group-hover:text-blue-700">
                    {s.fileName}
                  </span>
                  <span className="text-[10px] text-blue-600 font-semibold mt-1 group-hover:underline">
                    Click Thumbnail to Open in Drive ↗
                  </span>
                </div>
              </a>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px]">
                    Group {s.groupNumber} ({s.batchId})
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[10px]">
                    Sem {s.semester} • {s.docType === 'PROGRESS_REPORT' ? 'Report' : 'PPT/Pres.'}
                  </span>
                </div>

                <div className="font-bold text-slate-900 line-clamp-1" title={s.topicTitle}>
                  {s.topicCode}: {s.topicTitle}
                </div>

                <div className="text-[11px] text-slate-600">
                  Supervisor: <strong>{s.supervisorName}</strong>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span>Uploaded by {s.uploadedByName}</span>
                  <span>{(s.fileSize / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
