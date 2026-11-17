"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminShowcasePublicationsAction } from "@/app/actions/showcase";
import { BookOpen, ExternalLink, Search, Users, Award, Loader2 } from "lucide-react";

type ShowcasePublication = {
  id: string;
  title: string;
  authors: string;
  venue: string | null;
  year: number;
  pubType: string;
  doiUrl: string | null;
  citationsCount: number;
  source: string;
  groupNumber: number | null;
  batchId: string | null;
  topicCode: string | null;
  topicTitle: string | null;
  supervisorName: string;
  supervisorEmail: string | null;
  studentMembers: Array<{
    name: string;
    roll: string;
    universityRoll: string | null;
  }>;
};

export default function AdminShowcasePublicationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publications, setPublications] = useState<ShowcasePublication[]>([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("ALL");
  const [batchFilter, setBatchFilter] = useState<string>("ALL");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await getAdminShowcasePublicationsAction();
      if (!active) return;
      if (res.error) {
        setError(res.error);
      } else {
        setPublications(res.publications ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const years = useMemo(() => {
    const set = new Set(publications.map((p) => String(p.year)));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [publications]);

  const batches = useMemo(() => {
    const set = new Set(
      publications.map((p) => p.batchId).filter((b): b is string => Boolean(b))
    );
    return Array.from(set).sort().reverse();
  }, [publications]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return publications.filter((p) => {
      if (yearFilter !== "ALL" && String(p.year) !== yearFilter) return false;
      if (batchFilter !== "ALL" && p.batchId !== batchFilter) return false;
      if (!q) return true;
      const studentMatch = p.studentMembers.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.roll.toLowerCase().includes(q) ||
          (m.universityRoll && m.universityRoll.toLowerCase().includes(q))
      );
      return (
        p.title.toLowerCase().includes(q) ||
        p.authors.toLowerCase().includes(q) ||
        (p.venue && p.venue.toLowerCase().includes(q)) ||
        p.supervisorName.toLowerCase().includes(q) ||
        (p.topicTitle && p.topicTitle.toLowerCase().includes(q)) ||
        (p.topicCode && p.topicCode.toLowerCase().includes(q)) ||
        studentMatch
      );
    });
  }, [publications, search, yearFilter, batchFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
            <BookOpen className="h-3.5 w-3.5" />
            Admin Showcase &bull; Publications
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Department Capstone &amp; Research Publications
          </h1>
          <p className="text-sm text-slate-600">
            Consolidated view linking each publication to its Capstone Project, Group, Student Members, and Supervisor.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <Award className="h-5 w-5 text-indigo-600" />
          <div>
            <div className="text-xs text-slate-500">Total Indexed</div>
            <div className="text-lg font-bold text-slate-900">{publications.length}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by publication, author, project, supervisor, or student..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Loading showcase publications...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          No publications match your current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3">Publication</th>
                <th className="px-4 py-3">Project &amp; Group</th>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">Student Members</th>
                <th className="px-4 py-3 text-right">Year / Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 align-top">
                  <td className="px-4 py-3.5 max-w-md">
                    <div className="font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-1 text-xs text-slate-600">{p.authors}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {p.venue && (
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {p.venue}
                        </span>
                      )}
                      <span className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        {p.pubType}
                      </span>
                      <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        {p.source}
                      </span>
                      {p.citationsCount > 0 && (
                        <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          {p.citationsCount} citations
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 max-w-xs">
                    {p.groupNumber ? (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                            Group {p.groupNumber}
                          </span>
                          {p.batchId && (
                            <span className="text-xs font-medium text-slate-600">
                              ({p.batchId})
                            </span>
                          )}
                        </div>
                        {p.topicCode && (
                          <div className="mt-1 text-xs font-semibold text-indigo-700">
                            {p.topicCode}
                          </div>
                        )}
                        {p.topicTitle && (
                          <div className="mt-0.5 text-xs text-slate-700 line-clamp-2">
                            {p.topicTitle}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">
                        Unlinked / Faculty Research
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{p.supervisorName}</div>
                    {p.supervisorEmail && (
                      <div className="text-xs text-slate-500">{p.supervisorEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {p.studentMembers.length > 0 ? (
                      <ul className="space-y-1">
                        {p.studentMembers.map((m, idx) => (
                          <li key={idx} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <Users className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-medium">{m.name}</span>
                            <span className="text-slate-500">
                              ({m.universityRoll || m.roll})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-slate-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{p.year}</div>
                    {p.doiUrl && (
                      <a
                        href={
                          p.doiUrl.startsWith("http")
                            ? p.doiUrl
                            : `https://doi.org/${p.doiUrl.replace(/^doi:\s*/i, "")}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {/^https?:\/\/(dx\.)?doi\.org\//i.test(p.doiUrl) ||
                        /^10\.\d{4,9}\//i.test(p.doiUrl)
                          ? `DOI: ${p.doiUrl.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
                          : "Open Link"}{" "}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
