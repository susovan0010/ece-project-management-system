'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ParsedTopicRow } from '@/lib/import/parser';
import { evaluateRules } from '@/lib/rules';
import { Origin, TopicSource, TopicStatus } from '@prisma/client';

// ----------------------------------------------------
// 1. Get Existing Codes and Titles for Pre-import Validation
// ----------------------------------------------------
export async function getExistingCodesAndTitlesAction() {
  const topics = await prisma.topic.findMany({
    select: { code: true, title: true },
  });

  return {
    codes: topics.map((t) => t.code),
    titles: topics.map((t) => t.title.toLowerCase().trim()),
  };
}

// ----------------------------------------------------
// 2. Chunked Topic Ingestion Action (Max 100 rows per call)
// ----------------------------------------------------
export async function importTopicsChunkAction(chunk: ParsedTopicRow[]) {
  const session = await auth();

  // Strict Server-Side Role Guard
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can import topics.' };
  }

  if (!chunk || chunk.length === 0) {
    return { count: 0 };
  }

  // Safety: Limit chunk size to 100 to stay within Vercel timeout constraints
  const batch = chunk.slice(0, 100);
  let importedCount = 0;

  // Lookup Washington Accord Attribute IDs once per chunk for automatic WP/WK/EA tagging
  const dbAttributes = await prisma.attribute.findMany({
    select: { id: true, code: true },
  });
  const attrCodeToId = new Map(dbAttributes.map((a) => [a.code, a.id]));

  for (const item of batch) {
    const sourceEnum =
      item.source === 'SIH'
        ? TopicSource.SIH
        : item.source === 'UG_RESEARCH'
        ? TopicSource.UG_RESEARCH
        : TopicSource.FACULTY;

    // Sanitize description (max 500 words per specification)
    const words = item.description.trim().split(/\s+/);
    const sanitizedDesc = words.length > 500 ? words.slice(0, 500).join(' ') : item.description.trim();

    const topicRecord = await prisma.topic.upsert({
      where: { code: item.code },
      update: {
        title: item.title,
        source: sourceEnum,
        category: item.category,
        domain: item.domain || null,
        organization: item.organization || null,
        description: sanitizedDesc,
        tags: item.tags,
      },
      create: {
        code: item.code,
        title: item.title,
        source: sourceEnum,
        category: item.category,
        domain: item.domain || null,
        organization: item.organization || null,
        description: sanitizedDesc,
        tags: item.tags,
        status: TopicStatus.DRAFT,
      },
    });

    // Auto-assign baseline WP, WK, EA attributes via deterministic rule engine
    const ruleEval = evaluateRules(
      item.title,
      `${sanitizedDesc} ${item.domain || ''}`,
      item.tags || []
    );
    for (const [attrCode, level] of Object.entries(ruleEval.levels)) {
      const attributeId = attrCodeToId.get(attrCode);
      if (attributeId && level > 0) {
        await prisma.topicAttribute.upsert({
          where: {
            topicId_attributeId: { topicId: topicRecord.id, attributeId },
          },
          update: {},
          create: {
            topicId: topicRecord.id,
            attributeId,
            level,
            reason: ruleEval.reasons[attrCode] || 'Auto-mapped via Theme & Keyword Rule Engine',
            origin: Origin.RULE,
          },
        });
      }
    }

    // Link SDGs in TopicSdg (combine sheet SDGs + rule-detected SDGs if none specified)
    const sdgSet = new Set<number>(item.sdgIds || []);
    if (sdgSet.size === 0) {
      for (const s of ruleEval.sdgs) {
        sdgSet.add(s.sdg);
      }
    }
    for (const sdgId of Array.from(sdgSet)) {
      await prisma.topicSdg.upsert({
        where: { topicId_sdgId: { topicId: topicRecord.id, sdgId } },
        update: {},
        create: { topicId: topicRecord.id, sdgId },
      });
    }

    importedCount++;
  }

  // Record in Audit Log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string,
      action: 'IMPORT_TOPICS_CHUNK',
      entity: 'Topic',
      entityId: `BATCH_${Date.now()}`,
      payload: { count: importedCount, source: batch[0]?.source },
    },
  });

  return { success: true, count: importedCount };
}

// ----------------------------------------------------
// 3. Get Topic Bank with Filters & Pagination
// ----------------------------------------------------
export interface TopicFilters {
  search?: string;
  source?: string;
  category?: string;
  theme?: string;
  sdg?: number;
  page?: number;
  pageSize?: number;
}

export async function getTopicsAction(filters: TopicFilters = {}) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { domain: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.source && filters.source !== 'ALL') {
    where.source = filters.source as TopicSource;
  }

  if (filters.category && filters.category !== 'ALL') {
    where.category = filters.category;
  }

  if (filters.theme && filters.theme !== 'ALL') {
    where.domain = { equals: filters.theme, mode: 'insensitive' };
  }

  if (filters.sdg && filters.sdg > 0) {
    where.sdgs = { some: { sdgId: filters.sdg } };
  }

  const [topics, totalCount, distinctThemeRows] = await Promise.all([
    prisma.topic.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { code: 'asc' },
      include: {
        sdgs: { include: { sdg: true } },
        attributes: { include: { attribute: true } },
        proposer: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.topic.count({ where }),
    prisma.topic.findMany({
      where: { domain: { not: null } },
      select: { domain: true },
      distinct: ['domain'],
      orderBy: { domain: 'asc' },
    }),
  ]);

  const themes = Array.from(
    new Set(
      distinctThemeRows
        .map((r) => (r.domain || '').trim())
        .filter(Boolean)
    )
  ).sort();

  return {
    topics,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    currentPage: page,
    themes,
  };
}

// ----------------------------------------------------
// 4. Update Topic Category Inline Action
// ----------------------------------------------------
export async function updateTopicCategoryAction(id: string, category: string) {
  const session = await auth();

  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can update categories.' };
  }

  await prisma.topic.update({
    where: { id },
    data: { category },
  });

  return { success: true };
}
