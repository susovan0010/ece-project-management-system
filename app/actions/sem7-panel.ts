'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  generateSem7Panels,
  PanelGenerationResult,
  PanelFacultyCandidate,
  PanelGroupCandidate,
} from '@/lib/engine/panel-generator';

const MTECH_RESERVED_KEY = 'sem7_reserved_mtech_faculty';
function getPanelsKey(batchId: string) {
  return `sem7_panels_${batchId}`;
}

export interface Sem7PanelOverviewData {
  batches: { id: string; active: boolean }[];
  selectedBatchId: string;
  totalGroupsCount: number;
  totalFacultyCount: number;
  reservedMTechIds: string[];
  facultyList: PanelFacultyCandidate[];
  groupsList: PanelGroupCandidate[];
  recommendedPanelCount: number;
  savedPanelsResult: PanelGenerationResult | null;
}

/**
 * 1. Load Overview Data for 7th Sem Panels
 */
export async function getSem7PanelOverviewAction(
  requestedBatchId?: string
): Promise<{ success: true; data: Sem7PanelOverviewData } | { success: false; error: string }> {
  const session = await auth();

  // Strict server-side ADMIN role guard
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Admins can access 7th Sem Panel management.',
    };
  }

  try {
    const batches = await prisma.batch.findMany({
      orderBy: { id: 'desc' },
      select: { id: true, active: true },
    });

    const activeBatch = batches.find((b) => b.active) || batches[0];
    const targetBatchId = requestedBatchId || activeBatch?.id || '2023-2027';

    const [groupsRaw, facultyRaw, mtechSetting, panelsSetting] = await Promise.all([
      prisma.group.findMany({
        where: { batchId: targetBatchId },
        orderBy: { number: 'asc' },
        include: {
          topic: { select: { id: true, code: true, title: true, category: true } },
          supervisor: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              student: { select: { name: true, roll: true } },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: {
          active: true,
          role: { in: ['FACULTY', 'ADMIN'] },
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          domainExpertise: true,
        },
      }),
      prisma.setting.findUnique({
        where: { key: MTECH_RESERVED_KEY },
      }),
      prisma.setting.findUnique({
        where: { key: getPanelsKey(targetBatchId) },
      }),
    ]);

    const reservedMTechIds: string[] = Array.isArray(mtechSetting?.value)
      ? (mtechSetting.value as string[])
      : [];

    const facultyList: PanelFacultyCandidate[] = facultyRaw.map((f) => ({
      id: f.id,
      name: f.name,
      email: f.email,
      role: f.role as 'FACULTY' | 'ADMIN',
      domainExpertise: f.domainExpertise || [],
    }));

    const groupsList: PanelGroupCandidate[] = groupsRaw.map((g) => ({
      id: g.id,
      number: g.number,
      batchId: g.batchId,
      topicId: g.topicId,
      topicCode: g.topic?.code || `GRP-${g.number}`,
      topicTitle: g.topic?.title || 'Capstone Project',
      topicCategory: g.topic?.category || undefined,
      supervisorId: g.supervisorId,
      supervisorName: g.supervisor?.name || 'Department Supervisor',
      studentNames: g.members.map((m) => `${m.student.name} (${m.student.roll})`),
    }));

    const savedPanelsResult = panelsSetting?.value
      ? (panelsSetting.value as unknown as PanelGenerationResult)
      : null;

    const recommendedPanelCount = Math.ceil(groupsList.length / 10);

    return {
      success: true,
      data: {
        batches,
        selectedBatchId: targetBatchId,
        totalGroupsCount: groupsList.length,
        totalFacultyCount: facultyList.length,
        reservedMTechIds,
        facultyList,
        groupsList,
        recommendedPanelCount,
        savedPanelsResult,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load panel data: ${(err as Error).message}`,
    };
  }
}

/**
 * 2. Save Faculty Members Reserved for M.Tech
 */
export async function saveSem7ReservedMTechFacultyAction(
  reservedIds: string[]
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Only Admins can reserve faculty for M.Tech.' };
  }

  try {
    await prisma.setting.upsert({
      where: { key: MTECH_RESERVED_KEY },
      create: {
        key: MTECH_RESERVED_KEY,
        value: reservedIds,
      },
      update: {
        value: reservedIds,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: 'MTECH_FACULTY_RESERVATION_UPDATED',
        entity: 'Setting',
        entityId: MTECH_RESERVED_KEY,
        payload: { reservedCount: reservedIds.length, reservedIds },
      },
    });

    revalidatePath('/admin/sem7-panel');
    return {
      success: true,
      message: `Updated M.Tech reserved faculty list (${reservedIds.length} faculty reserved).`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 3. Make Panels: Run pure engine and persist the generated panels
 */
export async function generateAndSaveSem7PanelsAction(input: {
  batchId: string;
  reservedMTechIds?: string[];
  maxGroupsPerPanel?: number;
}): Promise<PanelGenerationResult> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Admins can generate panels.',
      panelCount: 0,
      totalGroups: 0,
      totalFaculty: 0,
      reservedMTechCount: 0,
      availableFacultyCount: 0,
      groupsPerPanelAvg: 0,
      membersPerPanelAvg: 0,
      panels: [],
      conflictsDetected: 0,
      unassignedGroups: [],
    };
  }

  const { batchId, reservedMTechIds = [], maxGroupsPerPanel = 10 } = input;

  try {
    // 1. Fetch current groups and faculty
    const [groupsRaw, facultyRaw] = await Promise.all([
      prisma.group.findMany({
        where: { batchId },
        orderBy: { number: 'asc' },
        include: {
          topic: { select: { id: true, code: true, title: true, category: true } },
          supervisor: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              student: { select: { name: true, roll: true } },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: {
          active: true,
          role: { in: ['FACULTY', 'ADMIN'] },
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          domainExpertise: true,
        },
      }),
    ]);

    const facultyList: PanelFacultyCandidate[] = facultyRaw.map((f) => ({
      id: f.id,
      name: f.name,
      email: f.email,
      role: f.role as 'FACULTY' | 'ADMIN',
      domainExpertise: f.domainExpertise || [],
    }));

    const groupsList: PanelGroupCandidate[] = groupsRaw.map((g) => ({
      id: g.id,
      number: g.number,
      batchId: g.batchId,
      topicId: g.topicId,
      topicCode: g.topic?.code || `GRP-${g.number}`,
      topicTitle: g.topic?.title || 'Capstone Project',
      topicCategory: g.topic?.category || undefined,
      supervisorId: g.supervisorId,
      supervisorName: g.supervisor?.name || 'Department Supervisor',
      studentNames: g.members.map((m) => `${m.student.name} (${m.student.roll})`),
    }));

    // 2. Run deterministic engine
    const result = generateSem7Panels({
      groups: groupsList,
      faculty: facultyList,
      reservedMTechIds,
      maxGroupsPerPanel,
    });

    if (result.success) {
      // 3. Save panels and reservation
      await Promise.all([
        prisma.setting.upsert({
          where: { key: getPanelsKey(batchId) },
          create: {
            key: getPanelsKey(batchId),
            value: result as any,
          },
          update: {
            value: result as any,
          },
        }),
        prisma.setting.upsert({
          where: { key: MTECH_RESERVED_KEY },
          create: {
            key: MTECH_RESERVED_KEY,
            value: reservedMTechIds,
          },
          update: {
            value: reservedMTechIds,
          },
        }),
      ]);

      await prisma.auditLog.create({
        data: {
          userId: session.user.id!,
          action: 'SEM7_PANELS_GENERATED',
          entity: 'Batch',
          entityId: batchId,
          payload: {
            panelCount: result.panelCount,
            totalGroups: result.totalGroups,
            reservedMTechCount: result.reservedMTechCount,
            availableFacultyCount: result.availableFacultyCount,
            conflictsDetected: result.conflictsDetected,
          },
        },
      });

      revalidatePath('/admin/sem7-panel');
    }

    return result;
  } catch (err) {
    return {
      success: false,
      error: `Failed to generate panels: ${(err as Error).message}`,
      panelCount: 0,
      totalGroups: 0,
      totalFaculty: 0,
      reservedMTechCount: 0,
      availableFacultyCount: 0,
      groupsPerPanelAvg: 0,
      membersPerPanelAvg: 0,
      panels: [],
      conflictsDetected: 0,
      unassignedGroups: [],
    };
  }
}

/**
 * 4. Reset or Clear Panels for a Batch
 */
export async function clearSem7PanelsAction(
  batchId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Only Admins can clear panels.' };
  }

  try {
    await prisma.setting.deleteMany({
      where: { key: getPanelsKey(batchId) },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: 'SEM7_PANELS_CLEARED',
        entity: 'Batch',
        entityId: batchId,
      },
    });

    revalidatePath('/admin/sem7-panel');
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
