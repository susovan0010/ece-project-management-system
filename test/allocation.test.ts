// ========================================================
// ECE Capstone Project Management System - Allocation Unit Tests
// Verifies foreign key validation (topics & supervisors),
// role isolation (Faculty vs Admin), and supervisor group filtering.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  validateAllocationDataAction,
  commitAllocationChunkAction,
  getAllocationSummaryAction,
  RawAllocationRow,
} from '../app/actions/allocation';
import { getMyFacultyGroupsAction } from '../app/actions/faculty-groups';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Allocation Engine: Pre-flight Foreign Key Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to validate allocations', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await validateAllocationDataAction([]);
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error).toContain('Unauthorized');
    }
  });

  it('rejects FACULTY user from running allocation validation (Admin only)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', email: 'prof@heritageit.edu' },
    } as any);

    const res = await validateAllocationDataAction([]);
    expect('error' in res).toBe(true);
  });

  it('flags missing topics and unregistered supervisors', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    // Mock DB finds topic SIH26001 but NOT UGR-999
    vi.spyOn(prisma.topic, 'findMany').mockResolvedValue([
      { code: 'SIH26001' } as any,
    ]);

    // Mock DB finds supervisor soumyo@heritageit.edu but NOT unknown@heritageit.edu
    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      { email: 'soumyo@heritageit.edu' } as any,
    ]);

    const rows: RawAllocationRow[] = [
      {
        groupNumber: 1,
        batchId: '2023-2027',
        topicCode: 'SIH26001',
        supervisorEmail: 'soumyo@heritageit.edu',
        studentRoll: '12623001001',
        studentName: 'Arijit Sen',
      },
      {
        groupNumber: 2,
        batchId: '2023-2027',
        topicCode: 'UGR-999', // Missing
        supervisorEmail: 'unknown@heritageit.edu', // Missing
        studentRoll: '12623001002',
        studentName: 'Debayan Das',
      },
    ];

    const report = await validateAllocationDataAction(rows);
    expect('error' in report).toBe(false);
    if (!('error' in report)) {
      expect(report.totalRows).toBe(2);
      expect(report.validRowsCount).toBe(1);
      expect(report.invalidRowsCount).toBe(1);
      expect(report.missingTopics).toContain('UGR-999');
      expect(report.missingSupervisors).toContain('unknown@heritageit.edu');
    }
  });
});

describe('Faculty Groups: Strict Supervisor Isolation (Rule 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries groups strictly by signed-in supervisor ID', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-123', role: 'FACULTY', email: 'soumyo@heritageit.edu' },
    } as any);

    const mockFindMany = vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        topic: { id: 'top-1', code: 'SIH26001', title: 'Smart Solar', category: 'Hardware', description: 'Desc', status: 'ALLOTTED' },
        members: [
          {
            student: { id: 's-1', name: 'Arijit Sen', roll: '12623001001', email: 'a@gmail.com', phone: '123' },
          },
        ],
        markEntries: [],
      } as any,
    ]);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([
      { id: '2023-2027', active: true } as any,
    ]);

    const res = await getMyFacultyGroupsAction();
    expect(res.error).toBeUndefined();
    expect(res.groups?.length).toBe(1);

    // Verify Prisma query was strictly filtered by supervisorId
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supervisorId: 'supervisor-123',
        }),
      })
    );
  });
});
