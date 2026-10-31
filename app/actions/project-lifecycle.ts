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

// ============================================================================
// 5. Supervisor Confirm Draft Topic & Pre-Confirmation Direct Deletion
// ============================================================================
export async function confirmDraftTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'FACULTY') {
    return { error: 'Forbidden: Only supervisors can confirm their draft projects.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, code: true, title: true, status: true, proposerId: true },
    });

    if (!topic) {
      return { error: 'Project topic not found.' };
    }

    if (topic.proposerId !== user.id) {
      return { error: 'Forbidden: You can only confirm your own draft topic.' };
    }

    if (topic.status !== TopicStatus.DRAFT) {
      return { error: `Topic ${topic.code} is already ${topic.status}.` };
    }

    const updated = await prisma.topic.update({
      where: { id: topic.id },
      data: { status: TopicStatus.CONFIRMED },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CONFIRM_DRAFT_TOPIC',
        entity: 'Topic',
        entityId: topic.id,
        payload: {
          code: topic.code,
          title: topic.title,
          previousStatus: topic.status,
          newStatus: TopicStatus.CONFIRMED,
        },
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');
    revalidatePath('/admin/topics');
    revalidatePath('/admin/confirmed');

    return { success: true, code: updated.code };
  } catch (err) {
    return { error: `Failed to confirm draft topic: ${(err as Error).message}` };
  }
}

export async function deleteUnconfirmedTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'FACULTY') {
    return { error: 'Forbidden: Only supervisors can delete their unconfirmed draft topics.' };
  }

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, code: true, title: true, status: true, proposerId: true },
    });

    if (!topic) {
      return { error: 'Project topic not found.' };
    }

    if (topic.proposerId !== user.id) {
      return { error: 'Forbidden: You can only delete a project topic that you created.' };
    }

    if (topic.status !== TopicStatus.DRAFT) {
      return {
        error:
          'Cannot delete directly: Once a project is confirmed, you must request deletion from the Admin.',
      };
    }

    await prisma.topic.delete({
      where: { id: topic.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_UNCONFIRMED_TOPIC',
        entity: 'Topic',
        entityId: topic.id,
        payload: {
          code: topic.code,
          title: topic.title,
          status: topic.status,
        },
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');
    revalidatePath('/admin/topics');
    revalidatePath('/admin/confirmed');

    return { success: true, code: topic.code, title: topic.title };
  } catch (err) {
    return { error: `Failed to delete unconfirmed topic: ${(err as Error).message}` };
  }
}

// ============================================================================
// 6. Post-Confirmation Supervisor Delete Request, Admin Approval & Final Delete
//    (Step 1: Supervisor Requests -> Step 2: Admin Agrees -> Step 3: Supervisor Final Delete)
// ============================================================================
export interface TopicDeleteRequestRecord {
  topicId: string;
  topicCode: string;
  topicTitle: string;
  supervisorId: string;
  supervisorName: string;
  supervisorEmail: string;
  requestedAt: string;
  reason?: string;
  status?: 'PENDING' | 'APPROVED';
  approvedAt?: string;
}

export interface SupervisorDeletedTopicRecord {
  topicId: string;
  supervisorId: string;
  deletedAt: string;
}

const DELETE_REQUESTS_SETTING_KEY = 'TOPIC_DELETE_REQUESTS';
const SUPERVISOR_DELETED_TOPICS_KEY = 'SUPERVISOR_DELETED_TOPICS';

async function readPendingDeleteRequests(): Promise<TopicDeleteRequestRecord[]> {
  const setting = await prisma.setting.findUnique({
    where: { key: DELETE_REQUESTS_SETTING_KEY },
  });
  if (!setting || !Array.isArray(setting.value)) {
    return [];
  }
  return setting.value as unknown as TopicDeleteRequestRecord[];
}

export async function readSupervisorDeletedTopicIds(supervisorId: string): Promise<string[]> {
  const setting = await prisma.setting.findUnique({
    where: { key: SUPERVISOR_DELETED_TOPICS_KEY },
  });
  if (!setting || !Array.isArray(setting.value)) {
    return [];
  }
  const rows = setting.value as unknown as SupervisorDeletedTopicRecord[];
  return rows.filter((r) => r.supervisorId === supervisorId).map((r) => r.topicId);
}

export async function requestTopicDeletionAction(topicId: string, reason?: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; name?: string | null; email?: string | null } | undefined;
  if (!user?.id || user.role !== 'FACULTY') {
    return { error: 'Forbidden: Only supervisors can request deletion of a confirmed project topic.' };
  }
  const supervisorId = user.id;

  try {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        groups: {
          where: { supervisorId },
          select: { id: true },
        },
      },
    });

    if (!topic) {
      return { error: 'Project topic not found.' };
    }

    const isOwner = topic.proposerId === supervisorId || topic.groups.length > 0;
    if (!isOwner) {
      return { error: 'Forbidden: This project topic is not in your supervisor pool.' };
    }

    if (topic.status === TopicStatus.DRAFT) {
      return {
        error:
          'This topic is still unconfirmed (DRAFT). You can delete it directly without requesting Admin approval.',
      };
    }

    const existing = await readPendingDeleteRequests();
    const alreadyRequested = existing.find(
      (r) => r.topicId === topic.id && r.supervisorId === supervisorId
    );
    if (alreadyRequested) {
      if (alreadyRequested.status === 'APPROVED') {
        return {
          error:
            'Admin has already agreed to your delete request. Click "Final Delete" to remove it from your account.',
        };
      }
      return { error: 'A delete request for this project topic is already pending Admin approval.' };
    }

    const newRequest: TopicDeleteRequestRecord = {
      topicId: topic.id,
      topicCode: topic.code,
      topicTitle: topic.title,
      supervisorId,
      supervisorName: user.name || 'Supervisor',
      supervisorEmail: user.email || '',
      requestedAt: new Date().toISOString(),
      reason: reason?.trim() || 'Requested removal from supervisor pool after confirmation.',
      status: 'PENDING',
    };

    const updatedList = [...existing, newRequest];

    await prisma.setting.upsert({
      where: { key: DELETE_REQUESTS_SETTING_KEY },
      update: { value: updatedList as any },
      create: { key: DELETE_REQUESTS_SETTING_KEY, value: updatedList as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: supervisorId,
        action: 'REQUEST_TOPIC_DELETE_FROM_POOL',
        entity: 'Topic',
        entityId: topic.id,
        payload: newRequest as any,
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');
    revalidatePath('/admin/topics');
    revalidatePath('/admin/confirmed');

    return { success: true, request: newRequest };
  } catch (err) {
    return { error: `Failed to submit delete request: ${(err as Error).message}` };
  }
}

export async function getTopicDeleteRequestsAction() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return { error: 'Unauthorized.' };
  }
  const userId = user.id;

  try {
    const allRequests = await readPendingDeleteRequests();
    if (user.role === 'ADMIN') {
      // Admins only need to act on PENDING requests
      return {
        requests: allRequests.filter((r) => (r.status || 'PENDING') === 'PENDING'),
      };
    }
    return {
      requests: allRequests.filter((r) => r.supervisorId === userId),
    };
  } catch (err) {
    return { error: `Failed to load delete requests: ${(err as Error).message}` };
  }
}

export async function resolveTopicDeleteRequestAction(
  topicId: string,
  supervisorId: string,
  decision: 'APPROVE' | 'REJECT'
) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Forbidden: Only Admins can approve or reject supervisor topic delete requests.' };
  }

  try {
    const allRequests = await readPendingDeleteRequests();
    const targetReq = allRequests.find(
      (r) => r.topicId === topicId && r.supervisorId === supervisorId
    );

    if (!targetReq) {
      return { error: 'Delete request not found or already resolved.' };
    }

    let updatedRequests: TopicDeleteRequestRecord[];

    if (decision === 'APPROVE') {
      // Mark request as APPROVED so the supervisor gets the "Final Delete" button in their account
      updatedRequests = allRequests.map((r) =>
        r.topicId === topicId && r.supervisorId === supervisorId
          ? { ...r, status: 'APPROVED', approvedAt: new Date().toISOString() }
          : r
      );
    } else {
      // Rejected: remove the request
      updatedRequests = allRequests.filter(
        (r) => !(r.topicId === topicId && r.supervisorId === supervisorId)
      );
    }

    await prisma.setting.upsert({
      where: { key: DELETE_REQUESTS_SETTING_KEY },
      update: { value: updatedRequests as any },
      create: { key: DELETE_REQUESTS_SETTING_KEY, value: updatedRequests as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action:
          decision === 'APPROVE'
            ? 'APPROVE_TOPIC_DELETE_REQUEST_FOR_FINAL_DELETE'
            : 'REJECT_TOPIC_DELETE_FROM_SUPERVISOR_POOL',
        entity: 'Topic',
        entityId: topicId,
        payload: {
          ...targetReq,
          decision,
        } as any,
      },
    });

    revalidatePath('/admin/topics');
    revalidatePath('/admin/confirmed');
    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');

    return {
      success: true,
      decision,
      topicCode: targetReq.topicCode,
      supervisorName: targetReq.supervisorName,
    };
  } catch (err) {
    return { error: `Failed to resolve delete request: ${(err as Error).message}` };
  }
}

export async function finalDeleteApprovedTopicAction(topicId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'FACULTY') {
    return { error: 'Forbidden: Only the supervisor can perform the final delete.' };
  }
  const supervisorId = user.id;

  try {
    const allRequests = await readPendingDeleteRequests();
    const approvedReq = allRequests.find(
      (r) => r.topicId === topicId && r.supervisorId === supervisorId && r.status === 'APPROVED'
    );

    if (!approvedReq) {
      return {
        error:
          'Cannot perform Final Delete: Admin approval is required before finally deleting a confirmed project.',
      };
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        groups: { select: { id: true, supervisorId: true } },
      },
    });

    if (topic) {
      // Remove any group linking this supervisor to this topic
      const supervisorGroups = topic.groups.filter((g) => g.supervisorId === supervisorId);
      for (const grp of supervisorGroups) {
        await prisma.group.delete({ where: { id: grp.id } });
      }

      const remainingOtherGroups = topic.groups.filter((g) => g.supervisorId !== supervisorId);

      // Remove from this supervisor's pool only (keep the topic in the general Admin Topic Bank)
      const shouldClearProposer = topic.proposerId === supervisorId;
      const nextStatus =
        remainingOtherGroups.length > 0 ? TopicStatus.ALLOTTED : TopicStatus.DRAFT;

      await prisma.topic.update({
        where: { id: topicId },
        data: {
          proposerId: shouldClearProposer ? null : topic.proposerId,
          status: nextStatus,
        },
      });
    }

    // Record in SUPERVISOR_DELETED_TOPICS so this topic never appears in this supervisor's account again
    const deletedSetting = await prisma.setting.findUnique({
      where: { key: SUPERVISOR_DELETED_TOPICS_KEY },
    });
    const existingDeleted =
      deletedSetting && Array.isArray(deletedSetting.value)
        ? (deletedSetting.value as unknown as SupervisorDeletedTopicRecord[])
        : [];
    const updatedDeleted: SupervisorDeletedTopicRecord[] = [
      ...existingDeleted.filter(
        (d) => !(d.topicId === topicId && d.supervisorId === supervisorId)
      ),
      { topicId, supervisorId, deletedAt: new Date().toISOString() },
    ];

    await prisma.setting.upsert({
      where: { key: SUPERVISOR_DELETED_TOPICS_KEY },
      update: { value: updatedDeleted as any },
      create: { key: SUPERVISOR_DELETED_TOPICS_KEY, value: updatedDeleted as any },
    });

    // Remove the fulfilled request from TOPIC_DELETE_REQUESTS
    const remainingRequests = allRequests.filter(
      (r) => !(r.topicId === topicId && r.supervisorId === supervisorId)
    );
    await prisma.setting.upsert({
      where: { key: DELETE_REQUESTS_SETTING_KEY },
      update: { value: remainingRequests as any },
      create: { key: DELETE_REQUESTS_SETTING_KEY, value: remainingRequests as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: supervisorId,
        action: 'FINAL_DELETE_APPROVED_TOPIC_BY_SUPERVISOR',
        entity: 'Topic',
        entityId: topicId,
        payload: approvedReq as any,
      },
    });

    revalidatePath('/faculty/my-topics');
    revalidatePath('/faculty/topics');
    revalidatePath('/admin/topics');
    revalidatePath('/admin/confirmed');

    return {
      success: true,
      topicCode: approvedReq.topicCode,
      topicTitle: approvedReq.topicTitle,
    };
  } catch (err) {
    return { error: `Failed to finally delete topic: ${(err as Error).message}` };
  }
}
