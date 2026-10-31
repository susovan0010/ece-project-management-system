'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma, TopicSource } from '@prisma/client';
import { readSupervisorDeletedTopicIds } from '@/app/actions/project-lifecycle';

export interface SearchFacultyTopicsParams {
  query?: string;
  category?: string; // 'Hardware' | 'Software' | 'Both' | 'ALL'
  source?: string; // 'SIH' | 'UG_RESEARCH' | 'FACULTY' | 'ALL'
  theme?: string;
  sdgIds?: number[];
  page?: number;
  pageSize?: number;
}

export async function searchFacultyTopicsAction(params: SearchFacultyTopicsParams) {
  const session = await auth();

  // Role validation: Must be logged in as FACULTY or ADMIN
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to search topics.' };
  }

  const {
    query = '',
    category = 'ALL',
    source = 'ALL',
    theme = 'ALL',
    sdgIds = [],
    page = 1,
    pageSize = 12,
  } = params;

  try {
    const where: Prisma.TopicWhereInput = {};

    // Exclude topics that this supervisor has finally deleted from their account
    const deletedIds = await readSupervisorDeletedTopicIds(session.user.id);
    if (deletedIds.length > 0) {
      where.id = { notIn: deletedIds };
    }

    // Source filtering
    if (source && source !== 'ALL') {
      where.source = source as TopicSource;
    }

    // Category filtering
    if (category && category !== 'ALL') {
      where.category = {
        equals: category,
        mode: 'insensitive',
      };
    }

    // Theme filtering
    if (theme && theme !== 'ALL') {
      where.domain = {
        equals: theme,
        mode: 'insensitive',
      };
    }

    // SDG filtering (topics must match at least one selected SDG if specified)
    if (sdgIds && sdgIds.length > 0) {
      where.sdgs = {
        some: {
          sdgId: { in: sdgIds },
        },
      };
    }

    // Query text search across title, description, code, and domain (Theme)
    if (query && query.trim().length > 0) {
      const q = query.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { domain: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (Math.max(1, page) - 1) * pageSize;
    const take = pageSize;

    const [totalCount, topics, distinctThemeRows] = await Promise.all([
      prisma.topic.count({ where }),
      prisma.topic.findMany({
        where,
        skip,
        take,
        orderBy: { code: 'asc' },
        include: {
          sdgs: {
            include: {
              sdg: true,
            },
          },
          attributes: {
            include: {
              attribute: true,
            },
          },
          proposer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.topic.findMany({
        where: { domain: { not: null } },
        select: { domain: true },
        distinct: ['domain'],
        orderBy: { domain: 'asc' },
      }),
    ]);

    const allThemes = Array.from(
      new Set(distinctThemeRows.map((r) => (r.domain || '').trim()).filter(Boolean))
    ).sort();

    // Fetch all 17 SDGs for filter chips
    const allSdgs = await prisma.sdg.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, title: true },
    });

    return {
      topics,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      allSdgs,
      allThemes,
    };
  } catch (err) {
    return { error: `Failed to search topics: ${(err as Error).message}` };
  }
}

export async function getFacultyTopicDetailAction(topicId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        sdgs: {
          include: {
            sdg: {
              include: {
                targets: true,
              },
            },
          },
        },
        attributes: {
          include: {
            attribute: true,
          },
          orderBy: {
            attribute: {
              code: 'asc',
            },
          },
        },
        versions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 3,
        },
        declarations: true,
        proposer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!topic) {
      return { error: 'Topic not found.' };
    }

    return { topic };
  } catch (err) {
    return { error: `Failed to load topic details: ${(err as Error).message}` };
  }
}

export async function getMyConfirmedTopicsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in.' };
  }

  const userId = session.user.id;

  try {
    const deletedIds = await readSupervisorDeletedTopicIds(userId);

    const topics = await prisma.topic.findMany({
      where: {
        ...(deletedIds.length > 0 ? { id: { notIn: deletedIds } } : {}),
        OR: [
          { proposerId: userId },
          { groups: { some: { supervisorId: userId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sdgs: { include: { sdg: true } },
        attributes: { include: { attribute: true } },
        groups: {
          where: { supervisorId: userId },
          include: { batch: true },
        },
        proposer: { select: { id: true, name: true, email: true } },
      },
    });

    return { topics };
  } catch (err) {
    return { error: `Failed to load confirmed topics: ${(err as Error).message}` };
  }
}

