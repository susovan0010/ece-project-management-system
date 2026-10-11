'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  attainment,
  isMetricAttained,
  DEFAULT_ATTAINMENT_TARGET,
  MarkEntryInput,
} from '@/lib/engine';
import { revalidatePath } from 'next/cache';

// ----------------------------------------------------
// 1. Calculate & Snapshot Attainment for a Group
// ----------------------------------------------------
export async function calculateAndSnapshotGroupAttainmentAction(groupId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized.' };
  }

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        topic: true,
        markEntries: {
          include: {
            criterion: {
              include: {
                maps: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return { error: 'Group not found.' };
    }

    if (!group.markEntries || group.markEntries.length === 0) {
      return { error: 'No marks entered for this group yet.' };
    }

    // Prepare inputs for pure attainment() engine
    // Average panel scores if examiner slots > 1
    const entriesMap = new Map<number, { marksSum: number; max: number; count: number; maps: string[] }>();

    for (const m of group.markEntries) {
      const crit = m.criterion;
      if (!crit) continue;

      const mappingCodes = crit.maps.map((map) => map.code);

      if (!entriesMap.has(crit.id)) {
        entriesMap.set(crit.id, {
          marksSum: m.marks,
          max: crit.maxMarks,
          count: 1,
          maps: mappingCodes,
        });
      } else {
        const existing = entriesMap.get(crit.id)!;
        existing.marksSum += m.marks;
        existing.count += 1;
      }
    }

    const markInputs: MarkEntryInput[] = Array.from(entriesMap.values()).map((e) => ({
      marks: e.marksSum / e.count, // averaged across examiner slots or students
      max: e.max,
      maps: e.maps,
    }));

    // Target metric set: PO1..PO11, WP1..WP7, WK1..WK9, EA1..EA5
    const metricsToEvaluate: string[] = [
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `WP${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `WK${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `EA${i + 1}`),
    ];

    const snapshotsToSave: Array<{
      topicId: string;
      groupId: string;
      metric: string;
      attainment: number;
      isAttained: boolean;
      target: number;
    }> = [];

    for (const metric of metricsToEvaluate) {
      const ratio = attainment(markInputs, metric);
      if (ratio !== null) {
        const attained = isMetricAttained(ratio, DEFAULT_ATTAINMENT_TARGET);
        snapshotsToSave.push({
          topicId: group.topicId,
          groupId: group.id,
          metric,
          attainment: ratio,
          isAttained: attained,
          target: DEFAULT_ATTAINMENT_TARGET,
        });
      }
    }

    // Upsert into AttainmentSnapshot in transaction
    await prisma.$transaction(async (tx) => {
      // Clear previous snapshots for this group
      await tx.attainmentSnapshot.deleteMany({
        where: { groupId: group.id },
      });

      for (const s of snapshotsToSave) {
        await tx.attainmentSnapshot.create({
          data: {
            topicId: s.topicId,
            groupId: s.groupId,
            metric: s.metric,
            attainment: s.attainment,
            isAttained: s.isAttained,
            target: s.target,
          },
        });
      }
    });

    revalidatePath('/faculty/attainment');
    revalidatePath('/admin/attainment');
    return { success: true, count: snapshotsToSave.length, snapshots: snapshotsToSave };
  } catch (err) {
    return { error: `Failed to calculate attainment: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Get Faculty Attainment Analytics (Strict Supervisor Isolation)
// ----------------------------------------------------
export async function getFacultyAttainmentAnalyticsAction(batchId?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to view attainment.' };
  }

  const supervisorId = session.user.id;

  try {
    const where: any = { supervisorId };
    if (batchId && batchId !== 'ALL') {
      where.batchId = batchId;
    }

    const [groups, activeBatches] = await Promise.all([
      prisma.group.findMany({
        where,
        orderBy: { number: 'asc' },
        include: {
          topic: true,
          snapshots: {
            orderBy: { metric: 'asc' },
          },
        },
      }),
      prisma.batch.findMany({
        where: { active: true },
        orderBy: { id: 'desc' },
      }),
    ]);

    // Aggregate PO attainment across supervisor groups
    const poStats: Record<string, { totalRatios: number[]; count: number }> = {};
    for (let i = 1; i <= 11; i++) {
      poStats[`PO${i}`] = { totalRatios: [], count: 0 };
    }

    let totalMetricsCount = 0;
    let attainedMetricsCount = 0;

    groups.forEach((g) => {
      g.snapshots.forEach((s) => {
        if (s.metric.startsWith('PO')) {
          if (poStats[s.metric]) {
            poStats[s.metric].totalRatios.push(s.attainment);
            poStats[s.metric].count++;
          }
          totalMetricsCount++;
          if (s.isAttained) attainedMetricsCount++;
        }
      });
    });

    const poAverages = Object.entries(poStats).map(([code, stat]) => {
      const avg =
        stat.totalRatios.length > 0
          ? Number((stat.totalRatios.reduce((a, b) => a + b, 0) / stat.totalRatios.length).toFixed(4))
          : 0;

      return {
        po: code,
        attainment: Math.round(avg * 100),
        ratio: avg,
        isAttained: avg >= DEFAULT_ATTAINMENT_TARGET,
        evaluatedGroups: stat.count,
      };
    });

    const overallAttainmentRate =
      totalMetricsCount > 0 ? Math.round((attainedMetricsCount / totalMetricsCount) * 100) : 0;

    return {
      groups,
      batches: activeBatches,
      poAverages,
      overallAttainmentRate,
      targetThreshold: Math.round(DEFAULT_ATTAINMENT_TARGET * 100),
    };
  } catch (err) {
    return { error: `Failed to load faculty attainment: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Get Admin Attainment Analytics (Department-wide)
// ----------------------------------------------------
export async function getAdminAttainmentAnalyticsAction(batchId?: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access department audit.' };
  }

  try {
    const where: any = {};
    if (batchId && batchId !== 'ALL') {
      where.batchId = batchId;
    }

    const [allGroups, batches] = await Promise.all([
      prisma.group.findMany({
        where,
        include: {
          topic: true,
          supervisor: {
            select: { name: true, email: true },
          },
          snapshots: true,
        },
      }),
      prisma.batch.findMany({ orderBy: { id: 'desc' } }),
    ]);

    // Aggregate department-wide PO averages
    const poStats: Record<string, number[]> = {};
    for (let i = 1; i <= 11; i++) {
      poStats[`PO${i}`] = [];
    }

    let totalEvaluated = 0;
    let totalAttained = 0;

    allGroups.forEach((g) => {
      g.snapshots.forEach((s) => {
        if (s.metric.startsWith('PO') && poStats[s.metric]) {
          poStats[s.metric].push(s.attainment);
          totalEvaluated++;
          if (s.isAttained) totalAttained++;
        }
      });
    });

    const poSummary = Object.entries(poStats).map(([po, values]) => {
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return {
        po,
        percentage: Math.round(avg * 100),
        ratio: Number(avg.toFixed(4)),
        isAttained: avg >= DEFAULT_ATTAINMENT_TARGET,
        count: values.length,
      };
    });
    return {
      groups: allGroups,
      totalGroups: allGroups.length,
      batches,
      poSummary,
      overallAttainmentRate: totalEvaluated > 0 ? Math.round((totalAttained / totalEvaluated) * 100) : 0,
      targetThreshold: Math.round(DEFAULT_ATTAINMENT_TARGET * 100),
      groupsWithSnapshots: allGroups.filter((g) => g.snapshots.length > 0).length,
    };
  } catch (err) {
    return { error: `Failed to load admin attainment analytics: ${(err as Error).message}` };
  }
}
