'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  HITK_ECE_AUTHORITY_ID,
  getOrCreateDepartmentAuthority,
  resolveUserAuthority,
} from '@/lib/authority-service';
import { AuthorityLevel } from '@/lib/admin-priority';

export interface HodAuthorityDataResponse {
  success?: boolean;
  error?: string;
  authorityId?: string;
  hodUserId?: string | null;
  hodUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  } | null;
  superAdminUserId?: string;
  superAdminUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  } | null;
  hodRemovalRequested?: boolean;
  hodRemovalRequestedAt?: string | null;
  callerAuthorityLevel?: AuthorityLevel;
  candidates?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
}

/**
 * 1. Fetch current Department Authority and candidate lists.
 */
export async function getHodAuthorityDataAction(): Promise<HodAuthorityDataResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthorityLevel = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    const authority = await getOrCreateDepartmentAuthority();

    // Fetch active candidates for HOD / Super Admin assignment
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return {
      success: true,
      authorityId: authority.authorityId,
      hodUserId: authority.hodUserId,
      hodUser: authority.hodUser
        ? {
            id: authority.hodUser.id,
            name: authority.hodUser.name,
            email: authority.hodUser.email,
            role: authority.hodUser.role,
            createdAt: authority.hodUser.createdAt.toISOString(),
          }
        : null,
      superAdminUserId: authority.superAdminUserId,
      superAdminUser: authority.superAdminUser
        ? {
            id: authority.superAdminUser.id,
            name: authority.superAdminUser.name,
            email: authority.superAdminUser.email,
            role: authority.superAdminUser.role,
            createdAt: authority.superAdminUser.createdAt.toISOString(),
          }
        : null,
      hodRemovalRequested: authority.hodRemovalRequested,
      hodRemovalRequestedAt: authority.hodRemovalRequestedAt
        ? authority.hodRemovalRequestedAt.toISOString()
        : null,
      callerAuthorityLevel,
      candidates: users,
    };
  } catch (err) {
    return { error: `Failed to load authority data: ${(err as Error).message}` };
  }
}

/**
 * 2. Super Admin assigns an HOD from faculty or existing admins.
 */
export async function assignHodAction(targetUserId: string): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'SUPER_ADMIN' && callerAuthority !== 'HOD') {
      return { error: 'Permission denied: Only Super Admin Type A can assign the Head of Department (HOD).' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return { error: 'Target user not found in the department directory.' };
    }

    // Elevate user to ADMIN if currently FACULTY so they have dashboard access
    if (targetUser.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { role: 'ADMIN' },
      });
    }

    await prisma.departmentAuthority.upsert({
      where: { id: HITK_ECE_AUTHORITY_ID },
      update: {
        hodUserId: targetUserId,
        hodRemovalRequested: false,
        hodRemovalRequestedAt: null,
      },
      create: {
        id: HITK_ECE_AUTHORITY_ID,
        hodUserId: targetUserId,
        superAdminUserId: session.user.id,
        hodRemovalRequested: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ASSIGN_HOD',
        entity: 'DepartmentAuthority',
        entityId: targetUserId,
        payload: {
          assignedHodName: targetUser.name,
          assignedHodEmail: targetUser.email,
        },
      },
    });

    revalidatePath('/admin/assign-hod');
    revalidatePath('/admin/assign-super-admin');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `${targetUser.name} (${targetUser.email}) has been assigned as Head of Department (HOD).`,
    };
  } catch (err) {
    return { error: `Failed to assign HOD: ${(err as Error).message}` };
  }
}

/**
 * 3. Super Admin requests removal of the current HOD (requires HOD agreement).
 */
export async function requestHodRemovalAction(): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'SUPER_ADMIN') {
      return { error: 'Permission denied: Only Super Admin Type A can initiate HOD removal.' };
    }

    const authority = await getOrCreateDepartmentAuthority();
    if (!authority.hodUserId) {
      return { error: 'No HOD is currently assigned to remove.' };
    }

    await prisma.departmentAuthority.update({
      where: { id: HITK_ECE_AUTHORITY_ID },
      data: {
        hodRemovalRequested: true,
        hodRemovalRequestedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'REQUEST_HOD_REMOVAL',
        entity: 'DepartmentAuthority',
        entityId: authority.hodUserId,
        payload: {
          hodUserId: authority.hodUserId,
          requestedAt: new Date().toISOString(),
        },
      },
    });

    revalidatePath('/admin/assign-hod');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: 'Removal request submitted. As required by policy, the HOD must confirm agreement before removal is completed.',
    };
  } catch (err) {
    return { error: `Failed to request HOD removal: ${(err as Error).message}` };
  }
}

/**
 * 4. Cancel a pending HOD removal request.
 */
export async function cancelHodRemovalRequestAction(): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'SUPER_ADMIN' && callerAuthority !== 'HOD') {
      return { error: 'Permission denied to cancel HOD removal request.' };
    }

    await prisma.departmentAuthority.update({
      where: { id: HITK_ECE_AUTHORITY_ID },
      data: {
        hodRemovalRequested: false,
        hodRemovalRequestedAt: null,
      },
    });

    revalidatePath('/admin/assign-hod');
    revalidatePath('/admin/dashboard');

    return { success: true, message: 'HOD removal request has been cancelled.' };
  } catch (err) {
    return { error: `Failed to cancel removal request: ${(err as Error).message}` };
  }
}

/**
 * 5. HOD responds to removal request (Mutual Agreement Workflow).
 */
export async function respondToHodRemovalAction(agree: boolean): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const authority = await getOrCreateDepartmentAuthority();
    if (authority.hodUserId !== session.user.id) {
      return { error: 'Permission denied: Only the current HOD can respond to this removal request.' };
    }

    if (!agree) {
      await prisma.departmentAuthority.update({
        where: { id: HITK_ECE_AUTHORITY_ID },
        data: {
          hodRemovalRequested: false,
          hodRemovalRequestedAt: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'HOD_DECLINED_REMOVAL',
          entity: 'DepartmentAuthority',
          entityId: authority.hodUserId,
          payload: { agreed: false },
        },
      });

      revalidatePath('/admin/assign-hod');
      revalidatePath('/admin/dashboard');

      return {
        success: true,
        message: 'You have declined the removal request. You remain as Head of Department (HOD).',
      };
    }

    // HOD agreed: clear HOD assignment
    await prisma.departmentAuthority.update({
      where: { id: HITK_ECE_AUTHORITY_ID },
      data: {
        hodUserId: null,
        hodRemovalRequested: false,
        hodRemovalRequestedAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOD_AGREED_REMOVAL',
        entity: 'DepartmentAuthority',
        entityId: session.user.id,
        payload: { agreed: true },
      },
    });

    revalidatePath('/admin/assign-hod');
    revalidatePath('/admin/assign-super-admin');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: 'You have agreed to step down. HOD assignment has been cleared.',
    };
  } catch (err) {
    return { error: `Failed to process HOD response: ${(err as Error).message}` };
  }
}

/**
 * 6. HOD assigns a new Super Admin Type A from faculty or existing admins.
 */
export async function assignSuperAdminAction(targetUserId: string): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'HOD') {
      return { error: 'Permission denied: Only the Head of Department (HOD) can assign Super Admin Type A.' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return { error: 'Target user not found in the department directory.' };
    }

    // Ensure new Super Admin has ADMIN role
    if (targetUser.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { role: 'ADMIN' },
      });
    }

    await prisma.departmentAuthority.update({
      where: { id: HITK_ECE_AUTHORITY_ID },
      data: {
        superAdminUserId: targetUserId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'REASSIGN_SUPER_ADMIN',
        entity: 'DepartmentAuthority',
        entityId: targetUserId,
        payload: {
          newSuperAdminName: targetUser.name,
          newSuperAdminEmail: targetUser.email,
        },
      },
    });

    revalidatePath('/admin/assign-super-admin');
    revalidatePath('/admin/assign-hod');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `${targetUser.name} (${targetUser.email}) has been assigned as Super Admin Type A.`,
    };
  } catch (err) {
    return { error: `Failed to reassign Super Admin: ${(err as Error).message}` };
  }
}

/**
 * 7. HOD transfers any member between ADMIN and FACULTY roles.
 */
export async function hodTransferUserRoleAction(targetUserId: string, newRole: 'ADMIN' | 'FACULTY'): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'HOD') {
      return { error: 'Permission denied: Only the Head of Department (HOD) can perform this role transfer.' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return { error: 'Target user not found.' };
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOD_TRANSFER_USER_ROLE',
        entity: 'User',
        entityId: targetUserId,
        payload: { previousRole: targetUser.role, newRole },
      },
    });

    revalidatePath('/admin/assign-super-admin');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `User ${targetUser.name} has been transferred to ${newRole === 'ADMIN' ? 'Committee Admin' : 'Faculty Supervisor'}.`,
    };
  } catch (err) {
    return { error: `Failed to transfer user role: ${(err as Error).message}` };
  }
}

/**
 * 8. HOD removes any admin (including Super Admin).
 */
export async function hodRemoveAdminAction(targetUserId: string): Promise<{ success?: boolean; error?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: 'Unauthorized: You must be signed in.' };
    }

    const callerAuthority = await resolveUserAuthority({
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string })?.role,
    });

    if (callerAuthority !== 'HOD') {
      return { error: 'Permission denied: Only the Head of Department (HOD) can remove committee members with supreme priority.' };
    }

    if (targetUserId === session.user.id) {
      return { error: 'Operation rejected: You cannot remove your own HOD account. Use the step down process.' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return { error: 'Target admin user not found.' };
    }

    const authority = await getOrCreateDepartmentAuthority();

    // If removing the current Super Admin, reassign Super Admin to the HOD or another admin
    if (authority.superAdminUserId === targetUserId) {
      await prisma.departmentAuthority.update({
        where: { id: HITK_ECE_AUTHORITY_ID },
        data: { superAdminUserId: session.user.id },
      });
    }

    // Clean up dependencies
    await prisma.topic.updateMany({
      where: { proposerId: targetUserId },
      data: { proposerId: null },
    });
    await prisma.markEntry.deleteMany({
      where: { enteredById: targetUserId },
    });
    await prisma.group.deleteMany({
      where: { supervisorId: targetUserId },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: targetUserId },
    });

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOD_REMOVE_ADMIN',
        entity: 'User',
        entityId: targetUserId,
        payload: {
          removedAdminName: targetUser.name,
          removedAdminEmail: targetUser.email,
          removedByHOD: true,
        },
      },
    });

    revalidatePath('/admin/assign-super-admin');
    revalidatePath('/admin/faculty');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `Admin ${targetUser.name} (${targetUser.email}) has been removed by the Head of Department (HOD).`,
    };
  } catch (err) {
    return { error: `Failed to remove admin: ${(err as Error).message}` };
  }
}
