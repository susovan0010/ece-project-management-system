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
          .filter((p) => {
            if (where?.channel && p.channel !== where.channel) return false;
            if (where?.groupId && p.groupId !== where.groupId) return false;
            return true;
          })
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
          id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          channel: data.channel || 'GROUP',
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
    user: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.role) {
          return mockUsers.filter((u) => u.role === where.role);
        }
        return mockUsers;
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return mockUsers.find((u) => u.id === where.id) || null;
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
      { id: 'user-faculty-1', name: 'Dr. Susovan Mandal', email: 'susovan.mandal@heritageit.edu', role: 'FACULTY' },
      { id: 'user-faculty-2', name: 'Dr. Debasish Roy', email: 'debasish.roy@heritageit.edu', role: 'FACULTY' },
      { id: 'user-student-1', name: 'Sourav Roy', email: 'student.demo@heritageit.edu', role: 'STUDENT' },
      { id: 'user-student-2', name: 'Ananya Sen', email: 'ananya.sen@heritageit.edu', role: 'STUDENT' },
      { id: 'user-admin-1', name: 'Prof. Subhashis Majumder', email: 'admin@heritageit.edu', role: 'ADMIN' },
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
        supervisor: { id: 'user-faculty-1', name: 'Dr. Susovan Mandal', email: 'susovan.mandal@heritageit.edu' },
        members: [
          { student: { id: 'stud-1', userId: 'user-student-1', name: 'Sourav Roy', roll: '12620003001', email: 'student.demo@heritageit.edu' } },
          { student: { id: 'stud-2', userId: 'user-student-2', name: 'Ananya Sen', roll: '12620003002', email: 'ananya.sen@heritageit.edu' } },
        ],
      },
      {
        id: 'group-2',
        number: 2,
        batchId: '2023-2027',
        topicId: 'topic-2',
        supervisorId: 'user-faculty-1',
        topic: { code: 'SIH26016', title: 'FPGA Cryptographic Accelerator' },
        supervisor: { id: 'user-faculty-1', name: 'Dr. Susovan Mandal', email: 'susovan.mandal@heritageit.edu' },
        members: [],
      },
    ];
  });

  describe('Channel Routing and Privacy Boundaries', () => {
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
      expect(res.data?.channel).toBe('GROUP');
      expect(res.data?.group?.number).toBe(1);
      expect(res.data?.group?.supervisor.name).toBe('Dr. Susovan Mandal');
      expect(res.data?.isSupervisor).toBe(false);
      expect(res.data?.members.length).toBe(2);
    });

    it('prevents students from accessing the COMMITTEE channel', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-1', role: 'STUDENT', email: 'student.demo@heritageit.edu' },
      });

      // Student attempting to access committee forum
      const res = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(res.data?.channel).toBe('GROUP'); // Enforced to GROUP
    });

    it('routes Admin directly to the COMMITTEE channel and blocks student group inspection', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(res.success).toBe(true);
      expect(res.data?.channel).toBe('COMMITTEE');
      expect(res.data?.group).toBeNull(); // No student group details leaked
    });
  });

  describe('createForumPostAction and Broadcasts', () => {
    it('allows student to publish a discussion thread with title and attachments', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-1', role: 'STUDENT', email: 'student.demo@heritageit.edu' },
      });

      const res = await createForumPostAction({
        channel: 'GROUP',
        groupId: 'group-1',
        title: 'YOLOv8 Satellite Image Pipeline',
        content: 'We need to discuss memory optimization for edge inference.',
        attachments: [{ name: 'results.pdf', size: 1024, type: 'application/pdf', url: 'data:pdf' }],
      });

      expect(res.success).toBe(true);
      expect(mockPosts.length).toBe(1);
      expect(mockPosts[0].title).toBe('YOLOv8 Satellite Image Pipeline');
      expect(mockPosts[0].channel).toBe('GROUP');
    });

    it('allows supervisor to broadcast a post to ALL supervised groups simultaneously', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });

      const res = await createForumPostAction({
        channel: 'GROUP',
        targetScope: 'ALL_SUPERVISED_GROUPS',
        title: 'Mandatory Phase 2 Review Preparation Guidelines',
        content: 'All groups supervised under me must prepare slides covering block diagrams and state machines.',
      });

      expect(res.success).toBe(true);
      expect(res.message).toMatch(/broadcast to all 2 supervised groups/i);
      expect(mockPosts.length).toBe(2); // One created for Group 1 and one for Group 2
      expect(mockPosts.every((p) => p.targetScope === 'ALL_SUPERVISED_GROUPS')).toBe(true);
    });

    it('allows faculty to post in the COMMITTEE channel', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });

      const res = await createForumPostAction({
        channel: 'COMMITTEE',
        title: 'Component Procurement Schedule Query',
        content: 'Requesting the committee to clarify component reimbursement deadlines.',
      });

      expect(res.success).toBe(true);
      expect(mockPosts.length).toBe(1);
      expect(mockPosts[0].channel).toBe('COMMITTEE');
      expect(mockPosts[0].groupId).toBeNull();
    });
  });

  describe('createForumReplyAction and toggleForumReactionAction', () => {
    beforeEach(() => {
      mockPosts.push({
        id: 'post-1',
        channel: 'GROUP',
        groupId: 'group-1',
        authorId: 'user-student-1',
        title: 'Dataset query',
        content: 'Where can we get the multispectral dataset?',
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        author: mockUsers[1],
        group: mockGroups[0],
      });
    });

    it('allows supervisor to reply to a discussion thread', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });

      const res = await createForumReplyAction({
        postId: 'post-1',
        content: 'Check the ISRO Bhuvan open portal as discussed in yesterday meeting.',
      });

      expect(res.success).toBe(true);
      expect(mockReplies.length).toBe(1);
      expect(mockReplies[0].content).toContain('ISRO Bhuvan');
    });

    it('allows toggling likes on posts', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-student-2', role: 'STUDENT', email: 'ananya.sen@heritageit.edu' },
      });

      const res1 = await toggleForumReactionAction({ postId: 'post-1', type: 'LIKE' });
      expect(res1.success).toBe(true);
      expect(res1.userReaction).toBe('LIKE');
      expect(mockReactions.length).toBe(1);

      const res2 = await toggleForumReactionAction({ postId: 'post-1', type: 'LIKE' });
      expect(res2.success).toBe(true);
      expect(res2.userReaction).toBeNull();
      expect(mockReactions.length).toBe(0);
    });
  });

  describe('castSupervisorMarkupAction and Badge Rules', () => {
    beforeEach(() => {
      mockPosts.push({
        id: 'post-1',
        channel: 'GROUP',
        groupId: 'group-1',
        authorId: 'user-student-1',
        title: 'Deep Research on Transformers',
        content: 'Detailed analysis of self-attention in vision transformers.',
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        group: mockGroups[0],
      });
      mockPosts.push({
        id: 'post-committee-1',
        channel: 'COMMITTEE',
        groupId: null,
        authorId: 'user-faculty-1',
        title: 'Committee Notice',
        content: 'Notice for all supervisors.',
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        group: null,
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

    it('disallows markups in the COMMITTEE channel', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const res = await castSupervisorMarkupAction({
        postId: 'post-committee-1',
        targetUserId: 'user-faculty-1',
        value: 1,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not applicable in Committee discussions/i);
    });

    it('allows supervisor to cast Mark Up (+1) and toggle it off in Group discussions', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
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

  describe('Supervisor-Admin Private Communication & Broadcast Targeting', () => {
    it('ensures faculty post to Admin is strictly private and hidden from other faculty', async () => {
      // 1. Faculty 1 creates post to Admin Committee
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });

      const createRes = await createForumPostAction({
        channel: 'COMMITTEE',
        title: 'Private Question on Rubrics Weightage',
        content: 'Dear Committee, I need clarification on Group 1 rubric scoring.',
      });
      expect(createRes.success).toBe(true);

      const createdPost = mockPosts.find((p) => p.title === 'Private Question on Rubrics Weightage');
      expect(createdPost).toBeDefined();
      expect(createdPost?.targetScope).toBe('PRIVATE_ADMIN');

      // 2. Admin can see this private communication
      (auth as any).mockResolvedValue({
        user: { id: 'user-admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });
      const adminData = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(adminData.success).toBe(true);
      expect(adminData.data?.posts.some((p) => p.id === createdPost?.id)).toBe(true);

      // 3. Faculty 1 (author) can see this post
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });
      const fac1Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac1Data.success).toBe(true);
      expect(fac1Data.data?.posts.some((p) => p.id === createdPost?.id)).toBe(true);

      // 4. Faculty 2 MUST NOT see Faculty 1's private communication
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-2', role: 'FACULTY', email: 'debasish.roy@heritageit.edu' },
      });
      const fac2Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac2Data.success).toBe(true);
      expect(fac2Data.data?.posts.some((p) => p.id === createdPost?.id)).toBe(false);

      // 5. Faculty 2 cannot reply to Faculty 1's private thread
      const fac2Reply = await createForumReplyAction({
        postId: createdPost!.id,
        content: 'I want to reply to this thread.',
      });
      expect(fac2Reply.success).toBe(false);
      expect(fac2Reply.error).toMatch(/unauthorized|permission/i);
    });

    it('allows Admin to broadcast to all faculty supervisors', async () => {
      // Admin creates broadcast
      (auth as any).mockResolvedValue({
        user: { id: 'user-admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const broadcastRes = await createForumPostAction({
        channel: 'COMMITTEE',
        targetScope: 'BROADCAST_ALL',
        title: 'Department Circular: Phase 2 Evaluation Dates',
        content: 'All faculty supervisors must submit marks by Friday.',
      });
      expect(broadcastRes.success).toBe(true);

      const broadcastPost = mockPosts.find((p) => p.title === 'Department Circular: Phase 2 Evaluation Dates');
      expect(broadcastPost).toBeDefined();

      // Faculty 1 sees broadcast
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });
      const fac1Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac1Data.data?.posts.some((p) => p.id === broadcastPost?.id)).toBe(true);

      // Faculty 2 sees broadcast
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-2', role: 'FACULTY', email: 'debasish.roy@heritageit.edu' },
      });
      const fac2Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac2Data.data?.posts.some((p) => p.id === broadcastPost?.id)).toBe(true);
    });

    it('allows Admin to target specific supervisor(s) exclusively', async () => {
      // Admin targets Faculty 1 only
      (auth as any).mockResolvedValue({
        user: { id: 'user-admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
      });

      const targetedRes = await createForumPostAction({
        channel: 'COMMITTEE',
        targetScope: 'SELECTED_SUPERVISORS',
        targetUserIds: ['user-faculty-1'],
        title: 'Specific Query regarding Group 1 Topic Scope',
        content: 'Please adjust WK attributes for Group 1.',
      });
      expect(targetedRes.success).toBe(true);

      const targetedPost = mockPosts.find((p) => p.title === 'Specific Query regarding Group 1 Topic Scope');
      expect(targetedPost).toBeDefined();

      // Faculty 1 (targeted) can see it
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-1', role: 'FACULTY', email: 'susovan.mandal@heritageit.edu' },
      });
      const fac1Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac1Data.data?.posts.some((p) => p.id === targetedPost?.id)).toBe(true);

      // Faculty 2 (not targeted) cannot see it
      (auth as any).mockResolvedValue({
        user: { id: 'user-faculty-2', role: 'FACULTY', email: 'debasish.roy@heritageit.edu' },
      });
      const fac2Data = await getGroupForumDataAction(undefined, 'COMMITTEE');
      expect(fac2Data.data?.posts.some((p) => p.id === targetedPost?.id)).toBe(false);

      // Faculty 2 cannot reply to targeted post
      const fac2Reply = await createForumReplyAction({
        postId: targetedPost!.id,
        content: 'Attempting to reply to targeted post.',
      });
      expect(fac2Reply.success).toBe(false);
      expect(fac2Reply.error).toMatch(/unauthorized|permission/i);
    });
  });
});
