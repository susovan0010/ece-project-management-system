import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStudentProjectDetailsAction } from '@/app/actions/student-project';
import {
  getStudentAllocationInviteStatsAction,
  sendBulkStudentInvitationsAction,
  sendSingleStudentInviteAction,
} from '@/app/actions/student-invite';

// Mock dependencies
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'msg-test-123' }),
  getCommunicationConfig: vi.fn().mockResolvedValue({
    senderName: 'ECE Project Committee HITK',
    senderEmail: 'ece.project.committee@heritageit.edu',
    replyTo: 'ece.project.committee@heritageit.edu',
  }),
}));

vi.mock('@/lib/tokens', () => ({
  createInviteToken: vi.fn().mockResolvedValue({ token: 'token-student-abc-123' }),
}));

// Mock prisma store
let mockStudents: any[] = [];
let mockGroups: any[] = [];
let mockGroupMembers: any[] = [];
let mockTopics: any[] = [];
let mockUsers: any[] = [];
let mockInviteTokens: any[] = [];
let mockSettings: Record<string, any> = {};
let mockAuditLogs: any[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: any }) => {
        let match: any = null;
        if (where.userId) match = mockStudents.find((s) => s.userId === where.userId) || null;
        else if (where.id) match = mockStudents.find((s) => s.id === where.id) || null;
        else if (where.email) match = mockStudents.find((s) => s.email?.toLowerCase() === where.email.toLowerCase()) || null;

        if (!match) return null;

        // attach groups
        const studentGms = mockGroupMembers.filter((gm) => gm.studentId === match.id);
        const groups = studentGms.map((gm) => {
          const group = mockGroups.find((g) => g.id === gm.groupId);
          return {
            ...gm,
            group: group
              ? {
                  ...group,
                  topic: mockTopics.find((t) => t.id === group.topicId),
                  supervisor: mockUsers.find((u) => u.id === group.supervisorId),
                }
              : null,
          };
        });

        return { ...match, groups };
      }),
      findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
        let match: any = null;
        if (where?.userId) {
          match = mockStudents.find((s) => s.userId === where.userId);
        } else if (where?.OR) {
          for (const clause of where.OR) {
            if (clause.userId) {
              match = mockStudents.find((s) => s.userId === clause.userId);
              if (match) break;
            }
            if (clause.email?.equals) {
              match = mockStudents.find((s) => s.email?.toLowerCase() === clause.email.equals.toLowerCase());
              if (match) break;
            }
          }
        }
        if (!match) return null;

        const studentGms = mockGroupMembers.filter((gm) => gm.studentId === match.id);
        const groups = studentGms.map((gm) => {
          const group = mockGroups.find((g) => g.id === gm.groupId);
          const topic = mockTopics.find((t) => t.id === group?.topicId);
          return {
            ...gm,
            group: group
              ? {
                  ...group,
                  topic: topic
                    ? {
                        ...topic,
                        sdgs: (topic.sdgs || []).map((id: number) => ({
                          sdgId: id,
                          target: 'Target 1',
                          reason: 'Reason 1',
                          sdg: { id, code: `SDG ${id}`, title: `Goal ${id}` },
                        })),
                        attributes: (topic.wpAttributes || []).map((code: string) => ({
                          level: 2,
                          reason: 'Attribute reason',
                          attribute: { code, title: code, kind: 'WP' },
                        })),
                      }
                    : null,
                  supervisor: mockUsers.find((u) => u.id === group.supervisorId),
                  members: mockGroupMembers
                    .filter((m) => m.groupId === group.id)
                    .map((m) => ({
                      ...m,
                      student: mockStudents.find((s) => s.id === m.studentId),
                    })),
                }
              : null,
          };
        });

        return { ...match, groups };
      }),
      findMany: vi.fn().mockImplementation(() => mockStudents),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: any }) => {
        if (where.id) return mockUsers.find((u) => u.id === where.id) || null;
        if (where.email) return mockUsers.find((u) => u.email?.toLowerCase() === where.email.toLowerCase()) || null;
        return null;
      }),
      findMany: vi.fn().mockImplementation(() => mockUsers),
    },
    groupMember: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
        if (where.studentId) {
          const match = mockGroupMembers.find((gm) => gm.studentId === where.studentId);
          if (!match) return null;
          const group = mockGroups.find((g) => g.id === match.groupId);
          return {
            ...match,
            group: group
              ? {
                  ...group,
                  members: mockGroupMembers
                    .filter((gm) => gm.groupId === group.id)
                    .map((gm) => ({
                      ...gm,
                      student: mockStudents.find((s) => s.id === gm.studentId),
                    })),
                  topic: mockTopics.find((t) => t.id === group.topicId) || null,
                  supervisor: mockUsers.find((u) => u.id === group.supervisorId) || null,
                }
              : null,
          };
        }
        return null;
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: any }) => {
        let results = [...mockGroupMembers];
        if (where?.group?.batchId) {
          const validGroupIds = mockGroups
            .filter((g) => g.batchId === where.group.batchId)
            .map((g) => g.id);
          results = results.filter((gm) => validGroupIds.includes(gm.groupId));
        }
        return results.map((gm) => {
          const group = mockGroups.find((g) => g.id === gm.groupId);
          return {
            ...gm,
            group: group
              ? {
                  ...group,
                  topic: mockTopics.find((t) => t.id === group.topicId),
                  supervisor: mockUsers.find((u) => u.id === group.supervisorId),
                }
              : null,
            student: {
              ...mockStudents.find((s) => s.id === gm.studentId),
              user: mockUsers.find((u) => u.id === mockStudents.find((s) => s.id === gm.studentId)?.userId),
            },
          };
        });
      }),
    },
    inviteToken: {
      findMany: vi.fn().mockImplementation(() => mockInviteTokens),
    },
    setting: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { key: string } }) => {
        return mockSettings[where.key] ? { key: where.key, value: mockSettings[where.key] } : null;
      }),
      upsert: vi.fn().mockImplementation(({ where, update, create }: any) => {
        const val = update?.value ?? create?.value;
        mockSettings[where.key] = val;
        return { key: where.key, value: val };
      }),
    },
    auditLog: {
      create: vi.fn().mockImplementation(({ data }: any) => {
        mockAuditLogs.push(data);
        return data;
      }),
    },
  },
}));

import { auth } from '@/auth';

describe('Student Project Details & Allocation Invites Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {};
    mockAuditLogs = [];
    mockUsers = [
      {
        id: 'admin-1',
        name: 'Dr. Admin User',
        email: 'ece.project.committee@heritageit.edu',
        role: 'ADMIN',
      },
      {
        id: 'faculty-1',
        name: 'Dr. Dulal Mandal',
        email: 'dulal.mandal@heritageit.edu',
        role: 'FACULTY',
        domainExpertise: ['AI and ML', 'Python', 'Digital Electronics'],
      },
      {
        id: 'student-user-1',
        name: 'Sourav Roy',
        email: 'student.demo@heritageit.edu',
        role: 'STUDENT',
        passwordHash: 'hashed123',
        active: true,
      },
    ];

    mockStudents = [
      {
        id: 'stud-1',
        userId: 'student-user-1',
        name: 'Sourav Roy',
        roll: '12620003001',
        email: 'student.demo@heritageit.edu',
        phone: '9876543210',
      },
      {
        id: 'stud-2',
        userId: null,
        name: 'Ananya Sen',
        roll: '12620003002',
        email: 'ananya.sen@heritageit.edu',
        phone: '9876543211',
      },
      {
        id: 'stud-3',
        userId: null,
        name: 'Student Without Email',
        roll: '12620003003',
        email: null,
        phone: null,
      },
    ];

    mockTopics = [
      {
        id: 'topic-1',
        code: 'SIH26015',
        title: 'Geospatial AI Watershed Analysis',
        description: 'Advanced computer vision on satellite imagery.',
        source: 'SIH',
        category: 'SOFTWARE',
        domain: 'AI and ML',
        wpAttributes: ['WP1', 'WP3'],
        wkAttributes: ['WK1', 'WK5'],
        eaAttributes: ['EA2'],
        sdgs: [6, 13],
      },
    ];

    mockGroups = [
      {
        id: 'group-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 'topic-1',
        supervisorId: 'faculty-1',
      },
    ];

    mockGroupMembers = [
      { id: 'gm-1', groupId: 'group-1', studentId: 'stud-1' },
      { id: 'gm-2', groupId: 'group-1', studentId: 'stud-2' },
      { id: 'gm-3', groupId: 'group-1', studentId: 'stud-3' },
    ];

    mockInviteTokens = [];
  });

  describe('getStudentProjectDetailsAction', () => {
    it('rejects unauthenticated requests', async () => {
      (auth as any).mockResolvedValue(null);
      const res = await getStudentProjectDetailsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unauthorized/i);
    });

    it('rejects users with non-STUDENT role', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });
      const res = await getStudentProjectDetailsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/student access required/i);
    });

    it('returns complete project, supervisor, and member details for enrolled student', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'student-user-1', role: 'STUDENT', email: 'student.demo@heritageit.edu' },
      });

      const res = await getStudentProjectDetailsAction();
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      // Student profile
      expect(res.data?.student.name).toBe('Sourav Roy');
      expect(res.data?.student.roll).toBe('12620003001');

      // Group & Topic
      expect(res.data?.group?.number).toBe(1);
      expect(res.data?.group?.batchId).toBe('2023-2027');
      expect(res.data?.topic?.code).toBe('SIH26015');
      expect(res.data?.topic?.title).toBe('Geospatial AI Watershed Analysis');
      expect(res.data?.topic?.attributes.length).toBeGreaterThan(0);

      // Supervisor
      expect(res.data?.supervisor?.name).toBe('Dr. Dulal Mandal');
      expect(res.data?.supervisor?.domainExpertise).toContain('AI and ML');

      // Team members
      expect(res.data?.members.length).toBe(3);
      const selfMember = res.data?.members.find((m) => m.isCurrentUser);
      expect(selfMember).toBeDefined();
      expect(selfMember?.roll).toBe('12620003001');
    });
  });

  describe('getStudentAllocationInviteStatsAction', () => {
    it('rejects unauthorized access if not ADMIN', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'student-user-1', role: 'STUDENT' },
      });
      const res = await getStudentAllocationInviteStatsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/admin/i);
    });

    it('correctly tallies active, pending, ready, and no-email students', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await getStudentAllocationInviteStatsAction('ALL');
      expect(res.success).toBe(true);
      expect(res.stats).toBeDefined();
      expect(res.stats?.totalAllocatedStudents).toBe(3);
      expect(res.stats?.studentsWithValidEmail).toBe(2);
      expect(res.stats?.activeAccountsCount).toBe(1); // stud-1 has userId
      expect(res.stats?.pendingInviteCount).toBe(0);
      expect(res.stats?.uninvitedCount).toBe(1); // stud-2 has email but no invite

      // Status map checks
      expect(res.statusMap?.['stud-1']).toBe('ACTIVE');
      expect(res.statusMap?.['stud-2']).toBe('READY_TO_INVITE');
      expect(res.statusMap?.['stud-3']).toBe('NO_EMAIL');
    });
  });

  describe('sendBulkStudentInvitationsAction', () => {
    it('rejects non-admin access', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'faculty-1', role: 'FACULTY' },
      });
      const res = await sendBulkStudentInvitationsAction('ALL');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/admin/i);
    });

    it('skips active users and dispatches invitations to ready students', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', name: 'Admin', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await sendBulkStudentInvitationsAction('2023-2027', 'http://localhost:3000');
      if (!res.success) {
        console.error('sendBulkStudentInvitationsAction error:', res.error);
      }
      expect(res.success).toBe(true);
      expect(res.sentCount).toBe(1); // only stud-2 (stud-1 is active, stud-3 has no email)
      expect(res.skippedActiveCount).toBe(1);

      // Verify communication history logged
      expect(mockSettings['communication_history']).toBeDefined();
      expect(mockSettings['communication_history'].length).toBe(1);
      expect(mockSettings['communication_history'][0].subject).toContain('Student Portal Invitation');

      // Verify audit log created
      expect(mockAuditLogs.length).toBeGreaterThan(0);
      expect(mockAuditLogs.some((a) => a.action === 'SEND_BULK_STUDENT_INVITATIONS')).toBe(true);
    });
  });

  describe('sendSingleStudentInviteAction', () => {
    it('returns error if student is missing email', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', name: 'Admin', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await sendSingleStudentInviteAction('stud-3');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/valid email/i);
    });

    it('returns error if student already has active account', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', name: 'Admin', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await sendSingleStudentInviteAction('stud-1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/active account/i);
    });

    it('successfully dispatches invite email for eligible student', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', name: 'Admin', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await sendSingleStudentInviteAction('stud-2', 'http://localhost:3000');
      expect(res.success).toBe(true);
      expect(res.message).toMatch(/invitation successfully sent/i);
      expect(mockAuditLogs.some((a) => a.action === 'STUDENT_INVITE_SENT')).toBe(true);
    });
  });
});
