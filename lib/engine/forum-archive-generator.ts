import { createZipBuffer, ZipEntryInput } from '@/lib/zip';

export interface ArchivableForumAttachment {
  name: string;
  size?: number;
  type?: string;
  url?: string;
  driveFileId?: string;
  driveViewLink?: string;
  driveDownloadLink?: string;
  hostedOn?: string;
}

export interface ArchivableForumAuthor {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  student?: {
    roll?: string | null;
    universityRoll?: string | null;
  } | null;
}

export interface ArchivableForumReaction {
  userId: string;
  type: string;
}

export interface ArchivableForumMarkupVote {
  value: number;
  reason?: string | null;
  supervisor?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export interface ArchivableForumReply {
  id: string;
  content: string;
  attachments?: unknown;
  createdAt: Date | string;
  author?: ArchivableForumAuthor | null;
  reactions?: ArchivableForumReaction[];
  markupVotes?: ArchivableForumMarkupVote[];
}

export interface ArchivableForumPost {
  id: string;
  groupId?: string | null;
  channel: string;
  targetScope?: string | null;
  title: string;
  content: string;
  attachments?: unknown;
  createdAt: Date | string;
  group?: {
    number: number;
    topic?: {
      code?: string | null;
      title?: string | null;
    } | null;
  } | null;
  author?: ArchivableForumAuthor | null;
  replies?: ArchivableForumReply[];
  reactions?: ArchivableForumReaction[];
  markupVotes?: ArchivableForumMarkupVote[];
}

export interface ForumArchiveBuildResult {
  zipBuffer: Buffer;
  postsCount: number;
  repliesCount: number;
  attachmentsArchivedCount: number;
  attachmentsManifestCount: number;
}

const MAX_REMOTE_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per file cap

function sanitizeFileName(name: string): string {
  const cleaned = (name || 'attachment')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || 'attachment';
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAttachments(raw: unknown): ArchivableForumAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ArchivableForumAttachment => Boolean(item && typeof item === 'object'));
}

async function resolveAttachmentBinary(att: ArchivableForumAttachment): Promise<{
  buffer: Buffer | null;
  sourceUrl: string | null;
  note?: string;
}> {
  const rawUrl = att.url || '';

  // 1. Embedded base64 data URL
  if (rawUrl.startsWith('data:') && rawUrl.includes('base64,')) {
    try {
      const base64Part = rawUrl.split('base64,')[1] || '';
      const buf = Buffer.from(base64Part, 'base64');
      return { buffer: buf, sourceUrl: 'embedded-data-url' };
    } catch (err) {
      return {
        buffer: null,
        sourceUrl: null,
        note: `Failed to decode base64 data URL: ${(err as Error).message}`,
      };
    }
  }

  // 2. Remote Google Drive or HTTP(S) URL
  const candidateUrl =
    att.driveDownloadLink ||
    (att.driveFileId ? `https://drive.google.com/uc?export=download&id=${att.driveFileId}` : null) ||
    (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : null);

  if (!candidateUrl) {
    return { buffer: null, sourceUrl: null, note: 'No downloadable URL or base64 payload present.' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(candidateUrl, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        buffer: null,
        sourceUrl: candidateUrl,
        note: `Remote fetch returned HTTP ${res.status}`,
      };
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_ATTACHMENT_BYTES) {
      return {
        buffer: null,
        sourceUrl: candidateUrl,
        note: `Attachment exceeded ${MAX_REMOTE_ATTACHMENT_BYTES} bytes limit`,
      };
    }

    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    if (buf.length > MAX_REMOTE_ATTACHMENT_BYTES) {
      return {
        buffer: null,
        sourceUrl: candidateUrl,
        note: `Attachment exceeded ${MAX_REMOTE_ATTACHMENT_BYTES} bytes limit`,
      };
    }

    return { buffer: buf, sourceUrl: candidateUrl };
  } catch (err) {
    return {
      buffer: null,
      sourceUrl: candidateUrl,
      note: `Remote fetch failed: ${(err as Error).message}`,
    };
  }
}

export async function buildForumArchiveZipBuffer(params: {
  batchId: string;
  archivedAt: string;
  archivedByAdmin: string;
  posts: ArchivableForumPost[];
}): Promise<ForumArchiveBuildResult> {
  const { batchId, archivedAt, archivedByAdmin, posts } = params;

  const zipEntries: ZipEntryInput[] = [];
  const usedPaths = new Set<string>();
  const unresolvedManifest: Array<{
    postId: string;
    replyId?: string;
    groupNumber: number | null;
    fileName: string;
    mimeType: string;
    driveViewLink?: string;
    driveDownloadLink?: string;
    url?: string;
    note?: string;
  }> = [];

  let repliesCount = 0;
  let attachmentsArchivedCount = 0;

  const uniqueZipPath = (desiredPath: string): string => {
    if (!usedPaths.has(desiredPath)) {
      usedPaths.add(desiredPath);
      return desiredPath;
    }
    const dotIdx = desiredPath.lastIndexOf('.');
    const base = dotIdx > 0 ? desiredPath.slice(0, dotIdx) : desiredPath;
    const ext = dotIdx > 0 ? desiredPath.slice(dotIdx) : '';
    let counter = 2;
    while (usedPaths.has(`${base}_${counter}${ext}`)) {
      counter++;
    }
    const finalPath = `${base}_${counter}${ext}`;
    usedPaths.add(finalPath);
    return finalPath;
  };

  const processAttachments = async (
    rawAttachments: unknown,
    groupNumber: number | null,
    postId: string,
    replyId?: string
  ) => {
    const list = normalizeAttachments(rawAttachments);
    const archivedMeta: Array<{
      name: string;
      type: string;
      size: number;
      archivePath: string | null;
      driveViewLink?: string;
      driveDownloadLink?: string;
      status: 'BUNDLED_IN_ZIP' | 'LINK_ONLY';
      note?: string;
    }> = [];

    const folderSegment = groupNumber !== null ? `Group_${groupNumber}` : 'Committee';
    const prefix = replyId ? `reply_${replyId.slice(-6)}` : `post_${postId.slice(-6)}`;

    for (const att of list) {
      const safeName = sanitizeFileName(att.name);
      const resolved = await resolveAttachmentBinary(att);

      if (resolved.buffer && resolved.buffer.length > 0) {
        const archivePath = uniqueZipPath(`attachments/${folderSegment}/${prefix}_${safeName}`);
        zipEntries.push({ name: archivePath, data: resolved.buffer });
        attachmentsArchivedCount++;
        archivedMeta.push({
          name: att.name,
          type: att.type || 'application/octet-stream',
          size: resolved.buffer.length,
          archivePath,
          driveViewLink: att.driveViewLink,
          driveDownloadLink: att.driveDownloadLink,
          status: 'BUNDLED_IN_ZIP',
        });
      } else {
        unresolvedManifest.push({
          postId,
          replyId,
          groupNumber,
          fileName: att.name,
          mimeType: att.type || 'application/octet-stream',
          driveViewLink: att.driveViewLink,
          driveDownloadLink: att.driveDownloadLink,
          url: att.url && !att.url.startsWith('data:') ? att.url : undefined,
          note: resolved.note,
        });
        archivedMeta.push({
          name: att.name,
          type: att.type || 'application/octet-stream',
          size: att.size || 0,
          archivePath: null,
          driveViewLink: att.driveViewLink,
          driveDownloadLink: att.driveDownloadLink,
          status: 'LINK_ONLY',
          note: resolved.note,
        });
      }
    }

    return archivedMeta;
  };

  const structuredPosts = [];

  for (const p of posts) {
    const groupNumber = p.group?.number ?? null;
    const postAttachments = await processAttachments(p.attachments, groupNumber, p.id);

    const structuredReplies = [];
    for (const r of p.replies || []) {
      repliesCount++;
      const replyAttachments = await processAttachments(r.attachments, groupNumber, p.id, r.id);
      structuredReplies.push({
        id: r.id,
        createdAt: new Date(r.createdAt).toISOString(),
        author: {
          id: r.author?.id || '',
          name: r.author?.name || 'Unknown',
          email: r.author?.email || '',
          role: r.author?.role || 'UNKNOWN',
          collegeRoll: r.author?.student?.roll || null,
          universityRoll: r.author?.student?.universityRoll || null,
        },
        content: r.content,
        reactions: {
          likes: (r.reactions || []).filter((x) => x.type === 'LIKE').length,
          dislikes: (r.reactions || []).filter((x) => x.type === 'DISLIKE').length,
        },
        markupVotes: (r.markupVotes || []).map((v) => ({
          value: v.value,
          reason: v.reason || null,
          supervisorName: v.supervisor?.name || null,
        })),
        attachments: replyAttachments,
      });
    }

    structuredPosts.push({
      id: p.id,
      channel: p.channel,
      targetScope: p.targetScope || null,
      groupNumber,
      topicCode: p.group?.topic?.code || null,
      topicTitle: p.group?.topic?.title || null,
      createdAt: new Date(p.createdAt).toISOString(),
      title: p.title,
      author: {
        id: p.author?.id || '',
        name: p.author?.name || 'Unknown',
        email: p.author?.email || '',
        role: p.author?.role || 'UNKNOWN',
        collegeRoll: p.author?.student?.roll || null,
        universityRoll: p.author?.student?.universityRoll || null,
      },
      content: p.content,
      reactions: {
        likes: (p.reactions || []).filter((x) => x.type === 'LIKE').length,
        dislikes: (p.reactions || []).filter((x) => x.type === 'DISLIKE').length,
      },
      markupVotes: (p.markupVotes || []).map((v) => ({
        value: v.value,
        reason: v.reason || null,
        supervisorName: v.supervisor?.name || null,
      })),
      attachments: postAttachments,
      replies: structuredReplies,
    });
  }

  const archiveJson = {
    batchId,
    archivedAt,
    archivedByAdmin,
    summary: {
      totalPosts: structuredPosts.length,
      totalReplies: repliesCount,
      attachmentsBundledInZip: attachmentsArchivedCount,
      attachmentsLinkOnly: unresolvedManifest.length,
    },
    posts: structuredPosts,
  };

  zipEntries.unshift({
    name: 'forum_communications.json',
    data: JSON.stringify(archiveJson, null, 2),
  });

  if (unresolvedManifest.length > 0) {
    zipEntries.push({
      name: 'attachments/download_manifest.json',
      data: JSON.stringify(unresolvedManifest, null, 2),
    });
  }

  // Standalone HTML transcript
  const renderAttachmentsHtml = (
    atts: Array<{
      name: string;
      size: number;
      archivePath: string | null;
      driveViewLink?: string;
      status: string;
    }>
  ) => {
    if (atts.length === 0) return '';
    return `<div class="atts"><strong>Attachments:</strong><ul>${atts
      .map((a) => {
        if (a.archivePath) {
          return `<li><a href="${escapeHtml(a.archivePath)}">${escapeHtml(a.name)}</a> (${(a.size / 1024).toFixed(1)} KB)</li>`;
        }
        if (a.driveViewLink) {
          return `<li><a href="${escapeHtml(a.driveViewLink)}" target="_blank">${escapeHtml(a.name)} (Drive Link)</a></li>`;
        }
        return `<li>${escapeHtml(a.name)} (Unavailable)</li>`;
      })
      .join('')}</ul></div>`;
  };

  const postsHtml = structuredPosts
    .map((p) => {
      const groupBadge =
        p.groupNumber !== null
          ? `Group ${p.groupNumber}${p.topicCode ? ` (${escapeHtml(p.topicCode)})` : ''}`
          : 'Committee Channel';
      const rollInfo = p.author.collegeRoll
        ? ` [Roll: ${escapeHtml(p.author.collegeRoll)}${p.author.universityRoll ? ` / Univ: ${escapeHtml(p.author.universityRoll)}` : ''}]`
        : '';

      const repliesHtml = p.replies
        .map((r) => {
          const rRoll = r.author.collegeRoll
            ? ` [Roll: ${escapeHtml(r.author.collegeRoll)}${r.author.universityRoll ? ` / Univ: ${escapeHtml(r.author.universityRoll)}` : ''}]`
            : '';
          return `<div class="reply">
            <div class="meta"><strong>${escapeHtml(r.author.name)}</strong> (${escapeHtml(r.author.role)})${rRoll} &bull; ${escapeHtml(r.createdAt)}</div>
            <div class="body">${escapeHtml(r.content).replace(/\n/g, '<br/>')}</div>
            ${renderAttachmentsHtml(r.attachments)}
          </div>`;
        })
        .join('');

      return `<article class="post">
        <div class="post-head">
          <span class="badge">${groupBadge}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <div class="meta">By <strong>${escapeHtml(p.author.name)}</strong> (${escapeHtml(p.author.role)})${rollInfo} &bull; ${escapeHtml(p.createdAt)} &bull; Likes: ${p.reactions.likes}</div>
        </div>
        <div class="body">${escapeHtml(p.content).replace(/\n/g, '<br/>')}</div>
        ${renderAttachmentsHtml(p.attachments)}
        ${repliesHtml ? `<div class="replies">${repliesHtml}</div>` : ''}
      </article>`;
    })
    .join('');

  const transcriptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Batch ${escapeHtml(batchId)} - Forum Communications Archive</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; color: #1e293b; background: #f8fafc; }
    header { background: #0f172a; color: #fff; padding: 20px 24px; border-radius: 10px; margin-bottom: 24px; }
    header h1 { margin: 0 0 6px 0; font-size: 20px; }
    header p { margin: 0; font-size: 13px; color: #cbd5e1; }
    .post { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
    .badge { display: inline-block; background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; }
    h3 { margin: 4px 0; font-size: 16px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 10px; }
    .body { font-size: 14px; line-height: 1.5; white-space: normal; }
    .atts { margin-top: 10px; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; font-size: 12px; }
    .atts ul { margin: 4px 0 0 18px; padding: 0; }
    .replies { margin-top: 14px; padding-left: 16px; border-left: 3px solid #cbd5e1; }
    .reply { padding: 8px 0; border-top: 1px dashed #e2e8f0; }
    .reply:first-child { border-top: none; }
  </style>
</head>
<body>
  <header>
    <h1>Batch ${escapeHtml(batchId)} &mdash; Forum Communications &amp; Attachments Archive</h1>
    <p>Archived on ${escapeHtml(archivedAt)} by ${escapeHtml(archivedByAdmin)} &bull; Posts: ${structuredPosts.length} &bull; Replies: ${repliesCount} &bull; Attachments in ZIP: ${attachmentsArchivedCount}</p>
  </header>
  ${postsHtml || '<p>No forum posts were recorded for this batch.</p>'}
</body>
</html>`;

  zipEntries.splice(1, 0, {
    name: 'forum_communications.html',
    data: transcriptHtml,
  });

  const zipBuffer = createZipBuffer(zipEntries);

  return {
    zipBuffer,
    postsCount: structuredPosts.length,
    repliesCount,
    attachmentsArchivedCount,
    attachmentsManifestCount: unresolvedManifest.length,
  };
}
