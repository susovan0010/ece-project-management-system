'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTopicsAction, updateTopicCategoryAction } from '@/app/actions/topics';
import {
  getTopicDeleteRequestsAction,
  resolveTopicDeleteRequestAction,
  adminDeleteTopicAction,
  adminRequestFacultyTopicDeleteAction,
  TopicDeleteRequestRecord,
} from '@/app/actions/project-lifecycle';
import { deriveMappedPoCodes } from '@/lib/engine';
import { evaluateRules } from '@/lib/rules';

interface TopicItem {
  id: string;
  code: string;
  title: string;
  source: string;
  status: string;
  category: string;
  domain: string | null;
  description: string | null;
  tags: string[];
  proposer: { id: string; name: string; email: string } | null;
  sdgs: Array<{ sdgId: number }>;
  attributes: Array<{
    level: number;
    attribute: { code: string; kind: string; title: string };
  }>;
}

export default function AdminTopicsPage() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [themesList, setThemesList] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRequests, setDeleteRequests] = useState<TopicDeleteRequestRecord[]>([]);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [theme, setTheme] = useState('ALL');
  const [sdg, setSdg] = useState(0);

  const loadTopics = useCallback(async (page: number) => {
    setLoading(true);
    const [res, reqRes] = await Promise.all([
      getTopicsAction({
        search,
        source,
        category,
        theme,
        sdg: sdg > 0 ? sdg : undefined,
        page,
        pageSize: 20,
      }),
      getTopicDeleteRequestsAction(),
    ]);

    setTopics(res.topics as unknown as TopicItem[]);
    setTotalCount(res.totalCount);
    setTotalPages(res.totalPages);
    setCurrentPage(res.currentPage);
    if (res.themes && themesList.length === 0) {
      setThemesList(res.themes);
    }
    if (!reqRes.error && reqRes.requests) {
      setDeleteRequests(reqRes.requests);
    }
    setLoading(false);
  }, [search, source, category, theme, sdg]);

  useEffect(() => {
    loadTopics(1);
  }, [loadTopics]);

  async function handleCategoryChange(id: string, newCat: string) {
    await updateTopicCategoryAction(id, newCat);
    setTopics((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category: newCat } : t))
    );
  }

  async function handleResolveDeleteRequest(
    topicId: string,
    supervisorId: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    const key = `${topicId}:${supervisorId}`;
    setResolvingKey(key);
    setBannerMessage(null);
    const res = await resolveTopicDeleteRequestAction(topicId, supervisorId, decision);
    if (!res.error) {
      setBannerMessage(
        decision === 'APPROVE'
          ? `Approved: ${res.supervisorName} now has the "Final Delete" option enabled for topic ${res.topicCode}.`
          : `Rejected delete request for topic ${res.topicCode} (${res.supervisorName}).`
      );
      await loadTopics(currentPage);
    }
    setResolvingKey(null);
  }

  async function handleAdminDeleteTopic(topicId: string, code: string) {
    if (!window.confirm(`Are you sure you want to delete topic ${code}?`)) {
      return;
    }
    setResolvingKey(topicId);
    setBannerMessage(null);
    const res = await adminDeleteTopicAction(topicId);
    if (res.error) {
      setBannerMessage(res.error);
    } else {
      setBannerMessage(`Topic ${code} has been deleted.`);
      await loadTopics(currentPage);
    }
    setResolvingKey(null);
  }

  async function handleRequestFacultyDelete(topicId: string, code: string) {
    setResolvingKey(topicId);
    setBannerMessage(null);
    const res = await adminRequestFacultyTopicDeleteAction(topicId);
    if (res.error) {
      setBannerMessage(res.error);
    } else if (res.deletedImmediately) {
      setBannerMessage(`Topic ${code} had no assigned supervisor and was deleted.`);
      await loadTopics(currentPage);
    } else {
      setBannerMessage(
        `Permission request sent to supervisor ${res.supervisorName} to delete faculty topic ${code}.`
      );
      await loadTopics(currentPage);
    }
    setResolvingKey(null);
  }

  const supervisorInitiatedRequests = deleteRequests.filter(
    (r) => r.initiatedBy !== 'ADMIN'
  );

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

      {bannerMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          {bannerMessage}
        </div>
      )}

      {/* Pending Supervisor Delete Requests Panel */}
      {supervisorInitiatedRequests.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Pending Supervisor Topic Delete Requests ({supervisorInitiatedRequests.length})
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Supervisors have requested to remove the following confirmed project topics.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {supervisorInitiatedRequests.map((req) => {
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

      {/* Filter Bar */}
      <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Search Keyword / Theme
          </label>
          <input
            type="text"
            placeholder="Search title, code, theme (e.g. Disaster Management)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Project Theme
          </label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="ALL">All Themes</option>
            {themesList.map((th) => (
              <option key={th} value={th}>
                {th}
              </option>
            ))}
          </select>
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
            <option value="Custom">Custom</option>
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
                  <th className="p-3">Title &amp; Description</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Project Theme</th>
                  <th className="p-3">WK, WP, EA, PO &amp; SDG Tags</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topics.map((t) => {
                  const effectiveAttrs =
                    t.attributes && t.attributes.length > 0
                      ? t.attributes
                      : Object.entries(
                          evaluateRules(t.title, `${t.description || ''} ${t.domain || ''}`, t.tags || []).levels
                        ).map(([code, level]) => ({
                          level,
                          attribute: {
                            code,
                            kind: code.slice(0, 2),
                            title: code,
                          },
                        }));

                  const wpCodes = effectiveAttrs
                    .filter((a) => a.attribute.code.startsWith('WP') && a.level >= 1)
                    .map((a) => `${a.attribute.code} (L${a.level})`);
                  const wkCodes = effectiveAttrs
                    .filter((a) => a.attribute.code.startsWith('WK') && a.level >= 1)
                    .map((a) => `${a.attribute.code} (L${a.level})`);
                  const eaCodes = effectiveAttrs
                    .filter((a) => a.attribute.code.startsWith('EA') && a.level >= 1)
                    .map((a) => `${a.attribute.code} (L${a.level})`);
                  const poCodes = deriveMappedPoCodes(effectiveAttrs);

                  return (
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
                        {t.proposer?.name ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-900">{t.proposer.name}</div>
                            {t.source !== 'FACULTY' && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {t.source === 'UG_RESEARCH' ? 'UG Research' : t.source}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {t.source === 'UG_RESEARCH' ? 'UG Research' : t.source}
                          </span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <select
                          value={t.category}
                          onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                          className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="Custom">Custom</option>
                          <option value="Software">Software</option>
                          <option value="Hardware">Hardware</option>
                          <option value="Both">Both</option>
                        </select>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {t.domain ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            {t.domain}
                          </span>
                        ) : (
                          <span className="text-slate-400">General ECE</span>
                        )}
                      </td>
                      <td className="p-3 max-w-sm">
                        <div className="flex flex-wrap gap-1">
                          {wpCodes.map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                            >
                              {code}
                            </span>
                          ))}
                          {wkCodes.map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200"
                            >
                              {code}
                            </span>
                          ))}
                          {eaCodes.map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200"
                            >
                              {code}
                            </span>
                          ))}
                          {poCodes.map((po) => (
                            <span
                              key={po}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                            >
                              {po}
                            </span>
                          ))}
                          {t.sdgs.map((s) => (
                            <span
                              key={s.sdgId}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              SDG {s.sdgId}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {t.source === 'FACULTY' ? (
                          deleteRequests.some(
                            (r) => r.topicId === t.id && r.initiatedBy === 'ADMIN'
                          ) ? (
                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Awaiting Supervisor Permission
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={resolvingKey === t.id}
                              onClick={() => handleRequestFacultyDelete(t.id, t.code)}
                              className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-semibold transition disabled:opacity-50"
                              title="Faculty-proposed topics require permission from the respective supervisor to delete"
                            >
                              {resolvingKey === t.id
                                ? 'Requesting...'
                                : 'Request Supervisor Permission'}
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={resolvingKey === t.id}
                            onClick={() => handleAdminDeleteTopic(t.id, t.code)}
                            className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold transition disabled:opacity-50"
                            title="Directly delete this SIH or UG Research topic"
                          >
                            {resolvingKey === t.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
