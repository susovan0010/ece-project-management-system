'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import {
  evaluateCapstone,
  CapstoneResult,
  RubricDScore,
  RubricFScore,
} from '@/lib/engine/capstone';
import {
  attainment,
  getAttainmentLevel,
  getAttainmentLevelDescription,
  MarkEntryInput,
  Levels,
} from '@/lib/engine';
import { calculateStudentBadges } from '@/lib/engine/badge-engine';
import { revalidatePath } from 'next/cache';

export interface AdminGroupCapstoneEvaluation {
  groupId: string;
  groupNumber: number;
  batchId: string;
  topicId: string;
  topicCode: string;
  topicTitle: string;
  supervisorName: string;
  supervisorEmail: string;
  evaluation: CapstoneResult;
  decision?: {
    id: string;
    status: string;
    notes?: string | null;
    confirmedAt?: Date | null;
  } | null;
  declarations: Array<{
    id: string;
    attributeCode: string;
    justification: string;
    confirmed: boolean;
  }>;
  dScoresSummary?: {
    examinerCount: number;
    avgNovelty: number;
    avgRealistic: number;
    avgImpact: number;
  } | null;
  fScoreSummary?: {
    novelty: number;
    realistic: number;
    impact: number;
  } | null;
}

// ----------------------------------------------------
// 1. Get Admin Capstone Evaluations across all groups
// ----------------------------------------------------
export async function getAdminCapstoneEvaluationAction(batchId?: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can view capstone evaluations.' };
  }

  try {
    const where: any = {};
    if (batchId && batchId !== 'ALL') {
      where.batchId = batchId;
    }

    const [groups, batches] = await Promise.all([
      prisma.group.findMany({
        where,
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
        include: {
          topic: {
            include: {
              attributes: {
                include: { attribute: true },
              },
              sdgs: true,
              declarations: true,
              decisions: true,
            },
          },
          supervisor: {
            select: { name: true, email: true },
          },
          markEntries: {
            include: {
              criterion: {
                include: {
                  rubric: true,
                },
              },
            },
          },
        },
      }),
      prisma.batch.findMany({ orderBy: { id: 'desc' } }),
    ]);

    const evaluatedGroups: AdminGroupCapstoneEvaluation[] = groups.map((g) => {
      const topic = g.topic;

      // 1. Step 1 Levels & SDG target
      const topicLevels: Levels = {};
      topic.attributes.forEach((attr) => {
        topicLevels[attr.attribute.code] = attr.level;
      });

      const hasSdgTarget = topic.sdgs.some(
        (s) => s.target && s.target.trim().length > 0 && s.target !== 'NONE'
      );

      // 2. Step 4 Complexity Declarations
      // Confirmed if has at least one declaration and all are confirmed
      const declarationsConfirmed =
        topic.declarations.length > 0 && topic.declarations.every((d) => d.confirmed);

      // 3. Step 2 Rubric D Scores (Sem 7 Panel)
      // Group by examinerSlot
      const dEntries = g.markEntries.filter(
        (m) => m.criterion?.rubric?.code === 'D' || m.criterion?.rubric?.semester === 7
      );

      const dSlotMap = new Map<number, { novelty?: number; realistic?: number; impact?: number }>();

      for (const m of dEntries) {
        const slot = m.examinerSlot || 1;
        if (!dSlotMap.has(slot)) {
          dSlotMap.set(slot, {});
        }
        const current = dSlotMap.get(slot)!;
        const key = m.criterion.key.toLowerCase();
        const max = m.criterion.maxMarks;

        if (key.includes('novelty')) {
          // Scale to 7
          current.novelty = (m.marks / max) * 7;
        } else if (key.includes('realistic') || key.includes('problem')) {
          // Scale to 7
          current.realistic = (m.marks / max) * 7;
        } else if (key.includes('impact') || key.includes('society')) {
          // Scale to 3
          current.impact = (m.marks / max) * 3;
        }
      }

      const rubricDScores: RubricDScore[] = [];
      dSlotMap.forEach((scores, slot) => {
        if (
          scores.novelty !== undefined &&
          scores.realistic !== undefined &&
          scores.impact !== undefined
        ) {
          rubricDScores.push({
            examinerSlot: slot,
            novelty: scores.novelty,
            realisticProblem: scores.realistic,
            impactOnSociety: scores.impact,
          });
        }
      });

      // 4. Step 3 Rubric F Scores (Sem 8 External Examiner)
      const fEntries = g.markEntries.filter(
        (m) => m.criterion?.rubric?.code === 'F' || m.criterion?.rubric?.semester === 8
      );

      let rubricFScore: RubricFScore | undefined = undefined;
      let fNovelty: number | undefined;
      let fRealistic: number | undefined;
      let fImpact: number | undefined;

      for (const m of fEntries) {
        const key = m.criterion.key.toLowerCase();
        const max = m.criterion.maxMarks;

        if (key.includes('novelty')) {
          // Scale to 8
          fNovelty = (m.marks / max) * 8;
        } else if (key.includes('realistic') || key.includes('problem')) {
          // Scale to 8
          fRealistic = (m.marks / max) * 8;
        } else if (key.includes('impact') || key.includes('society')) {
          // Scale to 3
          fImpact = (m.marks / max) * 3;
        }
      }

      if (fNovelty !== undefined && fRealistic !== undefined && fImpact !== undefined) {
        rubricFScore = {
          novelty: fNovelty,
          realisticProblem: fRealistic,
          impactOnSociety: fImpact,
        };
      }

      // 5. Evaluate through Pure Engine
      const evaluation = evaluateCapstone({
        topicLevels,
        hasSdgTarget,
        rubricDScores: rubricDScores.length > 0 ? rubricDScores : undefined,
        rubricFScore,
        declarationsConfirmed,
      });

      // Summaries for display
      const dScoresSummary =
        rubricDScores.length > 0
          ? {
              examinerCount: rubricDScores.length,
              avgNovelty: Number(
                (rubricDScores.reduce((sum, s) => sum + s.novelty, 0) / rubricDScores.length).toFixed(2)
              ),
              avgRealistic: Number(
                (
                  rubricDScores.reduce((sum, s) => sum + s.realisticProblem, 0) / rubricDScores.length
                ).toFixed(2)
              ),
              avgImpact: Number(
                (
                  rubricDScores.reduce((sum, s) => sum + s.impactOnSociety, 0) / rubricDScores.length
                ).toFixed(2)
              ),
            }
          : null;

      const fScoreSummary = rubricFScore
        ? {
            novelty: Number(rubricFScore.novelty.toFixed(2)),
            realistic: Number(rubricFScore.realisticProblem.toFixed(2)),
            impact: Number(rubricFScore.impactOnSociety.toFixed(2)),
          }
        : null;

      // Existing decision
      const decisionRecord = topic.decisions?.[0] || null;

      return {
        groupId: g.id,
        groupNumber: g.number,
        batchId: g.batchId,
        topicId: topic.id,
        topicCode: topic.code,
        topicTitle: topic.title,
        supervisorName: g.supervisor?.name || 'Unassigned',
        supervisorEmail: g.supervisor?.email || '',
        evaluation,
        decision: decisionRecord,
        declarations: topic.declarations.map((d) => ({
          id: d.id,
          attributeCode: d.attributeCode,
          justification: d.justification,
          confirmed: d.confirmed,
        })),
        dScoresSummary,
        fScoreSummary,
      };
    });

    const summary = {
      total: evaluatedGroups.length,
      qualified: evaluatedGroups.filter((g) => g.evaluation.isCapstone).length,
      pending: evaluatedGroups.filter((g) => g.evaluation.status === 'PENDING').length,
      failed: evaluatedGroups.filter((g) => g.evaluation.status === 'FAILED').length,
      confirmedDecisions: evaluatedGroups.filter((g) => g.decision?.status === 'CONFIRMED').length,
    };

    return {
      batches,
      groups: evaluatedGroups,
      summary,
    };
  } catch (err) {
    return { error: `Failed to load capstone evaluations: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Admin Confirm / Hold / Endorse Capstone Decision
// ----------------------------------------------------
export async function confirmCapstoneDecisionAction(input: {
  topicId: string;
  status: 'CONFIRMED' | 'HOLD' | 'PENDING';
  step1Qualify: boolean;
  step2Panel: boolean;
  step3External: boolean;
  step4Declared: boolean;
  isCapstone: boolean;
  notes?: string;
}) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can record capstone decisions.' };
  }

  try {
    const existing = await prisma.capstoneDecision.findFirst({
      where: { topicId: input.topicId },
    });

    if (existing) {
      await prisma.capstoneDecision.update({
        where: { id: existing.id },
        data: {
          step1Qualify: input.step1Qualify,
          step2Panel: input.step2Panel,
          step3External: input.step3External,
          step4Declared: input.step4Declared,
          isCapstone: input.isCapstone,
          status: input.status,
          notes: input.notes,
          confirmedAt: new Date(),
        },
      });
    } else {
      await prisma.capstoneDecision.create({
        data: {
          topicId: input.topicId,
          step1Qualify: input.step1Qualify,
          step2Panel: input.step2Panel,
          step3External: input.step3External,
          step4Declared: input.step4Declared,
          isCapstone: input.isCapstone,
          status: input.status,
          notes: input.notes,
          confirmedAt: new Date(),
        },
      });
    }

    revalidatePath('/admin/capstone');
    return { success: true };
  } catch (err) {
    return { error: `Failed to record capstone decision: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Save / Confirm Complexity Declaration (WP5, WP7, etc.)
// ----------------------------------------------------
export async function saveComplexityDeclarationAction(input: {
  topicId: string;
  attributeCode: string;
  justification: string;
  confirmed: boolean;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in.' };
  }

  try {
    await prisma.complexityDeclaration.upsert({
      where: {
        topicId_attributeCode: {
          topicId: input.topicId,
          attributeCode: input.attributeCode,
        },
      },
      update: {
        justification: input.justification,
        confirmed: input.confirmed,
      },
      create: {
        topicId: input.topicId,
        attributeCode: input.attributeCode,
        justification: input.justification,
        confirmed: input.confirmed,
      },
    });

    revalidatePath('/admin/capstone');
    revalidatePath('/faculty/groups');
    return { success: true };
  } catch (err) {
    return { error: `Failed to save complexity declaration: ${(err as Error).message}` };
  }
}

// ====================================================
// Phase 61: Close Session, Archival, & Capstone Catalogue
// ====================================================

export interface Semester8Status {
  batchId: string;
  isLocked: boolean;
  lockedAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  totalGroups: number;
  completedGroups: number;
  isComplete: boolean;
  pendingGroups: Array<{
    groupNumber: number;
    supervisorName: string;
    supervisorEmail: string;
    topicTitle: string;
  }>;
}

export interface CapstoneCatalogueItem {
  topicId: string;
  projectCode: string;
  projectTitle: string;
  batchId: string;
  groupNumber: number;
  domain: string;
  category: string;
  source: string;
  decisionYear: number;
  supervisor: {
    name: string;
    email: string;
  };
  students: Array<{
    name: string;
    roll: string;
  }>;
  proposalAttributes: Array<{
    code: string;
    title: string;
    kind: string;
    level: number;
    reason: string | null;
  }>;
  proposalSdgs: Array<{
    code: string;
    title: string;
    target: string;
    reason: string | null;
  }>;
}

export interface MetricAttainmentSummary {
  code: string;
  percentage: number;
  level: number;
  levelDescription: string;
  isAttained: boolean;
}

export interface SemesterWiseAttainmentBreakdown {
  semester: number;
  label: string;
  pos: MetricAttainmentSummary[];
  wps: MetricAttainmentSummary[];
  wks: MetricAttainmentSummary[];
  eas: MetricAttainmentSummary[];
}

export interface CapstoneDetailReport {
  topicId: string;
  projectCode: string;
  projectTitle: string;
  description: string;
  domain: string;
  category: string;
  batchId: string;
  groupNumber: number;
  decisionYear: number;
  decisionStatus: string;
  decisionNotes?: string | null;
  supervisor: {
    name: string;
    email: string;
  };
  students: Array<{
    id: string;
    name: string;
    roll: string;
    badges: {
      diamonds: number;
      gold: number;
      silver: number;
      copper: number;
      iron: number;
      totalBadgesCount: number;
    };
  }>;
  proposalAttributes: Array<{
    code: string;
    title: string;
    kind: string;
    level: number;
    reason: string | null;
  }>;
  proposalSdgs: Array<{
    code: string;
    title: string;
    target: string;
    reason: string | null;
  }>;
  overallAttainments: {
    pos: MetricAttainmentSummary[];
    wps: MetricAttainmentSummary[];
    wks: MetricAttainmentSummary[];
    eas: MetricAttainmentSummary[];
  };
  semesterBreakdowns: SemesterWiseAttainmentBreakdown[];
}

// ----------------------------------------------------
// 4. Check Semester 8 Marks Completion for Batch
// ----------------------------------------------------
export async function checkSemester8CompletionAction(batchId: string): Promise<{
  success: boolean;
  data?: Semester8Status;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        groups: {
          include: {
            supervisor: { select: { name: true, email: true } },
            topic: { select: { title: true } },
            markEntries: {
              include: {
                criterion: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return { success: false, error: `Batch "${batchId}" not found.` };
    }

    const pendingGroups: Semester8Status['pendingGroups'] = [];
    let completedGroups = 0;

    for (const g of batch.groups) {
      // Semester 8 requires mark entries with criterion.semester === 8 (Rubrics E and F)
      const hasSem8Marks = g.markEntries.some((m) => m.criterion?.semester === 8);
      if (hasSem8Marks) {
        completedGroups += 1;
      } else {
        pendingGroups.push({
          groupNumber: g.number,
          supervisorName: g.supervisor?.name || 'Unassigned',
          supervisorEmail: g.supervisor?.email || 'N/A',
          topicTitle: g.topic?.title || `Group ${g.number}`,
        });
      }
    }

    const totalGroups = batch.groups.length;
    const isComplete = totalGroups > 0 && completedGroups === totalGroups;

    return {
      success: true,
      data: {
        batchId: batch.id,
        isLocked: !!batch.isLocked,
        lockedAt: batch.lockedAt ? batch.lockedAt.toISOString() : null,
        isArchived: !!batch.isArchived,
        archivedAt: batch.archivedAt ? batch.archivedAt.toISOString() : null,
        totalGroups,
        completedGroups,
        isComplete,
        pendingGroups,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 5. Close & Lock Batch Session
// ----------------------------------------------------
export async function closeBatchSessionAction(batchId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    await prisma.batch.update({
      where: { id: batchId },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockedById: session.user.id,
      },
    });

    revalidatePath('/admin/capstone');
    revalidatePath('/admin/reports');
    return {
      success: true,
      message: `Batch ${batchId} session has been locked successfully. All marks and group details are now read-only.`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 6. Unlock Batch Session with Admin Login Password
// ----------------------------------------------------
export async function unlockBatchSessionAction(
  batchId: string,
  password: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  if (!password || password.trim().length === 0) {
    return { success: false, error: 'Admin login password is required to unlock this batch.' };
  }

  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!adminUser?.passwordHash) {
      return { success: false, error: 'Admin password record could not be found.' };
    }

    const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isValidPassword) {
      return { success: false, error: 'Incorrect admin login password. The batch session remains locked.' };
    }

    await prisma.batch.update({
      where: { id: batchId },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedById: null,
      },
    });

    revalidatePath('/admin/capstone');
    revalidatePath('/admin/reports');
    return {
      success: true,
      message: `Batch ${batchId} session has been unlocked successfully.`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 7. Archive Batch with 4-Year Retention for Non-Capstones
// ----------------------------------------------------
export async function archiveBatchAction(batchId: string): Promise<{
  success: boolean;
  message?: string;
  capstoneCount?: number;
  archivedCount?: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const groups = await prisma.group.findMany({
      where: { batchId },
      include: {
        topic: {
          include: {
            decisions: true,
          },
        },
      },
    });

    if (groups.length === 0) {
      return { success: false, error: `No groups found in batch ${batchId}.` };
    }

    let capstoneCount = 0;
    let archivedCount = 0;
    const fourYearsFromNow = new Date(Date.now() + 4 * 365.25 * 24 * 60 * 60 * 1000);
    const currentYear = new Date().getFullYear();

    for (const g of groups) {
      const isCapstone =
        g.isCapstonePermanent ||
        g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED');

      if (isCapstone) {
        capstoneCount += 1;
        // Capstone: permanent preservation forever under Capstone Catalogue
        await prisma.group.update({
          where: { id: g.id },
          data: {
            isCapstonePermanent: true,
            isArchived: false,
            purgeAt: null,
          },
        });

        // Ensure decisionYear is set
        const confirmedDecision = g.topic?.decisions?.find((d) => d.isCapstone && d.status === 'CONFIRMED');
        if (confirmedDecision && !confirmedDecision.decisionYear) {
          await prisma.capstoneDecision.update({
            where: { id: confirmedDecision.id },
            data: { decisionYear: currentYear },
          });
        }
      } else {
        archivedCount += 1;
        // Non-Capstone: archived with 4-year retention schedule
        await prisma.group.update({
          where: { id: g.id },
          data: {
            isArchived: true,
            isCapstonePermanent: false,
            purgeAt: fourYearsFromNow,
          },
        });
      }
    }

    // Mark batch as archived and locked
    await prisma.batch.update({
      where: { id: batchId },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        isLocked: true,
      },
    });

    revalidatePath('/admin/capstone');
    revalidatePath('/admin/reports');
    return {
      success: true,
      capstoneCount,
      archivedCount,
      message: `Batch ${batchId} archived successfully. ${capstoneCount} Capstone project(s) permanently catalogued. ${archivedCount} non-capstone project(s) scheduled for 4-year retention purge.`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 8. Purge Expired Archived Non-Capstone Projects
// ----------------------------------------------------
export async function purgeExpiredArchivedProjectsAction(): Promise<{
  success: boolean;
  purgedCount?: number;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const expiredGroups = await prisma.group.findMany({
      where: {
        isArchived: true,
        isCapstonePermanent: false,
        purgeAt: { lte: new Date() },
      },
      select: { id: true },
    });

    if (expiredGroups.length === 0) {
      return { success: true, purgedCount: 0, message: 'No expired non-capstone projects eligible for purging.' };
    }

    const groupIds = expiredGroups.map((g) => g.id);

    // Remove group members and mark entries
    await prisma.groupMember.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.markEntry.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });

    return {
      success: true,
      purgedCount: groupIds.length,
      message: `Cleaned up ${groupIds.length} expired archived project record(s) older than 4 years. Capstone records remain untouched.`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 9. Get Permanent Capstone Catalogue
// ----------------------------------------------------
export async function getCapstoneCatalogueAction(): Promise<{
  success: boolean;
  data?: CapstoneCatalogueItem[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const groups = await prisma.group.findMany({
      where: {
        OR: [
          { isCapstonePermanent: true },
          {
            topic: {
              decisions: {
                some: {
                  isCapstone: true,
                  status: 'CONFIRMED',
                },
              },
            },
          },
        ],
      },
      include: {
        topic: {
          include: {
            attributes: { include: { attribute: true } },
            sdgs: { include: { sdg: true } },
            decisions: true,
          },
        },
        supervisor: { select: { name: true, email: true } },
        members: {
          include: {
            student: { select: { name: true, roll: true } },
          },
        },
      },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    const currentYear = new Date().getFullYear();

    const items: CapstoneCatalogueItem[] = groups.map((g) => {
      const topic = g.topic;
      const decision = topic.decisions.find((d) => d.isCapstone && d.status === 'CONFIRMED') || topic.decisions[0];
      const decisionYear =
        decision?.decisionYear ||
        (decision?.confirmedAt ? new Date(decision.confirmedAt).getFullYear() : currentYear);

      return {
        topicId: topic.id,
        projectCode: topic.code,
        projectTitle: topic.title,
        batchId: g.batchId,
        groupNumber: g.number,
        domain: topic.domain || 'ECE Capstone',
        category: topic.category || 'Standard',
        source: topic.source || 'FACULTY',
        decisionYear,
        supervisor: {
          name: g.supervisor?.name || 'Unassigned',
          email: g.supervisor?.email || '',
        },
        students: g.members.map((m) => ({
          name: m.student.name,
          roll: m.student.roll,
        })),
        proposalAttributes: topic.attributes.map((a) => ({
          code: a.attribute.code,
          title: a.attribute.title,
          kind: a.attribute.kind,
          level: a.level,
          reason: a.reason,
        })),
        proposalSdgs: topic.sdgs.map((s) => ({
          code: `SDG ${s.sdg.id}`,
          title: s.sdg.title,
          target: s.target || 'General Target',
          reason: s.reason,
        })),
      };
    });

    return { success: true, data: items };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 10. Get Full Capstone Project Detail Report
// ----------------------------------------------------
export async function getCapstoneProjectDetailReportAction(topicId: string): Promise<{
  success: boolean;
  data?: CapstoneDetailReport;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        attributes: { include: { attribute: true } },
        sdgs: { include: { sdg: true } },
        decisions: true,
        groups: {
          include: {
            supervisor: { select: { name: true, email: true } },
            members: {
              include: {
                student: { select: { id: true, name: true, roll: true, userId: true } },
              },
            },
            markEntries: {
              include: {
                criterion: {
                  include: {
                    maps: true,
                    rubric: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!topic || topic.groups.length === 0) {
      return { success: false, error: 'Capstone project or associated group not found.' };
    }

    const group = topic.groups[0];
    const decision = topic.decisions.find((d) => d.isCapstone && d.status === 'CONFIRMED') || topic.decisions[0];
    const decisionYear =
      decision?.decisionYear ||
      (decision?.confirmedAt ? new Date(decision.confirmedAt).getFullYear() : new Date().getFullYear());

    // 1. Calculate student badges
    const studentsWithBadges = await Promise.all(
      group.members.map(async (gm) => {
        let diamonds = 0;
        let gold = 0;
        let silver = 0;
        let copper = 0;
        let iron = 0;

        if (gm.student.userId) {
          const votes = await prisma.forumMarkupVote.findMany({
            where: { targetUserId: gm.student.userId },
            select: { value: true },
          });
          const netMarks = votes.reduce((sum, v) => sum + (v.value || 0), 0);
          const badgeSummary = calculateStudentBadges(netMarks);
          diamonds = badgeSummary.diamonds;
          gold = badgeSummary.gold;
          silver = badgeSummary.silver;
          copper = badgeSummary.copper;
          iron = badgeSummary.iron;
        }

        const totalBadgesCount = diamonds + gold + silver + copper + iron;
        return {
          id: gm.student.id,
          name: gm.student.name,
          roll: gm.student.roll,
          badges: {
            diamonds,
            gold,
            silver,
            copper,
            iron,
            totalBadgesCount,
          },
        };
      })
    );

    // 2. Build mark inputs for calculations
    const buildMarkInputs = (entries: typeof group.markEntries): MarkEntryInput[] => {
      const map = new Map<number, { sum: number; count: number; max: number; maps: string[] }>();
      for (const e of entries) {
        const critId = e.criterionId;
        const maps = (e.criterion?.maps || []).map((m) => m.code);
        if (!map.has(critId)) {
          map.set(critId, { sum: e.marks, count: 1, max: e.criterion?.maxMarks || 10, maps });
        } else {
          const cur = map.get(critId)!;
          cur.sum += e.marks;
          cur.count += 1;
        }
      }
      return Array.from(map.values()).map((v) => ({
        marks: v.sum / v.count,
        max: v.max,
        maps: v.maps,
      }));
    };

    const overallInputs = buildMarkInputs(group.markEntries);
    const sem6Inputs = buildMarkInputs(group.markEntries.filter((m) => m.criterion?.semester === 6));
    const sem7Inputs = buildMarkInputs(group.markEntries.filter((m) => m.criterion?.semester === 7));
    const sem8Inputs = buildMarkInputs(group.markEntries.filter((m) => m.criterion?.semester === 8));

    const poCodes = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);
    const wpCodes = Array.from({ length: 7 }, (_, i) => `WP${i + 1}`);
    const wkCodes = Array.from({ length: 9 }, (_, i) => `WK${i + 1}`);
    const eaCodes = Array.from({ length: 5 }, (_, i) => `EA${i + 1}`);

    const computeMetrics = (inputs: MarkEntryInput[], codes: string[]): MetricAttainmentSummary[] => {
      return codes.map((code) => {
        const att = attainment(inputs, code);
        const percentage = att !== null ? Number((att * 100).toFixed(1)) : 0;
        const level = att !== null ? getAttainmentLevel(att) : 0;
        return {
          code,
          percentage,
          level,
          levelDescription: getAttainmentLevelDescription(level),
          isAttained: level >= 1 || percentage >= 65,
        };
      });
    };

    const overallAttainments = {
      pos: computeMetrics(overallInputs, poCodes),
      wps: computeMetrics(overallInputs, wpCodes),
      wks: computeMetrics(overallInputs, wkCodes),
      eas: computeMetrics(overallInputs, eaCodes),
    };

    const semesterBreakdowns: SemesterWiseAttainmentBreakdown[] = [
      {
        semester: 6,
        label: 'Semester 6 (Rubric A/B - Project Stage I)',
        pos: computeMetrics(sem6Inputs, poCodes),
        wps: computeMetrics(sem6Inputs, wpCodes),
        wks: computeMetrics(sem6Inputs, wkCodes),
        eas: computeMetrics(sem6Inputs, eaCodes),
      },
      {
        semester: 7,
        label: 'Semester 7 (Rubric C/D - Project Stage II & Panel)',
        pos: computeMetrics(sem7Inputs, poCodes),
        wps: computeMetrics(sem7Inputs, wpCodes),
        wks: computeMetrics(sem7Inputs, wkCodes),
        eas: computeMetrics(sem7Inputs, eaCodes),
      },
      {
        semester: 8,
        label: 'Semester 8 (Rubric E/F - Capstone External Defense)',
        pos: computeMetrics(sem8Inputs, poCodes),
        wps: computeMetrics(sem8Inputs, wpCodes),
        wks: computeMetrics(sem8Inputs, wkCodes),
        eas: computeMetrics(sem8Inputs, eaCodes),
      },
    ];

    const report: CapstoneDetailReport = {
      topicId: topic.id,
      projectCode: topic.code,
      projectTitle: topic.title,
      description: topic.description || 'ECE Capstone Project',
      domain: topic.domain || 'ECE Capstone',
      category: topic.category || 'Standard',
      batchId: group.batchId,
      groupNumber: group.number,
      decisionYear,
      decisionStatus: decision?.status || 'CONFIRMED',
      decisionNotes: decision?.notes,
      supervisor: {
        name: group.supervisor?.name || 'Unassigned',
        email: group.supervisor?.email || '',
      },
      students: studentsWithBadges,
      proposalAttributes: topic.attributes.map((a) => ({
        code: a.attribute.code,
        title: a.attribute.title,
        kind: a.attribute.kind,
        level: a.level,
        reason: a.reason,
      })),
      proposalSdgs: topic.sdgs.map((s) => ({
        code: `SDG ${s.sdg.id}`,
        title: s.sdg.title,
        target: s.target || 'General Target',
        reason: s.reason,
      })),
      overallAttainments,
      semesterBreakdowns,
    };

    return { success: true, data: report };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

