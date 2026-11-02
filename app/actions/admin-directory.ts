'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PRIORITY_A_ADMIN_EMAIL, isPriorityAAdmin } from '@/lib/admin-priority';
import { getOrCreateDepartmentAuthority, resolveUserAuthority } from '@/lib/authority-service';

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  priority: 'HOD' | 'A' | 'B';
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

    const authority = await getOrCreateDepartmentAuthority();

    const admins: AdminUserItem[] = adminsRaw.map((a) => {
      let priority: 'HOD' | 'A' | 'B' = 'B';
      if (authority.hodUserId && a.id === authority.hodUserId) {
        priority = 'HOD';
      } else if (
        (authority.superAdminUserId && a.id === authority.superAdminUserId) ||
        isPriorityAAdmin(a.email)
      ) {
        priority = 'A';
      }
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        active: a.active,
        mustChangePassword: a.mustChangePassword,
        priority,
        createdAt: a.createdAt.toISOString(),
      };
    });

    // Sort admins by priority: HOD first, then Super Admin (A), then Standard Admins (B)
    admins.sort((a, b) => {
      const rank = { HOD: 0, A: 1, B: 2 };
      if (rank[a.priority] !== rank[b.priority]) {
        return rank[a.priority] - rank[b.priority];
      }
      return a.name.localeCompare(b.name);
    });

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
      currentUserPriority: (authority.hodUserId === session.user.id
        ? 'HOD'
        : authority.superAdminUserId === session.user.id || isPriorityAAdmin(session.user.email)
        ? 'A'
        : 'B') as 'HOD' | 'A' | 'B',
      currentUserId: session.user.id,
      currentUserEmail: session.user.email,
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

// ----------------------------------------------------
// 2. Remove a Faculty Supervisor (Admin Only)
// ----------------------------------------------------
export async function removeSupervisorAction(supervisorId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  // Rule 1: Strict server-side ADMIN role check
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can remove supervisors.' };
  }

  try {
    const supervisor = await prisma.user.findUnique({
      where: { id: supervisorId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!supervisor) {
      return { error: 'Supervisor account not found.' };
    }

    if (supervisor.role !== 'FACULTY') {
      return { error: 'Only faculty supervisor accounts can be removed via this action.' };
    }

    // Detach topics, remove mark entries, groups, and user audit logs, then delete the supervisor user
    await prisma.topic.updateMany({
      where: { proposerId: supervisorId },
      data: { proposerId: null },
    });

    await prisma.markEntry.deleteMany({
      where: { enteredById: supervisorId },
    });

    await prisma.group.deleteMany({
      where: { supervisorId },
    });

    await prisma.auditLog.deleteMany({
      where: { userId: supervisorId },
    });

    await prisma.user.delete({
      where: { id: supervisorId },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REMOVE_SUPERVISOR',
        entity: 'User',
        entityId: supervisorId,
        payload: {
          removedName: supervisor.name,
          removedEmail: supervisor.email,
        },
      },
    });

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/allocation');
    revalidatePath('/admin/confirmed');

    return {
      success: true,
      message: `Supervisor ${supervisor.name} (${supervisor.email}) has been removed.`,
    };
  } catch (err) {
    return { error: `Failed to remove supervisor: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Remove a Student (Admin Only)
// ----------------------------------------------------
export async function removeStudentAction(studentId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  // Rule 1: Strict server-side ADMIN role check
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can remove students.' };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, roll: true, email: true },
    });

    if (!student) {
      return { error: 'Student not found.' };
    }

    // Deleting Student cascades GroupMember and student-scoped MarkEntry rows
    await prisma.student.delete({
      where: { id: studentId },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REMOVE_STUDENT',
        entity: 'Student',
        entityId: studentId,
        payload: {
          removedName: student.name,
          removedRoll: student.roll,
          removedEmail: student.email,
        },
      },
    });

    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/allocation');

    return {
      success: true,
      message: `Student ${student.name} (Roll: ${student.roll}) has been removed.`,
    };
  } catch (err) {
    return { error: `Failed to remove student: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Remove an Admin (Priority Type A Only)
// ----------------------------------------------------
export async function removeAdminAction(adminId: string) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;

  // Rule 1: Strict server-side ADMIN role check
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can remove admins.' };
  }

  // Priority Check: Only Priority Type A admin can remove an admin
  if (!isPriorityAAdmin(user.email)) {
    return {
      error: `Permission denied: Only Priority A Admin (${PRIORITY_A_ADMIN_EMAIL}) can remove committee admin members.`,
    };
  }

  if (adminId === user.id) {
    return { error: 'Operation rejected: You cannot remove your own admin account.' };
  }

  try {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!admin) {
      return { error: 'Admin account not found.' };
    }

    if (admin.role !== 'ADMIN') {
      return { error: 'Target user is not an administrator.' };
    }

    const authority = await getOrCreateDepartmentAuthority();
    if (authority.hodUserId && adminId === authority.hodUserId) {
      return {
        error:
          'Operation rejected: Head of Department (HOD) cannot be removed directly from this list. Please use the "Assign HOD" screen to request mutual agreement removal.',
      };
    }

    if (isPriorityAAdmin(admin.email)) {
      return { error: 'Operation rejected: Priority A Admin account cannot be removed.' };
    }

    // Detach any topics, mark entries, groups, and user audit logs, then delete the admin user
    await prisma.topic.updateMany({
      where: { proposerId: adminId },
      data: { proposerId: null },
    });

    await prisma.markEntry.deleteMany({
      where: { enteredById: adminId },
    });

    await prisma.group.deleteMany({
      where: { supervisorId: adminId },
    });

    await prisma.auditLog.deleteMany({
      where: { userId: adminId },
    });

    await prisma.user.delete({
      where: { id: adminId },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REMOVE_ADMIN',
        entity: 'User',
        entityId: adminId,
        payload: {
          removedName: admin.name,
          removedEmail: admin.email,
        },
      },
    });

    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `Admin ${admin.name} (${admin.email}) has been removed.`,
    };
  } catch (err) {
    return { error: `Failed to remove admin: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Transfer User Role (Admin <-> Faculty Supervisor)
// ----------------------------------------------------
export async function transferUserRoleAction(userId: string, targetRole: 'ADMIN' | 'FACULTY') {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;

  // Rule 1: Strict server-side ADMIN role check
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can transfer roles.' };
  }

  const isCallerTypeA = isPriorityAAdmin(user.email);

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      return { error: 'User account not found.' };
    }

    if (targetUser.role === targetRole) {
      return { error: `User is already in role ${targetRole}.` };
    }

    const authority = await getOrCreateDepartmentAuthority();
    if (authority.hodUserId && userId === authority.hodUserId && targetRole === 'FACULTY') {
      return {
        error:
          'Operation rejected: Head of Department (HOD) cannot be demoted to Faculty Supervisor directly. The HOD must first step down via HOD governance.',
      };
    }

    // Protection: Priority A admin cannot be demoted from ADMIN
    if (targetUser.role === 'ADMIN' && targetRole === 'FACULTY' && isPriorityAAdmin(targetUser.email)) {
      return { error: 'Operation rejected: Priority A Admin cannot be demoted to Faculty Supervisor.' };
    }

    // Case 1: Promoting to ADMIN -> Only Priority A Admin can grant Admin role
    if (targetRole === 'ADMIN') {
      if (!isCallerTypeA) {
        return {
          error: `Permission denied: Only Priority A Admin (${PRIORITY_A_ADMIN_EMAIL}) can transfer a member to Admin role.`,
        };
      }
    }

    // Case 2: Transferring ADMIN to FACULTY
    // Allowed if caller is Priority A, OR if the admin member is transferring him/herself
    if (targetRole === 'FACULTY') {
      const isSelfTransfer = userId === user.id;
      if (!isCallerTypeA && !isSelfTransfer) {
        return {
          error:
            'Permission denied: Priority B Admins can only transfer themselves to Faculty Supervisor. Only Priority A Admin can transfer other admins.',
        };
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'TRANSFER_USER_ROLE',
        entity: 'User',
        entityId: userId,
        payload: {
          userName: targetUser.name,
          userEmail: targetUser.email,
          previousRole: targetUser.role,
          newRole: targetRole,
        },
      },
    });

    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `${targetUser.name} (${targetUser.email}) transferred to ${
        targetRole === 'ADMIN' ? 'Project Committee Admin' : 'Faculty Supervisor'
      } role.`,
    };
  } catch (err) {
    return { error: `Failed to transfer user role: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 6. Update User Information (Name & Email)
// ----------------------------------------------------
export async function updateUserInformationAction(payload: {
  userId: string;
  name: string;
  email: string;
}) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;

  // Rule 1: Strict server-side ADMIN role check
  if (!user?.id || user.role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can edit user information.' };
  }

  const { userId, name, email } = payload;
  const cleanName = name?.trim();
  const cleanEmail = email?.toLowerCase().trim();

  if (!cleanName || cleanName.length < 2) {
    return { error: 'Full name must be at least 2 characters.' };
  }

  if (!cleanEmail || !z.string().email().safeParse(cleanEmail).success) {
    return { error: 'Please enter a valid institute email address.' };
  }

  const isCallerTypeA = isPriorityAAdmin(user.email);

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      return { error: 'User account not found.' };
    }

    // Permission check when target is an ADMIN:
    // Only Priority A Admin or the admin themselves can edit an admin account
    if (targetUser.role === 'ADMIN') {
      const isSelf = userId === user.id;
      if (!isCallerTypeA && !isSelf) {
        return {
          error: 'Permission denied: Priority B Admins cannot edit other Project Committee Admin accounts.',
        };
      }
    }

    // Check email uniqueness if email changed
    if (cleanEmail !== targetUser.email.toLowerCase()) {
      const existing = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
      if (existing && existing.id !== userId) {
        return { error: `The email "${cleanEmail}" is already registered to another account.` };
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: cleanName,
        email: cleanEmail,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_USER_INFO',
        entity: 'User',
        entityId: userId,
        payload: {
          previousName: targetUser.name,
          newName: cleanName,
          previousEmail: targetUser.email,
          newEmail: cleanEmail,
          role: targetUser.role,
        },
      },
    });

    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `User information updated successfully for ${cleanName} (${cleanEmail}).`,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
      },
    };
  } catch (err) {
    return { error: `Failed to update user information: ${(err as Error).message}` };
  }
}
