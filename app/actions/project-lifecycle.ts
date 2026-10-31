'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { TopicStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export interface ArchivedStudentMarksSummary {
  studentId: string;
  name: string;
  roll: string;
  email: string | null;
  phone: string | null;
  sem6RubricA: number; // max 60
  sem6RubricB: number; // max 40
  sem6Total: number;   // max 100
  sem7RubricC: number; // max 50
  sem7RubricD: number; // max 50
  sem7Total: number;   // max 100
  sem8RubricE: number; // max 40
  sem8RubricF: number; // max 60
  sem8Total: number;   // max 100
  grandTotal: number;  // max 300
}

export interface ArchivedGroupRecord {
  groupId: string;
  groupNumber: number;
  batchId: string;
  supervisorName: string;
  supervisorEmail: string;
  students: ArchivedStudentMarksSummary[];
}

export interface ArchivedProjectRecord {
  topicId: string;
  code: string;
  title: string;
  category: string;
  source: string;
  domain: string | null;
  proposerName: string | null;
  proposerEmail: string | null;
  supervisorsList: string[];
  sdgCodes: string[];
  wpCodes: string[];
  archivedAt: string;
  groups: ArchivedGroupRecord[];
}

// ----------------------------------------------------
// 1. Supervisor Selects & Confirms Topic from Bank as Active
// ----------------------------------------------------
export async function claimAndConfirmBankTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  // Rule 1: Only FACULTY can be proposer / claim a topic
  if (!user?.id || user.role !== 'FACULTY') {
    return {
      error: 'Unauthorized: Only Faculty Supervisors can select and confirm a project topic.',
    };
  }

  try {
    const existing = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        proposer: { select: { id: true, name: true } },
      },
    });

    if (!existing) {
      return { error: 'Topic not found.' };
    }

    if (existing.proposerId && existing.proposerId !== user.id) {
      return {
        error: `This topic has already been selected and confirmed by ${
          existing.proposer?.name || 'another supervisor'
        }.`,
      };
    }

    const nextStatus =
      existing.status === TopicStatus.ALLOTTED ? TopicStatus.ALLOTTED : TopicStatus.CONFIRMED;

    const updated = await prisma.topic.update({
      where: { id: topicId },
      data: {
        proposerId: user.id,
        status: nextStatus,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CLAIM_AND_ACTIVATE_TOPIC',
        entity: 'Topic',
        entityId: updated.id,
        payload: {
          code: updated.code,
          title: updated.title,
          status: updated.status,
        },
      },
    });

    revalidatePath('/faculty/topics');
    revalidatePath('/faculty/my-topics');
    revalidatePath('/admin/confirmed');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      topic: {
        id: updated.id,
        code: updated.code,
        title: updated.title,
        status: updated.status,
      },
    };
  } catch (err) {
    return { error: `Failed to confirm topic: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Complete & Deactivate Project (Archive after 8th Semester)
// ----------------------------------------------------
export async function completeAndArchiveTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  if (!user?.id || (user.role !== 'ADMIN' && user.role !== 'FACULTY')) {
    return { error: 'Unauthorized: You must be signed in as Admin or Faculty Supervisor.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        groups: {
          select: { id: true, number: true, supervisorId: true },
        },
      },
    });

    if (!topic) {
      return { error: 'Topic not found.' };
    }

    // Rule 1: If FACULTY, verify they are proposer or group supervisor for this topic
    if (user.role === 'FACULTY') {
      const isProposer = topic.proposerId === user.id;
      const isGroupSupervisor = topic.groups.some((g) => g.supervisorId === user.id);
      if (!isProposer && !isGroupSupervisor) {
        return {
          error: 'Unauthorized: You can only complete and archive projects that you supervise.',
        };
      }
    }

    const updated = await prisma.topic.update({
      where: { id: topicId },
      data: {
        status: TopicStatus.ARCHIVED,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'COMPLETE_AND_ARCHIVE_PROJECT',
        entity: 'Topic',
        entityId: updated.id,
        payload: {
          code: updated.code,
          title: updated.title,
          previousStatus: topic.status,
          newStatus: TopicStatus.ARCHIVED,
          archivedByRole: user.role,
        },
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');
    revalidatePath('/admin/confirmed');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      topic: {
        id: updated.id,
        code: updated.code,
        title: updated.title,
        status: updated.status,
      },
    };
  } catch (err) {
    return { error: `Failed to archive project: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Reactivate an Archived Project back to Active
// ----------------------------------------------------
export async function reactivateArchivedTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  if (!user?.id || (user.role !== 'ADMIN' && user.role !== 'FACULTY')) {
    return { error: 'Unauthorized.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        groups: { select: { id: true, supervisorId: true } },
      },
    });

    if (!topic) {
      return { error: 'Topic not found.' };
    }

    if (user.role === 'FACULTY') {
      const isProposer = topic.proposerId === user.id;
      const isGroupSupervisor = topic.groups.some((g) => g.supervisorId === user.id);
      if (!isProposer && !isGroupSupervisor) {
        return { error: 'Unauthorized: You can only reactivate your own supervised projects.' };
      }
    }

    const restoredStatus =
      topic.groups.length > 0 ? TopicStatus.ALLOTTED : TopicStatus.CONFIRMED;

    const updated = await prisma.topic.update({
      where: { id: topicId },
      data: { status: restoredStatus },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REACTIVATE_ARCHIVED_PROJECT',
        entity: 'Topic',
        entityId: updated.id,
        payload: {
          code: updated.code,
          restoredStatus,
        },
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/admin/confirmed');
    revalidatePath('/admin/dashboard');

    return { success: true, status: updated.status };
  } catch (err) {
    return { error: `Failed to reactivate project: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Get Comprehensive Archived Projects (with All Semesters Marks)
// ----------------------------------------------------
export async function getArchivedProjectsAction() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  if (!user?.id || (user.role !== 'ADMIN' && user.role !== 'FACULTY')) {
    return { error: 'Unauthorized.' };
  }

  try {
    const whereClause =
      user.role === 'ADMIN'
        ? { status: TopicStatus.ARCHIVED }
        : {
            status: TopicStatus.ARCHIVED,
            OR: [
              { proposerId: user.id },
              { groups: { some: { supervisorId: user.id } } },
            ],
          };

    const topics = await prisma.topic.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
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
          include: {
            supervisor: {
              select: { id: true, name: true, email: true },
            },
            members: {
              include: {
                student: true,
              },
            },
            markEntries: {
              include: {
                criterion: true,
              },
            },
          },
          orderBy: { number: 'asc' },
        },
      },
    });

    const records: ArchivedProjectRecord[] = topics.map((t) => {
      const supervisorSet = new Set<string>();
      if (t.proposer?.name) {
        supervisorSet.add(`${t.proposer.name} (${t.proposer.email})`);
      }

      const groupRecords: ArchivedGroupRecord[] = t.groups.map((g) => {
        if (g.supervisor?.name) {
          supervisorSet.add(`${g.supervisor.name} (${g.supervisor.email})`);
        }

        // Helper to compute total marks for a student in a specific rubric ('A'..'F')
        const calcRubricScore = (studentId: string, rubricCode: string): number => {
          const entriesForRubric = g.markEntries.filter(
            (m) => m.criterion.rubricCode === rubricCode
          );
          if (entriesForRubric.length === 0) return 0;

          // Group by criterionId so we can average across examinerSlot (e.g. Rubric D panel)
          const byCriterion = new Map<number, number[]>();
          for (const entry of entriesForRubric) {
            if (entry.criterion.scope === 'GROUP' || entry.studentId === null) {
              const arr = byCriterion.get(entry.criterionId) || [];
              arr.push(entry.marks);
              byCriterion.set(entry.criterionId, arr);
            } else if (entry.studentId === studentId) {
              const arr = byCriterion.get(entry.criterionId) || [];
              arr.push(entry.marks);
              byCriterion.set(entry.criterionId, arr);
            }
          }

          let sum = 0;
          for (const [, slotMarks] of Array.from(byCriterion.entries())) {
            const avg = slotMarks.reduce((a, b) => a + b, 0) / slotMarks.length;
            sum += avg;
          }
          return Math.round(sum * 100) / 100;
        };

        const students: ArchivedStudentMarksSummary[] = g.members.map((m) => {
          const st = m.student;
          const sem6RubricA = calcRubricScore(st.id, 'A');
          const sem6RubricB = calcRubricScore(st.id, 'B');
          const sem6Total = Math.round((sem6RubricA + sem6RubricB) * 100) / 100;

          const sem7RubricC = calcRubricScore(st.id, 'C');
          const sem7RubricD = calcRubricScore(st.id, 'D');
          const sem7Total = Math.round((sem7RubricC + sem7RubricD) * 100) / 100;

          const sem8RubricE = calcRubricScore(st.id, 'E');
          const sem8RubricF = calcRubricScore(st.id, 'F');
          const sem8Total = Math.round((sem8RubricE + sem8RubricF) * 100) / 100;

          const grandTotal = Math.round((sem6Total + sem7Total + sem8Total) * 100) / 100;

          return {
            studentId: st.id,
            name: st.name,
            roll: st.roll,
            email: st.email,
            phone: st.phone,
            sem6RubricA,
            sem6RubricB,
            sem6Total,
            sem7RubricC,
            sem7RubricD,
            sem7Total,
            sem8RubricE,
            sem8RubricF,
            sem8Total,
            grandTotal,
          };
        });

        return {
          groupId: g.id,
          groupNumber: g.number,
          batchId: g.batchId,
          supervisorName: g.supervisor.name,
          supervisorEmail: g.supervisor.email,
          students,
        };
      });

      return {
        topicId: t.id,
        code: t.code,
        title: t.title,
        category: t.category,
        source: t.source,
        domain: t.domain,
        proposerName: t.proposer?.name || null,
        proposerEmail: t.proposer?.email || null,
        supervisorsList: Array.from(supervisorSet),
        sdgCodes: t.sdgs.map((s) => `SDG ${s.sdgId}: ${s.sdg.title}`),
        wpCodes: t.attributes
          .filter((a) => a.attribute.kind === 'WP')
          .map((a) => `${a.attribute.code} (L${a.level})`),
        archivedAt: t.updatedAt.toISOString(),
        groups: groupRecords,
      };
    });

    return { archivedProjects: records };
  } catch (err) {
    return { error: `Failed to load archived projects: ${(err as Error).message}` };
  }
}
