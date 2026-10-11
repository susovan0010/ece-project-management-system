'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTopicsAction, updateTopicCategoryAction } from '@/app/actions/topics';

interface TopicItem {
  id: string;
  code: string;
  title: string;
  source: string;
  category: string;
  domain: string | null;
  description: string | null;
  tags: string[];
  sdgs: Array<{ sdgId: number }>;
}

export default function AdminTopicsPage() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [sdg, setSdg] = useState(0);

  const loadTopics = useCallback(async (page: number) => {
    setLoading(true);
    const res = await getTopicsAction({
      search,
      source,
      category,
      sdg: sdg > 0 ? sdg : undefined,
      page,
      pageSize: 20,
    });

    setTopics(res.topics as unknown as TopicItem[]);
    setTotalCount(res.totalCount);
    setTotalPages(res.totalPages);
    setCurrentPage(res.currentPage);
    setLoading(false);
  }, [search, source, category, sdg]);

  useEffect(() => {
    loadTopics(1);
  }, [loadTopics]);

  async function handleCategoryChange(id: string, newCat: string) {
    await updateTopicCategoryAction(id, newCat);
    setTopics((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category: newCat } : t))
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Catalogue Topic Bank
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Browse and manage all {totalCount} topics across SIH, UG Research, and Faculty submissions.
          </p>
        </div>

        <Link
          href="/admin/topics/import"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition self-start"
        >
          <span>+ Import Topic Workbooks</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Search Keyword
          </label>
          <input
            type="text"
            placeholder="Search title, code, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Source Origin
          </label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="ALL">All Sources</option>
            <option value="SIH">Smart India Hackathon (SIH)</option>
            <option value="UG_RESEARCH">UG Research</option>
            <option value="FACULTY">Faculty Proposed</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Discipline Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="ALL">All Categories</option>
            <option value="Software">Software</option>
            <option value="Hardware">Hardware</option>
            <option value="Both">Both (Hardware + Software)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            UN SDG Filter
          </label>
          <select
            value={sdg}
            onChange={(e) => setSdg(Number(e.target.value))}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="0">All SDGs</option>
            {Array.from({ length: 17 }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num}>
                SDG {num}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Topics Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-xs text-slate-500">Loading topic catalogue...</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm font-semibold text-slate-700">No topics match this query</p>
            <p className="text-xs text-slate-500">
              Try adjusting the filter criteria or import new topics using the import wizard.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-800 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Topic Code</th>
                  <th className="p-3">Title & Description</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Domain</th>
                  <th className="p-3">SDGs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topics.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {t.code}
                    </td>
                    <td className="p-3 max-w-md">
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      {t.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {t.source}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <select
                        value={t.category}
                        onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                        className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-600"
                      >
                        <option value="Software">Software</option>
                        <option value="Hardware">Hardware</option>
                        <option value="Both">Both</option>
                      </select>
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">
                      {t.domain || '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {t.sdgs.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {t.sdgs.map((s) => (
                            <span
                              key={s.sdgId}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                            >
                              SDG {s.sdgId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Page <span className="font-semibold text-slate-900">{currentPage}</span> of{' '}
              <span className="font-semibold text-slate-900">{totalPages}</span> ({totalCount} total)
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => loadTopics(currentPage - 1)}
                className="px-3 py-1 bg-white border border-slate-300 rounded shadow-xs hover:bg-slate-100 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => loadTopics(currentPage + 1)}
                className="px-3 py-1 bg-white border border-slate-300 rounded shadow-xs hover:bg-slate-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
