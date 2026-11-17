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
});

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
                  topic: { select: { code: true, title: true } },
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

          return {
            ...p,
            canDelete: isOwner,
            matchTag,
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
        publications: visible,
      };
    }

    // FACULTY or ADMIN (acting as supervisor)
    const supervisedGroups = await prisma.group.findMany({
      where: { supervisorId: userId, isArchived: false },
      include: { topic: { select: { code: true, title: true } } },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    const visible = allPubs
      .map((p) => {
        const isOwner = p.ownerUserId === userId;
        const isMatchedAuthor = doesAuthorListMatchName(p.authors, user.name);
        if (!isOwner && !isMatchedAuthor) return null;

        return {
          ...p,
          canDelete: isOwner,
          matchTag: isOwner ? 'Your Portfolio' : 'Matched by Author Name (Student/Co-Author)',
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
    const existing = await prisma.publication.findMany({
      where: { ownerUserId: userId },
      select: { title: true, year: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.title.trim().toLowerCase()}::${e.year}`));

    let importedCount = 0;
    for (const item of items) {
      const key = `${item.title.trim().toLowerCase()}::${item.year}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const resolvedGroupId = await resolveDefaultGroupId(userId, role, item.authors, groupId);

      await prisma.publication.create({
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
      importedCount++;
    }

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase/publications');

    return {
      success: true,
      importedCount,
      message: `Imported ${importedCount} new publication(s) (${items.length - importedCount} duplicate(s) skipped).`,
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
      },
    });

    revalidatePath('/faculty/publications');
    revalidatePath('/student/publications');
    revalidatePath('/admin/showcase/publications');

    return {
      success: true,
      publication: { ...created, createdAt: created.createdAt.toISOString() },
      message: `Added publication "${created.title}".`,
    };
  } catch (err) {
    return { error: `Failed to save publication: ${(err as Error).message}` };
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
