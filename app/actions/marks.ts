'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MarkStatus, Scope } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { RUBRICS } from '@/prisma/catalogue-data';

async function ensureRubricsSynced() {
  try {
    for (const r of RUBRICS) {
      await prisma.rubric.upsert({
        where: { code: r.code },
        update: { semester: r.semester, title: r.title, maxMarks: r.maxMarks },
        create: { code: r.code, semester: r.semester, title: r.title, maxMarks: r.maxMarks },
      });

      const validKeys = r.criteria.map((c) => c.key);
      // Remove any obsolete criteria keys for this rubric that have no mark entries
      await prisma.criterion.deleteMany({
        where: {
          rubricCode: r.code,
          key: { notIn: validKeys },
          markEntries: { none: {} },
        },
      });

      for (const c of r.criteria) {
        const existingCriterion = await prisma.criterion.findFirst({
          where: { rubricCode: r.code, key: c.key },
        });

        const criterionRecord = existingCriterion
          ? await prisma.criterion.update({
              where: { id: existingCriterion.id },
              data: {
                label: c.label,
                maxMarks: c.maxMarks,
                scope: c.scope,
                semester: r.semester,
              },
            })
          : await prisma.criterion.create({
              data: {
                rubricCode: r.code,
                semester: r.semester,
                key: c.key,
                label: c.label,
                maxMarks: c.maxMarks,
                scope: c.scope,
              },
            });

        for (const m of c.maps) {
          await prisma.criterionMap.upsert({
            where: {
              criterionId_kind_code: {
                criterionId: criterionRecord.id,
                kind: m.kind,
                code: m.code,
              },
            },
            update: {},
            create: {
              criterionId: criterionRecord.id,
              kind: m.kind,
              code: m.code,
            },
          });
        }
      }
    }
  } catch {
    // Ignore in unit test mocks
  }
}

// ----------------------------------------------------
// 1. Get Group Marks Data & Evaluation Rubric
// ----------------------------------------------------
export async function getGroupMarksAction(groupId: string, rubricCode: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to view marks.' };
  }

  const userId = session.user.id;
  const userRole = (session.user as { role?: string }).role;

  try {
    // 1. Verify Group & Supervisor Authorization
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        topic: true,
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            student: true,
          },
          orderBy: {
            student: {
              roll: 'asc',
            },
          },
        },
      },
    });

    if (!group) {
      return { error: 'Group not found.' };
    }

    // Role Guard: Only the assigned supervisor or an Admin can access
    if (userRole !== 'ADMIN' && group.supervisorId !== userId) {
      return { error: 'Unauthorized: You are not the supervisor of this project group.' };
    }

    // 2. Load Rubric with Criteria and Mappings
    await ensureRubricsSynced();
    const rubric = await prisma.rubric.findUnique({
      where: { code: rubricCode },
      include: {
        criteria: {
          include: {
            maps: {
              include: {
                attribute: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!rubric) {
      return { error: `Rubric "${rubricCode}" not found.` };
    }

    // 3. Check Marking Window Status
    const windowSetting = await prisma.markWindow.findFirst({
      where: {
        semester: rubric.semester,
        rubric: rubric.code,
      },
      orderBy: { createdAt: 'desc' },
    });

    const isLocked = windowSetting ? windowSetting.isLocked || new Date() > windowSetting.deadline : false;

    // 4. Load Existing Mark Entries for this Group & Rubric
    const criterionIds = rubric.criteria.map((c) => c.id);
    const existingMarks = await prisma.markEntry.findMany({
      where: {
        groupId,
        criterionId: { in: criterionIds },
      },
      include: {
        enteredBy: {
          select: { name: true },
        },
      },
    });

    return {
      group,
      rubric,
      isLocked,
      deadline: windowSetting?.deadline || null,
      existingMarks,
      students: group.members.map((m) => m.student),
    };
  } catch (err) {
    return { error: `Failed to load marks: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Save Marks Entry Action (Draft or Final Submit)
// ----------------------------------------------------
const MarkItemSchema = z.object({
  criterionId: z.number().int(),
  studentId: z.string().nullable().optional(), // null for GROUP scope
  examinerSlot: z.number().int().min(1).default(1),
  marks: z.number().min(0, 'Marks cannot be negative'),
});

const SaveMarksSchema = z.object({
  groupId: z.string().min(1),
  rubricCode: z.string().min(1),
  status: z.enum(['DRAFT', 'SUBMITTED']),
  entries: z.array(MarkItemSchema),
});

export async function saveMarksEntryAction(payload: z.infer<typeof SaveMarksSchema>) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized.' };
  }

  const userId = session.user.id;
  const userRole = (session.user as { role?: string }).role;

  const parsed = SaveMarksSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { groupId, rubricCode, status, entries } = parsed.data;

  try {
    // 1. Verify Group & Supervisor Authorization
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      return { error: 'Group not found.' };
    }

    if (userRole !== 'ADMIN' && group.supervisorId !== userId) {
      return { error: 'Unauthorized: You are not authorized to enter marks for this group.' };
    }

    // 2. Verify Rubric & Criteria Maxima
    const rubric = await prisma.rubric.findUnique({
      where: { code: rubricCode },
      include: { criteria: true },
    });

    if (!rubric) {
      return { error: 'Rubric not found.' };
    }

    // Check window lock
    const windowSetting = await prisma.markWindow.findFirst({
      where: {
        semester: rubric.semester,
        rubric: rubric.code,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (windowSetting && (windowSetting.isLocked || new Date() > windowSetting.deadline)) {
      return { error: `Marking window for Rubric ${rubricCode} is locked. Contact Project Committee.` };
    }

    const criteriaMap = new Map(rubric.criteria.map((c) => [c.id, c]));

    // 3. Strict Bounds Check: 0 <= marks <= maxMarks
    for (const entry of entries) {
      const criterion = criteriaMap.get(entry.criterionId);
      if (!criterion) {
        return { error: `Invalid criterion ID: ${entry.criterionId}` };
      }

      if (entry.marks < 0 || entry.marks > criterion.maxMarks) {
        return {
          error: `Mark for "${criterion.label}" (${entry.marks}) exceeds the maximum allowed limit of ${criterion.maxMarks}.`,
        };
      }
    }

    // 4. Upsert Mark Entries in a Transaction
    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const studentIdVal = entry.studentId || null;

        const existing = await tx.markEntry.findFirst({
          where: {
            criterionId: entry.criterionId,
            groupId,
            studentId: studentIdVal,
            examinerSlot: entry.examinerSlot,
          },
        });

        if (existing) {
          await tx.markEntry.update({
            where: { id: existing.id },
            data: {
              marks: entry.marks,
              status: status === 'SUBMITTED' ? MarkStatus.SUBMITTED : MarkStatus.DRAFT,
              enteredById: userId,
            },
          });
        } else {
          await tx.markEntry.create({
            data: {
              criterionId: entry.criterionId,
              groupId,
              studentId: studentIdVal,
              examinerSlot: entry.examinerSlot,
              marks: entry.marks,
              status: status === 'SUBMITTED' ? MarkStatus.SUBMITTED : MarkStatus.DRAFT,
              enteredById: userId,
            },
          });
        }
      }

      // Record in Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: status === 'SUBMITTED' ? 'SUBMIT_MARKS' : 'DRAFT_MARKS',
          entity: 'Group',
          entityId: groupId,
          payload: {
            rubricCode,
            entriesCount: entries.length,
            status,
          },
        },
      });
    });

    revalidatePath('/faculty/marks');
    revalidatePath('/faculty/groups');
    return { success: true, count: entries.length };
  } catch (err) {
    return { error: `Failed to save marks: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Get Printable Rubric Template
// ----------------------------------------------------
export async function getRubricDefinitionAction(rubricCode: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to view rubrics.' };
  }

  try {
    await ensureRubricsSynced();
    const rubric = await prisma.rubric.findUnique({
      where: { code: rubricCode },
      include: {
        criteria: {
          include: {
            maps: {
              include: {
                attribute: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!rubric) {
      return { error: `Rubric "${rubricCode}" not found.` };
    }

    return { rubric };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function getPrintableRubricsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized.' };
  }

  try {
    await ensureRubricsSynced();
    const rubrics = await prisma.rubric.findMany({
      orderBy: { code: 'asc' },
      include: {
        criteria: {
          include: {
            maps: {
              include: {
                attribute: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    return { rubrics };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
