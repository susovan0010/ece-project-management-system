export interface ParsedPublicationCandidate {
  title: string;
  authors: string;
  venue: string;
  year: number;
  pubType: 'JOURNAL' | 'CONFERENCE' | 'BOOK_CHAPTER' | 'PATENT';
  doiUrl: string;
  openAlexId?: string;
  citationsCount: number;
  source: 'OPENALEX' | 'BIBTEX' | 'MANUAL';
}

const TITLE_PREFIXES = /^(dr|prof|mr|mrs|ms|shri|smt)\.?\s+/i;

export function normalizePersonName(raw: string): string {
  return (raw || '')
    .trim()
    .replace(TITLE_PREFIXES, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Checks whether a comma/semicolon/"and"-separated author list contains a given person's name.
 * Handles "Susovan Mandal", "Dr. Susovan Mandal", "Mandal, Susovan", etc.
 */
export function doesAuthorListMatchName(authorsText: string, personName: string): boolean {
  const target = normalizePersonName(personName);
  if (!target || target.length < 3) return false;

  const targetTokens = target.split(' ').filter((t) => t.length >= 2);
  if (targetTokens.length === 0) return false;

  // Split by comma or " and "
  const segments = (authorsText || '')
    .split(/\s+and\s+|;/i)
    .flatMap((part) => {
      // If part looks like "Last, First", keep it intact as well as splitting commas if multiple authors
      const commaCount = (part.match(/,/g) || []).length;
      if (commaCount > 1) return part.split(',');
      return [part, ...part.split(',')];
    })
    .map((s) => normalizePersonName(s))
    .filter(Boolean);

  for (const seg of segments) {
    if (seg === target) return true;
    const segTokens = seg.split(' ').filter(Boolean);
    if (targetTokens.length >= 2 && targetTokens.every((t) => segTokens.includes(t))) {
      return true;
    }
  }

  // Fallback substring check for full normalized name inside full normalized authors string
  const fullNormalized = normalizePersonName(authorsText);
  return fullNormalized.includes(target);
}

/**
 * Parses Google Scholar BibTeX export (.bib) into structured publication candidates.
 */
export function parseBibtexEntries(bibtex: string): ParsedPublicationCandidate[] {
  const results: ParsedPublicationCandidate[] = [];
  if (!bibtex || !bibtex.trim()) return results;

  // Split on @type{
  const chunks = bibtex.split(/@(?=[a-zA-Z]+\s*\{)/);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const typeMatch = trimmed.match(/^([a-zA-Z]+)\s*\{/);
    if (!typeMatch) continue;
    const entryType = typeMatch[1].toLowerCase();

    const extractField = (fieldName: string): string => {
      const regex = new RegExp(
        `(?:^|[,\\n])\\s*${fieldName}\\s*=\\s*(?:\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)")`,
        'i'
      );
      const m = trimmed.match(regex);
      return (m?.[1] ?? m?.[2] ?? '').replace(/\s+/g, ' ').replace(/[{}]/g, '').trim();
    };

    const title = extractField('title');
    if (!title) continue;

    const rawAuthors = extractField('author');
    const authors = rawAuthors
      ? rawAuthors
          .split(/\s+and\s+/i)
          .map((a) => {
            const cleaned = a.trim();
            if (cleaned.includes(',')) {
              const [last, first] = cleaned.split(',').map((p) => p.trim());
              return first && last ? `${first} ${last}` : cleaned;
            }
            return cleaned;
          })
          .join(', ')
      : 'Unknown Author';

    const venue =
      extractField('journal') ||
      extractField('booktitle') ||
      extractField('publisher') ||
      'Google Scholar Export';

    const yearNum = parseInt(extractField('year'), 10);
    const year = !isNaN(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? yearNum : new Date().getFullYear();

    const doi = extractField('doi');
    const url = extractField('url');
    const doiUrl = doi
      ? doi.startsWith('http')
        ? doi
        : `https://doi.org/${doi}`
      : url || '';

    let pubType: ParsedPublicationCandidate['pubType'] = 'JOURNAL';
    if (entryType === 'inproceedings' || entryType === 'conference') pubType = 'CONFERENCE';
    else if (entryType === 'incollection' || entryType === 'book' || entryType === 'inbook')
      pubType = 'BOOK_CHAPTER';
    else if (entryType === 'patent') pubType = 'PATENT';

    results.push({
      title,
      authors,
      venue,
      year,
      pubType,
      doiUrl,
      citationsCount: 0,
      source: 'BIBTEX',
    });
  }

  return results;
}

function mapOrcidType(orcidType: string): ParsedPublicationCandidate['pubType'] {
  const t = (orcidType || '').toLowerCase();
  if (t.includes('conference') || t.includes('proceeding')) return 'CONFERENCE';
  if (t.includes('book')) return 'BOOK_CHAPTER';
  if (t.includes('patent')) return 'PATENT';
  return 'JOURNAL';
}

function normalizeDoi(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
}

async function fetchOrcidVerifiedWorks(
  cleanOrcid: string
): Promise<{ works: ParsedPublicationCandidate[]; matchedAuthorName?: string; error?: string }> {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(cleanOrcid)) {
    return { works: [], error: 'Invalid ORCID iD format. Expected 0000-0000-0000-0000.' };
  }

  const headers = { Accept: 'application/json' };
  const [worksRes, personRes] = await Promise.all([
    fetch(`https://pub.orcid.org/v3.0/${encodeURIComponent(cleanOrcid)}/works`, { headers }),
    fetch(`https://pub.orcid.org/v3.0/${encodeURIComponent(cleanOrcid)}/person`, { headers }).catch(
      () => null
    ),
  ]);

  if (!worksRes.ok) {
    return {
      works: [],
      error: `ORCID lookup failed for ${cleanOrcid} (HTTP ${worksRes.status}). Please verify the ORCID iD.`,
    };
  }

  let matchedAuthorName: string | undefined;
  if (personRes && personRes.ok) {
    try {
      const personJson = await personRes.json();
      const credit = personJson?.name?.['credit-name']?.value;
      const given = personJson?.name?.['given-names']?.value || '';
      const family = personJson?.name?.['family-name']?.value || '';
      const full = `${given} ${family}`.trim();
      matchedAuthorName = (credit || full || undefined)?.trim();
    } catch {
      // ignore person metadata parse issues
    }
  }

  const worksJson = await worksRes.json();
  const groups: any[] = Array.isArray(worksJson?.group) ? worksJson.group : [];

  const orcidItems = groups
    .map((g) => (Array.isArray(g?.['work-summary']) ? g['work-summary'][0] : null))
    .filter((s) => s?.title?.title?.value);

  if (orcidItems.length === 0) {
    return { works: [], matchedAuthorName };
  }

  // Extract DOIs to enrich author lists & citation counts from OpenAlex in one batch call
  const getDoiFromSummary = (s: any): string => {
    const extIds: any[] = Array.isArray(s?.['external-ids']?.['external-id'])
      ? s['external-ids']['external-id']
      : [];
    const doiObj = extIds.find((e) => String(e?.['external-id-type']).toLowerCase() === 'doi');
    return doiObj?.['external-id-value'] ? normalizeDoi(String(doiObj['external-id-value'])) : '';
  };

  const uniqueDois = Array.from(
    new Set(orcidItems.map(getDoiFromSummary).filter(Boolean))
  ).slice(0, 50);

  const openAlexByDoi = new Map<string, any>();
  if (uniqueDois.length > 0) {
    try {
      const doiFilter = uniqueDois.map((d) => `https://doi.org/${d}`).join('|');
      const oaRes = await fetch(
        `https://api.openalex.org/works?filter=doi:${encodeURIComponent(doiFilter)}&per-page=100`,
        {
          headers: {
            'User-Agent': 'HITK-ECE-Capstone-Portal/1.0 (mailto:ece.project.committee@heritageit.edu)',
          },
        }
      );
      if (oaRes.ok) {
        const oaJson = await oaRes.json();
        const oaWorks: any[] = Array.isArray(oaJson?.results) ? oaJson.results : [];
        for (const w of oaWorks) {
          if (w?.doi) {
            openAlexByDoi.set(normalizeDoi(String(w.doi)), w);
          }
        }
      }
    } catch {
      // OpenAlex enrichment is optional; ORCID works still succeed
    }
  }

  const works: ParsedPublicationCandidate[] = orcidItems.map((s) => {
    const doi = getDoiFromSummary(s);
    const oa = doi ? openAlexByDoi.get(doi) : undefined;

    const oaAuthors = Array.isArray(oa?.authorships)
      ? oa.authorships
          .map((a: any) => a?.author?.display_name)
          .filter(Boolean)
          .join(', ')
      : '';

    const title = String(s.title.title.value).trim();
    const venue =
      String(s?.['journal-title']?.value || '').trim() ||
      oa?.primary_location?.source?.display_name ||
      oa?.host_venue?.display_name ||
      'ORCID Indexed';
    const year =
      Number(s?.['publication-date']?.year?.value) ||
      Number(oa?.publication_year) ||
      new Date().getFullYear();

    return {
      title,
      authors: oaAuthors || matchedAuthorName || 'ORCID Author',
      venue,
      year,
      pubType: mapOrcidType(String(s?.type || '')),
      doiUrl: doi ? `https://doi.org/${doi}` : String(s?.url?.value || ''),
      openAlexId: oa?.id || undefined,
      citationsCount: Number(oa?.cited_by_count) || 0,
      source: 'OPENALEX',
    };
  });

  works.sort((a, b) => b.year - a.year);
  return { works, matchedAuthorName };
}

/**
 * Queries the official ORCID Public API when an ORCID iD is provided (preventing
 * homonym/same-name papers from other researchers), or OpenAlex by Author Name.
 * No API key required.
 */
export async function fetchOpenAlexWorks(params: {
  orcidId?: string;
  authorName?: string;
  institutionHint?: string;
}): Promise<{ works: ParsedPublicationCandidate[]; matchedAuthorName?: string; error?: string }> {
  const cleanOrcid = (params.orcidId || '')
    .trim()
    .replace(/^https?:\/\/orcid\.org\//i, '')
    .trim();

  try {
    if (cleanOrcid) {
      return await fetchOrcidVerifiedWorks(cleanOrcid);
    }

    let worksUrl = '';
    let matchedAuthorName = params.authorName?.trim();

    if (params.authorName && params.authorName.trim().length >= 3) {
      const searchQuery = params.institutionHint
        ? `${params.authorName.trim()} ${params.institutionHint.trim()}`
        : params.authorName.trim();
      const authorSearchUrl = `https://api.openalex.org/authors?search=${encodeURIComponent(
        searchQuery
      )}&per-page=5`;

      const authRes = await fetch(authorSearchUrl, {
        headers: { 'User-Agent': 'HITK-ECE-Capstone-Portal/1.0 (mailto:ece.project.committee@heritageit.edu)' },
      });
      if (!authRes.ok) {
        return { works: [], error: `OpenAlex author lookup failed (HTTP ${authRes.status}).` };
      }
      const authJson = await authRes.json();
      const firstAuthor = authJson?.results?.[0];
      if (!firstAuthor?.id) {
        return { works: [], error: `No matching author found in OpenAlex for "${params.authorName}".` };
      }

      matchedAuthorName = firstAuthor.display_name || params.authorName;
      const authorIdShort = String(firstAuthor.id).replace('https://openalex.org/', '');
      worksUrl = `https://api.openalex.org/works?filter=authorships.author.id:${encodeURIComponent(
        authorIdShort
      )}&sort=publication_year:desc&per-page=100`;
    } else {
      return { works: [], error: 'Please provide an ORCID iD or Author Name.' };
    }

    const res = await fetch(worksUrl, {
      headers: { 'User-Agent': 'HITK-ECE-Capstone-Portal/1.0 (mailto:ece.project.committee@heritageit.edu)' },
    });
    if (!res.ok) {
      return { works: [], error: `OpenAlex works request failed (HTTP ${res.status}).` };
    }

    const json = await res.json();
    const rawWorks: any[] = Array.isArray(json?.results) ? json.results : [];

    const works: ParsedPublicationCandidate[] = rawWorks
      .filter((w) => w?.title)
      .map((w) => {
        const authors = Array.isArray(w.authorships)
          ? w.authorships
              .map((a: any) => a?.author?.display_name)
              .filter(Boolean)
              .join(', ')
          : matchedAuthorName || 'Unknown Author';

        const venue =
          w?.primary_location?.source?.display_name ||
          w?.host_venue?.display_name ||
          'OpenAlex Indexed';

        const typeStr = String(w?.type || '').toLowerCase();
        let pubType: ParsedPublicationCandidate['pubType'] = 'JOURNAL';
        if (typeStr.includes('proceeding') || typeStr.includes('conference')) pubType = 'CONFERENCE';
        else if (typeStr.includes('book')) pubType = 'BOOK_CHAPTER';

        return {
          title: String(w.title).trim(),
          authors: authors || 'Unknown Author',
          venue,
          year: Number(w.publication_year) || new Date().getFullYear(),
          pubType,
          doiUrl: w.doi || w.primary_location?.landing_page_url || w.id || '',
          openAlexId: w.id || undefined,
          citationsCount: Number(w.cited_by_count) || 0,
          source: 'OPENALEX',
        };
      });

    return { works, matchedAuthorName };
  } catch (err) {
    return { works: [], error: `OpenAlex fetch failed: ${(err as Error).message}` };
  }
}
