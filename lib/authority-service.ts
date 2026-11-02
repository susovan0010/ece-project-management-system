// ========================================================
// ECE Capstone Project Management System
// Department Authority & Governance Service (Server-Side)
// ========================================================

import { prisma } from '@/lib/prisma';
import { DEFAULT_SUPER_ADMIN_EMAIL, AuthorityLevel } from '@/lib/admin-priority';

export const HITK_ECE_AUTHORITY_ID = 'HITK_ECE_AUTHORITY';

export interface AuthorityStatus {
  authorityId: string;
  hodUserId: string | null;
  hodUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
  } | null;
  superAdminUserId: string;
  superAdminUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
  } | null;
  hodRemovalRequested: boolean;
  hodRemovalRequestedAt: Date | null;
}

/**
 * Retrieves or lazily initializes the singleton DepartmentAuthority record.
 * Guarantees that superAdminUserId is initially linked to susovan.mandal@heritageit.edu
 * (or the first available Admin user).
 */
export async function getOrCreateDepartmentAuthority(): Promise<AuthorityStatus> {
  let authority = await prisma.departmentAuthority.findUnique({
    where: { id: HITK_ECE_AUTHORITY_ID },
  });

  if (!authority) {
    // Locate the primary super admin
    const primaryAdmin =
      (await prisma.user.findUnique({
        where: { email: DEFAULT_SUPER_ADMIN_EMAIL },
      })) ||
      (await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' },
      }));

    const superAdminId = primaryAdmin?.id || 'pending-super-admin-seed';

    authority = await prisma.departmentAuthority.upsert({
      where: { id: HITK_ECE_AUTHORITY_ID },
      update: {},
      create: {
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: superAdminId,
        hodUserId: null,
        hodRemovalRequested: false,
      },
    });
  }

  // Load user profiles for HOD and Super Admin
  const hodUser = authority.hodUserId
    ? await prisma.user.findUnique({
        where: { id: authority.hodUserId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      })
    : null;

  const superAdminUser = authority.superAdminUserId
    ? await prisma.user.findUnique({
        where: { id: authority.superAdminUserId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      })
    : null;

  return {
    authorityId: authority.id,
    hodUserId: authority.hodUserId,
    hodUser,
    superAdminUserId: authority.superAdminUserId,
    superAdminUser,
    hodRemovalRequested: authority.hodRemovalRequested,
    hodRemovalRequestedAt: authority.hodRemovalRequestedAt,
  };
}

/**
 * Resolves the hierarchical authority level for a given user.
 */
export async function resolveUserAuthority(user: {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}): Promise<AuthorityLevel> {
  if (!user.id && !user.email) return 'FACULTY';

  const auth = await getOrCreateDepartmentAuthority();

  if (user.id && auth.hodUserId === user.id) {
    return 'HOD';
  }

  if (user.id && auth.superAdminUserId === user.id) {
    return 'SUPER_ADMIN';
  }

  if (
    user.email &&
    user.email.toLowerCase().trim() === DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase()
  ) {
    return 'SUPER_ADMIN';
  }

  if (user.role === 'ADMIN') {
    return 'STANDARD_ADMIN';
  }

  return 'FACULTY';
}
