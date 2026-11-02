'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  attainment,
  isMetricAttained,
  getAttainmentLevel,
  getAttainmentLevelDescription,
  calculateStudentAttainment,
  DEFAULT_ATTAINMENT_TARGET,
  MarkEntryInput,
  StudentMarkEntryInput,
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
          members: {
            include: {
              student: true,
            },
          },
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
      }),
      prisma.batch.findMany({
        where: { active: true },
        orderBy: { id: 'desc' },
      }),
    ]);

    // Target metrics to evaluate
    const metricsToEvaluate = [
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `WP${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `WK${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `EA${i + 1}`),
    ];

    // Compute individual student attainments and augment snapshots with discrete levels
    const enrichedGroups = groups.map((g) => {
      const studentInputs: StudentMarkEntryInput[] = (g.markEntries || []).map((m) => ({
        studentId: m.studentId,
        marks: m.marks,
        max: m.criterion?.maxMarks || 0,
        maps: (m.criterion?.maps || []).map((map) => map.code),
      }));

      const membersWithAttainment = (g.members || []).map((m) => {
        const studentAttainments = calculateStudentAttainment(
          studentInputs,
          m.studentId,
          metricsToEvaluate
        );
        return {
          studentId: m.studentId,
          name: m.student?.name || '',
          roll: m.student?.roll || '',
          email: m.student?.email || '',
          attainments: studentAttainments,
        };
      });

      const enrichedSnapshots = (g.snapshots || []).map((s) => ({
        ...s,
        percentage: Math.round(s.attainment * 100),
        level: getAttainmentLevel(s.attainment),
        levelDescription: getAttainmentLevelDescription(getAttainmentLevel(s.attainment)),
      }));

      return {
        ...g,
        snapshots: enrichedSnapshots,
        studentsAttainment: membersWithAttainment,
      };
    });

    // Aggregate PO attainment across supervisor groups
    const poStats: Record<string, { totalRatios: number[]; count: number; levels: number[] }> = {};
    for (let i = 1; i <= 11; i++) {
      poStats[`PO${i}`] = { totalRatios: [], count: 0, levels: [] };
    }

    let totalMetricsCount = 0;
    let attainedMetricsCount = 0;

    enrichedGroups.forEach((g) => {
      g.snapshots.forEach((s) => {
        if (s.metric.startsWith('PO')) {
          if (poStats[s.metric]) {
            poStats[s.metric].totalRatios.push(s.attainment);
            poStats[s.metric].levels.push(s.level);
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

      const level = getAttainmentLevel(avg);
      const l0 = stat.levels.filter((lvl) => lvl === 0).length;
      const l1 = stat.levels.filter((lvl) => lvl === 1).length;
      const l2 = stat.levels.filter((lvl) => lvl === 2).length;
      const l3 = stat.levels.filter((lvl) => lvl === 3).length;
      const total = stat.count || 1;

      return {
        po: code,
        attainment: Math.round(avg * 100),
        ratio: avg,
        level,
        levelDescription: getAttainmentLevelDescription(level),
        isAttained: level >= 1,
        evaluatedGroups: stat.count,
        levelsDistribution: {
          l0Count: l0,
          l1Count: l1,
          l2Count: l2,
          l3Count: l3,
          l0Pct: Math.round((l0 / total) * 100),
          l1Pct: Math.round((l1 / total) * 100),
          l2Pct: Math.round((l2 / total) * 100),
          l3Pct: Math.round((l3 / total) * 100),
        },
      };
    });

    const overallAttainmentRate =
      totalMetricsCount > 0 ? Math.round((attainedMetricsCount / totalMetricsCount) * 100) : 0;

    return {
      groups: enrichedGroups,
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
          members: {
            include: {
              student: true,
            },
          },
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
      }),
      prisma.batch.findMany({ orderBy: { id: 'desc' } }),
    ]);

    const metricsToEvaluate = [
      ...Array.from({ length: 11 }, (_, i) => `PO${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `WP${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `WK${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `EA${i + 1}`),
    ];

    // Track both group-level and student-level ratios for each PO
    const poStats: Record<string, { ratios: number[]; levels: number[]; studentLevels: number[] }> = {};
    for (let i = 1; i <= 11; i++) {
      poStats[`PO${i}`] = { ratios: [], levels: [], studentLevels: [] };
    }

    let totalEvaluated = 0;
    let totalAttained = 0;

    const enrichedGroups = allGroups.map((g) => {
      const studentInputs: StudentMarkEntryInput[] = (g.markEntries || []).map((m) => ({
        studentId: m.studentId,
        marks: m.marks,
        max: m.criterion?.maxMarks || 0,
        maps: (m.criterion?.maps || []).map((map) => map.code),
      }));

      // Calculate student individual attainments
      (g.members || []).forEach((m) => {
        const studentAttainments = calculateStudentAttainment(
          studentInputs,
          m.studentId,
          metricsToEvaluate
        );
        for (let i = 1; i <= 11; i++) {
          const poCode = `PO${i}`;
          if (studentAttainments[poCode]) {
            poStats[poCode].studentLevels.push(studentAttainments[poCode].level);
          }
        }
      });

      const enrichedSnapshots = (g.snapshots || []).map((s) => {
        const lvl = getAttainmentLevel(s.attainment);
        if (s.metric.startsWith('PO') && poStats[s.metric]) {
          poStats[s.metric].ratios.push(s.attainment);
          poStats[s.metric].levels.push(lvl);
          totalEvaluated++;
          if (lvl >= 1) totalAttained++;
        }
        return {
          ...s,
          percentage: Math.round(s.attainment * 100),
          level: lvl,
          levelDescription: getAttainmentLevelDescription(lvl),
        };
      });

      return {
        ...g,
        snapshots: enrichedSnapshots,
      };
    });

    const poSummary = Object.entries(poStats).map(([po, data]) => {
      const avg = data.ratios.length > 0 ? data.ratios.reduce((a, b) => a + b, 0) / data.ratios.length : 0;
      const level = getAttainmentLevel(avg);
      const totalGroupsCount = data.levels.length || 1;

      const l0 = data.levels.filter((l) => l === 0).length;
      const l1 = data.levels.filter((l) => l === 1).length;
      const l2 = data.levels.filter((l) => l === 2).length;
      const l3 = data.levels.filter((l) => l === 3).length;

      const totalStudentsCount = data.studentLevels.length || 1;
      const sl0 = data.studentLevels.filter((l) => l === 0).length;
      const sl1 = data.studentLevels.filter((l) => l === 1).length;
      const sl2 = data.studentLevels.filter((l) => l === 2).length;
      const sl3 = data.studentLevels.filter((l) => l === 3).length;

      return {
        po,
        percentage: Math.round(avg * 100),
        ratio: Number(avg.toFixed(4)),
        level,
        levelDescription: getAttainmentLevelDescription(level),
        isAttained: level >= 1,
        count: data.ratios.length,
        // Group distributions
        l0Count: l0,
        l1Count: l1,
        l2Count: l2,
        l3Count: l3,
        l0Pct: Math.round((l0 / totalGroupsCount) * 100),
        l1Pct: Math.round((l1 / totalGroupsCount) * 100),
        l2Pct: Math.round((l2 / totalGroupsCount) * 100),
        l3Pct: Math.round((l3 / totalGroupsCount) * 100),
        // Student cohort distributions
        totalStudentsEvaluated: data.studentLevels.length,
        studentDistribution: {
          l0Count: sl0,
          l1Count: sl1,
          l2Count: sl2,
          l3Count: sl3,
          l0Pct: Math.round((sl0 / totalStudentsCount) * 100),
          l1Pct: Math.round((sl1 / totalStudentsCount) * 100),
          l2Pct: Math.round((sl2 / totalStudentsCount) * 100),
          l3Pct: Math.round((sl3 / totalStudentsCount) * 100),
        },
      };
    });

    return {
      groups: enrichedGroups,
      totalGroups: allGroups.length,
      batches,
      poSummary,
      overallAttainmentRate: totalEvaluated > 0 ? Math.round((totalAttained / totalEvaluated) * 100) : 0,
      targetThreshold: Math.round(DEFAULT_ATTAINMENT_TARGET * 100),
      groupsWithSnapshots: enrichedGroups.filter((g) => g.snapshots.length > 0).length,
    };
  } catch (err) {
    return { error: `Failed to load admin attainment analytics: ${(err as Error).message}` };
  }
}
