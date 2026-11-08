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
import {
  generateBatchStaticArchiveHtml,
  getBatchArchiveConfirmationSentence,
  ArchivedGroupProfile,
} from '@/lib/engine/archive-report-generator';
import { uploadFileToGoogleDrive, OFFICIAL_DRIVE_ACCOUNT } from '@/lib/google-drive';
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
  archiveDriveFileUrl?: string | null;
  archiveReportSummary?: any;
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
        archiveDriveFileUrl: batch.archiveDriveFileUrl || null,
        archiveReportSummary: batch.archiveReportSummary || null,
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
// 7. Archive Batch with Google Drive Report, Student Purge & DB Optimization
// ----------------------------------------------------
export interface ArchiveBatchPayload {
  batchId: string;
  adminPassword?: string;
  confirmationSentence?: string;
}

export async function getBatchArchiveConfirmationSentenceAction(batchId: string): Promise<string> {
  return getBatchArchiveConfirmationSentence(batchId);
}

export async function archiveBatchAction(
  input: string | ArchiveBatchPayload
): Promise<{
  success: boolean;
  message?: string;
  capstoneCount?: number;
  archivedCount?: number;
  purgedStudentsCount?: number;
  driveUrl?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const batchId = typeof input === 'string' ? input : input.batchId;
  const adminPassword = typeof input === 'string' ? undefined : input.adminPassword;
  const confirmationSentence = typeof input === 'string' ? undefined : input.confirmationSentence;

  if (!batchId) {
    return { success: false, error: 'Batch ID is required.' };
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return { success: false, error: `Batch "${batchId}" not found.` };
    }

    if (batch.isArchived) {
      return { success: false, error: `Batch "${batchId}" is already archived.` };
    }

    // 1. Verify session is locked / confirmed by Admin
    if (!batch.isLocked) {
      return {
        success: false,
        error: `Cannot archive batch "${batchId}": Session is not locked. Admin must first confirm 8th semester mark completion by closing the session.`,
      };
    }

    const groups = await prisma.group.findMany({
      where: { batchId },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        topic: {
          include: {
            attributes: { include: { attribute: true } },
            sdgs: { include: { sdg: true } },
            decisions: true,
          },
        },
        members: {
          include: {
            student: {
              include: {
                user: { select: { id: true, email: true, role: true } },
              },
            },
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
      orderBy: { number: 'asc' },
    });

    if (groups.length === 0) {
      return { success: false, error: `No groups found in batch ${batchId}.` };
    }

    // 2. Verify all groups have submitted Semester 8 marks (criterion.semester === 8)
    const incompleteGroups = groups.filter(
      (g) => !g.markEntries.some((m) => m.criterion?.semester === 8)
    );
    if (incompleteGroups.length > 0) {
      return {
        success: false,
        error: `Cannot archive batch "${batchId}": 8th semester marks are incomplete for ${incompleteGroups.length} group(s). All faculty supervisors must submit marks before archival can be performed.`,
      };
    }

    // 3. Verify Admin confirmation sentence
    const expectedSentence = getBatchArchiveConfirmationSentence(batchId);
    if (
      !confirmationSentence ||
      confirmationSentence.trim().toUpperCase() !== expectedSentence.toUpperCase()
    ) {
      return {
        success: false,
        error: `Confirmation sentence does not match. Please copy and paste: "${expectedSentence}"`,
      };
    }

    // 4. Verify Admin login password
    if (!adminPassword || adminPassword.trim().length === 0) {
      return {
        success: false,
        error: 'Admin login password is required to authorize batch archival.',
      };
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!adminUser?.passwordHash) {
      return { success: false, error: 'Admin account password record could not be found.' };
    }

    const isPasswordValid = await bcrypt.compare(adminPassword, adminUser.passwordHash);
    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Incorrect admin login password. Archival aborted.',
      };
    }

    const currentYear = new Date().getFullYear();
    const poCodes = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);

    // Helper to build pure mark inputs
    const buildMarkInputs = (entries: typeof groups[0]['markEntries']): MarkEntryInput[] => {
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

    // 1. Build Archived Profiles for all Groups
    let totalStudents = 0;
    let capstoneCount = 0;
    let nonCapstoneCount = 0;
    const studentUserIds: string[] = [];

    const archivedProfiles: ArchivedGroupProfile[] = await Promise.all(
      groups.map(async (g) => {
        const isCapstone =
          g.isCapstonePermanent ||
          g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED');

        if (isCapstone) capstoneCount++;
        else nonCapstoneCount++;

        const decision = g.topic?.decisions?.find((d) => d.isCapstone && d.status === 'CONFIRMED') || g.topic?.decisions?.[0];
        const decisionYear = decision?.decisionYear || currentYear;

        // Collect student members and badges
        const studentProfiles = await Promise.all(
          g.members.map(async (m) => {
            totalStudents++;
            const uid = m.student?.user?.id || m.student?.userId;
            if (uid && (!m.student?.user || m.student.user.role === 'STUDENT')) {
              studentUserIds.push(uid);
            }

            let diamonds = 0, gold = 0, silver = 0, copper = 0, iron = 0;
            if (m.student?.userId) {
              const votes = await prisma.forumMarkupVote.findMany({
                where: { targetUserId: m.student.userId },
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

            return {
              name: m.student.name,
              roll: m.student.roll,
              badges: {
                diamonds,
                gold,
                silver,
                copper,
                iron,
                total: diamonds + gold + silver + copper + iron,
              },
            };
          })
        );

        // Group mark inputs & PO attainments
        const overallInputs = buildMarkInputs(g.markEntries);
        const poAttainments = poCodes.map((code) => {
          const att = attainment(overallInputs, code);
          const percentage = att !== null ? Number((att * 100).toFixed(1)) : 0;
          const level = att !== null ? getAttainmentLevel(att) : 0;
          return {
            code,
            percentage,
            level,
            isAttained: level >= 1 || percentage >= 65,
          };
        });

        return {
          groupId: g.id,
          groupNumber: g.number,
          batchId: g.batchId,
          topicCode: g.topic?.code || 'N/A',
          topicTitle: g.topic?.title || `Group ${g.number}`,
          domain: g.topic?.domain || 'General',
          category: g.topic?.category || 'Standard',
          supervisorName: g.supervisor?.name || 'Unassigned',
          supervisorEmail: g.supervisor?.email || '',
          students: studentProfiles,
          attributes: (g.topic?.attributes || []).map((a) => ({
            code: a.attribute.code,
            title: a.attribute.title,
            level: a.level,
            reason: a.reason,
          })),
          sdgs: (g.topic?.sdgs || []).map((s) => ({
            code: `SDG ${s.sdg.id}`,
            title: s.sdg.title,
            target: s.target || 'General',
          })),
          semesterMarks: {},
          poAttainments,
          isCapstone,
          decisionYear,
          decisionNotes: decision?.notes || null,
        };
      })
    );

    // Compute department average PO attainments
    const departmentAveragePos = poCodes.map((code) => {
      const pcts = archivedProfiles.map((p) => p.poAttainments.find((x) => x.code === code)?.percentage || 0);
      const avg = Number((pcts.reduce((a, b) => a + b, 0) / (pcts.length || 1)).toFixed(1));
      const lvl = getAttainmentLevel(avg);
      return {
        code,
        avgPercentage: avg,
        level: lvl,
      };
    });

    // 2. Generate Static Standalone HTML Academic Archive Report
    const reportHtml = generateBatchStaticArchiveHtml({
      batchId,
      archivedAt: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' }),
      archivedByAdmin: (session.user as any).name || session.user.email || 'Project Committee Admin',
      totalGroups: groups.length,
      totalStudents,
      capstoneCount,
      nonCapstoneCount,
      groups: archivedProfiles,
      departmentAveragePos,
    });

    // 3. Upload Static Archive to ECE Project Committee Google Drive (15 GB Free Storage)
    const uploadRes = await uploadFileToGoogleDrive({
      fileName: `Batch_${batchId}_Comprehensive_Academic_Archive.html`,
      size: Buffer.byteLength(reportHtml, 'utf-8'),
      mimeType: 'text/html;charset=utf-8',
      dataUrlOrBase64: Buffer.from(reportHtml, 'utf-8').toString('base64'),
      folderName: 'ECE_Capstone_Academic_Archives',
      subFolder: `Batch_${batchId}`,
      uploaderEmail: session.user.email || OFFICIAL_DRIVE_ACCOUNT,
    });

    // 4. Permanent Student Account Deletion (Credentials Suspended)
    // NOTE: Faculty accounts (role === 'FACULTY' or 'ADMIN') are strictly preserved!
    const uniqueStudentUserIds = Array.from(new Set(studentUserIds));
    if (uniqueStudentUserIds.length > 0) {
      await prisma.forumReaction.deleteMany({ where: { userId: { in: uniqueStudentUserIds } } });
      await prisma.forumMarkupVote.deleteMany({
        where: { targetUserId: { in: uniqueStudentUserIds } },
      });
      await prisma.forumReply.deleteMany({ where: { authorId: { in: uniqueStudentUserIds } } });
      await prisma.forumPost.deleteMany({ where: { authorId: { in: uniqueStudentUserIds } } });

      await prisma.student.updateMany({
        where: { userId: { in: uniqueStudentUserIds } },
        data: { userId: null },
      });

      await prisma.user.deleteMany({
        where: {
          id: { in: uniqueStudentUserIds },
          role: 'STUDENT',
        },
      });
    }

    // 5. Database Operational Rows Optimization
    // Capstones are preserved permanent; non-capstone granular rows are deleted to reclaim DB space.
    const nonCapstoneGroupIds: string[] = [];

    for (const g of groups) {
      const isCapstone =
        g.isCapstonePermanent ||
        g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED');

      if (isCapstone) {
        await prisma.group.update({
          where: { id: g.id },
          data: {
            isCapstonePermanent: true,
            isArchived: false,
            purgeAt: null,
          },
        });

        const confirmedDecision = g.topic?.decisions?.find((d) => d.isCapstone && d.status === 'CONFIRMED');
        if (confirmedDecision && !confirmedDecision.decisionYear) {
          await prisma.capstoneDecision.update({
            where: { id: confirmedDecision.id },
            data: { decisionYear: currentYear },
          });
        }
      } else {
        nonCapstoneGroupIds.push(g.id);
      }
    }

    if (nonCapstoneGroupIds.length > 0) {
      // Purge granular rows to free up PostgreSQL database storage immediately
      await prisma.markEntry.deleteMany({ where: { groupId: { in: nonCapstoneGroupIds } } });
      await prisma.attainmentSnapshot.deleteMany({ where: { groupId: { in: nonCapstoneGroupIds } } });
      await prisma.forumPost.deleteMany({ where: { groupId: { in: nonCapstoneGroupIds } } });
      await prisma.groupMember.deleteMany({ where: { groupId: { in: nonCapstoneGroupIds } } });

      await prisma.group.updateMany({
        where: { id: { in: nonCapstoneGroupIds } },
        data: {
          isArchived: true,
          isCapstonePermanent: false,
          purgeAt: new Date(Date.now() + 4 * 365.25 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // 6. Update Batch record with Google Drive reference and compact metadata
    const driveUrl = uploadRes.viewUrl || null;
    await prisma.batch.update({
      where: { id: batchId },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        isLocked: true,
        active: false,
        archiveDriveFileUrl: driveUrl,
        archiveDriveFileId: uploadRes.fileId || null,
        archiveReportSummary: {
          archivedAt: new Date().toISOString(),
          totalGroups: groups.length,
          totalStudents,
          capstoneCount,
          nonCapstoneCount,
          purgedStudentsCount: uniqueStudentUserIds.length,
          driveViewUrl: driveUrl,
          groups: archivedProfiles,
        } as any,
      },
    });

    revalidatePath('/admin/capstone');
    revalidatePath('/admin/reports');
    revalidatePath('/admin/allocation');
    revalidatePath('/admin/archived-projects');

    return {
      success: true,
      capstoneCount,
      archivedCount: nonCapstoneCount,
      purgedStudentsCount: uniqueStudentUserIds.length,
      driveUrl: driveUrl || undefined,
      message: `Batch ${batchId} archived successfully. Static Academic Report saved to ECE Committee Google Drive. ${uniqueStudentUserIds.length} student account(s) deleted permanently. Database storage reclaimed.`,
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

// ----------------------------------------------------
// 11. Force Delete Batch Session (Database Space Cleanup)
// ----------------------------------------------------
export async function forceDeleteBatchSessionAction(input: {
  batchId: string;
  password: string;
  confirmBatchId: string;
  preserveCapstones: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  deletedGroupsCount?: number;
  preservedCapstonesCount?: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  if (input.confirmBatchId.trim() !== input.batchId.trim()) {
    return {
      success: false,
      error: `Confirmation mismatch. You typed "${input.confirmBatchId}", but the selected batch ID is "${input.batchId}".`,
    };
  }

  if (!input.password || input.password.trim().length === 0) {
    return { success: false, error: 'Admin login password is required to execute forceful deletion.' };
  }

  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!adminUser?.passwordHash) {
      return { success: false, error: 'Admin password record could not be found.' };
    }

    const isValidPassword = await bcrypt.compare(input.password, adminUser.passwordHash);
    if (!isValidPassword) {
      return { success: false, error: 'Incorrect admin login password. Forceful deletion aborted.' };
    }

    const batch = await prisma.batch.findUnique({
      where: { id: input.batchId },
      include: {
        groups: {
          include: {
            topic: {
              include: {
                decisions: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return { success: false, error: `Batch "${input.batchId}" not found in database.` };
    }

    if (input.preserveCapstones) {
      // 1. Identify capstones vs non-capstones
      const capstoneGroups = batch.groups.filter(
        (g) =>
          g.isCapstonePermanent ||
          g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED')
      );
      const nonCapstoneGroups = batch.groups.filter(
        (g) =>
          !g.isCapstonePermanent &&
          !g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED')
      );

      // Ensure capstones are marked permanent
      for (const cg of capstoneGroups) {
        await prisma.group.update({
          where: { id: cg.id },
          data: { isCapstonePermanent: true, isArchived: false, purgeAt: null },
        });
      }

      // Delete non-capstone groups and their cascades
      const nonCapstoneIds = nonCapstoneGroups.map((g) => g.id);
      if (nonCapstoneIds.length > 0) {
        await prisma.groupMember.deleteMany({ where: { groupId: { in: nonCapstoneIds } } });
        await prisma.markEntry.deleteMany({ where: { groupId: { in: nonCapstoneIds } } });
        await prisma.attainmentSnapshot.deleteMany({ where: { groupId: { in: nonCapstoneIds } } });
        await prisma.forumPost.deleteMany({ where: { groupId: { in: nonCapstoneIds } } });
        await prisma.group.deleteMany({ where: { id: { in: nonCapstoneIds } } });
      }

      // Mark batch as closed & archived
      await prisma.batch.update({
        where: { id: input.batchId },
        data: { isLocked: true, isArchived: true, active: false },
      });

      revalidatePath('/admin/capstone');
      revalidatePath('/admin/reports');
      revalidatePath('/admin/allocation');

      return {
        success: true,
        deletedGroupsCount: nonCapstoneIds.length,
        preservedCapstonesCount: capstoneGroups.length,
        message: `Forceful cleanup complete: Permanently deleted ${nonCapstoneIds.length} non-capstone project group(s) to free up database storage. ${capstoneGroups.length} Capstone project(s) remain permanently preserved in the Capstone Catalogue.`,
      };
    } else {
      // Complete Deletion of Batch and all groups
      const allGroupIds = batch.groups.map((g) => g.id);
      if (allGroupIds.length > 0) {
        await prisma.groupMember.deleteMany({ where: { groupId: { in: allGroupIds } } });
        await prisma.markEntry.deleteMany({ where: { groupId: { in: allGroupIds } } });
        await prisma.attainmentSnapshot.deleteMany({ where: { groupId: { in: allGroupIds } } });
        await prisma.forumPost.deleteMany({ where: { groupId: { in: allGroupIds } } });
        await prisma.group.deleteMany({ where: { id: { in: allGroupIds } } });
      }

      await prisma.batch.delete({ where: { id: input.batchId } });

      revalidatePath('/admin/capstone');
      revalidatePath('/admin/reports');
      revalidatePath('/admin/allocation');

      return {
        success: true,
        deletedGroupsCount: allGroupIds.length,
        preservedCapstonesCount: 0,
        message: `Batch "${input.batchId}" and all associated group records (${allGroupIds.length}) were permanently deleted from the database.`,
      };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 12. Get All Archived Projects (Admin / Archived Projects Hub)
// ----------------------------------------------------
export interface ArchivedProjectListItem {
  id: string;
  topicId: string;
  topicCode: string;
  topicTitle: string;
  domain: string;
  category: string;
  batchId: string;
  groupNumber: number;
  year: number;
  supervisorName: string;
  supervisorEmail: string;
  students: Array<{
    name: string;
    roll: string;
    badges?: {
      diamonds: number;
      gold: number;
      silver: number;
      copper: number;
      iron: number;
      total: number;
    };
  }>;
  isCapstone: boolean;
  decisionYear: number;
  decisionNotes?: string | null;
  driveFileUrl?: string | null;
  attributes: Array<{
    code: string;
    title: string;
    level: number;
    reason: string | null;
  }>;
  sdgs: Array<{
    code: string;
    title: string;
    target: string;
  }>;
  semesterMarks?: {
    sem6?: { rubricA?: number; rubricB?: number; total?: number };
    sem7?: { rubricC?: number; rubricD?: number; total?: number };
    sem8?: { rubricE?: number; rubricF?: number; total?: number };
  };
  poAttainments: Array<{
    code: string;
    percentage: number;
    level: number;
    isAttained: boolean;
  }>;
}

export async function getArchivedProjectsAction(): Promise<{
  success: boolean;
  projects?: ArchivedProjectListItem[];
  batches?: Array<{ id: string; archivedAt: string | null; driveUrl?: string | null }>;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const archivedBatches = await prisma.batch.findMany({
      where: { isArchived: true },
      orderBy: { id: 'desc' },
    });

    const projectList: ArchivedProjectListItem[] = [];
    const batchList: Array<{ id: string; archivedAt: string | null; driveUrl?: string | null }> = [];

    for (const b of archivedBatches) {
      batchList.push({
        id: b.id,
        archivedAt: b.archivedAt ? b.archivedAt.toISOString() : null,
        driveUrl: b.archiveDriveFileUrl,
      });

      // Extract year from batch ID e.g. "2023-2027" -> 2027
      let graduatingYear = new Date().getFullYear();
      if (b.id.includes('-')) {
        const parts = b.id.split('-');
        const parsedYear = parseInt(parts[1], 10);
        if (!isNaN(parsedYear)) graduatingYear = parsedYear;
      }

      const summary = b.archiveReportSummary as any;
      if (summary?.groups && Array.isArray(summary.groups) && summary.groups.length > 0) {
        // Fast path: load directly from the compiled archive summary
        for (const g of summary.groups as ArchivedGroupProfile[]) {
          projectList.push({
            id: `${b.id}-g-${g.groupNumber}`,
            topicId: g.groupId || `${b.id}-topic-${g.groupNumber}`,
            topicCode: g.topicCode,
            topicTitle: g.topicTitle,
            domain: g.domain,
            category: g.category,
            batchId: b.id,
            groupNumber: g.groupNumber,
            year: g.decisionYear || graduatingYear,
            supervisorName: g.supervisorName,
            supervisorEmail: g.supervisorEmail,
            students: g.students || [],
            isCapstone: g.isCapstone,
            decisionYear: g.decisionYear || graduatingYear,
            decisionNotes: g.decisionNotes || null,
            driveFileUrl: b.archiveDriveFileUrl || summary.driveViewUrl || null,
            attributes: g.attributes || [],
            sdgs: g.sdgs || [],
            semesterMarks: g.semesterMarks,
            poAttainments: g.poAttainments || [],
          });
        }
      } else {
        // Fallback: Query database records for this batch
        const dbGroups = await prisma.group.findMany({
          where: { batchId: b.id },
          include: {
            supervisor: { select: { name: true, email: true } },
            topic: {
              include: {
                attributes: { include: { attribute: true } },
                sdgs: { include: { sdg: true } },
                decisions: true,
              },
            },
            members: {
              include: {
                student: { select: { name: true, roll: true } },
              },
            },
          },
          orderBy: { number: 'asc' },
        });

        for (const g of dbGroups) {
          const isCapstone =
            g.isCapstonePermanent ||
            g.topic?.decisions?.some((d) => d.isCapstone && d.status === 'CONFIRMED');
          const decision = g.topic?.decisions?.find((d) => d.isCapstone && d.status === 'CONFIRMED') || g.topic?.decisions?.[0];

          projectList.push({
            id: g.id,
            topicId: g.topic?.id || g.id,
            topicCode: g.topic?.code || 'N/A',
            topicTitle: g.topic?.title || `Group ${g.number}`,
            domain: g.topic?.domain || 'General',
            category: g.topic?.category || 'Standard',
            batchId: b.id,
            groupNumber: g.number,
            year: decision?.decisionYear || graduatingYear,
            supervisorName: g.supervisor?.name || 'Unassigned',
            supervisorEmail: g.supervisor?.email || '',
            students: g.members.map((m) => ({
              name: m.student.name,
              roll: m.student.roll,
            })),
            isCapstone: !!isCapstone,
            decisionYear: decision?.decisionYear || graduatingYear,
            decisionNotes: decision?.notes || null,
            driveFileUrl: b.archiveDriveFileUrl,
            attributes: (g.topic?.attributes || []).map((a) => ({
              code: a.attribute.code,
              title: a.attribute.title,
              level: a.level,
              reason: a.reason,
            })),
            sdgs: (g.topic?.sdgs || []).map((s) => ({
              code: `SDG ${s.sdg.id}`,
              title: s.sdg.title,
              target: s.target || 'General',
            })),
            poAttainments: [],
          });
        }
      }
    }

    return {
      success: true,
      projects: projectList,
      batches: batchList,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}



