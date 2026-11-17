'use client';

import { useState, useEffect } from 'react';
import {
  getStudentSubmissionsAction,
  uploadStudentSubmissionAction,
  deleteStudentSubmissionAction,
  DocTypeValue,
} from '@/app/actions/submission';

export default function StudentSubmissionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedSem, setSelectedSem] = useState<6 | 7 | 8>(6);
  const [group, setGroup] = useState<{
    id: string;
    number: number;
    batchId: string;
    topicCode: string;
    topicTitle: string;
    supervisorName: string;
  } | null>(null);
  const [openSemesters, setOpenSemesters] = useState<Record<6 | 7 | 8, boolean>>({
    6: false,
    7: false,
    8: false,
  });
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteSubmission(submissionId: string, fileName: string) {
    if (!window.confirm(`Delete "${fileName}"? You can upload a new file while the semester is open.`)) {
      return;
    }
    setDeletingId(submissionId);
    setError(null);
    setSuccessMsg(null);
    const res = await deleteStudentSubmissionAction(submissionId);
    setDeletingId(null);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Submission deleted.');
      await loadData();
    }
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getStudentSubmissionsAction();
    if (res.error) {
      setError(res.error);
    } else if (res.success) {
      setGroup(res.group || null);
      if (res.openSemesters) setOpenSemesters(res.openSemesters);
      setSubmissions(res.submissions || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleFileUpload(docType: DocTypeValue, file: File | null) {
    if (!file) return;
    setError(null);
    setSuccessMsg(null);

    if (file.size > 15 * 1024 * 1024) {
      setError('File size must not exceed 15 MB.');
      return;
    }

    setUploadingKey(`${selectedSem}-${docType}`);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read selected file.'));
        reader.readAsDataURL(file);
      });

      const res = await uploadStudentSubmissionAction({
        semester: selectedSem,
        docType,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        dataUrlOrBase64: dataUrl,
      });

      if (res.error) {
        setError(res.error);
      } else {
        setSuccessMsg(res.message || 'Uploaded successfully.');
        await loadData();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingKey(null);
    }
  }

  const isSemOpen = openSemesters[selectedSem];

  const getSubmissionFor = (docType: DocTypeValue) =>
    submissions.find((s) => s.semester === selectedSem && s.docType === docType) || null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="border-b border-slate-200 pb-5">
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Student Portal • Google Drive Submission
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          Semester Progress Report &amp; Presentation Submission
        </h1>
        {group && (
          <p className="text-sm text-slate-500 mt-1">
            Group <strong>{group.number}</strong> ({group.batchId}) • {group.topicCode}: {group.topicTitle} • Supervisor: <strong>{group.supervisorName}</strong>
          </p>
        )}
      </div>

      {/* Mandatory Group Replacement Warning */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-3">
        <span className="text-base leading-none">⚠️</span>
        <div className="space-y-1">
          <strong className="block text-xs uppercase tracking-wider text-amber-900">
            Important Group Submission Policy
          </strong>
          <p>
            Any member of your group can upload documents. Uploading a new revised{' '}
            <strong>Progress Report</strong> or <strong>Presentation</strong> will{' '}
            <strong>permanently replace the previous file</strong> in Google Drive (even if the filename is different) and will be treated as your group&apos;s latest submission.
          </p>
        </div>
      </div>

      {/* Semester Tabs (6th, 7th, 8th) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {([6, 7, 8] as const).map((sem) => {
          const open = openSemesters[sem];
          return (
            <button
              key={sem}
              type="button"
              onClick={() => {
                setSelectedSem(sem);
                setError(null);
                setSuccessMsg(null);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                selectedSem === sem
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{sem}th Semester</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  open
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {open ? '🔓 Open' : '🔒 Locked'}
              </span>
            </button>
          );
        })}
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

      {!isSemOpen && !loading && (
        <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-700 font-medium">
          🔒 <strong>{selectedSem}th Semester</strong> submission is currently turned off. It will unlock automatically when the Project Committee Admin unlocks {selectedSem}th Semester marks.
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading submissions...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(
            [
              {
                docType: 'PROGRESS_REPORT' as DocTypeValue,
                title: 'Progress Report',
                accept: '.doc,.docx,.pdf',
                formatsLabel: 'DOC, DOCX, or PDF (Max 15 MB)',
              },
              {
                docType: 'PRESENTATION' as DocTypeValue,
                title: 'Presentation (PPT / PDF)',
                accept: '.ppt,.pptx,.pdf',
                formatsLabel: 'PPT, PPTX, or PDF (Max 15 MB)',
              },
            ] as const
          ).map((slot) => {
            const existing = getSubmissionFor(slot.docType);
            const isCompleted = existing?.status === 'COMPLETED';
            const isUploading = uploadingKey === `${selectedSem}-${slot.docType}`;
            const disabled = !isSemOpen || isCompleted || isUploading;

            return (
              <div
                key={slot.docType}
                className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedSem}th Sem — {slot.title}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">{slot.formatsLabel}</p>
                  </div>
                  {existing ? (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        existing.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : existing.status === 'REVISION_REQUESTED'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }`}
                    >
                      {existing.status === 'COMPLETED'
                        ? '✓ Completed'
                        : existing.status === 'REVISION_REQUESTED'
                        ? '↻ Revision Requested'
                        : 'Submitted'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                      Not Uploaded
                    </span>
                  )}
                </div>

                {existing && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 truncate" title={existing.fileName}>
                        📄 {existing.fileName}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] uppercase">
                        .{existing.fileExtension}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Uploaded by <strong>{existing.uploadedByName}</strong> on{' '}
                      {new Date(existing.uploadedAt).toLocaleString('en-IN')}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {existing.driveViewLink && (
                        <a
                          href={existing.driveViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 underline"
                        >
                          Open in Google Drive ↗
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={isCompleted || deletingId === existing.id}
                        onClick={() => handleDeleteSubmission(existing.id, existing.fileName)}
                        title={
                          isCompleted
                            ? 'Disabled: Marked Completed by your supervisor.'
                            : 'Delete this submission before supervisor marks it Completed'
                        }
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition bg-red-50 hover:bg-red-100 text-red-700 border-red-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed"
                      >
                        {deletingId === existing.id ? 'Deleting...' : '🗑 Delete'}
                      </button>
                    </div>
                    {existing.supervisorComment && (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
                        <strong className="block text-[10px] uppercase tracking-wider text-amber-800">
                          Supervisor Comment:
                        </strong>
                        <p className="mt-0.5 whitespace-pre-line">{existing.supervisorComment}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label
                    className={`block w-full text-center px-4 py-3 rounded-xl border-2 border-dashed text-xs font-bold transition ${
                      disabled
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-50/40 border-blue-300 text-blue-800 hover:bg-blue-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="file"
                      accept={slot.accept}
                      disabled={disabled}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleFileUpload(slot.docType, file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    {isUploading
                      ? 'Uploading to Google Drive...'
                      : isCompleted
                      ? 'Finalized (Marked Completed by Supervisor)'
                      : !isSemOpen
                      ? `Locked (${selectedSem}th Sem Marks Locked)`
                      : existing
                      ? `Browse & Replace ${slot.title}`
                      : `Browse & Upload ${slot.title}`}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
