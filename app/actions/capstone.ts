'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  evaluateCapstone,
  CapstoneResult,
  RubricDScore,
  RubricFScore,
} from '@/lib/engine/capstone';
import { Levels } from '@/lib/engine';
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
