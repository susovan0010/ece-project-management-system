// ========================================================
// ECE Capstone Project Management System - HOD Authority Unit Tests
// Verifies HOD assignment by Super Admin, mutual agreement HOD removal flow,
// HOD supreme authority over Super Admin assignment, role transfers, and removals.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  getHodAuthorityDataAction,
  assignHodAction,
  requestHodRemovalAction,
  cancelHodRemovalRequestAction,
  respondToHodRemovalAction,
  assignSuperAdminAction,
  hodTransferUserRoleAction,
  hodRemoveAdminAction,
} from '../app/actions/hod-authority';
import {
  HITK_ECE_AUTHORITY_ID,
  getOrCreateDepartmentAuthority,
  resolveUserAuthority,
} from '../lib/authority-service';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('HOD & Super Admin Governance Hierarchy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.user, 'findUnique').mockImplementation(async ({ where }: any) => {
      return {
        id: where.id || 'usr-mock',
        email: where.email || 'mock@heritageit.edu',
        name: 'Mock Member',
        role: 'ADMIN',
        createdAt: new Date(),
      } as any;
    });
  });

  describe('Authority Resolution & Lazy Initialization', () => {
    it('initializes DepartmentAuthority with default super admin if record does not exist', async () => {
      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: 'super-admin-1',
        email: 'susovan.mandal@heritageit.edu',
        name: 'Dr. Susovan Mandal',
        role: 'ADMIN',
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'upsert').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: null,
        hodRemovalRequested: false,
        hodRemovalRequestedAt: null,
      } as any);

      const authority = await getOrCreateDepartmentAuthority();
      expect(authority.superAdminUserId).toBe('super-admin-1');
      expect(authority.hodUserId).toBeNull();
    });

    it('correctly resolves authority levels for HOD, Super Admin, and Standard Admin', async () => {
      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'hod-user-1',
        hodRemovalRequested: false,
        hodRemovalRequestedAt: null,
      } as any);

      const hodLevel = await resolveUserAuthority({ id: 'hod-user-1', role: 'ADMIN' });
      expect(hodLevel).toBe('HOD');

      const superLevel = await resolveUserAuthority({ id: 'super-admin-1', role: 'ADMIN' });
      expect(superLevel).toBe('SUPER_ADMIN');

      const standardLevel = await resolveUserAuthority({ id: 'standard-admin-1', role: 'ADMIN' });
      expect(standardLevel).toBe('STANDARD_ADMIN');

      const facultyLevel = await resolveUserAuthority({ id: 'fac-1', role: 'FACULTY' });
      expect(facultyLevel).toBe('FACULTY');
    });
  });

  describe('Super Admin assigning HOD', () => {
    it('rejects non-Super-Admin from assigning HOD', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'standard-admin-1', email: 'admin@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: null,
      } as any);

      const res = await assignHodAction('cand-1');
      expect(res.error).toContain('Only Super Admin Type A can assign the Head of Department');
    });

    it('allows Super Admin to assign HOD and elevates their role to ADMIN', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'super-admin-1', email: 'susovan.mandal@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: null,
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'prof-hod',
        name: 'Prof. Department Head',
        email: 'hod@heritageit.edu',
        role: 'FACULTY',
      } as any);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'prof-hod',
        role: 'ADMIN',
      } as any);

      const upsertAuthSpy = vi.spyOn(prisma.departmentAuthority, 'upsert').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        hodUserId: 'prof-hod',
        superAdminUserId: 'super-admin-1',
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-1' } as any);

      const res = await assignHodAction('prof-hod');
      expect(res.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'prof-hod' },
        data: { role: 'ADMIN' },
      });
      expect(upsertAuthSpy).toHaveBeenCalled();
    });
  });

  describe('Mutual Agreement Flow for HOD Removal', () => {
    it('allows Super Admin to initiate HOD removal request', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'super-admin-1', email: 'susovan.mandal@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
        hodRemovalRequested: false,
      } as any);

      const updateAuthSpy = vi.spyOn(prisma.departmentAuthority, 'update').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        hodRemovalRequested: true,
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-2' } as any);

      const res = await requestHodRemovalAction();
      expect(res.success).toBe(true);
      expect(res.message).toContain('HOD must confirm agreement');
      expect(updateAuthSpy).toHaveBeenCalled();
    });

    it('rejects non-HOD from responding to removal request', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'someone-else', email: 'other@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
        hodRemovalRequested: true,
      } as any);

      const res = await respondToHodRemovalAction(true);
      expect(res.error).toContain('Only the current HOD can respond');
    });

    it('clears HOD assignment when HOD agrees to step down', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'prof-hod', email: 'hod@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
        hodRemovalRequested: true,
      } as any);

      const updateAuthSpy = vi.spyOn(prisma.departmentAuthority, 'update').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        hodUserId: null,
        hodRemovalRequested: false,
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-3' } as any);

      const res = await respondToHodRemovalAction(true);
      expect(res.success).toBe(true);
      expect(updateAuthSpy).toHaveBeenCalledWith({
        where: { id: HITK_ECE_AUTHORITY_ID },
        data: {
          hodUserId: null,
          hodRemovalRequested: false,
          hodRemovalRequestedAt: null,
        },
      });
    });

    it('keeps HOD in office when HOD declines the removal request', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'prof-hod', email: 'hod@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
        hodRemovalRequested: true,
      } as any);

      const updateAuthSpy = vi.spyOn(prisma.departmentAuthority, 'update').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        hodRemovalRequested: false,
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-4' } as any);

      const res = await respondToHodRemovalAction(false);
      expect(res.success).toBe(true);
      expect(res.message).toContain('You remain as Head of Department');
      expect(updateAuthSpy).toHaveBeenCalledWith({
        where: { id: HITK_ECE_AUTHORITY_ID },
        data: {
          hodRemovalRequested: false,
          hodRemovalRequestedAt: null,
        },
      });
    });
  });

  describe('HOD Supreme Governance over Super Admin & Members', () => {
    it('allows HOD to assign/change Super Admin Type A to any member', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'prof-hod', email: 'hod@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'new-super-admin',
        name: 'Dr. New Super Admin',
        email: 'newsuper@heritageit.edu',
        role: 'FACULTY',
      } as any);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'new-super-admin',
        role: 'ADMIN',
      } as any);

      const updateAuthSpy = vi.spyOn(prisma.departmentAuthority, 'update').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'new-super-admin',
      } as any);

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-5' } as any);

      const res = await assignSuperAdminAction('new-super-admin');
      expect(res.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'new-super-admin' },
        data: { role: 'ADMIN' },
      });
      expect(updateAuthSpy).toHaveBeenCalledWith({
        where: { id: HITK_ECE_AUTHORITY_ID },
        data: { superAdminUserId: 'new-super-admin' },
      });
    });

    it('rejects non-HOD from reassigning Super Admin Type A', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'super-admin-1', email: 'susovan.mandal@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
      } as any);

      const res = await assignSuperAdminAction('some-user');
      expect(res.error).toContain('Only the Head of Department (HOD) can assign Super Admin Type A');
    });

    it('allows HOD to remove any committee admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'prof-hod', email: 'hod@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'admin-to-delete',
        name: 'Mistaken Admin',
        email: 'mistaken@heritageit.edu',
        role: 'ADMIN',
      } as any);

      vi.spyOn(prisma.topic, 'updateMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(prisma.markEntry, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(prisma.group, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      vi.spyOn(prisma.auditLog, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const deleteUserSpy = vi.spyOn(prisma.user, 'delete').mockResolvedValue({ id: 'admin-to-delete' } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-6' } as any);

      const res = await hodRemoveAdminAction('admin-to-delete');
      expect(res.success).toBe(true);
      expect(deleteUserSpy).toHaveBeenCalledWith({ where: { id: 'admin-to-delete' } });
    });

    it('allows HOD to transfer any user between FACULTY and ADMIN', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'prof-hod', email: 'hod@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.departmentAuthority, 'findUnique').mockResolvedValue({
        id: HITK_ECE_AUTHORITY_ID,
        superAdminUserId: 'super-admin-1',
        hodUserId: 'prof-hod',
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-1',
        name: 'Member',
        email: 'member@heritageit.edu',
        role: 'FACULTY',
      } as any);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u-1',
        role: 'ADMIN',
      } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-7' } as any);

      const res = await hodTransferUserRoleAction('u-1', 'ADMIN');
      expect(res.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { role: 'ADMIN' },
      });
    });
  });
});
