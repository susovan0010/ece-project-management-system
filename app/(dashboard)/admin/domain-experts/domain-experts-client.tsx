'use client';

import { useState, useEffect } from 'react';
import {
  getDomainExpertsMappingAction,
  DomainExpertsOverviewData,
  DomainCategoryMapping,
  DomainMappingItem,
  DomainExpertFacultyItem,
} from '@/app/actions/domain-experts';
import { ECE_DOMAIN_CATEGORIES } from '@/lib/constants/domains';

export default function DomainExpertsClient() {
  const [data, setData] = useState<DomainExpertsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<'BY_DOMAIN' | 'BY_FACULTY' | 'MATRIX'>('BY_DOMAIN');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [coverageFilter, setCoverageFilter] = useState<'ALL' | 'COVERED' | 'UNCOVERED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Expandable domain detail drawers
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getDomainExpertsMappingAction();
    setLoading(false);

    if (res.success) {
      setData(res.data);
    } else {
      setError(res.error);
    }
  }

  function toggleDomainExpand(domain: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }

  function expandAllDomains() {
    if (!data) return;
    const all = new Set<string>();
    data.categories.forEach((c) => c.domains.forEach((d) => all.add(d.domain)));
    setExpandedDomains(all);
  }

  function collapseAllDomains() {
    setExpandedDomains(new Set());
  }

  // Export CSV summary of faculty domain mappings
  function handleExportCSV() {
    if (!data) return;
    const rows = [
      ['Faculty Name', 'Email', 'Role', 'Total Domains', 'Allotted Groups', 'Specialized Domains'],
    ];

    data.facultyList.forEach((f) => {
      rows.push([
        f.name,
        f.email,
        f.role === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor',
        f.domainExpertise.length.toString(),
        f.allottedGroupsCount.toString(),
        `"${f.domainExpertise.join('; ')}"`,
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ECE_Faculty_Domain_Experts_Mapping_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const query = searchQuery.trim().toLowerCase();

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/30 mb-2">
            Academic &amp; Research Portfolio
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Domain Experts Mapping</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete mapping of department faculty supervisors and committee administrators across the 32 official ECE domains.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5 shadow-2xs"
          >
            <svg
              className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!data || data.facultyList.length === 0}
            className="px-4 py-2 bg-[#1985A1] hover:bg-[#146E85] text-white text-xs font-semibold rounded-xl transition shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Mapping (CSV)
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
          {error}
        </div>
      )}

      {/* Metric Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Department Faculty &amp; Admins
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{data.stats.totalFaculty}</span>
              <span className="text-[11px] text-slate-500">registered</span>
            </div>
            <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              <span>●</span> {data.stats.completedProfiles} profiles specified
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Domains Covered
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#1985A1]">{data.stats.coveredDomainsCount}</span>
              <span className="text-xs text-slate-500">/ {data.stats.totalCatalogueDomains} domains</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {Math.round((data.stats.coveredDomainsCount / data.stats.totalCatalogueDomains) * 100)}% syllabus coverage
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Unassigned Gaps
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${data.stats.totalCatalogueDomains - data.stats.coveredDomainsCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {data.stats.totalCatalogueDomains - data.stats.coveredDomainsCount}
              </span>
              <span className="text-xs text-slate-500">domains without experts</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {data.stats.pendingProfiles} faculty pending login setup
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Top Specialization
            </span>
            <div className="mt-1 truncate">
              {data.stats.topDomains.length > 0 ? (
                <>
                  <div className="text-sm font-bold text-slate-900 truncate" title={data.stats.topDomains[0].domain}>
                    {data.stats.topDomains[0].domain}
                  </div>
                  <div className="mt-1 text-[11px] text-[#1985A1] font-semibold">
                    {data.stats.topDomains[0].count} Faculty Experts
                  </div>
                </>
              ) : (
                <span className="text-xs text-slate-400 italic">No domain data</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Navigation & View Controls Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('BY_DOMAIN')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'BY_DOMAIN'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Domain ({data ? data.stats.totalCatalogueDomains : 32})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BY_FACULTY')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'BY_FACULTY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Faculty ({data ? data.facultyList.length : 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('MATRIX')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                activeTab === 'MATRIX'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Category Matrix Grid
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1985A1]"
            >
              <option value="ALL">All ECE Categories (5)</option>
              {ECE_DOMAIN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Coverage Filter (For By Domain tab) */}
            {activeTab === 'BY_DOMAIN' && (
              <select
                value={coverageFilter}
                onChange={(e) => setCoverageFilter(e.target.value as any)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1985A1]"
              >
                <option value="ALL">All Coverage Statuses</option>
                <option value="COVERED">Covered Only (Has Experts)</option>
                <option value="UNCOVERED">Gaps Only (0 Experts)</option>
              </select>
            )}

            {/* Text Search */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                placeholder={
                  activeTab === 'BY_FACULTY'
                    ? 'Search faculty name, email...'
                    : 'Search domain name or faculty...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1985A1] focus:outline-none"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="p-16 text-center text-slate-500 text-xs">
            <svg className="animate-spin h-6 w-6 text-[#1985A1] mx-auto mb-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Aggregating departmental domain expert mapping...
          </div>
        ) : !data ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No domain mapping data available.
          </div>
        ) : (
          <div className="p-6">
            {/* VIEW 1: BY DOMAIN (Categorized Cards & Faculty Badges) */}
            {activeTab === 'BY_DOMAIN' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Showing domain mapping grouped by official ECE curriculum categories.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={expandAllDomains}
                      className="text-[11px] font-semibold text-[#1985A1] hover:underline"
                    >
                      Expand All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={collapseAllDomains}
                      className="text-[11px] font-semibold text-slate-500 hover:underline"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                {data.categories
                  .filter((cat) => selectedCategory === 'ALL' || cat.id === selectedCategory)
                  .map((cat) => {
                    const filteredDomains = cat.domains.filter((dom) => {
                      if (coverageFilter === 'COVERED' && dom.expertCount === 0) return false;
                      if (coverageFilter === 'UNCOVERED' && dom.expertCount > 0) return false;

                      if (!query) return true;
                      const matchesDomain = dom.domain.toLowerCase().includes(query);
                      const matchesExpert = dom.experts.some(
                        (e) =>
                          e.name.toLowerCase().includes(query) ||
                          e.email.toLowerCase().includes(query)
                      );
                      return matchesDomain || matchesExpert;
                    });

                    if (filteredDomains.length === 0) return null;

                    return (
                      <div
                        key={cat.id}
                        className={`rounded-2xl border ${cat.color.border} ${cat.color.bg} p-5 space-y-4`}
                      >
                        {/* Category Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={`text-sm font-bold ${cat.color.text}`}>
                                {cat.name}
                              </h3>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${cat.color.badge}`}
                              >
                                {cat.coveredDomainsCount} / {cat.domains.length} domains covered
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">{cat.description}</p>
                          </div>

                          <div className="text-[11px] font-semibold text-slate-600">
                            {cat.totalExpertsInCat} total faculty specializations in category
                          </div>
                        </div>

                        {/* Grid of Domain Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {filteredDomains.map((dom) => {
                            const isExpanded = expandedDomains.has(dom.domain);
                            const hasExperts = dom.expertCount > 0;

                            return (
                              <div
                                key={dom.domain}
                                className={`bg-white rounded-xl border transition shadow-2xs overflow-hidden ${
                                  hasExperts ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30'
                                }`}
                              >
                                <div
                                  onClick={() => toggleDomainExpand(dom.domain)}
                                  className="p-3.5 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50/70 select-none"
                                >
                                  <div>
                                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                      <span>{dom.domain}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                      {hasExperts ? (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                          ✓ {dom.expertCount} Faculty Expert{dom.expertCount > 1 ? 's' : ''}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                          ⚠️ 0 Experts (Unassigned Gap)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className="text-slate-400 hover:text-slate-600 text-xs p-1"
                                    aria-label="Toggle domain"
                                  >
                                    <svg
                                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                </div>

                                {/* Quick Preview of Faculty Names */}
                                {hasExperts && !isExpanded && (
                                  <div className="px-3.5 pb-3 flex flex-wrap gap-1.5">
                                    {dom.experts.slice(0, 3).map((e) => (
                                      <span
                                        key={e.id}
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#1985A1]"></span>
                                        {e.name}
                                        {e.role === 'ADMIN' && (
                                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                                            Admin
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                    {dom.experts.length > 3 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200">
                                        +{dom.experts.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Expanded Detail Drawer */}
                                {isExpanded && (
                                  <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 bg-slate-50/50 space-y-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                      Specialized Department Members ({dom.expertCount})
                                    </div>
                                    {hasExperts ? (
                                      <div className="space-y-1.5">
                                        {dom.experts.map((exp) => (
                                          <div
                                            key={exp.id}
                                            className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs"
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-[#1985A1]/10 text-[#1985A1] font-bold text-[10px] flex items-center justify-center">
                                                {exp.name.charAt(0)}
                                              </div>
                                              <div>
                                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                                  {exp.name}
                                                  {exp.role === 'ADMIN' ? (
                                                    <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                                      Admin
                                                    </span>
                                                  ) : (
                                                    <span className="px-1 py-0.2 rounded text-[8px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                                      Faculty
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="font-mono text-[10px] text-slate-500">
                                                  {exp.email}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="text-right">
                                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                                {exp.allottedGroupsCount} group(s)
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-amber-800 italic">
                                        No faculty member has selected this domain yet. Recommended for faculty recruitment or topic alignment.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* VIEW 2: BY FACULTY (Faculty Profiles & Their Domain Tags) */}
            {activeTab === 'BY_FACULTY' && (
              <div className="space-y-4">
                <div className="text-xs text-slate-500 mb-2">
                  Directory of department members and their selected academic &amp; research domains.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.facultyList
                    .filter((f) => {
                      if (!query) return true;
                      const matchesName = f.name.toLowerCase().includes(query);
                      const matchesEmail = f.email.toLowerCase().includes(query);
                      const matchesDomain = f.domainExpertise.some((d) =>
                        d.toLowerCase().includes(query)
                      );
                      return matchesName || matchesEmail || matchesDomain;
                    })
                    .map((fac) => (
                      <div
                        key={fac.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-[#1985A1]/40 transition"
                      >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#1985A1] text-white font-bold text-xs flex items-center justify-center">
                              {fac.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                {fac.name}
                                {fac.role === 'ADMIN' ? (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                    Supervisor
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">{fac.email}</div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1985A1]/10 text-[#1985A1] border border-[#1985A1]/30">
                              {fac.domainExpertise.length} Domain{fac.domainExpertise.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>

                        {/* List of Domains */}
                        <div>
                          {fac.domainExpertise.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {fac.domainExpertise.map((domain) => (
                                <span
                                  key={domain}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-[#1985A1]/10 hover:text-[#1985A1] transition"
                                >
                                  {domain}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600 italic bg-amber-50 p-2 rounded-lg border border-amber-200">
                              No domain expertise specified yet (Prompt scheduled on next login).
                            </div>
                          )}
                        </div>

                        {/* Footer Badges */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {fac.allottedGroupsCount} group{fac.allottedGroupsCount === 1 ? '' : 's'} allotted
                          </span>
                          <span
                            className={`font-semibold ${
                              fac.mustChangePassword ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            {fac.mustChangePassword ? 'Initial Password' : 'Verified Login'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* VIEW 3: CATEGORY MATRIX GRID */}
            {activeTab === 'MATRIX' && (
              <div className="space-y-4">
                <div className="text-xs text-slate-500 mb-2">
                  Cross-tabulation matrix mapping each faculty member against the 5 ECE curriculum categories.
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10">Faculty Member</th>
                        <th className="px-3 py-3 text-center">Comm &amp; RF</th>
                        <th className="px-3 py-3 text-center">Circuits &amp; Systems</th>
                        <th className="px-3 py-3 text-center">VLSI &amp; Devices</th>
                        <th className="px-3 py-3 text-center">Embedded &amp; IoT</th>
                        <th className="px-3 py-3 text-center">Computing &amp; AI</th>
                        <th className="px-4 py-3 text-right">Total Domains</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.facultyList
                        .filter((f) => {
                          if (!query) return true;
                          return (
                            f.name.toLowerCase().includes(query) ||
                            f.email.toLowerCase().includes(query)
                          );
                        })
                        .map((f) => {
                          const catCounts: Record<string, number> = {
                            'comm-rf': 0,
                            'circuits-systems': 0,
                            'vlsi-devices': 0,
                            'embedded-iot': 0,
                            'ai-computing': 0,
                          };

                          ECE_DOMAIN_CATEGORIES.forEach((cat) => {
                            f.domainExpertise.forEach((d) => {
                              if (cat.domains.includes(d)) {
                                catCounts[cat.id] = (catCounts[cat.id] || 0) + 1;
                              }
                            });
                          });

                          return (
                            <tr key={f.id} className="hover:bg-slate-50 transition">
                              <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-white z-10">
                                <div className="flex items-center gap-1.5">
                                  <span>{f.name}</span>
                                  {f.role === 'ADMIN' && (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400">{f.email}</div>
                              </td>

                              {ECE_DOMAIN_CATEGORIES.map((cat) => {
                                const count = catCounts[cat.id] || 0;
                                return (
                                  <td key={cat.id} className="px-3 py-3 text-center">
                                    {count > 0 ? (
                                      <span
                                        title={`${count} domains in ${cat.name}`}
                                        className="inline-block px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      >
                                        {count}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-mono">—</span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="px-4 py-3 text-right font-bold font-mono text-[#1985A1]">
                                {f.domainExpertise.length}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
