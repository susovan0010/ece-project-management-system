'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface SupervisorUserItem {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  proposedTopicsCount: number;
  groups: Array<{
    id: string;
    number: number;
    batchId: string;
    topicCode: string;
    topicTitle: string;
  }>;
  createdAt: string;
}

export interface StudentGroupItem {
  studentId: string;
  roll: string;
  name: string;
  email: string | null;
  phone: string | null;
  groupId: string | null;
  groupNumber: number | null;
  batchId: string | null;
  topicCode: string | null;
  topicTitle: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
}

export async function getAdminDirectoryDataAction(batchFilter?: string) {
  const session = await auth();

  // Rule 1: Strict server-side ADMIN role check
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can view department directories.' };
  }

  try {
    const [
      adminsRaw,
      supervisorsRaw,
      studentsRaw,
      batches,
      totalTopics,
      sihTopics,
      ugTopics,
      facultyTopics,
      totalGroups,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN' },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          mustChangePassword: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: { role: 'FACULTY' },
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { topics: true },
          },
          groups: {
            orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
            include: {
              topic: {
                select: { code: true, title: true },
              },
            },
          },
        },
      }),
      prisma.student.findMany({
        orderBy: { roll: 'asc' },
        include: {
          groups: {
            include: {
              group: {
                include: {
                  topic: {
                    select: { code: true, title: true },
                  },
                  supervisor: {
                    select: { name: true, email: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.batch.findMany({
        orderBy: { id: 'desc' },
      }),
      prisma.topic.count(),
      prisma.topic.count({ where: { source: 'SIH' } }),
      prisma.topic.count({ where: { source: 'UG_RESEARCH' } }),
      prisma.topic.count({ where: { source: 'FACULTY' } }),
      prisma.group.count(),
    ]);

    const admins: AdminUserItem[] = adminsRaw.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      active: a.active,
      mustChangePassword: a.mustChangePassword,
      createdAt: a.createdAt.toISOString(),
    }));

    const supervisors: SupervisorUserItem[] = supervisorsRaw.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      active: s.active,
      mustChangePassword: s.mustChangePassword,
      proposedTopicsCount: s._count?.topics ?? 0,
      groups: (s.groups || []).map((g) => ({
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topicCode: g.topic.code,
        topicTitle: g.topic.title,
      })),
      createdAt: s.createdAt.toISOString(),
    }));

    const studentRows: StudentGroupItem[] = [];

    for (const st of studentsRaw) {
      if (!st.groups || st.groups.length === 0) {
        if (!batchFilter || batchFilter === 'ALL') {
          studentRows.push({
            studentId: st.id,
            roll: st.roll,
            name: st.name,
            email: st.email,
            phone: st.phone,
            groupId: null,
            groupNumber: null,
            batchId: null,
            topicCode: null,
            topicTitle: null,
            supervisorName: null,
            supervisorEmail: null,
          });
        }
      } else {
        for (const gm of st.groups) {
          const grp = gm.group;
          if (batchFilter && batchFilter !== 'ALL' && grp.batchId !== batchFilter) {
            continue;
          }
          studentRows.push({
            studentId: st.id,
            roll: st.roll,
            name: st.name,
            email: st.email,
            phone: st.phone,
            groupId: grp.id,
            groupNumber: grp.number,
            batchId: grp.batchId,
            topicCode: grp.topic?.code || null,
            topicTitle: grp.topic?.title || null,
            supervisorName: grp.supervisor?.name || null,
            supervisorEmail: grp.supervisor?.email || null,
          });
        }
      }
    }

    // Sort by groupNumber ascending (ungrouped last), then roll ascending
    studentRows.sort((a, b) => {
      if (a.groupNumber !== null && b.groupNumber !== null) {
        if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
      } else if (a.groupNumber !== null) {
        return -1;
      } else if (b.groupNumber !== null) {
        return 1;
      }
      return a.roll.localeCompare(b.roll);
    });

    return {
      admins,
      supervisors,
      students: studentRows,
      batches,
      kpis: {
        totalTopics,
        sihTopics,
        ugTopics,
        facultyTopics,
        totalAdmins: admins.length,
        totalSupervisors: supervisors.length,
        totalGroups,
        totalStudents: studentsRaw.length,
      },
    };
  } catch (err) {
    return { error: `Failed to load department directory: ${(err as Error).message}` };
  }
}
