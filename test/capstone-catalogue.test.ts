import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  checkSemester8CompletionAction,
  closeBatchSessionAction,
  unlockBatchSessionAction,
  archiveBatchAction,
  purgeExpiredArchivedProjectsAction,
  getCapstoneCatalogueAction,
  getCapstoneProjectDetailReportAction,
  forceDeleteBatchSessionAction,
} from '@/app/actions/capstone';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/google-drive', () => ({
  uploadFileToGoogleDrive: vi.fn().mockResolvedValue({
    success: true,
    fileId: 'mock-drive-file-id-123',
    viewUrl: 'https://drive.google.com/file/d/mock-drive-file-id-123/view',
    fileName: 'archive.html',
    size: 1024,
    mimeType: 'text/html',
    hostedOn: 'GOOGLE_DRIVE',
  }),
  OFFICIAL_DRIVE_ACCOUNT: 'ece.project.committee@heritageit.edu',
}));

let mockBatches: any[] = [];
let mockGroups: any[] = [];
let mockUsers: any[] = [];
let mockTopics: any[] = [];
let mockDecisions: any[] = [];
let mockComplexityDeclarations: any[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    batch: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const b = mockBatches.find((item) => item.id === where.id);
        if (!b) return null;
        return {
          ...b,
          groups: mockGroups.filter((g) => g.batchId === b.id).map((g) => ({
            ...g,
            supervisor: mockUsers.find((u) => u.id === g.supervisorId) || null,
            topic: {
              ...(mockTopics.find((t) => t.id === g.topicId) || {}),
              decisions: mockDecisions.filter((d) => d.topicId === g.topicId),
            },
            markEntries: g.markEntries || [],
          })),
        };
      }),
      findMany: vi.fn().mockImplementation(() => mockBatches),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const b = mockBatches.find((item) => item.id === where.id);
        if (b) Object.assign(b, data);
        return b;
      }),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        mockBatches = mockBatches.filter((b) => b.id !== where.id);
        return { id: where.id };
      }),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return mockUsers.find((u) => u.id === where.id) || null;
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.id?.in) {
          mockUsers = mockUsers.filter((u) => !where.id.in.includes(u.id));
        }
        return { count: 1 };
      }),
    },
    student: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    group: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        let list = [...mockGroups];
        if (where?.batchId) {
          list = list.filter((g) => g.batchId === where.batchId);
        }
        if (where?.isArchived !== undefined) {
          list = list.filter((g) => g.isArchived === where.isArchived);
        }
        if (where?.isCapstonePermanent !== undefined) {
          list = list.filter((g) => g.isCapstonePermanent === where.isCapstonePermanent);
        }
        if (where?.purgeAt?.lte) {
          list = list.filter((g) => g.purgeAt && g.purgeAt <= where.purgeAt.lte);
        }
        if (where?.OR) {
          list = list.filter((g) => {
            const isPerm = g.isCapstonePermanent;
            const hasConfirmed = mockDecisions.some(
              (d) => d.topicId === g.topicId && d.isCapstone && d.status === 'CONFIRMED'
            );
            return isPerm || hasConfirmed;
          });
        }
        return list.map((g) => ({
          ...g,
          topic: {
            ...(mockTopics.find((t) => t.id === g.topicId) || {}),
            attributes: g.attributes || [],
            sdgs: g.sdgs || [],
            decisions: mockDecisions.filter((d) => d.topicId === g.topicId),
          },
          supervisor: mockUsers.find((u) => u.id === g.supervisorId) || null,
          members: (g.members || []).map((m: any) => ({
            ...m,
            student: {
              ...(m.student || {}),
              user: mockUsers.find((u) => u.id === m.student?.userId) || null,
            },
          })),
          markEntries: g.markEntries || [],
        }));
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const g = mockGroups.find((item) => item.id === where.id);
        if (g) Object.assign(g, data);
        return g;
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
        if (where?.id?.in) {
          mockGroups.filter((g) => where.id.in.includes(g.id)).forEach((g) => Object.assign(g, data));
        }
        return { count: 1 };
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: any) => {
        const before = mockGroups.length;
        mockGroups = mockGroups.filter((g) => !where.id.in.includes(g.id));
        return { count: before - mockGroups.length };
      }),
    },
    groupMember: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    markEntry: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    attainmentSnapshot: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    forumPost: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    capstoneDecision: {
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const d = mockDecisions.find((item) => item.id === where.id);
        if (d) Object.assign(d, data);
        return d;
      }),
    },
    topic: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const t = mockTopics.find((item) => item.id === where.id);
        if (!t) return null;
        const gList = mockGroups.filter((g) => g.topicId === t.id);
        return {
          ...t,
          attributes: t.attributes || [],
          sdgs: t.sdgs || [],
          decisions: mockDecisions.filter((d) => d.topicId === t.id),
          groups: gList.map((g) => ({
            ...g,
            supervisor: mockUsers.find((u) => u.id === g.supervisorId) || null,
            members: g.members || [],
            markEntries: g.markEntries || [],
          })),
        };
      }),
    },
    forumMarkupVote: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    forumReaction: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    forumReply: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

describe('Phase 61: Close Session, Archival & Capstone Catalogue', () => {
  const adminId = 'admin-user-1';
  let hashedAdminPass: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    hashedAdminPass = await bcrypt.hash('AdminSecret123!', 10);

    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: adminId, role: 'ADMIN', email: 'admin@heritageit.edu' },
    });

    mockUsers = [
      { id: adminId, name: 'Committee Admin', email: 'admin@heritageit.edu', role: 'ADMIN', passwordHash: hashedAdminPass },
      { id: 'sup-1', name: 'Dr. Debanjan', email: 'debanjan@heritageit.edu', role: 'FACULTY' },
      { id: 'u-s-1', name: 'Aarav Sharma', email: 'aarav@heritageit.edu', role: 'STUDENT' },
      { id: 'u-s-2', name: 'Diya Sen', email: 'diya@heritageit.edu', role: 'STUDENT' },
      { id: 'u-s-3', name: 'Rohan Roy', email: 'rohan@heritageit.edu', role: 'STUDENT' },
    ];

    mockBatches = [
      { id: '2023-2027', active: true, isLocked: false, isArchived: false },
    ];

    mockTopics = [
      {
        id: 'topic-1',
        code: 'ECE-23-01',
        title: 'Smart IoT Precision Agriculture',
        description: 'Deep learning IoT soil moisture capstone',
        domain: 'IoT & Embedded Systems',
        category: 'Capstone',
        source: 'FACULTY',
        attributes: [
          { attribute: { code: 'WP1', title: 'Engineering Knowledge', kind: 'WP' }, level: 3, reason: 'Complex system' },
          { attribute: { code: 'WP2', title: 'Conflicting Requirements', kind: 'WP' }, level: 2, reason: 'Power vs Latency' },
          { attribute: { code: 'WP3', title: 'Depth of Analysis', kind: 'WP' }, level: 2, reason: 'Real-time telemetry' },
          { attribute: { code: 'WP4', title: 'Familiarity', kind: 'WP' }, level: 2, reason: 'Novel architecture' },
          { attribute: { code: 'EA1', title: 'Range of Resources', kind: 'EA' }, level: 2, reason: 'LoRa and Edge TPU' },
          { attribute: { code: 'EA2', title: 'Interactions', kind: 'EA' }, level: 2, reason: 'Multi-stakeholder' },
        ],
        sdgs: [
          { sdg: { id: 2, title: 'Zero Hunger' }, target: '2.4 Sustainable Food Production', reason: 'Agri automation' },
        ],
      },
      {
        id: 'topic-2',
        code: 'ECE-23-02',
        title: 'Basic LED Chaser',
        description: 'Standard 555 timer project',
        domain: 'Electronics',
        category: 'Standard',
        source: 'FACULTY',
        attributes: [
          { attribute: { code: 'WP1', title: 'Engineering Knowledge', kind: 'WP' }, level: 1, reason: 'Introductory' },
        ],
        sdgs: [],
      },
    ];

    mockDecisions = [
      {
        id: 'dec-1',
        topicId: 'topic-1',
        step1Qualify: true,
        step2Panel: true,
        step3External: true,
        step4Declared: true,
        isCapstone: true,
        status: 'CONFIRMED',
        notes: 'Exemplary capstone implementation.',
        decisionYear: 2026,
        confirmedAt: new Date('2026-05-15'),
      },
    ];

    mockGroups = [
      {
        id: 'group-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 'topic-1',
        supervisorId: 'sup-1',
        isArchived: false,
        isCapstonePermanent: false,
        purgeAt: null,
        members: [
          { student: { id: 's-1', name: 'Aarav Sharma', roll: '12620021001', userId: 'u-s-1' } },
          { student: { id: 's-2', name: 'Diya Sen', roll: '12620021002', userId: 'u-s-2' } },
        ],
        markEntries: [
          // Sem 6
          {
            criterionId: 101,
            marks: 85,
            criterion: {
              semester: 6,
              maxMarks: 100,
              maps: [{ code: 'PO1', kind: 'PO' }, { code: 'WP1', kind: 'WP' }],
            },
          },
          // Sem 7
          {
            criterionId: 102,
            marks: 88,
            criterion: {
              semester: 7,
              maxMarks: 100,
              maps: [{ code: 'PO2', kind: 'PO' }, { code: 'WP2', kind: 'WP' }],
            },
          },
          // Sem 8 (Complete)
          {
            criterionId: 103,
            marks: 90,
            criterion: {
              semester: 8,
              maxMarks: 100,
              maps: [{ code: 'PO3', kind: 'PO' }, { code: 'EA1', kind: 'EA' }],
            },
          },
        ],
      },
      {
        id: 'group-2',
        number: 2,
        batchId: '2023-2027',
        topicId: 'topic-2',
        supervisorId: 'sup-1',
        isArchived: false,
        isCapstonePermanent: false,
        purgeAt: null,
        members: [
          { student: { id: 's-3', name: 'Rohan Roy', roll: '12620021003', userId: 'u-s-3' } },
        ],
        markEntries: [
          // Missing Sem 8
          {
            criterionId: 101,
            marks: 60,
            criterion: {
              semester: 6,
              maxMarks: 100,
              maps: [{ code: 'PO1', kind: 'PO' }],
            },
          },
        ],
      },
    ];
  });

  it('1. checkSemester8CompletionAction detects completed vs pending groups', async () => {
    const res = await checkSemester8CompletionAction('2023-2027');
    expect(res.success).toBe(true);
    expect(res.data?.totalGroups).toBe(2);
    expect(res.data?.completedGroups).toBe(1);
    expect(res.data?.isComplete).toBe(false);
    expect(res.data?.pendingGroups.length).toBe(1);
    expect(res.data?.pendingGroups[0].groupNumber).toBe(2);
  });

  it('2. closeBatchSessionAction locks the batch session', async () => {
    const res = await closeBatchSessionAction('2023-2027');
    expect(res.success).toBe(true);
    expect(mockBatches[0].isLocked).toBe(true);
    expect(mockBatches[0].lockedAt).toBeDefined();
  });

  it('3. unlockBatchSessionAction verifies admin login password', async () => {
    // Lock first
    mockBatches[0].isLocked = true;

    // Try wrong password
    const failRes = await unlockBatchSessionAction('2023-2027', 'WrongPassword123');
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain('Incorrect admin login password');
    expect(mockBatches[0].isLocked).toBe(true);

    // Try correct password
    const okRes = await unlockBatchSessionAction('2023-2027', 'AdminSecret123!');
    expect(okRes.success).toBe(true);
    expect(mockBatches[0].isLocked).toBe(false);
    expect(mockBatches[0].lockedAt).toBeNull();
  });

  it('4. archiveBatchAction permanently retains capstone and schedules 4-year purge for non-capstone', async () => {
    const res = await archiveBatchAction('2023-2027');
    expect(res.success).toBe(true);
    expect(res.capstoneCount).toBe(1);
    expect(res.archivedCount).toBe(1);
    expect(res.driveUrl).toBeDefined();

    // Verify student accounts were deleted permanently, while faculty account is retained
    expect(mockUsers.some((u) => u.id === 'u-s-1')).toBe(false);
    expect(mockUsers.some((u) => u.id === 'u-s-2')).toBe(false);
    expect(mockUsers.some((u) => u.id === 'u-s-3')).toBe(false);
    expect(mockUsers.some((u) => u.id === 'sup-1')).toBe(true);
    expect(mockUsers.some((u) => u.id === adminId)).toBe(true);

    // Group 1 (Capstone)
    const g1 = mockGroups.find((g) => g.id === 'group-1');
    expect(g1.isCapstonePermanent).toBe(true);
    expect(g1.isArchived).toBe(false);
    expect(g1.purgeAt).toBeNull();

    // Group 2 (Non-Capstone)
    const g2 = mockGroups.find((g) => g.id === 'group-2');
    expect(g2.isCapstonePermanent).toBe(false);
    expect(g2.isArchived).toBe(true);
    expect(g2.purgeAt).toBeInstanceOf(Date);
    // Purge date should be ~4 years from now
    const nowYears = new Date().getFullYear();
    expect(g2.purgeAt.getFullYear()).toBeGreaterThanOrEqual(nowYears + 3);

    // Batch itself is marked archived with Drive File URL
    expect(mockBatches[0].isArchived).toBe(true);
    expect(mockBatches[0].archiveDriveFileUrl).toBeDefined();
  });

  it('5. purgeExpiredArchivedProjectsAction cleans only eligible expired non-capstones', async () => {
    // Add an expired group
    mockGroups.push({
      id: 'group-old',
      number: 99,
      batchId: '2019-2023',
      topicId: 'topic-2',
      isArchived: true,
      isCapstonePermanent: false,
      purgeAt: new Date('2024-01-01'), // in the past
    });

    const purgeRes = await purgeExpiredArchivedProjectsAction();
    expect(purgeRes.success).toBe(true);
    expect(purgeRes.purgedCount).toBe(1);
    expect(mockGroups.some((g) => g.id === 'group-old')).toBe(false);
  });

  it('6. getCapstoneCatalogueAction returns permanent catalogue with proposal attributes & SDGs', async () => {
    // Mark Group 1 as permanent
    mockGroups[0].isCapstonePermanent = true;
    mockGroups[0].attributes = mockTopics[0].attributes;
    mockGroups[0].sdgs = mockTopics[0].sdgs;

    const res = await getCapstoneCatalogueAction();
    expect(res.success).toBe(true);
    expect(res.data?.length).toBeGreaterThanOrEqual(1);

    const capstoneItem = res.data?.find((c) => c.topicId === 'topic-1');
    expect(capstoneItem).toBeDefined();
    expect(capstoneItem?.projectCode).toBe('ECE-23-01');
    expect(capstoneItem?.decisionYear).toBe(2026);
    expect(capstoneItem?.proposalAttributes.length).toBe(6);
    expect(capstoneItem?.proposalSdgs.length).toBe(1);
    expect(capstoneItem?.proposalSdgs[0].code).toBe('SDG 2');
    expect(capstoneItem?.students.length).toBe(2);
  });

  it('7. getCapstoneProjectDetailReportAction computes semester-wise & overall attainments', async () => {
    const res = await getCapstoneProjectDetailReportAction('topic-1');
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();

    const report = res.data!;
    expect(report.projectTitle).toBe('Smart IoT Precision Agriculture');
    expect(report.students.length).toBe(2);
    expect(report.proposalAttributes.some((a) => a.code === 'WP1')).toBe(true);

    // Overall Attainments
    expect(report.overallAttainments.pos.length).toBe(11);
    const po1 = report.overallAttainments.pos.find((p) => p.code === 'PO1');
    expect(po1?.percentage).toBe(85);
    expect(po1?.level).toBe(3);

    // Semester Breakdowns
    expect(report.semesterBreakdowns.length).toBe(3);
    const sem6 = report.semesterBreakdowns.find((s) => s.semester === 6);
    const sem7 = report.semesterBreakdowns.find((s) => s.semester === 7);
    const sem8 = report.semesterBreakdowns.find((s) => s.semester === 8);

    expect(sem6?.pos.find((p) => p.code === 'PO1')?.percentage).toBe(85);
    expect(sem7?.pos.find((p) => p.code === 'PO2')?.percentage).toBe(88);
    expect(sem8?.pos.find((p) => p.code === 'PO3')?.percentage).toBe(90);
  });

  it('8. forceDeleteBatchSessionAction enforces admin password and allows forceful cleanup / deletion', async () => {
    // 1. Rejects mismatched batch confirmation text
    const mismatchRes = await forceDeleteBatchSessionAction({
      batchId: '2023-2027',
      confirmBatchId: 'wrong-batch',
      password: 'AdminSecret123!',
      preserveCapstones: true,
    });
    expect(mismatchRes.success).toBe(false);
    expect(mismatchRes.error).toContain('Confirmation mismatch');

    // 2. Rejects wrong admin password
    const wrongPassRes = await forceDeleteBatchSessionAction({
      batchId: '2023-2027',
      confirmBatchId: '2023-2027',
      password: 'WrongPassword!',
      preserveCapstones: true,
    });
    expect(wrongPassRes.success).toBe(false);
    expect(wrongPassRes.error).toContain('Incorrect admin login password');

    // 3. Forceful cleanup with preserveCapstones = true
    const preserveRes = await forceDeleteBatchSessionAction({
      batchId: '2023-2027',
      confirmBatchId: '2023-2027',
      password: 'AdminSecret123!',
      preserveCapstones: true,
    });
    expect(preserveRes.success).toBe(true);
    expect(preserveRes.deletedGroupsCount).toBe(1); // Group 2 non-capstone deleted
    expect(preserveRes.preservedCapstonesCount).toBe(1); // Group 1 capstone preserved
    expect(mockGroups.some((g) => g.id === 'group-2')).toBe(false);
    expect(mockGroups.some((g) => g.id === 'group-1')).toBe(true);

    // 4. Forceful complete deletion with preserveCapstones = false
    const deleteTotalRes = await forceDeleteBatchSessionAction({
      batchId: '2023-2027',
      confirmBatchId: '2023-2027',
      password: 'AdminSecret123!',
      preserveCapstones: false,
    });
    expect(deleteTotalRes.success).toBe(true);
    expect(mockBatches.some((b) => b.id === '2023-2027')).toBe(false);
  });
});
