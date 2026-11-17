'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  doesAuthorListMatchName,
  fetchOpenAlexWorks,
  parseBibtexEntries,
  ParsedPublicationCandidate,
} from '@/lib/publications';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ProfileLinksSchema = z.object({
  orcidId: z.string().max(64).optional(),
  scholarUrl: z.string().max(300).optional(),
});

const ManualPubSchema = z.object({
  title: z.string().min(3, 'Publication title must be at least 3 characters.'),
  authors: z.string().min(2, 'At least one author name is required.'),
  venue: z.string().max(250).optional(),
  year: z.number().int().min(1950).max(2100),
  pubType: z.enum(['JOURNAL', 'CONFERENCE', 'BOOK_CHAPTER', 'PATENT']).default('JOURNAL'),
  doiUrl: z.string().max(400).optional(),
  groupId: z.string().optional(),
  topicId: z.string().optional(),
});

function normalizePubTitle(title: string): string {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDoiForDedup(doiUrl?: string | null): string {
  const raw = (doiUrl || '').trim().toLowerCase();
  if (!raw) return '';
  const stripped = raw
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  // Only treat actual DOIs (10.xxxx/...) or full URLs cleanly
  return stripped;
}

function findDuplicatePublication<
  T extends { title: string; year: number; doiUrl?: string | null; openAlexId?: string | null }
>(
  existingList: T[],
  candidate: { title: string; year: number; doiUrl?: string | null; openAlexId?: string | null }
): T | undefined {
  const candTitle = normalizePubTitle(candidate.title);
  const candDoi = normalizeDoiForDedup(candidate.doiUrl);
  const candOa = (candidate.openAlexId || '').trim().toLowerCase();

  return existingList.find((e) => {
    if (candTitle && normalizePubTitle(e.title) === candTitle && e.year === candidate.year) {
      return true;
    }
    if (candDoi && candDoi.length >= 6 && normalizeDoiForDedup(e.doiUrl) === candDoi) {
      return true;
    }
    if (candOa && e.openAlexId && e.openAlexId.trim().toLowerCase() === candOa) {
      return true;
    }
    return false;
  });
}

export async function getMyPublicationsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: Please sign in.' };
  }

  const userId = session.user.id;
  const role = (session.user as { role?: string }).role || 'FACULTY';

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        orcidId: true,
        scholarUrl: true,
      },
    });

    if (!user) return { error: 'User not found.' };

    const allPubs = await prisma.publication.findMany({
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });

    if (role === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { userId },
        include: {
          groups: {
            include: {
              group: {
                include: {
                  supervisor: { select: { id: true, name: true } },
                  topic: { select: { id: true, code: true, title: true, status: true } },
                },
              },
            },
          },
        },
      });

      const activeMembership =
        student?.groups?.find((gm) => !gm.group.isArchived) || student?.groups?.[0];
      const supervisorId = activeMembership?.group?.supervisorId || null;
      const supervisorName = activeMembership?.group?.supervisor?.name || '';
      const studentName = student?.name || user.name;

      const studentProposedTopics = (student?.groups || [])
        .map((gm) => gm.group?.topic)
        .filter((t): t is NonNullable<typeof t> => Boolean(t?.id));
      const topicById = new Map(studentProposedTopics.map((t) => [t.id, t]));
      const groupTopicByGroupId = new Map(
        (student?.groups || [])
          .filter((gm) => gm.group?.id && gm.group?.topic)
          .map((gm) => [gm.group.id, gm.group.topic!])
      );

      const visible = allPubs
        .map((p) => {
          const isOwner = p.ownerUserId === userId;
          const isStudentCoAuthor = doesAuthorListMatchName(p.authors, studentName);
          const isSupervisorPub =
            Boolean(supervisorId && p.ownerUserId === supervisorId) ||
            Boolean(supervisorName && doesAuthorListMatchName(p.authors, supervisorName));

          if (!isOwner && !isStudentCoAuthor && !isSupervisorPub) return null;

          const matchTag = isOwner
            ? 'Added by You'
            : isStudentCoAuthor
            ? 'Matched by Author Name'
            : `Supervisor (${supervisorName})`;

          const taggedTopic =
            (p.topicId ? topicById.get(p.topicId) : null) ||
            (p.groupId ? groupTopicByGroupId.get(p.groupId) : null) ||
            null;

          return {
            ...p,
            canDelete: isOwner,
            matchTag,
            linkedTopicId: p.topicId || taggedTopic?.id || null,
            linkedTopicCode: taggedTopic?.code || null,
            linkedTopicTitle: taggedTopic?.title || null,
            createdAt: p.createdAt.toISOString(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      return {
        success: true,
        role,
        profile: {
          name: studentName,
          orcidId: user.orcidId || '',
          scholarUrl: user.scholarUrl || '',
          supervisorName: supervisorName || null,
          groupNumber: activeMembership?.group?.number || null,
          groupId: activeMembership?.group?.id || null,
        },
        groups: activeMembership
          ? [
              {
                id: activeMembership.group.id,
                number: activeMembership.group.number,
                batchId: activeMembership.group.batchId,
                topicCode: activeMembership.group.topic?.code || 'N/A',
              },
            ]
          : [],
        proposedTopics: studentProposedTopics.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          status: t.status || 'CONFIRMED',
          batchId: activeMembership?.group?.batchId || '',
        })),
        publications: visible,
      };
    }

    // FACULTY or ADMIN (acting as supervisor)
    const [supervisedGroups, proposedTopics] = await Promise.all([
      prisma.group.findMany({
        where: { supervisorId: userId, isArchived: false },
        include: { topic: { select: { id: true, code: true, title: true } } },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
      prisma.topic?.findMany
        ? prisma.topic.findMany({
            where: { proposerId: userId },
            select: { id: true, code: true, title: true, status: true },
            orderBy: [{ code: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    const topicById = new Map(proposedTopics.map((t) => [t.id, t]));
    const groupTopicByGroupId = new Map(
      supervisedGroups
        .filter((g) => g.topic)
        .map((g) => [g.id, g.topic!])
    );

    const visible = allPubs
      .map((p) => {
        const isOwner = p.ownerUserId === userId;
        const isMatchedAuthor = doesAuthorListMatchName(p.authors, user.name);
        if (!isOwner && !isMatchedAuthor) return null;

        const taggedTopic =
          (p.topicId ? topicById.get(p.topicId) : null) ||
          (p.groupId ? groupTopicByGroupId.get(p.groupId) : null) ||
          null;

        return {
          ...p,
          canDelete: isOwner,
          matchTag: isOwner ? 'Your Portfolio' : 'Matched by Author Name (Student/Co-Author)',
          linkedTopicId: p.topicId || taggedTopic?.id || null,
          linkedTopicCode: taggedTopic?.code || null,
          linkedTopicTitle: taggedTopic?.title || null,
          createdAt: p.createdAt.toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return {
      success: true,
      role,
      profile: {
        name: user.name,
        orcidId: user.orcidId || '',
        scholarUrl: user.scholarUrl || '',
        supervisorName: null,
        groupNumber: null,
        groupId: null,
      },
      groups: supervisedGroups.map((g) => ({
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topicCode: g.topic?.code || 'N/A',
      })),
      proposedTopics: proposedTopics.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        batchId: '',
      })),
      publications: visible,
    };
  } catch (err) {
    return { error: `Failed to load publications: ${(err as Error).message}` };
  }
}

export async function saveProfileScholarLinksAction(input: z.infer<typeof ProfileLinksSchema>) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  const parsed = ProfileLinksSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid ORCID / Scholar URL input.' };

  try {
    const cleanOrcid = (parsed.data.orcidId || '')
      .trim()
      .replace(/^https?:\/\/orcid\.org\//i, '')
      .trim();

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        orcidId: cleanOrcid || null,
        scholarUrl: parsed.data.scholarUrl?.trim() || null,
      },
    });

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    return { success: true, message: 'ORCID & Google Scholar profile saved.' };
  } catch (err) {
    return { error: `Failed to save profile links: ${(err as Error).message}` };
  }
}

export async function fetchOpenAlexPreviewAction(params: {
  orcidId?: string;
  authorName?: string;
  institutionHint?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  return await fetchOpenAlexWorks(params);
}

export async function parseBibtexPreviewAction(bibtexText: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  const works = parseBibtexEntries(bibtexText);
  if (works.length === 0) {
    return { error: 'No valid BibTeX entries found. Export BibTeX from Google Scholar and paste or upload the .bib content.' };
  }
  return { success: true, works };
}

async function resolveDefaultGroupId(userId: string, role: string, authors: string, explicitGroupId?: string): Promise<string | null> {
  if (explicitGroupId) return explicitGroupId;

  if (role === 'STUDENT') {
    const st = await prisma.student.findUnique({
      where: { userId },
      include: { groups: { include: { group: true } } },
    });
    const active = st?.groups?.find((gm) => !gm.group.isArchived) || st?.groups?.[0];
    return active?.group?.id || null;
  }

  // For supervisor: if any student in one of their active groups is a co-author, link that group automatically
  const supGroups = await prisma.group.findMany({
    where: { supervisorId: userId, isArchived: false },
    include: { members: { include: { student: { select: { name: true } } } } },
  });
  for (const g of supGroups) {
    if (g.members.some((m) => doesAuthorListMatchName(authors, m.student.name))) {
      return g.id;
    }
  }
  return null;
}

export async function importPublicationsBatchAction(
  items: ParsedPublicationCandidate[],
  groupId?: string
) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  if (!items || items.length === 0) {
    return { error: 'No publications selected to import.' };
  }

  const userId = session.user.id;
  const role = (session.user as { role?: string }).role || 'FACULTY';

  try {
    const allExisting = await prisma.publication.findMany({
      select: {
        id: true,
        ownerUserId: true,
        title: true,
        year: true,
        authors: true,
        venue: true,
        doiUrl: true,
        openAlexId: true,
        citationsCount: true,
        groupId: true,
      },
    });

    let importedCount = 0;
    let updatedCount = 0;
    let skippedDuplicates = 0;
    for (const item of items) {
      const existingRow = findDuplicatePublication(allExisting, item);
      if (existingRow) {
        if (existingRow.ownerUserId === userId) {
          // Enrich existing publication if newly fetched metadata has more complete details
          const nextAuthors =
            item.authors.trim().length > existingRow.authors.trim().length
              ? item.authors.trim()
              : existingRow.authors;
          const nextVenue = existingRow.venue || item.venue?.trim() || null;
          const nextDoiUrl = item.doiUrl?.trim() || existingRow.doiUrl || null;
          const nextOpenAlexId = item.openAlexId || existingRow.openAlexId || null;
          const nextCitations = Math.max(existingRow.citationsCount || 0, item.citationsCount || 0);
          const nextGroupId =
            existingRow.groupId || (await resolveDefaultGroupId(userId, role, nextAuthors, groupId));

          const hasChanges =
            nextAuthors !== existingRow.authors ||
            nextVenue !== existingRow.venue ||
            nextDoiUrl !== existingRow.doiUrl ||
            nextOpenAlexId !== existingRow.openAlexId ||
            nextCitations !== existingRow.citationsCount ||
            nextGroupId !== existingRow.groupId;

          if (hasChanges) {
            await prisma.publication.update({
              where: { id: existingRow.id },
              data: {
                authors: nextAuthors,
                venue: nextVenue,
                doiUrl: nextDoiUrl,
                openAlexId: nextOpenAlexId,
                citationsCount: nextCitations,
                groupId: nextGroupId,
              },
            });
            updatedCount++;
            continue;
          }
        }
        skippedDuplicates++;
        continue;
      }

      const resolvedGroupId = await resolveDefaultGroupId(userId, role, item.authors, groupId);

      const created = await prisma.publication.create({
        data: {
          title: item.title.trim(),
          authors: item.authors.trim(),
          venue: item.venue?.trim() || null,
          year: item.year,
          pubType: item.pubType || 'JOURNAL',
          doiUrl: item.doiUrl?.trim() || null,
          openAlexId: item.openAlexId || null,
          citationsCount: item.citationsCount || 0,
          source: item.source || 'OPENALEX',
          ownerUserId: userId,
          groupId: resolvedGroupId,
        },
      });
      allExisting.push(created);
      importedCount++;
    }

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase/publications');
    revalidatePath('/admin/showcase');

    return {
      success: true,
      importedCount,
      updatedCount,
      skippedDuplicates,
      message: `Imported ${importedCount} new publication(s)${
        updatedCount > 0 ? `, updated ${updatedCount} existing record(s)` : ''
      }${skippedDuplicates > 0 ? `, skipped ${skippedDuplicates} duplicate(s)` : ''}.`,
    };
  } catch (err) {
    return { error: `Failed to import publications: ${(err as Error).message}` };
  }
}

export async function createManualPublicationAction(input: z.infer<typeof ManualPubSchema>) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  const parsed = ManualPubSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid publication details.' };
  }

  const userId = session.user.id;
  const role = (session.user as { role?: string }).role || 'FACULTY';

  try {
    const allExisting = await prisma.publication.findMany({
      select: { id: true, title: true, year: true, doiUrl: true, openAlexId: true },
    });
    const dup = findDuplicatePublication(allExisting, {
      title: parsed.data.title,
      year: parsed.data.year,
      doiUrl: parsed.data.doiUrl,
    });
    if (dup) {
      return {
        error: `Duplicate publication restricted: "${dup.title}" (${dup.year}) already exists in the portal.`,
      };
    }

    const resolvedGroupId = await resolveDefaultGroupId(
      userId,
      role,
      parsed.data.authors,
      parsed.data.groupId
    );

    const created = await prisma.publication.create({
      data: {
        title: parsed.data.title.trim(),
        authors: parsed.data.authors.trim(),
        venue: parsed.data.venue?.trim() || null,
        year: parsed.data.year,
        pubType: parsed.data.pubType,
        doiUrl: parsed.data.doiUrl?.trim() || null,
        source: 'MANUAL',
        ownerUserId: userId,
        groupId: resolvedGroupId,
        topicId: parsed.data.topicId || null,
      },
    });

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase/publications');
    revalidatePath('/admin/showcase');

    return {
      success: true,
      publication: { ...created, createdAt: created.createdAt.toISOString() },
      message: `Added publication "${created.title}".`,
    };
  } catch (err) {
    return { error: `Failed to save publication: ${(err as Error).message}` };
  }
}

export async function linkPublicationToProjectAction(
  publicationId: string,
  topicId: string | null
) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  const userId = session.user.id;
  const role = (session.user as { role?: string }).role || 'FACULTY';

  try {
    const pub = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) return { error: 'Publication not found.' };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    const isOwner = pub.ownerUserId === userId;
    const isCoAuthor = Boolean(user?.name && doesAuthorListMatchName(pub.authors, user.name));
    if (!isOwner && !isCoAuthor && role !== 'ADMIN') {
      return { error: 'Forbidden: You can only tag publications in your portfolio.' };
    }

    if (!topicId) {
      await prisma.publication.update({
        where: { id: publicationId },
        data: { topicId: null },
      });
      revalidatePath('/faculty/publications');
      revalidatePath('/student/publications');
      revalidatePath('/admin/showcase');
      revalidatePath('/admin/showcase/publications');
      return { success: true, message: 'Removed project tag from publication.' };
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { groups: { select: { id: true } } },
    });
    if (!topic) return { error: 'Selected project topic not found.' };

    if (role === 'FACULTY' && topic.proposerId !== userId) {
      return { error: 'Forbidden: You can only link to your own proposed projects.' };
    }

    await prisma.publication.update({
      where: { id: publicationId },
      data: {
        topicId: topic.id,
        groupId: pub.groupId || topic.groups?.[0]?.id || null,
      },
    });

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/publications');

    return {
      success: true,
      message: `Linked publication to project ${topic.code}.`,
    };
  } catch (err) {
    return { error: `Failed to link project: ${(err as Error).message}` };
  }
}

export async function deletePublicationAction(publicationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized.' };

  const role = (session.user as { role?: string }).role;
  try {
    const existing = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!existing) return { error: 'Publication not found.' };

    if (existing.ownerUserId !== session.user.id && role !== 'ADMIN') {
      return { error: 'Forbidden: You can only delete publications you added.' };
    }

    await prisma.publication.delete({ where: { id: publicationId } });

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase/publications');
    return { success: true, message: 'Publication removed.' };
  } catch (err) {
    return { error: `Failed to delete publication: ${(err as Error).message}` };
  }
}
