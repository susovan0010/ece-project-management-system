'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyConfirmedTopicsAction } from '@/app/actions/faculty-topics';

export default function MyTopicsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await getMyConfirmedTopicsAction();
      if (res.error) {
        setError(res.error);
      } else {
        setTopics(res.topics || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Supervisor Portfolio
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            My Confirmed &amp; Supervised Topics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Projects you proposed or oversee as faculty supervisor with Washington Accord &amp; SDG mappings.
          </p>
        </div>

        <Link
          href="/faculty/topics/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>+ Propose New Topic</span>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Loading topics...</div>
      ) : topics.length === 0 ? (
        <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
          <p className="text-sm font-semibold text-slate-700">No confirmed topics found.</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You haven&apos;t proposed any topics yet or been assigned groups. Search the bank or draft a new proposal.
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
          {topics.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                    {t.code}
                  </span>
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
                        : 'None yet'}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {t.groups && t.groups.length > 0 && (
                    <Link
                      href={`/faculty/marks?group=${t.groups[0].id}`}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      Enter Marks
                    </Link>
                  )}
                  <Link
                    href={`/faculty/topics`}
                    className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
                  >
                    View in Bank
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
