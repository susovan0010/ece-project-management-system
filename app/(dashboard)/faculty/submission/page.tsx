'use client';

import { useState, useEffect } from 'react';
import {
  getFacultySubmissionsAction,
  reviewFacultySubmissionAction,
  respondToAdminSubmissionDeleteAction,
} from '@/app/actions/submission';

export default function FacultySubmissionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getFacultySubmissionsAction();
    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      const list = res.groups || [];
      setGroups(list);
      const initialComments: Record<string, string> = {};
      for (const g of list) {
        for (const s of g.submissions || []) {
          initialComments[s.id] = s.supervisorComment || '';
        }
      }
      setComments(initialComments);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleReview(submissionId: string, decision: 'REVISION_REQUESTED' | 'COMPLETED') {
    setProcessingId(submissionId);
    setError(null);
    setSuccessMsg(null);
    const res = await reviewFacultySubmissionAction(
      submissionId,
      decision,
      comments[submissionId] || ''
    );
    setProcessingId(null);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Review updated.');
      await loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      <div className="border-b border-slate-200 pb-5">
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          Supervisor Workspace • Group Submissions
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          Student Progress Reports &amp; Presentations
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review submissions uploaded by your allotted groups, return comments for revision, or mark documents as Completed so Admin receives the Drive link.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading group submissions...</div>
      ) : groups.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-500 text-sm">
          No active groups allotted to you yet.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
                      Group {g.number} ({g.batchId})
                    </span>
                    <span className="font-mono text-xs font-bold text-blue-700">{g.topicCode}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1">{g.topicTitle}</h3>
                </div>
                <div className="text-[11px] text-slate-500">
                  {g.students.map((st: any) => `${st.name} (${st.roll})`).join(', ')}
                </div>
              </div>

              {g.submissions.length === 0 ? (
                <div className="p-6 text-xs text-slate-400 italic">
                  No documents uploaded by Group {g.number} yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {g.submissions.map((s: any) => {
                    const isCompleted = s.status === 'COMPLETED';
                    const isBusy = processingId === s.id;
                    return (
                      <div key={s.id} className="p-5 flex flex-col lg:flex-row gap-4 justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                              {s.semester}th Semester
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-bold">
                              {s.docType === 'PROGRESS_REPORT' ? 'Progress Report' : 'Presentation'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : s.status === 'REVISION_REQUESTED'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-blue-100 text-blue-800 border-blue-300'
                              }`}
                            >
                              {isCompleted
                                ? '✓ Completed'
                                : s.status === 'REVISION_REQUESTED'
                                ? '↻ Revision Requested'
                                : 'Submitted for Review'}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900">
                            📄 {s.fileName}{' '}
                            <span className="font-mono text-[10px] text-slate-500 uppercase">
                              (.{s.fileExtension}, {(s.fileSize / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Latest upload by <strong>{s.uploadedByName}</strong> on{' '}
                            {new Date(s.uploadedAt).toLocaleString('en-IN')}
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <a
                              href={s.driveViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition"
                            >
                              Open / Inspect in Drive ↗
                            </a>
                            <a
                              href={`/api/submissions/${s.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                            >
                              ⬇ Download
                            </a>
                          </div>
                        </div>

                        <div className="w-full lg:w-96 space-y-2">
                          <textarea
                            rows={2}
                            placeholder="Enter review comments / requested changes for students..."
                            value={comments[s.id] ?? ''}
                            disabled={isCompleted || isBusy}
                            onChange={(e) =>
                              setComments((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                          />
                          {!isCompleted ? (
                            <div className="flex flex-wrap gap-2 justify-end">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReview(s.id, 'REVISION_REQUESTED')}
                                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold disabled:opacity-50"
                              >
                                ↻ Return with Comments
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReview(s.id, 'COMPLETED')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                              >
                                ✓ Completed (Accept)
                              </button>
                            </div>
                          ) : (
                            <p className="text-[11px] font-semibold text-emerald-700 text-right">
                              ✓ Accepted &amp; shared with Admin (link only)
                            </p>
                          )}

                          {s.adminDeleteRequested && !s.adminDeleteApproved && (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 space-y-2">
                              <p className="text-[11px] font-bold text-amber-900">
                                ⚠️ Admin requested permission to delete this submission.
                              </p>
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setProcessingId(s.id);
                                    const res = await respondToAdminSubmissionDeleteAction(s.id, false);
                                    setProcessingId(null);
                                    if (res.error) setError(res.error);
                                    else {
                                      setSuccessMsg(res.message || 'Declined.');
                                      await loadData();
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded text-[11px] font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                                >
                                  ✕ Decline
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setProcessingId(s.id);
                                    const res = await respondToAdminSubmissionDeleteAction(s.id, true);
                                    setProcessingId(null);
                                    if (res.error) setError(res.error);
                                    else {
                                      setSuccessMsg(res.message || 'Approved.');
                                      await loadData();
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white"
                                >
                                  ✓ Approve Admin Delete
                                </button>
                              </div>
                            </div>
                          )}

                          {s.adminDeleteApproved && (
                            <p className="text-[11px] font-semibold text-red-700 text-right">
                              ✓ Admin deletion approved by supervisor
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
