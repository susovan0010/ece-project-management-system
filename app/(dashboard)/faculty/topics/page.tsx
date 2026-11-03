'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  searchFacultyTopicsAction,
  getFacultyTopicDetailAction,
} from '@/app/actions/faculty-topics';
import {
  claimAndConfirmBankTopicAction,
  deleteUnconfirmedTopicAction,
  getTopicDeleteRequestsAction,
  finalDeleteApprovedTopicAction,
  TopicDeleteRequestRecord,
} from '@/app/actions/project-lifecycle';
import { deriveMappedPoCodes } from '@/lib/engine';
import { evaluateRules } from '@/lib/rules';
import { SupervisorAiPicker } from '@/components/supervisor-ai-picker';

interface TopicItem {
  id: string;
  code: string;
  title: string;
  source: string;
  category: string;
  status: 'DRAFT' | 'CONFIRMED' | 'ALLOTTED' | 'ARCHIVED';
  domain: string | null;
  organization: string | null;
  description: string | null;
  tags: string[];
  sdgs: Array<{
    sdgId: number;
    target: string | null;
    sdg: { id: number; title: string };
  }>;
  attributes: Array<{
    level: number;
    origin: string;
    attribute: { code: string; kind: string; title: string };
  }>;
  proposer: { id: string; name: string; email: string } | null;
}

interface SdgOption {
  id: number;
  title: string;
}

export default function FacultyTopicsSearchPage() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [allSdgs, setAllSdgs] = useState<SdgOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteRequests, setDeleteRequests] = useState<TopicDeleteRequestRecord[]>([]);

  // Filters
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [theme, setTheme] = useState('ALL');
  const [allThemes, setAllThemes] = useState<string[]>([]);
  const [selectedSdgs, setSelectedSdgs] = useState<number[]>([]);

  // Slide-over Detail Drawer
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [detailTopic, setDetailTopic] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function handleConfirmBankTopic(topicId: string) {
    setConfirmingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await claimAndConfirmBankTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Topic ${res.topic?.code} ("${res.topic?.title}") confirmed and tagged as ACTIVE! It is now visible in your Active Portfolio and the Admin Ledger.`
      );
      await fetchTopics(page);
      if (selectedTopicId === topicId) {
        const refreshed = await getFacultyTopicDetailAction(topicId);
        if (refreshed.topic) setDetailTopic(refreshed.topic);
      }
    }
    setConfirmingId(null);
  }

  async function handleDeleteUnconfirmedFromBank(topicId: string, code: string) {
    if (!window.confirm(`Delete unconfirmed draft project ${code}?`)) {
      return;
    }
    setConfirmingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await deleteUnconfirmedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Unconfirmed project ${code} has been deleted.`);
      await fetchTopics(page);
    }
    setConfirmingId(null);
  }

  async function handleFinalDeleteFromBank(topicId: string, code: string) {
    if (
      !window.confirm(
        `Admin has agreed to your delete request for ${code}. Click OK to finally delete this project from your supervisor account.`
      )
    ) {
      return;
    }
    setConfirmingId(topicId);
    setError(null);
    setSuccessMsg(null);
    const res = await finalDeleteApprovedTopicAction(topicId);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(`Project ${code} has been finally deleted from your supervisor account.`);
      await fetchTopics(page);
    }
    setConfirmingId(null);
  }

  // Load topics
  async function fetchTopics(currentPage = page) {
    setLoading(true);
    setError(null);
    const [res, reqRes] = await Promise.all([
      searchFacultyTopicsAction({
        query,
        category,
        source,
        theme,
        sdgIds: selectedSdgs,
        page: currentPage,
        pageSize: 12,
      }),
      getTopicDeleteRequestsAction(),
    ]);

    if (res.error) {
      setError(res.error);
    } else {
      setTopics(res.topics as unknown as TopicItem[]);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
      if (res.allSdgs && allSdgs.length === 0) {
        setAllSdgs(res.allSdgs);
      }
      if (res.allThemes && allThemes.length === 0) {
        setAllThemes(res.allThemes);
      }
    }
    if (!reqRes.error && reqRes.requests) {
      setDeleteRequests(reqRes.requests);
    }
    setLoading(false);
  }

  // Trigger search on filter changes with debounce for text
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchTopics(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [query, category, source, theme, selectedSdgs]);

  // Handle Detail Drawer
  async function handleOpenDetail(topicId: string) {
    setSelectedTopicId(topicId);
    setDetailLoading(true);
    const res = await getFacultyTopicDetailAction(topicId);
    if (!res.error && res.topic) {
      setDetailTopic(res.topic);
    }
    setDetailLoading(false);
  }

  function handleCloseDetail() {
    setSelectedTopicId(null);
    setDetailTopic(null);
  }

  function toggleSdgFilter(sdgId: number) {
    if (selectedSdgs.includes(sdgId)) {
      setSelectedSdgs(selectedSdgs.filter((id) => id !== sdgId));
    } else {
      setSelectedSdgs([...selectedSdgs, sdgId]);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Undergraduate Capstone Catalogue
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Washington Accord Compliant
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Topic Bank & Search</h1>
          <p className="text-sm text-slate-500 mt-1">
            Explore accredited Smart India Hackathon (SIH) & UG Research project challenges, or filter by engineering complexity and SDGs.
          </p>
        </div>

        <Link
          href="/faculty/topics/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Propose Original Topic
        </Link>
      </div>

      {/* Supervisor AI Picker Choice Widget */}
      <SupervisorAiPicker />

      {/* Search and Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Query Input */}
          <div className="md:col-span-4 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, code, keywords, or theme (e.g. Disaster Management)..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Theme Dropdown */}
          <div className="md:col-span-3">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
            >
              <option value="ALL">All Project Themes</option>
              {allThemes.map((th) => (
                <option key={th} value={th}>
                  Theme: {th}
                </option>
              ))}
            </select>
          </div>

          {/* Category Toggle Pills */}
          <div className="md:col-span-3 flex items-center bg-slate-100 p-1 rounded-lg">
            {['ALL', 'Custom', 'Hardware', 'Software', 'Both'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition text-center ${
                  category === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'ALL' ? 'All' : cat}
              </button>
            ))}
          </div>

          {/* Source Dropdown */}
          <div className="md:col-span-2">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
            >
              <option value="ALL">All Sources</option>
              <option value="SIH">Smart India Hackathon (SIH)</option>
              <option value="UG_RESEARCH">UG Research Initiatives</option>
              <option value="FACULTY">Faculty Proposed</option>
            </select>
          </div>
        </div>

        {/* SDG Multi-Select Filter Strip */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Filter by UN Sustainable Development Goals (SDGs)
            </span>
            {selectedSdgs.length > 0 && (
              <button
                onClick={() => setSelectedSdgs([])}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                Clear SDG filters ({selectedSdgs.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {allSdgs.map((sdg) => {
              const active = selectedSdgs.includes(sdg.id);
              return (
                <button
                  key={sdg.id}
                  type="button"
                  onClick={() => toggleSdgFilter(sdg.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  SDG {sdg.id}: {sdg.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Count & Status */}
      <div className="flex justify-between items-center text-xs text-slate-500 px-1">
        <div>
          Showing <span className="font-semibold text-slate-800">{topics.length}</span> of{' '}
          <span className="font-semibold text-slate-800">{totalCount}</span> accredited topics
        </div>
        {loading && <div className="text-blue-600 font-semibold animate-pulse">Searching catalogue...</div>}
      </div>

      {/* Error & Success states */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between gap-3">
          <span>{successMsg}</span>
          <Link
            href="/faculty/my-topics"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            View My Active Topics →
          </Link>
        </div>
      )}

      {/* Topic Grid */}
      {topics.length === 0 && !loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-bold text-slate-800 text-base">No Matching Topics Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search keywords, clearing SDG filters, or switching category pills.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {topics.map((t) => {
            const effectiveAttrs =
              t.attributes && t.attributes.length > 0
                ? t.attributes
                : Object.entries(
                    evaluateRules(t.title, `${t.description || ''} ${t.domain || ''}`, t.tags || []).levels
                  ).map(([code, level]) => ({
                    level,
                    origin: 'RULE',
                    attribute: { code, kind: code.slice(0, 2), title: code },
                  }));

            const wpAttrs = effectiveAttrs.filter((a) => a.attribute.code.startsWith('WP') && a.level >= 1);
            const wkAttrs = effectiveAttrs.filter((a) => a.attribute.code.startsWith('WK') && a.level >= 1);
            const eaAttrs = effectiveAttrs.filter((a) => a.attribute.code.startsWith('EA') && a.level >= 1);
            const poCodes = deriveMappedPoCodes(effectiveAttrs);
            const isActive = t.status === 'CONFIRMED' || t.status === 'ALLOTTED';
            const isArchived = t.status === 'ARCHIVED';

            return (
              <div
                key={t.id}
                className={`bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between border-t-4 ${
                  isActive
                    ? 'border-t-emerald-600'
                    : isArchived
                    ? 'border-t-slate-400'
                    : 'border-t-blue-600'
                }`}
              >
                <div>
                  {/* Top Bar: Code, Active Status, Category, Source */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {t.code}
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ACTIVE
                        </span>
                      )}
                      {isArchived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          t.category === 'Hardware'
                            ? 'bg-amber-100 text-amber-800'
                            : t.category === 'Software'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {t.category}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {t.proposer?.name || (t.source === 'UG_RESEARCH' ? 'UG Research' : t.source)}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug">
                    {t.title}
                  </h3>

                  {/* Project Theme Badge */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                      Theme: {t.domain || 'General ECE'}
                    </span>
                    {t.proposer && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        • Supervisor: {t.proposer.name}
                      </span>
                    )}
                  </div>

                  {/* 500-word sanitized abstract snippet */}
                  <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                    {t.description || 'No description provided.'}
                  </p>

                  {/* WP, WK, EA & PO Tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {wpAttrs.map((a) => (
                      <span
                        key={a.attribute.code}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                      >
                        {a.attribute.code} (L{a.level})
                      </span>
                    ))}
                    {wkAttrs.map((a) => (
                      <span
                        key={a.attribute.code}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200"
                      >
                        {a.attribute.code} (L{a.level})
                      </span>
                    ))}
                    {eaAttrs.map((a) => (
                      <span
                        key={a.attribute.code}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200"
                      >
                        {a.attribute.code} (L{a.level})
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
                  </div>

                  {/* SDGs */}
                  {t.sdgs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.sdgs.map((s) => (
                        <span
                          key={s.sdgId}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          SDG {s.sdgId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenDetail(t.id)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    Inspect Details →
                  </button>
                  <div className="flex items-center gap-1.5">
                    {deleteRequests.some(
                      (r) => r.topicId === t.id && r.status === 'APPROVED'
                    ) ? (
                      <button
                        type="button"
                        disabled={confirmingId === t.id}
                        onClick={() => handleFinalDeleteFromBank(t.id, t.code)}
                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        {confirmingId === t.id ? 'Deleting...' : 'Final Delete (Admin Agreed)'}
                      </button>
                    ) : (
                      !isArchived && (
                        <>
                          {t.status === 'DRAFT' && t.source === 'FACULTY' && (
                            <button
                              type="button"
                              disabled={confirmingId === t.id}
                              onClick={() => handleDeleteUnconfirmedFromBank(t.id, t.code)}
                              className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold transition disabled:opacity-50"
                              title="Delete unconfirmed draft topic before confirming"
                            >
                              Delete
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={confirmingId === t.id}
                            onClick={() => handleConfirmBankTopic(t.id)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            {confirmingId === t.id
                              ? 'Confirming...'
                              : isActive
                              ? 'Active'
                              : 'Confirm as Active'}
                          </button>
                        </>
                      )
                    )}
                    <Link
                      href={`/faculty/topics/new?edit=${t.code}`}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold transition"
                    >
                      Customize / Edit
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-4">
          <button
            onClick={() => {
              const p = Math.max(1, page - 1);
              setPage(p);
              fetchTopics(p);
            }}
            disabled={page === 1}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-slate-600 font-medium">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => {
              const p = Math.min(totalPages, page + 1);
              setPage(p);
              fetchTopics(p);
            }}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      {selectedTopicId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {detailTopic?.code || 'Loading...'}
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-2">
                  {detailTopic?.title || 'Loading topic details...'}
                </h2>
              </div>
              <button
                onClick={handleCloseDetail}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="py-20 text-center text-slate-500 text-sm">Loading full topic details...</div>
            ) : detailTopic ? (
              <div className="space-y-6 text-sm text-slate-700">
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-xs">
                  <div>
                    <span className="font-semibold text-slate-500">Source:</span>{' '}
                    <span className="font-bold text-slate-800">{detailTopic.source}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Category:</span>{' '}
                    <span className="font-bold text-slate-800">{detailTopic.category}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold text-slate-500">Project Theme:</span>{' '}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 ml-1">
                      {detailTopic.domain || 'General ECE'}
                    </span>
                  </div>
                </div>

                {/* 500-word sanitized abstract */}
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1">
                    Project Abstract (Max 500 Words)
                  </h4>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-800 whitespace-pre-line">
                    {detailTopic.description || 'No abstract recorded.'}
                  </div>
                </div>

                {/* Mapped Program Outcomes (POs) */}
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">
                    Mapped Program Outcomes (NBA POs)
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {deriveMappedPoCodes(
                      detailTopic.attributes && detailTopic.attributes.length > 0
                        ? detailTopic.attributes
                        : (() => {
                            const r = evaluateRules(detailTopic.title, `${detailTopic.description || ''} ${detailTopic.domain || ''}`, detailTopic.tags || []);
                            return Object.entries(r.levels).map(([code, level]) => ({
                              attribute: { code, kind: code.slice(0, 2) },
                              level,
                            }));
                          })()
                    ).map((po) => (
                      <span
                        key={po}
                        className="px-2.5 py-1 rounded-md text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200"
                      >
                        {po}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Washington Accord Complex Problem Solving (WP, WK, EA) */}
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">
                    Washington Accord Attributes (WP, WK, EA)
                  </h4>
                  <div className="space-y-2">
                    {(detailTopic.attributes && detailTopic.attributes.length > 0
                      ? detailTopic.attributes
                      : (() => {
                          const r = evaluateRules(detailTopic.title, `${detailTopic.description || ''} ${detailTopic.domain || ''}`, detailTopic.tags || []);
                          return Object.entries(r.levels).map(([code, level]) => ({
                            attribute: { code, title: code },
                            level,
                            origin: 'RULE',
                            reason: r.reasons[code] || 'Mapped via Theme & Keyword Rule Engine',
                          }));
                        })()
                    ).map((a: any) => (
                      <div
                        key={a.attribute.code}
                        className="p-3 border border-slate-200 rounded-lg bg-white text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {a.attribute.code}: {a.attribute.title}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Level {a.level} ({a.origin})
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                          {a.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SDGs */}
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">
                    Sustainable Development Goals (SDGs)
                  </h4>
                  <div className="space-y-2">
                    {detailTopic.sdgs.map((s: any) => (
                      <div
                        key={s.sdgId}
                        className="p-3 border border-indigo-100 bg-indigo-50/50 rounded-lg text-xs"
                      >
                        <div className="font-bold text-indigo-900">
                          Goal {s.sdg.id}: {s.sdg.title} {s.target && `(Target ${s.target})`}
                        </div>
                        {s.reason && <p className="text-indigo-800/80 text-[11px] mt-1">{s.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Adopt Action in Drawer */}
                <div className="pt-4 border-t border-slate-200 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={handleCloseDetail}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  {detailTopic.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      disabled={confirmingId === detailTopic.id}
                      onClick={() => handleConfirmBankTopic(detailTopic.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    >
                      {confirmingId === detailTopic.id
                        ? 'Confirming...'
                        : detailTopic.status === 'CONFIRMED' || detailTopic.status === 'ALLOTTED'
                        ? 'Confirmed (Active)'
                        : 'Select & Confirm as Active'}
                    </button>
                  )}
                  <Link
                    href={`/faculty/topics/new?edit=${detailTopic.code}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    Customize / Edit &amp; Confirm →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
