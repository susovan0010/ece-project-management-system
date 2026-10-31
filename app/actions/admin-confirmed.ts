'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma, TopicSource, TopicStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { sanitizeCellForCsv } from '@/lib/csv-sanitize';
import { deriveMappedPoCodes } from '@/lib/engine';
import { evaluateRules } from '@/lib/rules';

// ----------------------------------------------------
// 1. Get Confirmed Topics for Admin Ledger
// ----------------------------------------------------
export async function getAdminConfirmedTopicsAction(params?: {
  query?: string;
  category?: string;
  source?: string;
  theme?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access confirmed topics ledger.' };
  }

  const {
    query = '',
    category = 'ALL',
    source = 'ALL',
    theme = 'ALL',
    status = 'CONFIRMED',
    page = 1,
    pageSize = 20,
  } = params || {};

  try {
    const where: Prisma.TopicWhereInput = {};

    if (status === 'ACTIVE') {
      where.status = { in: [TopicStatus.CONFIRMED, TopicStatus.ALLOTTED] };
    } else if (status && status !== 'ALL') {
      where.status = status as TopicStatus;
    }

    if (source && source !== 'ALL') {
      where.source = source as TopicSource;
    }

    if (category && category !== 'ALL') {
      where.category = {
        equals: category,
        mode: 'insensitive',
      };
    }

    if (theme && theme !== 'ALL') {
      where.domain = {
        equals: theme,
        mode: 'insensitive',
      };
    }

    if (query && query.trim().length > 0) {
      const q = query.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { domain: { contains: q, mode: 'insensitive' } },
        { proposer: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (Math.max(1, page) - 1) * pageSize;
    const take = pageSize;

    const [totalCount, topics, totalConfirmed, totalDraft, totalAllotted, totalArchived] = await Promise.all([
      prisma.topic.count({ where }),
      prisma.topic.findMany({
        where,
        skip,
        take,
        orderBy: { code: 'asc' },
        include: {
          proposer: {
            select: { id: true, name: true, email: true },
          },
          sdgs: {
            include: { sdg: true },
          },
          attributes: {
            include: { attribute: true },
          },
          groups: {
            select: { id: true, number: true },
          },
        },
      }),
      prisma.topic.count({ where: { status: TopicStatus.CONFIRMED } }),
      prisma.topic.count({ where: { status: TopicStatus.DRAFT } }),
      prisma.topic.count({ where: { status: TopicStatus.ALLOTTED } }),
      prisma.topic.count({ where: { status: TopicStatus.ARCHIVED } }),
    ]);

    return {
      topics,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      counts: {
        confirmed: totalConfirmed,
        draft: totalDraft,
        allotted: totalAllotted,
        archived: totalArchived,
      },
    };
  } catch (err) {
    return { error: `Failed to load confirmed topics: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Update Topic Status Action (Admin Only)
// ----------------------------------------------------
export async function updateTopicStatusAction(topicId: string, newStatus: TopicStatus) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    const updated = await prisma.topic.update({
      where: { id: topicId },
      data: { status: newStatus },
      select: { id: true, code: true, title: true, status: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_TOPIC_STATUS',
        entity: 'Topic',
        entityId: topicId,
        payload: {
          code: updated.code,
          newStatus,
        },
      },
    });

    revalidatePath('/admin/confirmed');
    revalidatePath('/faculty/topics');
    return { success: true, topic: updated };
  } catch (err) {
    return { error: `Failed to update topic status: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Export Student-Facing Topics Payload Action (Sanitized)
// ----------------------------------------------------
export async function exportStudentTopicsDataAction() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can generate catalog exports.' };
  }

  try {
    // Only export CONFIRMED or ALLOTTED topics for student catalogue
    const topics = await prisma.topic.findMany({
      where: {
        status: { in: [TopicStatus.CONFIRMED, TopicStatus.ALLOTTED] },
      },
      orderBy: { code: 'asc' },
      include: {
        proposer: {
          select: { name: true, email: true },
        },
        sdgs: {
          include: { sdg: true },
        },
        attributes: {
          include: { attribute: true },
        },
      },
    });

    // Transform into clean student-facing records
    // Decision 3: Supervisor name is included.
    // Rule 2 & Decision 5: Never include student personal data.
    const sanitizedRows = topics.map((t) => {
      const supervisorName = t.proposer?.name || 'Department Committee';
      const sdgList = t.sdgs.map((s) => `SDG ${s.sdgId} (${s.target || 'General'})`).join('; ');
      const effectiveAttrs =
        t.attributes && t.attributes.length > 0
          ? t.attributes
          : Object.entries(
              evaluateRules(t.title, `${t.description || ''} ${t.domain || ''}`, t.tags || []).levels
            ).map(([code, level]) => ({
              level,
              attribute: { code, kind: code.slice(0, 2), title: code },
            }));
      const allAttrsStr = effectiveAttrs
        .filter((a) => a.level >= 1)
        .map((a) => `${a.attribute.code} (L${a.level})`)
        .join(', ');
      const poStr = deriveMappedPoCodes(effectiveAttrs).join(', ');

      return {
        code: sanitizeCellForCsv(t.code),
        title: sanitizeCellForCsv(t.title),
        category: sanitizeCellForCsv(t.category),
        source: sanitizeCellForCsv(t.source === 'UG_RESEARCH' ? 'UG Research' : t.source),
        supervisor: sanitizeCellForCsv(supervisorName),
        domain: sanitizeCellForCsv(t.domain || 'General ECE'),
        organization: sanitizeCellForCsv(t.organization || 'HITK Department of ECE'),
        sdgs: sanitizeCellForCsv(sdgList || 'None Specified'),
        complexityWp: sanitizeCellForCsv(
          `${allAttrsStr || 'Baseline'}${poStr ? ` | POs: ${poStr}` : ''}`
        ),
        description: sanitizeCellForCsv(t.description || ''),
      };
    });

    return { rows: sanitizedRows, count: sanitizedRows.length };
  } catch (err) {
    return { error: `Failed to generate export data: ${(err as Error).message}` };
  }
}
