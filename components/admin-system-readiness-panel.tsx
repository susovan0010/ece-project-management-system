'use client';

import { useState, useEffect } from 'react';
import {
  getSystemReadinessAction,
  updateBatchDeadlinesAction,
  ReadinessCheckItem,
  BatchDeadlines,
} from '@/app/actions/system-health';

export default function AdminSystemReadinessPanel({
  activeBatchId,
  initialDeadlines,
}: {
  activeBatchId: string | null;
  initialDeadlines: BatchDeadlines | null;
}) {
  const [checks, setChecks] = useState<ReadinessCheckItem[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(true);

  const [topicSelection, setTopicSelection] = useState(initialDeadlines?.topicSelection || '');
  const [sem7Panel, setSem7Panel] = useState(initialDeadlines?.sem7Panel || '');
  const [sem8Marks, setSem8Marks] = useState(initialDeadlines?.sem8Marks || '');
  const [note, setNote] = useState(initialDeadlines?.note || '');
  const [savingDeadlines, setSavingDeadlines] = useState(false);
  const [deadlineMsg, setDeadlineMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function loadChecks() {
    setLoadingChecks(true);
    const res = await getSystemReadinessAction();
    if (res.success && res.checks) {
      setChecks(res.checks);
    }
    setLoadingChecks(false);
  }

  useEffect(() => {
    loadChecks();
  }, []);

  async function handleSaveDeadlines(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBatchId) return;
    setSavingDeadlines(true);
    setDeadlineMsg(null);
    const res = await updateBatchDeadlinesAction({
      batchId: activeBatchId,
      topicSelection,
      sem7Panel,
      sem8Marks,
      note,
    });
    setSavingDeadlines(false);
    if (res.success) {
      setDeadlineMsg({ type: 'ok', text: res.message || 'Deadlines saved.' });
    } else {
      setDeadlineMsg({ type: 'err', text: res.error || 'Failed to save deadlines.' });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* System Readiness & Integration Health */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">System Readiness &amp; Integration Health</h2>
            <p className="text-xs text-slate-500">Live configuration check for DB, Drive, Email, AI &amp; Cron.</p>
          </div>
          <button
            type="button"
            onClick={loadChecks}
            disabled={loadingChecks}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 disabled:opacity-50"
          >
            {loadingChecks ? 'Checking...' : '↻ Re-check'}
          </button>
        </div>

        <div className="space-y-2">
          {loadingChecks && checks.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Running readiness checks...</p>
          ) : (
            checks.map((c) => (
              <div
                key={c.key}
                className={`p-3 rounded-lg border flex items-start justify-between gap-3 text-xs ${
                  c.ok
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : c.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div>
                  <div className="font-bold text-slate-900">{c.label}</div>
                  <div className="text-slate-600 mt-0.5">{c.detail}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${
                    c.ok
                      ? 'bg-emerald-100 text-emerald-800'
                      : c.severity === 'critical'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {c.ok ? 'Ready' : c.severity === 'critical' ? 'Missing' : 'Optional'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Batch-Wide Milestone Deadlines */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Batch-Wide Milestone Deadlines</h2>
          <p className="text-xs text-slate-500">
            {activeBatchId
              ? `Displayed as countdown banners to Faculty & Students in Batch ${activeBatchId}.`
              : 'No active unarchived batch found.'}
          </p>
        </div>

        {activeBatchId ? (
          <form onSubmit={handleSaveDeadlines} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Topic Selection</label>
                <input
                  type="date"
                  value={topicSelection}
                  onChange={(e) => setTopicSelection(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Sem 7 Panel</label>
                <input
                  type="date"
                  value={sem7Panel}
                  onChange={(e) => setSem7Panel(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Sem 8 Marks</label>
                <input
                  type="date"
                  value={sem8Marks}
                  onChange={(e) => setSem8Marks(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Committee Notice / Banner Note</label>
              <input
                type="text"
                maxLength={240}
                placeholder="e.g., All supervisors must finalize Sem 8 marks before panel lock."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {deadlineMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium ${
                  deadlineMsg.type === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {deadlineMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingDeadlines}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {savingDeadlines ? 'Saving...' : 'Save Batch Deadlines'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-slate-400 italic py-4">Activate or import a batch to configure milestone deadlines.</p>
        )}
      </div>
    </div>
  );
}
