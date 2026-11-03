// ========================================================
// ECE Capstone Project Management System - Marks Tracker & Reminders Unit Tests
// Tests marks completion tracking, marking windows lock toggles,
// manual supervisor reminder dispatch, and automated cron endpoint security.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-tracker-msg-id-123' }),
    })),
  },
}));

import {
  getMarksTrackerAction,
  toggleMarkWindowLockAction,
  updateMarkWindowDeadlineAction,
  sendSupervisorReminderAction,
  sendBulkRemindersAction,
} from '../app/actions/tracker';
import { GET as cronRemindersGet } from '../app/api/cron/reminders/route';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';
import { NextRequest } from 'next/server';

describe('Marks Tracker: Access Control & Role Security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to view marks tracker', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getMarksTrackerAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY user from viewing admin marks tracker', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await getMarksTrackerAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });

  it('rejects FACULTY user from toggling mark window lock', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await toggleMarkWindowLockAction('win-1', true);
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });
});

describe('Marks Tracker: Completion Calculation & Window Toggles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates rubric completion rates for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.markWindow, 'findMany').mockResolvedValue([
      { id: 'w1', semester: 6, rubric: 'A', deadline: new Date(), isLocked: false },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);

    vi.spyOn(prisma.rubric, 'findMany').mockResolvedValue([
      {
        code: 'A',
        semester: 6,
        title: 'Supervisor Evaluation',
        maxMarks: 60,
        criteria: [{ id: 101 }],
      },
    ] as any);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        supervisor: { id: 'sup-1', name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        markEntries: [{ criterionId: 101, criterion: { rubricCode: 'A', semester: 6 } }],
      },
      {
        id: 'grp-2',
        number: 2,
        supervisor: { id: 'sup-2', name: 'Dr. Prabir Banerjee', email: 'prabir@hitk.edu' },
        markEntries: [],
      },
    ] as any);

    vi.spyOn(prisma.reminderLog, 'findMany').mockResolvedValue([]);

    const res = await getMarksTrackerAction('2023-2027');
    expect(res.error).toBeUndefined();
    expect(res.totalGroups).toBe(2);

    // Rubric A should have 1 completed group out of 2 = 50%
    const rubricA = res.rubricStats!.find((r) => r.code === 'A');
    expect(rubricA).toBeDefined();
    expect(rubricA?.completedGroups).toBe(1);
    expect(rubricA?.pendingGroups).toBe(1);
    expect(rubricA?.completionRate).toBe(50);
  });

  it('toggles mark window lock status in database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const updateSpy = vi.spyOn(prisma.markWindow, 'update').mockResolvedValue({
      id: 'win-1',
      isLocked: true,
    } as any);

    const res = await toggleMarkWindowLockAction('win-1', true);
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'win-1' },
      data: { isLocked: true },
    });
  });
});

describe('Marks Tracker: Automated Reminders & Cron Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches single supervisor reminder and logs into database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      name: 'Dr. Debasish Saha',
      email: 'debasish@hitk.edu',
    } as any);

    const createLogSpy = vi.spyOn(prisma.reminderLog, 'create').mockResolvedValue({} as any);

    const res = await sendSupervisorReminderAction({
      supervisorId: 'sup-1',
      semester: 6,
      groupsCount: 2,
    });

    expect(res.success).toBe(true);
    expect(createLogSpy).toHaveBeenCalledWith({
      data: {
        supervisorId: 'sup-1',
        semester: 6,
        groupsCount: 2,
        success: true,
      },
    });
  });

  it('rejects unauthorized requests to cron endpoint with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/reminders', {
      headers: { authorization: 'Bearer invalid-secret' },
    });

    const res = await cronRemindersGet(req);
    expect(res.status).toBe(401);
  });

  it('processes authorized cron requests with valid CRON_SECRET Bearer token', async () => {
    process.env.CRON_SECRET = 'test-cron-secret-123';

    vi.spyOn(prisma.markWindow, 'findMany').mockResolvedValue([
      { id: 'w1', semester: 6, rubric: 'A', isLocked: false },
    ] as any);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        supervisor: { id: 'sup-1', name: 'Dr. Debasish Saha' },
        markEntries: [], // pending
      },
    ] as any);

    const createLogSpy = vi.spyOn(prisma.reminderLog, 'create').mockResolvedValue({} as any);

    const req = new NextRequest('http://localhost:3000/api/cron/reminders', {
      headers: { authorization: 'Bearer test-cron-secret-123' },
    });

    const res = await cronRemindersGet(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.dispatchedCount).toBe(1);
    expect(createLogSpy).toHaveBeenCalledTimes(1);
  });
});
