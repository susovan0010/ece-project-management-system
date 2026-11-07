import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getGroupForumDataAction,
  createForumPostAction,
  createForumReplyAction,
  toggleForumReactionAction,
  castSupervisorMarkupAction,
} from '@/app/actions/forum';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

let mockPosts: any[] = [];
let mockReplies: any[] = [];
let mockReactions: any[] = [];
let mockMarkupVotes: any[] = [];
let mockGroups: any[] = [];
let mockStudents: any[] = [];
let mockUsers: any[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findFirst: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.OR) {
          for (const c of where.OR) {
            if (c.userId) {
              const s = mockStudents.find((st) => st.userId === c.userId);
              if (s) return s;
            }
          }
        }
        return null;
      }),
    },
    group: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return mockGroups.find((g) => g.id === where.id) || null;
      }),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.supervisorId) {
          return mockGroups.filter((g) => g.supervisorId === where.supervisorId);
        }
        return mockGroups;
      }),
      findFirst: vi.fn().mockImplementation(() => mockGroups[0] || null),
    },
    forumPost: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return mockPosts
          .filter((p) => p.groupId === where.groupId)
          .map((p) => ({
            ...p,
            reactions: mockReactions.filter((r) => r.postId === p.id),
            markupVotes: mockMarkupVotes.filter((v) => v.postId === p.id),
            replies: mockReplies
              .filter((r) => r.postId === p.id)
              .map((r) => ({
                ...r,
                reactions: mockReactions.filter((rx) => rx.replyId === r.id),
                markupVotes: mockMarkupVotes.filter((vx) => vx.replyId === r.id),
              })),
          }));
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const p = mockPosts.find((post) => post.id === where.id);
        if (!p) return null;
        const g = mockGroups.find((grp) => grp.id === p.groupId);
        return {
          ...p,
          group: g,
        };
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const newPost = {
          id: `post-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          author: mockUsers.find((u) => u.id === data.authorId) || {
            id: data.authorId,
            name: 'User',
            role: 'STUDENT',
            email: 'user@heritageit.edu',
          },
        };
        mockPosts.push(newPost);
        return newPost;
      }),
    },
    forumReply: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const r = mockReplies.find((rep) => rep.id === where.id);
        if (!r) return null;
        const p = mockPosts.find((post) => post.id === r.postId);
        const g = mockGroups.find((grp) => grp.id === p?.groupId);
        return {
          ...r,
          post: {
            ...p,
            group: g,
          },
        };
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const newReply = {
          id: `reply-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          author: mockUsers.find((u) => u.id === data.authorId) || {
            id: data.authorId,
            name: 'User',
            role: 'STUDENT',
            email: 'user@heritageit.edu',
          },
        };
        mockReplies.push(newReply);
        return newReply;
      }),
    },
    forumReaction: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.userId_postId) {
          return (
            mockReactions.find(
              (r) => r.userId === where.userId_postId.userId && r.postId === where.userId_postId.postId
            ) || null
          );
        }
        if (where?.userId_replyId) {
          return (
            mockReactions.find(
              (r) => r.userId === where.userId_replyId.userId && r.replyId === where.userId_replyId.replyId
            ) || null
          );
        }
        return null;
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const item = { id: `react-${Date.now()}`, createdAt: new Date(), ...data };
        mockReactions.push(item);
        return item;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const idx = mockReactions.findIndex((r) => r.id === where.id);
        if (idx >= 0) mockReactions[idx] = { ...mockReactions[idx], ...data };
        return mockReactions[idx];
      }),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        mockReactions = mockReactions.filter((r) => r.id !== where.id);
        return {};
      }),
    },
    forumMarkupVote: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.targetUserId) {
          return mockMarkupVotes.filter((v) => v.targetUserId === where.targetUserId);
        }
        return mockMarkupVotes;
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.supervisorId_postId) {
          return (
            mockMarkupVotes.find(
              (v) =>
                v.supervisorId === where.supervisorId_postId.supervisorId &&
                v.postId === where.supervisorId_postId.postId
            ) || null
          );
        }
        if (where?.supervisorId_replyId) {
          return (
            mockMarkupVotes.find(
              (v) =>
                v.supervisorId === where.supervisorId_replyId.supervisorId &&
                v.replyId === where.supervisorId_replyId.replyId
            ) || null
          );
        }
        return null;
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const item = { id: `vote-${Date.now()}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockMarkupVotes.push(item);
        return item;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const idx = mockMarkupVotes.findIndex((v) => v.id === where.id);
        if (idx >= 0) mockMarkupVotes[idx] = { ...mockMarkupVotes[idx], ...data };
        return mockMarkupVotes[idx];
      }),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        mockMarkupVotes = mockMarkupVotes.filter((v) => v.id !== where.id);
        return {};
      }),
    },
  },
}));

import { auth } from '@/auth';

describe('Group Forum Discussion & Supervisor Feedback Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPosts = [];
    mockReplies = [];
    mockReactions = [];
    mockMarkupVotes = [];

    mockUsers = [
      { id: 'user-faculty-1', name: 'Dr. Dulal Mandal', email: 'dulal.mandal@heritageit.edu', role: 'FACULTY' },
      { id: 'user-student-1', name: 'Sourav Roy', email: 'student.demo@heritageit.edu', role: 'STUDENT' },
      { id: 'user-student-2', name: 'Ananya Sen', email: 'ananya.sen@heritageit.edu', role: 'STUDENT' },
    ];

    mockStudents = [
      {
        id: 'stud-1',
        userId: 'user-student-1',
        name: 'Sourav Roy',
        roll: '12620003001',
        email: 'student.demo@heritageit.edu',
        groups: [{ groupId: 'group-1' }],
      },
      {
        id: 'stud-2',
        userId: 'user-student-2',
        name: 'Ananya Sen',
        roll: '12620003002',
        email: 'ananya.sen@heritageit.edu',
        groups: [{ groupId: 'group-1' }],
      },
    ];

    mockGroups = [
      {
        id: 'group-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 'topic-1',
        supervisorId: 'user-faculty-1',
        topic: { code: 'SIH26015', title: 'Geospatial Watershed AI' },
        supervisor: { id: 'user-faculty-1', name: 'Dr. Dulal Mandal', email: 'dulal.mandal@heritageit.edu' },
        members: [
          { student: { id: 'stud-1', userId: 'user-student-1', name: 'Sourav Roy', roll: '12620003001', email: 'student.demo@heritageit.edu' } },
          { student: { id: 'stud-2', userId: 'user-student-2', name: 'Ananya Sen', roll: '12620003002', email: 'ananya.sen@heritageit.edu' } },
        ],
      },
    ];
  });

  describe('getGroupForumDataAction', () => {
    it('rejects unauthenticated requests', async () => {
      (auth as any).mockResolvedValue(null);
      const res = await getGroupForumDataAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unauthorized/i);
    });

    it('loads allocated group forum data for student', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-1', role: 'STUDENT', email: 'student.demo@heritageit.edu' },
      });

      const res = await getGroupForumDataAction();
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.group.number).toBe(1);
      expect(res.data?.group.supervisor.name).toBe('Dr. Dulal Mandal');
      expect(res.data?.isSupervisor).toBe(false);
      expect(res.data?.members.length).toBe(2);
    });
  });

  describe('createForumPostAction and createForumReplyAction', () => {
    it('allows student to publish a discussion thread with title and attachments', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-1', role: 'STUDENT', email: 'student.demo@heritageit.edu' },
      });

      const res = await createForumPostAction({
        groupId: 'group-1',
        title: 'YOLOv8 Satellite Image Pipeline',
        content: 'We need to discuss memory optimization for edge inference.',
        attachments: [{ name: 'results.pdf', size: 1024, type: 'application/pdf', url: 'data:pdf' }],
      });

      expect(res.success).toBe(true);
      expect(mockPosts.length).toBe(1);
      expect(mockPosts[0].title).toBe('YOLOv8 Satellite Image Pipeline');
    });

    it('allows supervisor to reply to a discussion thread', async () => {
      // First seed a post
      mockPosts.push({
        id: 'post-1',
        groupId: 'group-1',
        authorId: 'user-student-1',
        title: 'Dataset query',
        content: 'Where can we get the multispectral dataset?',
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        author: mockUsers[1],
      });

      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'dulal.mandal@heritageit.edu' },
      });

      const res = await createForumReplyAction({
        postId: 'post-1',
        content: 'Check the ISRO Bhuvan open portal as discussed in yesterday meeting.',
      });

      expect(res.success).toBe(true);
      expect(mockReplies.length).toBe(1);
      expect(mockReplies[0].content).toContain('ISRO Bhuvan');
    });
  });

  describe('toggleForumReactionAction', () => {
    it('allows toggling likes on posts', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-2', role: 'STUDENT', email: 'ananya.sen@heritageit.edu' },
      });

      // Like
      const res1 = await toggleForumReactionAction({ postId: 'post-1', type: 'LIKE' });
      expect(res1.success).toBe(true);
      expect(res1.userReaction).toBe('LIKE');
      expect(mockReactions.length).toBe(1);

      // Toggle off
      const res2 = await toggleForumReactionAction({ postId: 'post-1', type: 'LIKE' });
      expect(res2.success).toBe(true);
      expect(res2.userReaction).toBeNull();
      expect(mockReactions.length).toBe(0);
    });
  });

  describe('castSupervisorMarkupAction', () => {
    beforeEach(() => {
      mockPosts.push({
        id: 'post-1',
        groupId: 'group-1',
        authorId: 'user-student-1',
        title: 'Deep Research on Transformers',
        content: 'Detailed analysis of self-attention in vision transformers.',
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        group: mockGroups[0],
      });
    });

    it('rejects student attempting to cast supervisor markup', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-2', role: 'STUDENT', email: 'ananya.sen@heritageit.edu' },
      });

      const res = await castSupervisorMarkupAction({
        postId: 'post-1',
        targetUserId: 'user-student-1',
        value: 1,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only the project supervisor/i);
    });

    it('allows supervisor to cast Mark Up (+1) and toggle it off', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'dulal.mandal@heritageit.edu' },
      });

      // Give Mark Up
      const res1 = await castSupervisorMarkupAction({
        postId: 'post-1',
        targetUserId: 'user-student-1',
        value: 1,
      });

      expect(res1.success).toBe(true);
      expect(res1.currentVote).toBe(1);
      expect(mockMarkupVotes.length).toBe(1);
      expect(mockMarkupVotes[0].value).toBe(1);

      // Toggle off
      const res2 = await castSupervisorMarkupAction({
        postId: 'post-1',
        targetUserId: 'user-student-1',
        value: 1,
      });

      expect(res2.success).toBe(true);
      expect(res2.currentVote).toBeNull();
      expect(mockMarkupVotes.length).toBe(0);
    });
  });
});
