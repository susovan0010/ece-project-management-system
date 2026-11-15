import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { updateFacultyGroupLoadAction } from '@/app/actions/admin-directory';
import { validateAllocationDataAction } from '@/app/actions/allocation';
import { archiveBatchAction, downloadLocalBatchArchiveAction } from '@/app/actions/capstone';
import { getSystemReadinessAction, updateBatchDeadlinesAction } from '@/app/actions/system-health';
import { getBatchArchiveConfirmationSentence } from '@/lib/engine/archive-report-generator';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/google-drive', () => ({
  uploadFileToGoogleDrive: vi.fn(),
  getGoogleDriveConfig: vi.fn().mockResolvedValue({
    webhookUrl: 'https://script.google.com/macros/s/test/exec',
    targetEmail: 'ece.project.committee@heritageit.edu',
    isConfigured: true,
  }),
  OFFICIAL_DRIVE_ACCOUNT: 'ece.project.committee@heritageit.edu',
}));

const state = {
  users: [] as any[],
  batches: [] as any[],
  topics: [] as any[],
  groups: [] as any[],
  auditLogs: [] as any[],
  forumPosts: [] as any[],
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return state.users.find((u) => u.id === where.id) || null;
      }),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.email?.in) {
          return state.users.filter(
            (u) => where.email.in.includes(u.email.toLowerCase()) && (where.active === undefined || u.active === where.active)
          );
        }
        return state.users;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const u = state.users.find((x) => x.id === where.id);
        if (u) Object.assign(u, data);
        return u;
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockImplementation(() => state.users.length),
    },
    topic: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.code?.in) {
          return state.topics.filter((t) => where.code.in.includes(t.code.toUpperCase()));
        }
        return state.topics;
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    batch: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return state.batches.find((b) => b.id === where.id) || null;
      }),
      findFirst: vi.fn().mockImplementation(() => state.batches[0] || null),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const b = state.batches.find((x) => x.id === where.id);
        if (b) Object.assign(b, data);
        return b;
      }),
    },
    group: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return state.groups.filter((g) => g.batchId === where.batchId);
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    forumPost: {
      findMany: vi.fn().mockImplementation(() => state.forumPosts),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    forumReaction: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    forumMarkupVote: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    forumReply: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    student: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    markEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    attainmentSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    groupMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    capstoneDecision: { update: vi.fn().mockResolvedValue({}) },
    aiProvider: { count: vi.fn().mockResolvedValue(1) },
    auditLog: {
      create: vi.fn().mockImplementation(({ data }: any) => {
        state.auditLogs.push(data);
        return data;
      }),
    },
  },
}));

describe('Phase 71: Platform Enhancements & Supervisor Group-Load Cap', () => {
  beforeEach(async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu', name: 'Admin' },
    });

    const adminHash = await bcrypt.hash('AdminPass123!', 4);
    state.users = [
      { id: 'admin-1', name: 'Admin', email: 'admin@heritageit.edu', role: 'ADMIN', active: true, passwordHash: adminHash },
      {
        id: 'fac-1',
        name: 'Prof. Roy',
        email: 'roy@heritageit.edu',
        role: 'FACULTY',
        active: true,
        maxGroupLoad: 2,
        groups: [{ batchId: '2023-2027', number: 1 }],
      },
      {
        id: 'fac-2',
        name: 'Prof. Sen',
        email: 'sen@heritageit.edu',
        role: 'FACULTY',
        active: true,
        maxGroupLoad: 4,
        groups: [{ batchId: '2023-2027', number: 2 }],
      },
      { id: 'stu-u1', name: 'Student 1', email: 's1@heritageit.edu', role: 'STUDENT', active: true },
    ];
    state.topics = [{ code: 'ECE-01' }, { code: 'ECE-02' }, { code: 'ECE-03' }];
    state.batches = [{ id: '2023-2027', active: true, isLocked: true, isArchived: false }];
    state.groups = [
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        supervisor: { id: 'fac-1', name: 'Prof. Roy', email: 'roy@heritageit.edu' },
        topic: { code: 'ECE-01', title: 'IoT Node', domain: 'IoT', category: 'Capstone', attributes: [], sdgs: [], decisions: [] },
        members: [{ student: { name: 'Student 1', roll: '2355001', userId: 'stu-u1', user: { id: 'stu-u1', role: 'STUDENT' } } }],
        markEntries: [{ criterionId: 1, marks: 80, criterion: { semester: 8, maxMarks: 100, maps: [] } }],
      },
    ];
    state.auditLogs = [];
    state.forumPosts = [];
  });

  it('allows Admin to adjust individual faculty maxGroupLoad (more or less than default 2) and rejects non-Admins', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValueOnce({ user: { id: 'fac-1', role: 'FACULTY' } });
    const denied = await updateFacultyGroupLoadAction('fac-1', 4);
    expect(denied.error).toContain('Unauthorized');

    const bad = await updateFacultyGroupLoadAction('fac-1', -1);
    expect(bad.error).toContain('negative');

    const ok = await updateFacultyGroupLoadAction('fac-1', 5);
    expect(ok.success).toBe(true);
    expect(state.users.find((u) => u.id === 'fac-1')?.maxGroupLoad).toBe(5);
    expect(state.auditLogs.some((l) => l.action === 'FACULTY_GROUP_LOAD_UPDATED')).toBe(true);

    // Also supports Admin / HOD accounts who act as supervisors
    const okAdmin = await updateFacultyGroupLoadAction('admin-1', 1);
    expect(okAdmin.success).toBe(true);
    expect(state.users.find((u) => u.id === 'admin-1')?.maxGroupLoad).toBe(1);
  });

  it('triggers supervisorLoadWarnings in validateAllocationDataAction when cap is exceeded, but respects custom higher cap', async () => {
    const report = await validateAllocationDataAction([
      { groupNumber: 3, batchId: '2023-2027', topicCode: 'ECE-01', supervisorEmail: 'roy@heritageit.edu', studentRoll: '2355010', studentName: 'A' },
      { groupNumber: 4, batchId: '2023-2027', topicCode: 'ECE-02', supervisorEmail: 'roy@heritageit.edu', studentRoll: '2355011', studentName: 'B' },
      { groupNumber: 5, batchId: '2023-2027', topicCode: 'ECE-03', supervisorEmail: 'sen@heritageit.edu', studentRoll: '2355012', studentName: 'C' },
      { groupNumber: 6, batchId: '2023-2027', topicCode: 'ECE-03', supervisorEmail: 'sen@heritageit.edu', studentRoll: '2355013', studentName: 'D' },
    ]);

    expect('error' in report).toBe(false);
    if (!('error' in report)) {
      // fac-1: 1 active + 2 incoming = 3 > cap 2 -> warning
      // fac-2: 1 active + 2 incoming = 3 <= cap 4 -> no warning
      expect(report.supervisorLoadWarnings).toHaveLength(1);
      expect(report.supervisorLoadWarnings![0].email).toBe('roy@heritageit.edu');
      expect(report.supervisorLoadWarnings![0].maxGroupLoad).toBe(2);
    }
  });

  it('aborts archiveBatchAction before deleting student accounts if Academic HTML Drive upload returns an error', async () => {
    const { uploadFileToGoogleDrive } = await import('@/lib/google-drive');
    const { prisma } = await import('@/lib/prisma');
    (prisma.user.deleteMany as any).mockClear();
    (uploadFileToGoogleDrive as any).mockResolvedValueOnce({
      success: true,
      hostedOn: 'LOCAL_FALLBACK',
      error: 'Google Drive Quota Exceeded',
    });

    const res = await archiveBatchAction({
      batchId: '2023-2027',
      adminPassword: 'AdminPass123!',
      confirmationSentence: getBatchArchiveConfirmationSentence('2023-2027'),
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Student accounts were NOT deleted');
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('supports one-click local HTML and ZIP archive downloads for Admin', async () => {
    const htmlRes = await downloadLocalBatchArchiveAction('2023-2027', 'html');
    expect(htmlRes.success).toBe(true);
    expect(htmlRes.fileName).toBe('Batch_2023-2027_Comprehensive_Academic_Archive.html');
    expect(htmlRes.base64).toBeDefined();

    const zipRes = await downloadLocalBatchArchiveAction('2023-2027', 'zip');
    expect(zipRes.success).toBe(true);
    expect(zipRes.fileName).toBe('Batch_2023-2027_Forum_Archive.zip');
    expect(Buffer.from(zipRes.base64!, 'base64').readUInt32LE(0)).toBe(0x04034b50);
  });

  it('returns system readiness checks and saves batch-wide milestone deadlines', async () => {
    const health = await getSystemReadinessAction();
    expect(health.success).toBe(true);
    expect(health.checks?.some((c) => c.key === 'database' && c.ok)).toBe(true);

    const dl = await updateBatchDeadlinesAction({
      batchId: '2023-2027',
      topicSelection: '2026-12-01',
      sem7Panel: '2027-01-15',
      sem8Marks: '2027-05-10',
      note: 'Final submission window',
    });
    expect(dl.success).toBe(true);
    expect(state.batches[0].deadlines.sem8Marks).toBe('2027-05-10');
    expect(state.auditLogs.some((l) => l.action === 'BATCH_DEADLINES_UPDATED')).toBe(true);
  });
});
