import { createZipBuffer, ZipEntryInput } from '@/lib/zip';

export interface ArchivableSemesterSubmission {
  id: string;
  groupId: string;
  groupNumber: number;
  semester: number;
  docType: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  driveFileId?: string | null;
  driveViewLink: string;
  driveDownloadLink?: string | null;
  status: string;
  uploadedByName: string;
  uploadedAt: Date | string;
}

export interface Sem8SubmissionsArchiveResult {
  zipBuffer: Buffer;
  submissionsCount: number;
  filesBundledCount: number;
  linkOnlyCount: number;
}

const MAX_REMOTE_SUBMISSION_BYTES = 25 * 1024 * 1024; // 25 MB cap per file

function sanitizeFileName(name: string): string {
  const cleaned = (name || 'submission')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || 'submission';
}

async function resolveSubmissionBinary(sub: ArchivableSemesterSubmission): Promise<{
  buffer: Buffer | null;
  note?: string;
}> {
  const rawUrl = sub.driveViewLink || '';
  if (rawUrl.startsWith('data:') && rawUrl.includes('base64,')) {
    try {
      const base64Part = rawUrl.split('base64,')[1] || '';
      return { buffer: Buffer.from(base64Part, 'base64') };
    } catch (err) {
      return { buffer: null, note: `Base64 decode failed: ${(err as Error).message}` };
    }
  }

  const candidateUrl =
    sub.driveDownloadLink ||
    (sub.driveFileId ? `https://drive.google.com/uc?export=download&id=${sub.driveFileId}` : null) ||
    (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : null);

  if (!candidateUrl) {
    return { buffer: null, note: 'No downloadable URL available.' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(candidateUrl, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);

    if (!res.ok) {
      return { buffer: null, note: `Remote fetch returned HTTP ${res.status}` };
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_SUBMISSION_BYTES) {
      return { buffer: null, note: `File exceeded ${MAX_REMOTE_SUBMISSION_BYTES} bytes limit` };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_REMOTE_SUBMISSION_BYTES) {
      return { buffer: null, note: `File exceeded ${MAX_REMOTE_SUBMISSION_BYTES} bytes limit` };
    }
    return { buffer: buf };
  } catch (err) {
    return { buffer: null, note: `Remote fetch failed: ${(err as Error).message}` };
  }
}

/**
 * Compresses all 8th-semester Progress Reports & Presentations into a single ZIP archive
 * for 4-year retention in Google Drive.
 */
export async function buildSem8SubmissionsZipBuffer(params: {
  batchId: string;
  archivedAt: string;
  retainUntil: string;
  archivedByAdmin: string;
  submissions: ArchivableSemesterSubmission[];
}): Promise<Sem8SubmissionsArchiveResult> {
  const { batchId, archivedAt, retainUntil, archivedByAdmin, submissions } = params;

  const zipEntries: ZipEntryInput[] = [];
  const usedPaths = new Set<string>();
  let filesBundledCount = 0;
  let linkOnlyCount = 0;

  const uniqueZipPath = (desiredPath: string): string => {
    if (!usedPaths.has(desiredPath)) {
      usedPaths.add(desiredPath);
      return desiredPath;
    }
    const dotIdx = desiredPath.lastIndexOf('.');
    const base = dotIdx > 0 ? desiredPath.slice(0, dotIdx) : desiredPath;
    const ext = dotIdx > 0 ? desiredPath.slice(dotIdx) : '';
    let counter = 2;
    while (usedPaths.has(`${base}_${counter}${ext}`)) counter++;
    const finalPath = `${base}_${counter}${ext}`;
    usedPaths.add(finalPath);
    return finalPath;
  };

  // Resolve remote binaries in bounded parallel batches (concurrency = 5)
  const CONCURRENCY = 5;
  const resolvedList: Array<Awaited<ReturnType<typeof resolveSubmissionBinary>>> = [];
  for (let i = 0; i < submissions.length; i += CONCURRENCY) {
    const chunk = submissions.slice(i, i + CONCURRENCY);
    const chunkRes = await Promise.all(chunk.map((s) => resolveSubmissionBinary(s)));
    resolvedList.push(...chunkRes);
  }

  const manifestItems = submissions.map((s, idx) => {
    const resolved = resolvedList[idx];
    const docLabel = s.docType === 'PROGRESS_REPORT' ? 'Progress_Report' : 'Presentation';
    const safeName = sanitizeFileName(s.fileName);
    let archivePath: string | null = null;

    if (resolved.buffer && resolved.buffer.length > 0) {
      archivePath = uniqueZipPath(`Group_${s.groupNumber}/${docLabel}_${safeName}`);
      zipEntries.push({ name: archivePath, data: resolved.buffer });
      filesBundledCount++;
    } else {
      linkOnlyCount++;
    }

    return {
      groupNumber: s.groupNumber,
      semester: s.semester,
      docType: s.docType,
      fileName: s.fileName,
      fileExtension: s.fileExtension,
      status: s.status,
      uploadedByName: s.uploadedByName,
      uploadedAt: new Date(s.uploadedAt).toISOString(),
      driveViewLink: s.driveViewLink,
      driveDownloadLink: s.driveDownloadLink || null,
      archivePath,
      note: resolved.note || null,
    };
  });

  zipEntries.unshift({
    name: 'submissions_manifest.json',
    data: JSON.stringify(
      {
        batchId,
        semester: 8,
        archivedAt,
        retainUntil,
        archivedByAdmin,
        totalSubmissions: submissions.length,
        filesBundledInZip: filesBundledCount,
        linkOnlyCount,
        submissions: manifestItems,
      },
      null,
      2
    ),
  });

  const zipBuffer = createZipBuffer(zipEntries);
  return {
    zipBuffer,
    submissionsCount: submissions.length,
    filesBundledCount,
    linkOnlyCount,
  };
}
