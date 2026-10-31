'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyConfirmedTopicsAction } from '@/app/actions/faculty-topics';
import {
  completeAndArchiveTopicAction,
  reactivateArchivedTopicAction,
  getArchivedProjectsAction,
  ArchivedProjectRecord,
} from '@/app/actions/project-lifecycle';

export default function MyTopicsClient() {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProjectRecord[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const [topicsRes, archiveRes] = await Promise.all([
      getMyConfirmedTopicsAction(),
      getArchivedProjectsAction(),
    ]);

    if (topicsRes.error) {
      setError(topicsRes.error);
    } else {
      setTopics(topicsRes.topics || []);
    }

    if (!archiveRes.error && archiveRes.archivedProjects) {
      setArchivedProjects(archiveRes.archivedProjects);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCompleteAndArchive(topicId: string, code: string) {
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await completeAndArchiveTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Project ${code} has been deactivated (marked Completed) and moved to the Archive with all supervisor, student, group, and multi-semester marks preserved.`
      );
      await loadAll();
    }
    setProcessingId(null);
  }

  async function handleReactivate(topicId: string, code: string) {
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await reactivateArchivedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Project ${code} has been reactivated back to your Active Portfolio.`);
      await loadAll();
    }
    setProcessingId(null);
  }

  const activeTopics = topics.filter((t) => t.status !== 'ARCHIVED');

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Supervisor Portfolio &amp; Project Archive
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            My Active &amp; Completed Projects
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View active topics you selected or proposed, deactivate projects completed after 8th semester assessment, and inspect archived records with all semester marks.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/faculty/topics"
            className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            Choose from Topic Bank
          </Link>
          <Link
            href="/faculty/topics/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
          >
            <span>+ Propose Own Topic</span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'ACTIVE'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Active Topics &amp; Projects ({activeTopics.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ARCHIVED')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'ARCHIVED'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Completed &amp; Archived Projects ({archivedProjects.length})
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Loading your projects...</div>
      ) : activeTab === 'ACTIVE' ? (
        activeTopics.length === 0 ? (
          <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">No active topics found.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Select a topic from the Topic Bank or write and confirm your own proposal to mark it Active.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Link
                href="/faculty/topics"
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Search Topic Bank
              </Link>
              <Link
                href="/faculty/topics/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition"
              >
                Propose Original Topic
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeTopics.map((t) => (
              <div
                key={t.id}
                className="bg-white border border-slate-200 border-t-4 border-t-emerald-600 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                        {t.code}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ACTIVE ({t.status})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {t.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        {t.source}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{t.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                      {t.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* SDGs */}
                  {t.sdgs && t.sdgs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {t.sdgs.map((s: any) => (
                        <span
                          key={s.sdgId}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          SDG {s.sdg.id}: {s.sdg.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Groups Assigned & Actions */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>
                      Assigned Groups:{' '}
                      <strong className="text-slate-800">
                        {t.groups && t.groups.length > 0
                          ? t.groups.map((g: any) => `Group ${g.number} (${g.batchId})`).join(', ')
                          : 'Ready for group allocation'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      disabled={processingId === t.id}
                      onClick={() => handleCompleteAndArchive(t.id, t.code)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                      title="Mark this project as completed after 8th semester assessment and archive all details"
                    >
                      {processingId === t.id
                        ? 'Archiving...'
                        : 'Deactivate / Mark Completed (Archive)'}
                    </button>

                    <div className="flex items-center gap-2">
                      {t.groups && t.groups.length > 0 && (
                        <Link
                          href={`/faculty/marks?group=${t.groups[0].id}`}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                        >
                          Enter Marks
                        </Link>
                      )}
                      <Link
                        href="/faculty/topics"
                        className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        View in Bank
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : archivedProjects.length === 0 ? (
        <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700">No completed/archived projects yet.</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Once the 8th-semester assessment of an active project is completed, click &ldquo;Deactivate / Mark Completed (Archive)&rdquo; on an active project to archive its complete record here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {archivedProjects.map((proj) => (
            <div
              key={proj.topicId}
              className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden"
            >
              {/* Archive Header */}
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
                      : proj.proposerName || 'Assigned Faculty'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={processingId === proj.topicId}
                  onClick={() => handleReactivate(proj.topicId, proj.code)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg text-xs font-semibold transition self-start sm:self-auto"
                >
                  {processingId === proj.topicId ? 'Restoring...' : 'Reactivate Project'}
                </button>
              </div>

              {/* Groups & Students Multi-Semester Marks Table */}
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
                          <strong>Group Supervisor:</strong> {grp.supervisorName} ({grp.supervisorEmail})
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
          ))}
        </div>
      )}
    </div>
  );
}
