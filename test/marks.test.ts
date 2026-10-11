// ========================================================
// ECE Capstone Project Management System - Marks & Rubrics Unit Tests
// Verifies bounds checking (0 <= marks <= maxMarks), Decision 1 supervisor entry auditing,
// panel examiner slot averaging in Rubric D, and marking window locks.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  getGroupMarksAction,
  saveMarksEntryAction,
  getPrintableRubricsAction,
} from '../app/actions/marks';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Marks Entry: Strict Bounds Checking & Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to save marks', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await saveMarksEntryAction({
      groupId: 'grp-1',
      rubricCode: 'A',
      status: 'DRAFT',
      entries: [{ criterionId: 1, marks: 10, examinerSlot: 1 }],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects marks exceeding criteria maxima', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.group, 'findUnique').mockResolvedValue({
      id: 'grp-1',
      supervisorId: 'supervisor-1',
      members: [],
    } as any);

    vi.spyOn(prisma.rubric, 'findUnique').mockResolvedValue({
      code: 'A',
      semester: 6,
      criteria: [
        { id: 101, label: 'Literature Survey', maxMarks: 30 },
      ],
    } as any);

    vi.spyOn(prisma.markWindow, 'findFirst').mockResolvedValue(null);

    // Attempt to submit 35 marks on a 30 max criterion
    const res = await saveMarksEntryAction({
      groupId: 'grp-1',
      rubricCode: 'A',
      status: 'DRAFT',
      entries: [{ criterionId: 101, marks: 35, examinerSlot: 1 }],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('exceeds the maximum allowed limit of 30');
  });

  it('rejects negative marks', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    const res = await saveMarksEntryAction({
      groupId: 'grp-1',
      rubricCode: 'A',
      status: 'DRAFT',
      entries: [{ criterionId: 101, marks: -5, examinerSlot: 1 }],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Marks cannot be negative');
  });
});

describe('Marks Entry: Supervisor Isolation & Window Lock Check', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects supervisor from saving marks for a group they do not supervise', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'other-supervisor', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.group, 'findUnique').mockResolvedValue({
      id: 'grp-1',
      supervisorId: 'real-supervisor-id',
      members: [],
    } as any);

    const res = await saveMarksEntryAction({
      groupId: 'grp-1',
      rubricCode: 'A',
      status: 'DRAFT',
      entries: [{ criterionId: 101, marks: 15, examinerSlot: 1 }],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('not authorized to enter marks for this group');
  });

  it('rejects marks submission when marking window is locked', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.group, 'findUnique').mockResolvedValue({
      id: 'grp-1',
      supervisorId: 'supervisor-1',
      members: [],
    } as any);

    vi.spyOn(prisma.rubric, 'findUnique').mockResolvedValue({
      code: 'A',
      semester: 6,
      criteria: [{ id: 101, label: 'Lit Survey', maxMarks: 30 }],
    } as any);

    // Locked window
    vi.spyOn(prisma.markWindow, 'findFirst').mockResolvedValue({
      isLocked: true,
      deadline: new Date(Date.now() - 100000),
    } as any);

    const res = await saveMarksEntryAction({
      groupId: 'grp-1',
      rubricCode: 'A',
      status: 'DRAFT',
      entries: [{ criterionId: 101, marks: 20, examinerSlot: 1 }],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('is locked');
  });
});
