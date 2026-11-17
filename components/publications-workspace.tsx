'use client';

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  getMyPublicationsAction,
  saveProfileScholarLinksAction,
  fetchOpenAlexPreviewAction,
  parseBibtexPreviewAction,
  importPublicationsBatchAction,
  createManualPublicationAction,
  deletePublicationAction,
} from '@/app/actions/publications';
import type { ParsedPublicationCandidate } from '@/lib/publications';

export default function PublicationsWorkspace({ portalRole }: { portalRole: 'FACULTY' | 'STUDENT' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [profile, setProfile] = useState<{
    name: string;
    orcidId: string;
    scholarUrl: string;
    supervisorName: string | null;
    groupNumber: number | null;
    groupId: string | null;
  } | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; number: number; batchId: string; topicCode: string }>>([]);
  const [publications, setPublications] = useState<any[]>([]);

  // Import Mode Tabs
  const [importTab, setImportTab] = useState<'OPENALEX' | 'BIBTEX' | 'MANUAL'>('OPENALEX');

  // ORCID / OpenAlex state
  const [orcidInput, setOrcidInput] = useState('');
  const [scholarInput, setScholarInput] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [institutionHint, setInstitutionHint] = useState('Heritage Institute of Technology');
  const [savingProfile, setSavingProfile] = useState(false);
  const [fetchingOpenAlex, setFetchingOpenAlex] = useState(false);

  // BibTeX state
  const [bibtexText, setBibtexText] = useState('');

  // Preview candidates (shared for OpenAlex & BibTeX)
  const [candidates, setCandidates] = useState<ParsedPublicationCandidate[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [importGroupId, setImportGroupId] = useState('');
  const [importing, setImporting] = useState(false);

  // Manual add state
  const [mTitle, setMTitle] = useState('');
  const [mAuthors, setMAuthors] = useState('');
  const [mVenue, setMVenue] = useState('');
  const [mYear, setMYear] = useState(new Date().getFullYear());
  const [mType, setMType] = useState<'JOURNAL' | 'CONFERENCE' | 'BOOK_CHAPTER' | 'PATENT'>('JOURNAL');
  const [mDoiUrl, setMDoiUrl] = useState('');
  const [mGroupId, setMGroupId] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await getMyPublicationsAction();
    if (res.error) {
      setError(res.error);
    } else if (res.success && res.profile) {
      setProfile(res.profile);
      setOrcidInput(res.profile.orcidId || '');
      setScholarInput(res.profile.scholarUrl || '');
      setAuthorSearch((prev) => prev || res.profile!.name);
      setMAuthors((prev) => prev || res.profile!.name);
      setGroups(res.groups || []);
      setPublications(res.publications || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSaveScholarProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setSuccessMsg(null);
    const res = await saveProfileScholarLinksAction({
      orcidId: orcidInput,
      scholarUrl: scholarInput,
    });
    setSavingProfile(false);
    if (res.error) setError(res.error);
    else {
      setSuccessMsg(res.message || 'Saved.');
      await loadData();
    }
  }

  async function handleFetchOpenAlex() {
    setFetchingOpenAlex(true);
    setError(null);
    setSuccessMsg(null);
    setCandidates([]);
    const res = await fetchOpenAlexPreviewAction({
      orcidId: orcidInput.trim() || undefined,
      authorName: !orcidInput.trim() ? authorSearch.trim() : undefined,
      institutionHint: !orcidInput.trim() ? institutionHint.trim() : undefined,
    });
    setFetchingOpenAlex(false);
    if (res.error || !('works' in res)) {
      setError(res.error || 'Failed to fetch publications from OpenAlex.');
    } else {
      const works = res.works ?? [];
      setCandidates(works);
      setSelectedIdx(new Set(works.map((_, i) => i)));
      if (works.length === 0) {
        setError('No publications found in OpenAlex for the given ORCID iD / Author Name.');
      } else {
        setSuccessMsg(
          `Found ${works.length} publication(s) from OpenAlex${
            res.matchedAuthorName ? ` for "${res.matchedAuthorName}"` : ''
          }. Review and click Import Selected.`
        );
      }
    }
  }

  async function handleParseBibtex() {
    setError(null);
    setSuccessMsg(null);
    const res = await parseBibtexPreviewAction(bibtexText);
    if (res.error) {
      setError(res.error);
    } else if (res.works) {
      setCandidates(res.works);
      setSelectedIdx(new Set(res.works.map((_, i) => i)));
      setSuccessMsg(`Parsed ${res.works.length} BibTeX entry(ies). Review and click Import Selected.`);
    }
  }

  async function handleImportSelected() {
    const chosen = candidates.filter((_, i) => selectedIdx.has(i));
    if (chosen.length === 0) {
      setError('Select at least one publication to import.');
      return;
    }
    setImporting(true);
    setError(null);
    const res = await importPublicationsBatchAction(chosen, importGroupId || undefined);
    setImporting(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Imported.');
      setCandidates([]);
      setBibtexText('');
      await loadData();
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingManual(true);
    setError(null);
    setSuccessMsg(null);
    const res = await createManualPublicationAction({
      title: mTitle,
      authors: mAuthors,
      venue: mVenue,
      year: Number(mYear),
      pubType: mType,
      doiUrl: mDoiUrl,
      groupId: mGroupId || undefined,
    });
    setSavingManual(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(res.message || 'Added.');
      setMTitle('');
      setMVenue('');
      setMDoiUrl('');
      await loadData();
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      <div className="border-b border-slate-200 pb-5">
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
          {portalRole === 'FACULTY' ? 'Supervisor Research Portfolio' : 'Student & Group Research Publications'}
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Publications</h1>
        <p className="text-sm text-slate-500 mt-1">
          {portalRole === 'FACULTY'
            ? 'Auto-import your papers via ORCID / OpenAlex or Google Scholar BibTeX, or add manually. Publications co-authored with students automatically appear in their accounts.'
            : `View your publications, co-authored papers${
                profile?.supervisorName ? `, and papers by your supervisor (${profile.supervisorName})` : ''
              }. Publications you add with your supervisor as co-author also appear in their account.`}
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

      {/* Import & Add Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setImportTab('OPENALEX')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              importTab === 'OPENALEX'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🔍 ORCID / OpenAlex Auto-Import
          </button>
          <button
            type="button"
            onClick={() => setImportTab('BIBTEX')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              importTab === 'BIBTEX'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📄 Google Scholar BibTeX Import
          </button>
          <button
            type="button"
            onClick={() => setImportTab('MANUAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              importTab === 'MANUAL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            ➕ Add Manually
          </button>
        </div>

        {importTab === 'OPENALEX' && (
          <div className="space-y-4">
            <form onSubmit={handleSaveScholarProfile} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ORCID iD (e.g. 0000-0002-1825-0097)
                </label>
                <input
                  type="text"
                  value={orcidInput}
                  onChange={(e) => setOrcidInput(e.target.value)}
                  placeholder="0000-0000-0000-0000"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Google Scholar Profile URL (Optional)
                </label>
                <input
                  type="url"
                  value={scholarInput}
                  onChange={(e) => setScholarInput(e.target.value)}
                  placeholder="https://scholar.google.com/citations?user=..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save ORCID / Scholar Profile'}
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Or Search OpenAlex by Author Name (if no ORCID)
                </label>
                <input
                  type="text"
                  value={authorSearch}
                  onChange={(e) => setAuthorSearch(e.target.value)}
                  placeholder="Full Name"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Institution Hint
                </label>
                <input
                  type="text"
                  value={institutionHint}
                  onChange={(e) => setInstitutionHint(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="button"
                disabled={fetchingOpenAlex}
                onClick={handleFetchOpenAlex}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {fetchingOpenAlex ? 'Fetching from OpenAlex...' : 'Auto-Fetch Publications from OpenAlex'}
              </button>
            </div>
          </div>
        )}

        {importTab === 'BIBTEX' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              In Google Scholar, select your papers → <strong>Export → BibTeX</strong>, then paste the text or upload the <code>.bib</code> file below:
            </p>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".bib,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setBibtexText(await f.text());
                }}
                className="text-xs"
              />
            </div>
            <textarea
              rows={5}
              value={bibtexText}
              onChange={(e) => setBibtexText(e.target.value)}
              placeholder="@article{...}"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleParseBibtex}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg"
            >
              Parse BibTeX Entries
            </button>
          </div>
        )}

        {importTab === 'MANUAL' && (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Publication Title *</label>
                <input
                  type="text"
                  required
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Authors (Comma-separated — matching student/supervisor names auto-link!) *
                </label>
                <input
                  type="text"
                  required
                  value={mAuthors}
                  onChange={(e) => setMAuthors(e.target.value)}
                  placeholder="e.g. Susovan Mandal, Sourav Roy, Ananya Sen"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Journal / Conference Venue</label>
                <input
                  type="text"
                  value={mVenue}
                  onChange={(e) => setMVenue(e.target.value)}
                  placeholder="e.g. IEEE Transactions on..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Year *</label>
                  <input
                    type="number"
                    required
                    value={mYear}
                    onChange={(e) => setMYear(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Type</label>
                  <select
                    value={mType}
                    onChange={(e) => setMType(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="JOURNAL">Journal</option>
                    <option value="CONFERENCE">Conference</option>
                    <option value="BOOK_CHAPTER">Book Chapter</option>
                    <option value="PATENT">Patent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">DOI / Paper URL</label>
                <input
                  type="text"
                  value={mDoiUrl}
                  onChange={(e) => setMDoiUrl(e.target.value)}
                  placeholder="https://doi.org/..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Link to Project Group (Optional)</label>
                  <select
                    value={mGroupId}
                    onChange={(e) => setMGroupId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Auto-detect by Co-Author Name</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Group {g.number} ({g.batchId}) — {g.topicCode}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={savingManual}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {savingManual ? 'Saving...' : 'Save Publication'}
            </button>
          </form>
        )}

        {/* Candidate Import Preview Table */}
        {candidates.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={selectedIdx.size === candidates.length && candidates.length > 0}
                    onChange={() => {
                      if (selectedIdx.size === candidates.length) {
                        setSelectedIdx(new Set());
                      } else {
                        setSelectedIdx(new Set(candidates.map((_, i) => i)));
                      }
                    }}
                  />
                  {selectedIdx.size === candidates.length ? 'Uncheck All' : 'Check All'}
                </label>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Preview Candidates ({selectedIdx.size} of {candidates.length} selected)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {groups.length > 0 && (
                  <select
                    value={importGroupId}
                    onChange={(e) => setImportGroupId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Auto-link Group by Co-Author</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Link to Group {g.number} ({g.batchId})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleImportSelected}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  {importing ? 'Importing...' : `Import Selected (${selectedIdx.size})`}
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {candidates.map((c, idx) => (
                <label key={idx} className="p-3 flex items-start gap-3 hover:bg-slate-50 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedIdx.has(idx)}
                    onChange={() => {
                      const next = new Set(selectedIdx);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      setSelectedIdx(next);
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{c.title}</div>
                    <div className="text-[11px] text-slate-700 mt-0.5">
                      <span className="font-semibold text-slate-500">Authors:</span> {c.authors}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 mt-1">
                      <span>{c.venue}</span>
                      <span>•</span>
                      <span>{c.year}</span>
                      <span>•</span>
                      <span>{c.pubType}</span>
                      <span>•</span>
                      <span>Citations: {c.citationsCount}</span>
                      {c.doiUrl && (
                        <>
                          <span>•</span>
                          <a
                            href={c.doiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                          >
                            {c.doiUrl.replace(/^https?:\/\/(dx\.)?doi\.org\//i, 'DOI: ')}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saved / Matched Publications List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Publications List ({publications.length})
          </h2>
          {profile?.scholarUrl && (
            <a
              href={profile.scholarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-blue-700 hover:underline"
            >
              Google Scholar Profile ↗
            </a>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading publications...</div>
        ) : publications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No publications recorded yet. Use ORCID / OpenAlex Auto-Import, BibTeX Import, or Add Manually above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {publications.map((p) => (
              <div key={p.id} className="p-5 flex flex-col sm:flex-row justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                      {p.year}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                      {p.pubType}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold">
                      {p.matchTag}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold">
                      {p.source}
                    </span>
                    {p.linkedTopicCode && (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                        Project: {p.linkedTopicCode}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">{p.title}</h3>
                  {p.linkedTopicTitle && (
                    <p className="text-[11px] text-amber-800 font-medium">
                      Linked Project: {p.linkedTopicCode} &mdash; {p.linkedTopicTitle}
                    </p>
                  )}
                  <p className="text-xs text-slate-700">
                    <span className="font-semibold text-slate-500">Authors:</span> {p.authors}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {p.venue || 'Venue not specified'} • {p.year} • {p.pubType} • Citations: {p.citationsCount}
                  </p>
                  {p.doiUrl && (
                    <div className="pt-0.5">
                      <a
                        href={
                          p.doiUrl.startsWith('http')
                            ? p.doiUrl
                            : `https://doi.org/${p.doiUrl.replace(/^doi:\s*/i, '')}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                      >
                        {/^https?:\/\/(dx\.)?doi\.org\//i.test(p.doiUrl) || /^10\.\d{4,9}\//i.test(p.doiUrl)
                          ? `DOI: ${p.doiUrl.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`
                          : p.doiUrl}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start">
                  {p.doiUrl && (
                    <a
                      href={
                        p.doiUrl.startsWith('http')
                          ? p.doiUrl
                          : `https://doi.org/${p.doiUrl.replace(/^doi:\s*/i, '')}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold whitespace-nowrap"
                    >
                      Open Paper ↗
                    </a>
                  )}
                  {p.canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove "${p.title}"?`)) return;
                        const res = await deletePublicationAction(p.id);
                        if (res.error) setError(res.error);
                        else await loadData();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
