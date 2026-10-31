// ========================================================
// ECE Capstone Project Management System - Admin Directory Unit Tests
// Verifies that each Admin can view the list of other Admins,
// list of Supervisors, and list of Students with their corresponding groups.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { getAdminDirectoryDataAction } from '../app/actions/admin-directory';
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
});
