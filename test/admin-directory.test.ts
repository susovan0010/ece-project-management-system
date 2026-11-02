// ========================================================
// ECE Capstone Project Management System - Admin Directory Unit Tests
// Verifies that each Admin can view the list of other Admins,
// list of Supervisors, and list of Students with their corresponding groups.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  getAdminDirectoryDataAction,
  removeSupervisorAction,
  removeStudentAction,
  removeAdminAction,
  transferUserRoleAction,
  updateUserInformationAction,
  isPriorityAAdmin,
  PRIORITY_A_ADMIN_EMAIL,
} from '../app/actions/admin-directory';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Admin Directory: Admins, Supervisors, and Students with Groups', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to view department directories', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await getAdminDirectoryDataAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY users from viewing admin department directories', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    const res = await getAdminDirectoryDataAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });

  it('returns lists of admins, supervisors, and students with their corresponding groups for ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'adm-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.user, 'findMany')
      .mockResolvedValueOnce([
        {
          id: 'adm-1',
          name: 'Committee Chair',
          email: 'chair@heritageit.edu',
          active: true,
          mustChangePassword: false,
          createdAt: new Date('2026-01-10T00:00:00Z'),
        },
        {
          id: 'adm-2',
          name: 'Committee Co-Chair',
          email: 'cochair@heritageit.edu',
          active: true,
          mustChangePassword: true,
          createdAt: new Date('2026-01-12T00:00:00Z'),
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 'sup-1',
          name: 'Dr. Subhashish Roy',
          email: 'subhashish@heritageit.edu',
          active: true,
          mustChangePassword: false,
          createdAt: new Date('2026-01-15T00:00:00Z'),
          _count: { topics: 3 },
          groups: [
            {
              id: 'grp-1',
              number: 1,
              batchId: '2023-2027',
              topic: { code: 'SIH26001', title: 'Smart Solar Telemetry' },
            },
          ],
        },
      ] as any);

    vi.spyOn(prisma.student, 'findMany').mockResolvedValue([
      {
        id: 'st-1',
        roll: '12623001001',
        name: 'Arijit Sen',
        email: 'arijit@gmail.com',
        phone: '+919876543210',
        groups: [
          {
            group: {
              id: 'grp-1',
              number: 1,
              batchId: '2023-2027',
              topic: { code: 'SIH26001', title: 'Smart Solar Telemetry' },
              supervisor: { name: 'Dr. Subhashish Roy', email: 'subhashish@heritageit.edu' },
            },
          },
        ],
      },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);
    vi.spyOn(prisma.topic, 'count')
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(10);
    vi.spyOn(prisma.group, 'count').mockResolvedValue(1);

    const res = await getAdminDirectoryDataAction('ALL');
    expect(res.error).toBeUndefined();
    expect(res.admins).toHaveLength(2);
    expect(res.supervisors).toHaveLength(1);
    expect(res.supervisors![0].groups).toHaveLength(1);
    expect(res.students).toHaveLength(1);
    expect(res.students![0]).toMatchObject({
      roll: '12623001001',
      name: 'Arijit Sen',
      groupNumber: 1,
      batchId: '2023-2027',
      topicCode: 'SIH26001',
      supervisorName: 'Dr. Subhashish Roy',
    });
  });

  it('rejects non-ADMIN from removing a supervisor or student', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    const supRes = await removeSupervisorAction('sup-1');
    expect(supRes.error).toContain('Only Project Committee Admins');

    const stuRes = await removeStudentAction('st-1');
    expect(stuRes.error).toContain('Only Project Committee Admins');
  });

  it('allows ADMIN to remove a supervisor and cleans up associated relations', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'adm-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'sup-1',
      name: 'Dr. Subhashish Roy',
      email: 'subhashish@heritageit.edu',
      role: 'FACULTY',
    } as any);

    const updateTopicsSpy = vi.spyOn(prisma.topic, 'updateMany').mockResolvedValue({ count: 1 } as any);
    const deleteMarksSpy = vi.spyOn(prisma.markEntry, 'deleteMany').mockResolvedValue({ count: 0 } as any);
    const deleteGroupsSpy = vi.spyOn(prisma.group, 'deleteMany').mockResolvedValue({ count: 1 } as any);
    const deleteLogsSpy = vi.spyOn(prisma.auditLog, 'deleteMany').mockResolvedValue({ count: 0 } as any);
    const deleteUserSpy = vi.spyOn(prisma.user, 'delete').mockResolvedValue({ id: 'sup-1' } as any);
    const createAuditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-1' } as any);

    const res = await removeSupervisorAction('sup-1');
    expect(res.success).toBe(true);
    expect(updateTopicsSpy).toHaveBeenCalledWith({
      where: { proposerId: 'sup-1' },
      data: { proposerId: null },
    });
    expect(deleteMarksSpy).toHaveBeenCalled();
    expect(deleteGroupsSpy).toHaveBeenCalled();
    expect(deleteLogsSpy).toHaveBeenCalled();
    expect(deleteUserSpy).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(createAuditSpy).toHaveBeenCalled();
  });

  it('allows ADMIN to remove any student', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'adm-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.student, 'findUnique').mockResolvedValue({
      id: 'st-1',
      name: 'Arijit Sen',
      roll: '12623001001',
      email: 'arijit@gmail.com',
    } as any);

    const deleteStudentSpy = vi.spyOn(prisma.student, 'delete').mockResolvedValue({ id: 'st-1' } as any);
    const createAuditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-2' } as any);

    const res = await removeStudentAction('st-1');
    expect(res.success).toBe(true);
    expect(deleteStudentSpy).toHaveBeenCalledWith({ where: { id: 'st-1' } });
    expect(createAuditSpy).toHaveBeenCalled();
  });

  describe('Admin Priority System (Type A and Type B)', () => {
    it('correctly identifies Priority A admin by email', () => {
      expect(isPriorityAAdmin('susovan.mandal@heritageit.edu')).toBe(true);
      expect(isPriorityAAdmin('SUSOVAN.MANDAL@HERITAGEIT.EDU')).toBe(true);
      expect(isPriorityAAdmin('  susovan.mandal@heritageit.edu  ')).toBe(true);
      expect(isPriorityAAdmin('other.admin@heritageit.edu')).toBe(false);
      expect(isPriorityAAdmin(null)).toBe(false);
      expect(isPriorityAAdmin(undefined)).toBe(false);
    });

    it('returns priority tag A for susovan.mandal@heritageit.edu and B for others', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-super', email: PRIORITY_A_ADMIN_EMAIL, role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.user, 'findMany')
        .mockResolvedValueOnce([
          {
            id: 'adm-super',
            name: 'Dr. Susovan Mandal',
            email: 'susovan.mandal@heritageit.edu',
            active: true,
            mustChangePassword: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'adm-standard',
            name: 'Standard Admin',
            email: 'standard.admin@heritageit.edu',
            active: true,
            mustChangePassword: false,
            createdAt: new Date('2026-01-05T00:00:00Z'),
          },
        ] as any)
        .mockResolvedValueOnce([] as any);

      vi.spyOn(prisma.student, 'findMany').mockResolvedValue([] as any);
      vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([] as any);
      vi.spyOn(prisma.topic, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.group, 'count').mockResolvedValue(0);

      const res = await getAdminDirectoryDataAction('ALL');
      expect(res.error).toBeUndefined();
      expect(res.currentUserPriority).toBe('A');
      expect(res.admins).toHaveLength(2);
      expect(res.admins![0].priority).toBe('A');
      expect(res.admins![1].priority).toBe('B');
    });

    it('rejects Priority B admin from removing any admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-b', email: 'standard.admin@heritageit.edu', role: 'ADMIN' },
      } as any);

      const res = await removeAdminAction('adm-other');
      expect(res.error).toContain('Only Priority A Admin');
    });

    it('rejects Priority A admin from removing themselves or the primary Priority A admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-super', email: PRIORITY_A_ADMIN_EMAIL, role: 'ADMIN' },
      } as any);

      // Self-removal
      const selfRes = await removeAdminAction('adm-super');
      expect(selfRes.error).toContain('remove your own admin account');

      // Attempting to remove primary priority A admin
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'adm-super-id-2',
        email: 'susovan.mandal@heritageit.edu',
        role: 'ADMIN',
      } as any);

      const superRes = await removeAdminAction('adm-super-id-2');
      expect(superRes.error).toContain('Priority A Admin account cannot be removed');
    });

    it('allows Priority A admin to remove a mistakenly added Priority B admin with complete cleanup', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-super', email: PRIORITY_A_ADMIN_EMAIL, role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'adm-target',
        name: 'Mistaken Admin',
        email: 'mistaken.admin@heritageit.edu',
        role: 'ADMIN',
      } as any);

      const updateTopicsSpy = vi.spyOn(prisma.topic, 'updateMany').mockResolvedValue({ count: 0 } as any);
      const deleteMarksSpy = vi.spyOn(prisma.markEntry, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const deleteGroupsSpy = vi.spyOn(prisma.group, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const deleteLogsSpy = vi.spyOn(prisma.auditLog, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const deleteUserSpy = vi.spyOn(prisma.user, 'delete').mockResolvedValue({ id: 'adm-target' } as any);
      const createAuditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-rem-adm' } as any);

      const res = await removeAdminAction('adm-target');
      expect(res.success).toBe(true);
      expect(deleteUserSpy).toHaveBeenCalledWith({ where: { id: 'adm-target' } });
      expect(createAuditSpy).toHaveBeenCalled();
    });

    it('rejects Priority B admin from transferring a faculty member into an admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-b', email: 'standard.admin@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'fac-1',
        name: 'Prof. X',
        email: 'prof.x@heritageit.edu',
        role: 'FACULTY',
      } as any);

      const res = await transferUserRoleAction('fac-1', 'ADMIN');
      expect(res.error).toContain('Only Priority A Admin');
    });

    it('allows an admin to transfer themselves into a Faculty Supervisor', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-b', email: 'standard.admin@heritageit.edu', role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'adm-b',
        name: 'Standard Admin',
        email: 'standard.admin@heritageit.edu',
        role: 'ADMIN',
      } as any);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'adm-b',
        role: 'FACULTY',
      } as any);
      const createAuditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-transfer' } as any);

      const res = await transferUserRoleAction('adm-b', 'FACULTY');
      expect(res.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'adm-b' },
        data: { role: 'FACULTY' },
      });
      expect(createAuditSpy).toHaveBeenCalled();
    });

    it('allows Priority A admin to transfer faculty supervisor into admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-super', email: PRIORITY_A_ADMIN_EMAIL, role: 'ADMIN' },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'fac-1',
        name: 'Dr. Faculty',
        email: 'faculty@heritageit.edu',
        role: 'FACULTY',
      } as any);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'fac-1',
        role: 'ADMIN',
      } as any);
      const createAuditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-transfer-2' } as any);

      const res = await transferUserRoleAction('fac-1', 'ADMIN');
      expect(res.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'fac-1' },
        data: { role: 'ADMIN' },
      });
      expect(createAuditSpy).toHaveBeenCalled();
    });

    it('allows updating user information (name and email) with validation and uniqueness checks', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'adm-super', email: PRIORITY_A_ADMIN_EMAIL, role: 'ADMIN' },
      } as any);

      // Existing user lookup
      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce({
          id: 'u-1',
          name: 'Old Name',
          email: 'old@heritageit.edu',
          role: 'FACULTY',
        } as any)
        .mockResolvedValueOnce({
          id: 'u-other',
          email: 'taken@heritageit.edu',
          role: 'FACULTY',
        } as any);

      const duplicateRes = await updateUserInformationAction({
        userId: 'u-1',
        name: 'New Name',
        email: 'taken@heritageit.edu',
      });
      expect(duplicateRes.error).toContain('already registered');

      // Valid update
      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce({
          id: 'u-1',
          name: 'Old Name',
          email: 'old@heritageit.edu',
          role: 'FACULTY',
        } as any)
        .mockResolvedValueOnce(null);

      const updateUserSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'u-1',
        name: 'Dr. New Name',
        email: 'new.email@heritageit.edu',
        role: 'FACULTY',
      } as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({ id: 'log-edit' } as any);

      const successRes = await updateUserInformationAction({
        userId: 'u-1',
        name: 'Dr. New Name',
        email: 'new.email@heritageit.edu',
      });
      expect(successRes.success).toBe(true);
      expect(updateUserSpy).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { name: 'Dr. New Name', email: 'new.email@heritageit.edu' },
      });
    });
  });
});
