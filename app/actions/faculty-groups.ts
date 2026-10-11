'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// ----------------------------------------------------
// 1. Get Faculty Assigned Groups (Strict Isolation)
// ----------------------------------------------------
export async function getMyFacultyGroupsAction(batchId?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to view your groups.' };
  }

  // Mandatory Rule 1: Always filter strictly by the signed-in faculty's ID
  const supervisorId = session.user.id;

  try {
    const where: any = {
      supervisorId,
    };

    if (batchId && batchId !== 'ALL') {
      where.batchId = batchId;
    }

    const [groups, activeBatches] = await Promise.all([
      prisma.group.findMany({
        where,
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
        include: {
          topic: {
            select: {
              id: true,
              code: true,
              title: true,
              category: true,
              description: true,
              status: true,
            },
          },
          members: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  roll: true,
                  email: true,
                  phone: true,
                },
              },
            },
            orderBy: {
              student: {
                roll: 'asc',
              },
            },
          },
          markEntries: {
            select: {
              id: true,
              criterion: {
                select: {
                  semester: true,
                  rubricCode: true,
                },
              },
              status: true,
            },
          },
        },
      }),
      prisma.batch.findMany({
        where: { active: true },
        orderBy: { id: 'desc' },
      }),
    ]);

    // Format groups with marks progress indicators
    const formattedGroups = groups.map((g) => {
      const semsWithMarks = new Set<number>();
      g.markEntries.forEach((m) => {
        if (m.criterion?.semester) {
          semsWithMarks.add(m.criterion.semester);
        }
      });

      return {
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topic: g.topic,
        students: g.members.map((m) => m.student),
        progress: {
          sem6: semsWithMarks.has(6),
          sem7: semsWithMarks.has(7),
          sem8: semsWithMarks.has(8),
        },
      };
    });

    return {
      groups: formattedGroups,
      batches: activeBatches,
      totalCount: formattedGroups.length,
    };
  } catch (err) {
    return { error: `Failed to load faculty groups: ${(err as Error).message}` };
  }
}
