'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getArchivedProjectsAction,
  ArchivedProjectListItem,
} from '@/app/actions/capstone';

export default function ArchivedProjectsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ArchivedProjectListItem[]>([]);
  const [batches, setBatches] = useState<Array<{ id: string; archivedAt: string | null; driveUrl?: string | null }>>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [capstoneFilter, setCapstoneFilter] = useState<'ALL' | 'CAPSTONE_ONLY' | 'STANDARD_ONLY'>('ALL');

  // Selected Project for NBA Report Modal
  const [selectedProject, setSelectedProject] = useState<ArchivedProjectListItem | null>(null);

  useEffect(() => {
    loadArchivedData();
  }, []);

  async function loadArchivedData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getArchivedProjectsAction();
      if (res.success && res.projects) {
        setProjects(res.projects);
        setBatches(res.batches || []);
      } else {
        setError(res.error || 'Failed to retrieve archived projects.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Filtered project list
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Batch filter
      if (selectedBatch !== 'ALL' && p.batchId !== selectedBatch) {
        return false;
      }

      // Capstone filter
      if (capstoneFilter === 'CAPSTONE_ONLY' && !p.isCapstone) {
        return false;
      }
      if (capstoneFilter === 'STANDARD_ONLY' && p.isCapstone) {
        return false;
      }

      // Search query filter (matches title, code, student names, roll numbers, supervisor, domain)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = p.topicTitle.toLowerCase().includes(query);
        const matchesCode = p.topicCode.toLowerCase().includes(query);
        const matchesSupervisor = p.supervisorName.toLowerCase().includes(query);
        const matchesDomain = p.domain.toLowerCase().includes(query);
        const matchesStudent = p.students.some(
          (s) => s.name.toLowerCase().includes(query) || s.roll.toLowerCase().includes(query)
        );

        if (!matchesTitle && !matchesCode && !matchesSupervisor && !matchesDomain && !matchesStudent) {
          return false;
        }
      }

      return true;
    });
  }, [projects, selectedBatch, capstoneFilter, searchQuery]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const totalBatches = batches.length;
    const totalProjects = projects.length;
    const capstoneProjects = projects.filter((p) => p.isCapstone).length;
    const totalStudents = projects.reduce((acc, p) => acc + (p.students?.length || 0), 0);
    return { totalBatches, totalProjects, capstoneProjects, totalStudents };
  }, [batches, projects]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              📦 Academic Archive Repository
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              NBA SAR Criterion 2.2
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Washington Accord
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">
            Archived Projects &amp; Evaluation Dossiers
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Permanent academic records of past graduating batches. Student credentials have been safely suspended to optimize database storage, while full project attainments, attributes, badges, and supervisor profiles are preserved for NBA accreditation inspections.
          </p>
        </div>

        <button
          onClick={loadArchivedData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs self-start md:self-auto"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Archives
        </button>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Archived Batches</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalBatches}</p>
          <span className="text-[11px] text-slate-400">Graduating sessions closed</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Archived Projects</span>
          <p className="text-2xl font-black text-blue-600 mt-1">{stats.totalProjects}</p>
          <span className="text-[11px] text-slate-400">Preserved in static dossier</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Capstone Projects</span>
          <p className="text-2xl font-black text-purple-600 mt-1">{stats.capstoneProjects}</p>
          <span className="text-[11px] text-purple-500">🌟 Permanent Capstone status</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Students Documented</span>
          <p className="text-2xl font-black text-emerald-600 mt-1">{stats.totalStudents}</p>
          <span className="text-[11px] text-slate-400">Rolls &amp; badges archived</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by topic title, code, student name, roll number, supervisor, or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Batch Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Batch:</label>
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="text-xs p-2 border border-slate-300 rounded-xl bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">All Archived Batches ({batches.length})</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch {b.id}
                </option>
              ))}
            </select>
          </div>

          {/* Capstone Filter Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Type:</label>
            <select
              value={capstoneFilter}
              onChange={(e) => setCapstoneFilter(e.target.value as any)}
              className="text-xs p-2 border border-slate-300 rounded-xl bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">All Projects</option>
              <option value="CAPSTONE_ONLY">🌟 Capstone Projects Only</option>
              <option value="STANDARD_ONLY">Standard Projects Only</option>
            </select>
          </div>
        </div>

        {/* Batch Google Drive Links Quick Bar */}
        {batches.some((b) => b.driveUrl) && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-1.41-1.41L14.17 13H6v-2h8.17l-3.58-3.59L12 6l5 7z" />
              </svg>
              ECE Drive Archives:
            </span>
            {batches.map((b) =>
              b.driveUrl ? (
                <a
                  key={b.id}
                  href={b.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] transition-colors"
                >
                  📁 Batch {b.id} Archive
                  <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm animate-pulse space-y-2">
          <div className="w-8 h-8 mx-auto border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold text-slate-700">Loading Archived Projects &amp; NBA Reports...</p>
          <p className="text-xs text-slate-400">Parsing static academic summaries from storage</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm space-y-2">
          <div className="text-4xl">📦</div>
          <p className="font-bold text-slate-700">No archived projects found</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchQuery || selectedBatch !== 'ALL' || capstoneFilter !== 'ALL'
              ? 'No projects match your search or filter criteria. Try clearing filters.'
              : 'When a graduating batch session is closed and archived under Capstone Decision, projects will appear here permanently with full NBA SAR Criterion 2.2 dossiers.'}
          </p>
        </div>
      ) : (
        /* Projects List */
        <div className="grid grid-cols-1 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col md:flex-row gap-5 justify-between items-start"
            >
              <div className="space-y-3 flex-1">
                {/* Meta header */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Batch {project.batchId}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    Group {project.groupNumber}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Graduating Year: {project.year}
                  </span>
                  {project.isCapstone ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1 shadow-xs">
                      🌟 Capstone Project
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      Standard Project
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-50 text-slate-600 border border-slate-200">
                    {project.topicCode}
                  </span>
                </div>

                {/* Topic Title */}
                <div>
                  <h3
                    onClick={() => setSelectedProject(project)}
                    className="font-bold text-lg text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                  >
                    {project.topicTitle}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>
                      <strong>Domain:</strong> {project.domain}
                    </span>
                    <span>•</span>
                    <span>
                      <strong>Supervisor:</strong> {project.supervisorName}{' '}
                      <span className="text-slate-400">({project.supervisorEmail})</span>
                    </span>
                  </div>
                </div>

                {/* Student Roster & Badges */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Student Team Members ({project.students.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {project.students.map((st, idx) => (
                      <div key={idx} className="text-xs flex items-center justify-between bg-white p-2 rounded-md border border-slate-200">
                        <div>
                          <p className="font-semibold text-slate-900">{st.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">{st.roll}</p>
                        </div>
                        {st.badges && st.badges.total > 0 && (
                          <div className="flex items-center gap-1 text-[11px]" title={`${st.badges.total} badges earned`}>
                            {st.badges.diamonds > 0 && <span>💎{st.badges.diamonds}</span>}
                            {st.badges.gold > 0 && <span>🥇{st.badges.gold}</span>}
                            {st.badges.silver > 0 && <span>🥈{st.badges.silver}</span>}
                            {st.badges.copper > 0 && <span>🥉{st.badges.copper}</span>}
                            {st.badges.iron > 0 && <span>⚙️{st.badges.iron}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Attributes & SDGs Preview */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {project.attributes.map((a) => (
                    <span
                      key={a.code}
                      className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200"
                      title={`${a.title} (Level ${a.level})`}
                    >
                      {a.code} (L{a.level})
                    </span>
                  ))}
                  {project.sdgs.map((s) => (
                    <span
                      key={s.code}
                      className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                      title={s.title}
                    >
                      🌍 {s.code}
                    </span>
                  ))}
                </div>

                {/* PO Attainment Preview Chips */}
                {project.poAttainments && project.poAttainments.length > 0 && (
                  <div className="pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Program Outcomes Attainment Preview:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {project.poAttainments.map((po) => (
                        <span
                          key={po.code}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            po.isAttained
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                          title={`${po.code}: ${po.percentage.toFixed(1)}% (Level ${po.level})`}
                        >
                          {po.code}: L{po.level} ({po.percentage.toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex md:flex-col gap-2 w-full md:w-auto shrink-0 justify-end pt-2 md:pt-0">
                <button
                  onClick={() => setSelectedProject(project)}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View NBA Report
                </button>

                {project.driveFileUrl && (
                  <a
                    href={project.driveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-1.41-1.41L14.17 13H6v-2h8.17l-3.58-3.59L12 6l5 7z" />
                    </svg>
                    Batch Drive
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: FULL NBA STATIC REPORT VIEWER (PRINTABLE) */}
      {/* ==================================================== */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 md:p-8 shadow-2xl space-y-6 my-8 max-h-[92vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:p-0 print:border-none print:m-0">
            {/* Action Bar (Hidden during print) */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 no-print print:hidden">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  🏛️ NBA Evaluation Dossier
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Batch {selectedProject.batchId} • Year {selectedProject.year}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  🖨️ Print / Save PDF
                </button>
                {selectedProject.driveFileUrl && (
                  <a
                    href={selectedProject.driveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    📁 Drive Archive
                  </a>
                )}
                <button
                  onClick={() => setSelectedProject(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Dossier Header - Printed */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
              <h2 className="text-xl font-black uppercase tracking-wide text-slate-900">
                Heritage Institute of Technology, Kolkata
              </h2>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                Department of Electronics &amp; Communication Engineering (B.Tech ECE)
              </p>
              <p className="text-xs font-medium text-slate-500">
                NBA Self Assessment Report (SAR) • Criterion 2.2: Project Evaluation &amp; PO Attainment Dossier
              </p>
            </div>

            {/* Project Overview Card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Project Topic</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedProject.topicTitle}</p>
                <div className="flex gap-2 text-slate-600 mt-1">
                  <span><strong>Code:</strong> {selectedProject.topicCode}</span>
                  <span>•</span>
                  <span><strong>Domain:</strong> {selectedProject.domain}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Academic Session &amp; Classification</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  Batch {selectedProject.batchId} (Graduating Class of {selectedProject.year})
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span>Group {selectedProject.groupNumber}</span>
                  <span>•</span>
                  {selectedProject.isCapstone ? (
                    <span className="font-bold text-purple-700">🌟 Confirmed Capstone Project</span>
                  ) : (
                    <span className="text-slate-600">Standard Project</span>
                  )}
                </div>
              </div>
            </div>

            {/* Supervisor & Student Team */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Faculty Supervisor
                </span>
                <p className="font-bold text-sm text-slate-900">{selectedProject.supervisorName}</p>
                <p className="text-xs text-slate-500">{selectedProject.supervisorEmail}</p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Student Team Roster ({selectedProject.students.length} Members)
                </span>
                <div className="space-y-1.5 mt-1">
                  {selectedProject.students.map((st, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-800">
                        {st.name} <span className="font-mono text-slate-500">({st.roll})</span>
                      </span>
                      {st.badges && (
                        <div className="flex items-center gap-1 text-[11px]">
                          {st.badges.diamonds > 0 && <span>💎{st.badges.diamonds}</span>}
                          {st.badges.gold > 0 && <span>🥇{st.badges.gold}</span>}
                          {st.badges.silver > 0 && <span>🥈{st.badges.silver}</span>}
                          {st.badges.copper > 0 && <span>🥉{st.badges.copper}</span>}
                          {st.badges.iron > 0 && <span>⚙️{st.badges.iron}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Washington Accord & SDGs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                <span className="font-bold text-blue-900 block text-xs uppercase tracking-wider">
                  Washington Accord Attributes (WP, WK, EA)
                </span>
                <div className="space-y-1.5">
                  {selectedProject.attributes.length > 0 ? (
                    selectedProject.attributes.map((a) => (
                      <div key={a.code} className="flex justify-between items-start text-[11px]">
                        <div>
                          <strong>{a.code}</strong>: {a.title}
                          {a.reason && <p className="text-slate-500 text-[10px] italic">{a.reason}</p>}
                        </div>
                        <span className="font-bold text-blue-800 ml-2 shrink-0">Level {a.level}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">No specific attribute mappings recorded.</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                <span className="font-bold text-emerald-900 block text-xs uppercase tracking-wider">
                  Sustainable Development Goals (SDGs)
                </span>
                <div className="space-y-1.5">
                  {selectedProject.sdgs.length > 0 ? (
                    selectedProject.sdgs.map((s) => (
                      <div key={s.code} className="text-[11px]">
                        <strong>🌍 {s.code}: {s.title}</strong>
                        <p className="text-emerald-800 text-[10px]">Target: {s.target}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">No specific SDG mappings recorded.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Semester Marks (if available) */}
            {selectedProject.semesterMarks && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider block">
                  Cumulative Semester Rubric Marks Breakdown
                </span>
                <div className="grid grid-cols-3 gap-3 text-xs text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 block">Semester 6 (Rubric A/B)</span>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedProject.semesterMarks.sem6?.total ?? '—'} / 100
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 block">Semester 7 (Rubric C/D)</span>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedProject.semesterMarks.sem7?.total ?? '—'} / 100
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 block">Semester 8 (Rubric E/F)</span>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedProject.semesterMarks.sem8?.total ?? '—'} / 100
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* NBA Program Outcomes (PO1 to PO11) Attainment Scorecard */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Program Outcomes (PO1 to PO11) Attainment Scorecard
                </h4>
                <span className="text-[11px] text-slate-500">
                  Level 3: &ge;70% • Level 2: &ge;60% • Level 1: &ge;50%
                </span>
              </div>

              {selectedProject.poAttainments && selectedProject.poAttainments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedProject.poAttainments.map((po) => (
                    <div
                      key={po.code}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        po.isAttained
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{po.code}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            po.isAttained
                              ? 'bg-emerald-200 text-emerald-900'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          Level {po.level}
                        </span>
                      </div>
                      {/* Attainment progress bar */}
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            po.level === 3
                              ? 'bg-emerald-600'
                              : po.level === 2
                              ? 'bg-blue-600'
                              : po.level === 1
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, po.percentage))}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>Attainment: {po.percentage.toFixed(1)}%</span>
                        <span className="font-semibold">
                          {po.isAttained ? '✓ Attained' : '✗ Below Threshold'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                  PO attainment calculation details not available in this profile.
                </p>
              )}
            </div>

            {/* Decision Notes (if any) */}
            {selectedProject.decisionNotes && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs">
                <span className="font-bold text-purple-900 block mb-0.5">Project Committee Decision Notes:</span>
                <p className="text-purple-800">{selectedProject.decisionNotes}</p>
              </div>
            )}

            {/* Print Sign-off Block (Visible on print) */}
            <div className="hidden print:block pt-12 mt-8 border-t border-slate-400 text-xs">
              <div className="flex justify-between items-end pt-12">
                <div className="text-center">
                  <div className="w-48 border-b border-slate-900 mb-1"></div>
                  <p className="font-bold text-slate-900">Faculty Supervisor Signature</p>
                  <p className="text-[10px] text-slate-500">{selectedProject.supervisorName}</p>
                </div>
                <div className="text-center">
                  <div className="w-48 border-b border-slate-900 mb-1"></div>
                  <p className="font-bold text-slate-900">ECE Project Committee Convener</p>
                  <p className="text-[10px] text-slate-500">Heritage Institute of Technology</p>
                </div>
                <div className="text-center">
                  <div className="w-48 border-b border-slate-900 mb-1"></div>
                  <p className="font-bold text-slate-900">Head of Department (ECE)</p>
                  <p className="text-[10px] text-slate-500">HITK Accreditation Cell</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-4 border-t border-slate-200 no-print print:hidden">
              <button
                onClick={() => setSelectedProject(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
