'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyConfirmedTopicsAction } from '@/app/actions/faculty-topics';
import { updateTopicCategoryAction } from '@/app/actions/topics';
import { deriveMappedPoCodes, getAttainmentLevel } from '@/lib/engine';
import { evaluateRules } from '@/lib/rules';
import {
  completeAndArchiveTopicAction,
  reactivateArchivedTopicAction,
  getArchivedProjectsAction,
  confirmDraftTopicAction,
  deleteUnconfirmedTopicAction,
  requestTopicDeletionAction,
  getTopicDeleteRequestsAction,
  finalDeleteApprovedTopicAction,
  supervisorResolveAdminDeleteRequestAction,
  TopicDeleteRequestRecord,
  ArchivedProjectRecord,
} from '@/app/actions/project-lifecycle';

export default function MyTopicsClient() {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProjectRecord[]>([]);
  const [pendingDeleteRequests, setPendingDeleteRequests] = useState<TopicDeleteRequestRecord[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const [topicsRes, archiveRes, deleteReqRes] = await Promise.all([
      getMyConfirmedTopicsAction(),
      getArchivedProjectsAction(),
      getTopicDeleteRequestsAction(),
    ]);

    if (topicsRes.error) {
      setError(topicsRes.error);
    } else {
      setTopics(topicsRes.topics || []);
    }

    if (!archiveRes.error && archiveRes.archivedProjects) {
      setArchivedProjects(archiveRes.archivedProjects);
    }

    if (!deleteReqRes.error && deleteReqRes.requests) {
      setPendingDeleteRequests(deleteReqRes.requests);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleConfirmDraft(topicId: string, code: string) {
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await confirmDraftTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Project ${code} is now Confirmed and marked Active.`);
      await loadAll();
    }
    setProcessingId(null);
  }

  async function handleDeleteUnconfirmed(topicId: string, code: string) {
    if (!window.confirm(`Are you sure you want to delete unconfirmed project ${code}?`)) {
      return;
    }
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await deleteUnconfirmedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Unconfirmed project ${code} has been deleted.`);
      await loadAll();
    }
    setProcessingId(null);
  }

  async function handleRequestDeleteToAdmin(topicId: string, code: string) {
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await requestTopicDeletionAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Delete request for confirmed project ${code} has been sent to the Admin. Once the Admin agrees, a "Final Delete" button will appear here for you.`
      );
      await loadAll();
    }
    setProcessingId(null);
  }

  async function handleFinalDeleteApproved(topicId: string, code: string) {
    if (
      !window.confirm(
        `Admin has agreed to your delete request for ${code}. Click OK to finally delete this project from your supervisor account.`
      )
    ) {
      return;
    }
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await finalDeleteApprovedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Project ${code} has been finally deleted from your supervisor account.`
      );
      await loadAll();
    }
    setProcessingId(null);
  }

  async function handleResolveAdminDeleteRequest(
    topicId: string,
    code: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    if (
      decision === 'APPROVE' &&
      !window.confirm(
        `Admin requested your permission to delete project ${code}. Click OK to grant permission and delete this project.`
      )
    ) {
      return;
    }
    setProcessingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await supervisorResolveAdminDeleteRequestAction(topicId, decision);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        decision === 'APPROVE'
          ? `You granted permission and project ${code} has been deleted.`
          : `You declined the Admin's delete request for project ${code}.`
      );
      await loadAll();
    }
    setProcessingId(null);
  }

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
            {activeTopics.map((t) => {
              const isDraft = t.status === 'DRAFT';
              const matchingReq = pendingDeleteRequests.find((r) => r.topicId === t.id);
              const isAdminRequestingDelete = matchingReq?.initiatedBy === 'ADMIN';
              const isDeleteApprovedByAdmin =
                !isAdminRequestingDelete && matchingReq?.status === 'APPROVED';
              const isDeletePendingAdmin =
                !isAdminRequestingDelete && Boolean(matchingReq) && !isDeleteApprovedByAdmin;

              return (
                <div
                  key={t.id}
                  className={`bg-white border border-slate-200 border-t-4 ${
                    isDeleteApprovedByAdmin
                      ? 'border-t-red-600'
                      : isDraft
                      ? 'border-t-amber-500'
                      : 'border-t-emerald-600'
                  } rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                          {t.code}
                        </span>
                        {isAdminRequestingDelete ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            ADMIN REQUESTED PERMISSION TO DELETE
                          </span>
                        ) : isDeleteApprovedByAdmin ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            ADMIN AGREED TO DELETE (READY FOR FINAL DELETE)
                          </span>
                        ) : isDraft ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            UNCONFIRMED (DRAFT)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ACTIVE ({t.status})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          Theme: {t.domain || 'General ECE'}
                        </span>
                        <select
                          value={t.category || 'Custom'}
                          onChange={async (e) => {
                            const newCat = e.target.value;
                            setTopics((prev) =>
                              prev.map((item) =>
                                item.id === t.id ? { ...item, category: newCat } : item
                              )
                            );
                            await updateTopicCategoryAction(t.id, newCat);
                          }}
                          title="Supervisor can define or update the project category"
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300 focus:ring-1 focus:ring-blue-600 cursor-pointer"
                        >
                          <option value="Custom">Category: Custom</option>
                          <option value="Hardware">Category: Hardware</option>
                          <option value="Software">Category: Software</option>
                          <option value="Both">Category: Both</option>
                        </select>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          {t.proposer?.name || t.source}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{t.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                        {t.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* WP, WK, EA, PO & SDG Tags & Attainment Progress */}
                    {(() => {
                      const effectiveAttrs =
                        t.attributes && t.attributes.length > 0
                          ? t.attributes.map((a: any) => ({
                              code: a.attribute.code,
                              kind: a.attribute.kind || a.attribute.code.slice(0, 2),
                              level: a.level,
                            }))
                          : (() => {
                              const r = evaluateRules(t.title, `${t.description || ''} ${t.domain || ''}`, t.tags || []);
                              return Object.entries(r.levels).map(([code, level]) => ({
                                code,
                                kind: code.slice(0, 2),
                                level,
                              }));
                            })();
                      const wpAttrs = effectiveAttrs.filter((a: any) => a.kind === 'WP' && a.level > 0);
                      const wkAttrs = effectiveAttrs.filter((a: any) => a.kind === 'WK' && a.level > 0);
                      const eaAttrs = effectiveAttrs.filter((a: any) => a.kind === 'EA' && a.level > 0);
                      const poCodes = deriveMappedPoCodes(
                        effectiveAttrs.map((a: any) => ({
                          level: a.level,
                          attribute: { code: a.code, kind: a.kind },
                        }))
                      );

                      // Gather evaluated group snapshots to compute attained levels vs target
                      const allGroupSnapshots = (t.groups || []).flatMap((g: any) => g.snapshots || []);
                      const groupAttainedMap: Record<string, { ratio: number; level: number; percentage: number }> = {};
                      allGroupSnapshots.forEach((s: any) => {
                        const lvl = getAttainmentLevel(s.attainment);
                        if (!groupAttainedMap[s.metric] || lvl > groupAttainedMap[s.metric].level) {
                          groupAttainedMap[s.metric] = {
                            ratio: s.attainment,
                            level: lvl,
                            percentage: Math.round(s.attainment * 100),
                          };
                        }
                      });

                      const taggedCodes = new Set(effectiveAttrs.map((a: any) => a.code));
                      const additionallyAttained = Object.entries(groupAttainedMap).filter(([code, data]) => {
                        const isAccordAttr = code.startsWith('WP') || code.startsWith('WK') || code.startsWith('EA');
                        return isAccordAttr && data.level >= 1 && !taggedCodes.has(code);
                      });

                      return (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap gap-1.5">
                            {wpAttrs.map((a: any) => {
                              const att = groupAttainedMap[a.code];
                              const isTargetMet = att && att.level >= a.level;
                              return (
                                <span
                                  key={a.code}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                    att
                                      ? isTargetMet
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                  title={`Complex Problem Solving: Target Level ${a.level}${att ? ` | Attained Level ${att.level} (${att.percentage}%)` : ' (Pending Evaluation)'}`}
                                >
                                  {a.code} (Target L{a.level}
                                  {att ? (
                                    <span className="ml-1 text-[9px] font-extrabold text-blue-700">
                                      → Attained L{att.level} [{att.percentage}%] {isTargetMet ? '✓' : ''}
                                    </span>
                                  ) : null}
                                  )
                                </span>
                              );
                            })}
                            {wkAttrs.map((a: any) => {
                              const att = groupAttainedMap[a.code];
                              const isTargetMet = att && att.level >= a.level;
                              return (
                                <span
                                  key={a.code}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                    att
                                      ? isTargetMet
                                        ? 'bg-blue-50 text-blue-900 border-blue-300'
                                        : 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-blue-50 text-blue-800 border-blue-200'
                                  }`}
                                  title={`Engineering Knowledge: Target Level ${a.level}${att ? ` | Attained Level ${att.level} (${att.percentage}%)` : ' (Pending Evaluation)'}`}
                                >
                                  {a.code} (Target L{a.level}
                                  {att ? (
                                    <span className="ml-1 text-[9px] font-extrabold text-indigo-700">
                                      → Attained L{att.level} [{att.percentage}%] {isTargetMet ? '✓' : ''}
                                    </span>
                                  ) : null}
                                  )
                                </span>
                              );
                            })}
                            {eaAttrs.map((a: any) => {
                              const att = groupAttainedMap[a.code];
                              const isTargetMet = att && att.level >= a.level;
                              return (
                                <span
                                  key={a.code}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                    att
                                      ? isTargetMet
                                        ? 'bg-teal-50 text-teal-900 border-teal-300'
                                        : 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-teal-50 text-teal-800 border-teal-200'
                                  }`}
                                  title={`Engineering Activity: Target Level ${a.level}${att ? ` | Attained Level ${att.level} (${att.percentage}%)` : ' (Pending Evaluation)'}`}
                                >
                                  {a.code} (Target L{a.level}
                                  {att ? (
                                    <span className="ml-1 text-[9px] font-extrabold text-teal-800">
                                      → Attained L{att.level} [{att.percentage}%] {isTargetMet ? '✓' : ''}
                                    </span>
                                  ) : null}
                                  )
                                </span>
                              );
                            })}
                            {poCodes.map((po) => {
                              const att = groupAttainedMap[po];
                              return (
                                <span
                                  key={po}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                    att && att.level >= 1
                                      ? 'bg-violet-100 text-violet-900 border-violet-300'
                                      : 'bg-violet-50 text-violet-800 border-violet-200'
                                  }`}
                                  title={`Mapped Program Outcome: ${po}${att ? ` | Attained Level ${att.level} (${att.percentage}%)` : ''}`}
                                >
                                  {po}
                                  {att ? ` (L${att.level})` : ''}
                                </span>
                              );
                            })}
                            {t.sdgs &&
                              t.sdgs.map((s: any) => (
                                <span
                                  key={s.sdgId}
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                  SDG {s.sdg.id}
                                </span>
                              ))}
                          </div>

                          {/* Additionally Attained Attributes (achieved through group rubric evaluation) */}
                          {additionallyAttained.length > 0 && (
                            <div className="pt-2 border-t border-dashed border-slate-200">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                Additionally Attained Attributes (From Evaluation Rubrics):
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {additionallyAttained.map(([code, data]) => (
                                  <span
                                    key={code}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs inline-flex items-center gap-1"
                                    title={`Evaluated & Attained at Level ${data.level} (${data.percentage}%) though not initially tagged.`}
                                  >
                                    <span>+ {code}</span>
                                    <span className="text-[9px] px-1 py-0.2 bg-emerald-200/70 rounded text-emerald-950 font-semibold">
                                      Level {data.level} ({data.percentage}%)
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Groups Assigned & Actions */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>
                        Assigned Groups:{' '}
                        <strong className="text-slate-800">
                          {t.groups && t.groups.length > 0
                            ? t.groups.map((g: any) => `Group ${g.number} (${g.batchId})`).join(', ')
                            : isDraft
                            ? 'Confirm topic to make it active'
                            : 'Ready for group allocation'}
                        </strong>
                      </span>
                    </div>

                    {isAdminRequestingDelete ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                        <div className="text-xs font-bold text-red-900">
                          Admin Requested Your Permission to Delete This Project
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleResolveAdminDeleteRequest(t.id, t.code, 'APPROVE')}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                          >
                            {processingId === t.id ? 'Processing...' : 'Agree & Delete Project'}
                          </button>
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleResolveAdminDeleteRequest(t.id, t.code, 'REJECT')}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                          >
                            Decline Request
                          </button>
                        </div>
                      </div>
                    ) : isDeleteApprovedByAdmin ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={processingId === t.id}
                          onClick={() => handleFinalDeleteApproved(t.id, t.code)}
                          className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                          title="Admin has agreed to your delete request. Click to finally delete this project."
                        >
                          {processingId === t.id
                            ? 'Deleting...'
                            : 'Final Delete (Admin Agreed)'}
                        </button>
                      </div>
                    ) : isDraft ? (
                      /* Unconfirmed (DRAFT) Actions: Direct Confirm, Edit, or Delete */
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleConfirmDraft(t.id, t.code)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                          >
                            {processingId === t.id ? 'Confirming...' : 'Confirm Project'}
                          </button>
                          <Link
                            href={`/faculty/topics/new?edit=${t.code}`}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                          >
                            Edit Project
                          </Link>
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleDeleteUnconfirmed(t.id, t.code)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                          >
                            Delete Project (Before Confirming)
                          </button>
                        </div>

                        <Link
                          href="/faculty/topics"
                          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
                        >
                          View in Bank
                        </Link>
                      </div>
                    ) : (
                      /* Confirmed (ACTIVE / ALLOTTED) Actions: Edit, Request Delete to Admin, or Complete/Archive */
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/faculty/topics/new?edit=${t.code}`}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                          >
                            Edit Project
                          </Link>
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

                          {isAdminRequestingDelete ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                        <div className="text-xs font-bold text-red-900">
                          Admin Requested Your Permission to Delete This Project
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleResolveAdminDeleteRequest(t.id, t.code, 'APPROVE')}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                          >
                            {processingId === t.id ? 'Processing...' : 'Agree & Delete Project'}
                          </button>
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => handleResolveAdminDeleteRequest(t.id, t.code, 'REJECT')}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                          >
                            Decline Request
                          </button>
                        </div>
                      </div>
                    ) : isDeleteApprovedByAdmin ? (
                            <button
                              type="button"
                              disabled={processingId === t.id}
                              onClick={() => handleFinalDeleteApproved(t.id, t.code)}
                              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                              title="Admin has agreed to your delete request. Click to finally delete this project from your supervisor account."
                            >
                              {processingId === t.id
                                ? 'Deleting...'
                                : 'Final Delete (Admin Agreed)'}
                            </button>
                          ) : isDeletePendingAdmin ? (
                            <span className="px-2.5 py-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-semibold">
                              Delete Request Pending Admin Approval
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={processingId === t.id}
                              onClick={() => handleRequestDeleteToAdmin(t.id, t.code)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                              title="Once confirmed, request the Admin to remove this topic from your supervisor pool"
                            >
                              Request Delete to Admin
                            </button>
                          )}
                        </div>

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
                    )}
                  </div>
                </div>
              );
            })}
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
