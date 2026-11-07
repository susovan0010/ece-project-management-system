'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { calculateStudentBadges, StudentBadgeSummary } from '@/lib/engine/badge-engine';
import { uploadFileToGoogleDrive } from '@/lib/google-drive';

export interface ForumAttachment {
  name: string;
  size: number;
  type: string;
  url: string; // Base64 data URL or Google Drive link
  driveFileId?: string;
  driveViewLink?: string;
  driveDownloadLink?: string;
  hostedOn?: 'GOOGLE_DRIVE' | 'LOCAL_FALLBACK';
}

export interface ForumAuthor {
  id: string;
  name: string;
  role: 'STUDENT' | 'FACULTY' | 'ADMIN';
  email: string;
  roll?: string;
  badges?: StudentBadgeSummary;
}

export interface ForumReactionSummary {
  likes: number;
  dislikes: number;
  userReaction: 'LIKE' | 'DISLIKE' | null;
}

export interface ForumMarkupSummary {
  netScore: number; // sum of markup (+1) and markdown (-1)
  supervisorVote: 1 | -1 | null; // Vote cast by current group's supervisor
}

export interface ForumReplyItem {
  id: string;
  postId: string;
  content: string;
  attachments: ForumAttachment[];
  createdAt: string;
  author: ForumAuthor;
  reactions: ForumReactionSummary;
  markup: ForumMarkupSummary;
}

export interface ForumPostItem {
  id: string;
  groupId: string | null;
  channel: 'GROUP' | 'COMMITTEE';
  targetScope?: string | null;
  title: string;
  content: string;
  attachments: ForumAttachment[];
  createdAt: string;
  author: ForumAuthor;
  reactions: ForumReactionSummary;
  markup: ForumMarkupSummary;
  replies: ForumReplyItem[];
}

export interface GroupForumData {
  channel: 'GROUP' | 'COMMITTEE';
  group: {
    id: string;
    number: number;
    batchId: string;
    topic: {
      code: string;
      title: string;
    } | null;
    supervisor: {
      id: string;
      name: string;
      email: string;
    };
  } | null;
  supervisedGroups: Array<{
    id: string;
    number: number;
    batchId: string;
    topicCode: string;
    topicTitle: string;
  }>;
  currentUserRole: 'STUDENT' | 'FACULTY' | 'ADMIN';
  currentUserId: string;
  isSupervisor: boolean;
  members: Array<{
    id: string;
    studentId: string;
    name: string;
    roll: string;
    email: string | null;
    badges: StudentBadgeSummary;
  }>;
  posts: ForumPostItem[];
}

/**
 * 1. Load Forum Data for a Group or Committee Channel
 *
 * Privacy Rules:
 * - STUDENT: Only their own group forum (GROUP). Never COMMITTEE.
 * - ADMIN: Only Committee forum (COMMITTEE). Never student-supervisor group posts.
 * - FACULTY: Can switch between their supervised groups (GROUP) and Committee forum (COMMITTEE).
 */
export async function getGroupForumDataAction(
  requestedGroupId?: string,
  requestedChannel?: 'GROUP' | 'COMMITTEE'
): Promise<{
  success: boolean;
  data?: GroupForumData;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized: Please sign in.' };
  }

  const userId = session.user.id;
  const userRole = (session.user as { role?: string }).role as 'STUDENT' | 'FACULTY' | 'ADMIN';
  const userEmail = session.user.email?.toLowerCase().trim();

  // Enforce channel routing
  let effectiveChannel: 'GROUP' | 'COMMITTEE' = 'GROUP';
  if (userRole === 'ADMIN') {
    effectiveChannel = 'COMMITTEE';
  } else if (userRole === 'STUDENT') {
    effectiveChannel = 'GROUP';
  } else {
    effectiveChannel = requestedChannel === 'COMMITTEE' ? 'COMMITTEE' : 'GROUP';
  }

  try {
    let supervisedGroupsList: any[] = [];
    if (userRole === 'FACULTY' || userRole === 'ADMIN') {
      supervisedGroupsList = await prisma.group.findMany({
        where: userRole === 'FACULTY' ? { supervisorId: userId } : undefined,
        include: {
          topic: { select: { code: true, title: true } },
          supervisor: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      });
    }

    // ----------------------------------------------------
    // CASE A: COMMITTEE DISCUSSION CHANNEL (Supervisors <-> Admins)
    // ----------------------------------------------------
    if (effectiveChannel === 'COMMITTEE') {
      if (userRole === 'STUDENT') {
        return {
          success: false,
          error: 'Unauthorized: Students do not have access to Committee discussions.',
        };
      }

      const rawPosts = await prisma.forumPost.findMany({
        where: { channel: 'COMMITTEE' },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
              email: true,
            },
          },
          reactions: true,
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  email: true,
                },
              },
              reactions: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const formattedPosts: ForumPostItem[] = rawPosts.map((p) => {
        const postLikes = p.reactions.filter((r) => r.type === 'LIKE').length;
        const postDislikes = p.reactions.filter((r) => r.type === 'DISLIKE').length;
        const myPostReaction = (p.reactions.find((r) => r.userId === userId)?.type as 'LIKE' | 'DISLIKE' | undefined) || null;

        const formattedReplies: ForumReplyItem[] = p.replies.map((r) => {
          const rLikes = r.reactions.filter((rx) => rx.type === 'LIKE').length;
          const rDislikes = r.reactions.filter((rx) => rx.type === 'DISLIKE').length;
          const myRReaction = (r.reactions.find((rx) => rx.userId === userId)?.type as 'LIKE' | 'DISLIKE' | undefined) || null;

          return {
            id: r.id,
            postId: r.postId,
            content: r.content,
            attachments: (r.attachments as any) || [],
            createdAt: r.createdAt.toISOString(),
            author: {
              id: r.author.id,
              name: r.author.name,
              role: r.author.role,
              email: r.author.email,
            },
            reactions: {
              likes: rLikes,
              dislikes: rDislikes,
              userReaction: myRReaction,
            },
            markup: {
              netScore: 0,
              supervisorVote: null,
            },
          };
        });

        return {
          id: p.id,
          groupId: null,
          channel: 'COMMITTEE',
          targetScope: p.targetScope || 'COMMITTEE',
          title: p.title,
          content: p.content,
          attachments: (p.attachments as any) || [],
          createdAt: p.createdAt.toISOString(),
          author: {
            id: p.author.id,
            name: p.author.name,
            role: p.author.role,
            email: p.author.email,
          },
          reactions: {
            likes: postLikes,
            dislikes: postDislikes,
            userReaction: myPostReaction || null,
          },
          markup: {
            netScore: 0,
            supervisorVote: null,
          },
          replies: formattedReplies,
        };
      });

      return {
        success: true,
        data: {
          channel: 'COMMITTEE',
          group: null,
          supervisedGroups: supervisedGroupsList.map((g) => ({
            id: g.id,
            number: g.number,
            batchId: g.batchId,
            topicCode: g.topic?.code || '',
            topicTitle: g.topic?.title || '',
          })),
          currentUserRole: userRole,
          currentUserId: userId,
          isSupervisor: false,
          members: [],
          posts: formattedPosts,
        },
      };
    }

    // ----------------------------------------------------
    // CASE B: GROUP DISCUSSION CHANNEL (Supervisor <-> Students)
    // ----------------------------------------------------
    if (userRole === 'ADMIN') {
      return {
        success: false,
        error: 'Unauthorized: Student group discussions are strictly private between students and their supervisor.',
      };
    }

    let targetGroupId = requestedGroupId;

    if (userRole === 'STUDENT') {
      const studentRecord = await prisma.student.findFirst({
        where: {
          OR: [
            { userId },
            userEmail ? { email: { equals: userEmail, mode: 'insensitive' } } : {},
          ],
        },
        include: {
          groups: {
            include: { group: true },
          },
        },
      });

      if (!studentRecord || studentRecord.groups.length === 0) {
        return {
          success: false,
          error: 'You have not been allocated to a project group yet. Please contact the project committee.',
        };
      }

      targetGroupId = studentRecord.groups[0].groupId;
    } else if (userRole === 'FACULTY') {
      if (supervisedGroupsList.length === 0) {
        return {
          success: false,
          error: 'You do not have any allotted project groups assigned as supervisor yet.',
        };
      }

      if (!targetGroupId || !supervisedGroupsList.some((g) => g.id === targetGroupId)) {
        targetGroupId = supervisedGroupsList[0].id;
      }
    }

    if (!targetGroupId) {
      return { success: false, error: 'Target project group not found.' };
    }

    const group = await prisma.group.findUnique({
      where: { id: targetGroupId },
      include: {
        topic: { select: { code: true, title: true } },
        supervisor: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            student: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!group) {
      return { success: false, error: 'Project group not found.' };
    }

    const isSupervisor = group.supervisorId === userId;

    if (userRole === 'STUDENT') {
      const isMember = group.members.some(
        (m) =>
          m.student.userId === userId ||
          (userEmail && m.student.email?.toLowerCase().trim() === userEmail)
      );
      if (!isMember) {
        return { success: false, error: 'Unauthorized: You can only access your own project group forum.' };
      }
    }

    // Calculate badges for group members
    const membersWithBadges = await Promise.all(
      group.members.map(async (m) => {
        const studentUserId = m.student.userId;
        let score = 0;
        if (studentUserId) {
          const votes = await prisma.forumMarkupVote.findMany({
            where: { targetUserId: studentUserId },
            select: { value: true },
          });
          score = votes.reduce((acc, v) => acc + v.value, 0);
        }
        return {
          id: m.student.id,
          studentId: m.student.id,
          name: m.student.name,
          roll: m.student.roll,
          email: m.student.email,
          badges: calculateStudentBadges(score),
        };
      })
    );

    // Fetch posts for this specific group
    const rawPosts = await prisma.forumPost.findMany({
      where: {
        groupId: targetGroupId,
        channel: 'GROUP',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            email: true,
            student: { select: { roll: true } },
          },
        },
        reactions: true,
        markupVotes: true,
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                email: true,
                student: { select: { roll: true } },
              },
            },
            reactions: true,
            markupVotes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedPosts: ForumPostItem[] = await Promise.all(
      rawPosts.map(async (p) => {
        let authorBadges = calculateStudentBadges(0);
        if (p.author.role === 'STUDENT') {
          const authorVotes = await prisma.forumMarkupVote.findMany({
            where: { targetUserId: p.author.id },
            select: { value: true },
          });
          const score = authorVotes.reduce((acc, v) => acc + v.value, 0);
          authorBadges = calculateStudentBadges(score);
        }

        const postLikes = p.reactions.filter((r) => r.type === 'LIKE').length;
        const postDislikes = p.reactions.filter((r) => r.type === 'DISLIKE').length;
        const myPostReaction = (p.reactions.find((r) => r.userId === userId)?.type as 'LIKE' | 'DISLIKE' | undefined) || null;

        const postNetMarkup = p.markupVotes.reduce((acc, v) => acc + v.value, 0);
        const mySupervisorPostVote = isSupervisor
          ? (p.markupVotes.find((v) => v.supervisorId === userId)?.value as 1 | -1 | undefined)
          : undefined;

        const formattedReplies: ForumReplyItem[] = await Promise.all(
          p.replies.map(async (r) => {
            let rAuthorBadges = calculateStudentBadges(0);
            if (r.author.role === 'STUDENT') {
              const rVotes = await prisma.forumMarkupVote.findMany({
                where: { targetUserId: r.author.id },
                select: { value: true },
              });
              const score = rVotes.reduce((acc, v) => acc + v.value, 0);
              rAuthorBadges = calculateStudentBadges(score);
            }

            const rLikes = r.reactions.filter((rx) => rx.type === 'LIKE').length;
            const rDislikes = r.reactions.filter((rx) => rx.type === 'DISLIKE').length;
            const myRReaction = (r.reactions.find((rx) => rx.userId === userId)?.type as 'LIKE' | 'DISLIKE' | undefined) || null;

            const rNetMarkup = r.markupVotes.reduce((acc, v) => acc + v.value, 0);
            const mySupervisorRVote = isSupervisor
              ? (r.markupVotes.find((v) => v.supervisorId === userId)?.value as 1 | -1 | undefined)
              : undefined;

            return {
              id: r.id,
              postId: r.postId,
              content: r.content,
              attachments: (r.attachments as any) || [],
              createdAt: r.createdAt.toISOString(),
              author: {
                id: r.author.id,
                name: r.author.name,
                role: r.author.role,
                email: r.author.email,
                roll: r.author.student?.roll,
                badges: rAuthorBadges,
              },
              reactions: {
                likes: rLikes,
                dislikes: rDislikes,
                userReaction: myRReaction || null,
              },
              markup: {
                netScore: rNetMarkup,
                supervisorVote: mySupervisorRVote || null,
              },
            };
          })
        );

        return {
          id: p.id,
          groupId: p.groupId,
          channel: 'GROUP',
          targetScope: p.targetScope || 'SINGLE_GROUP',
          title: p.title,
          content: p.content,
          attachments: (p.attachments as any) || [],
          createdAt: p.createdAt.toISOString(),
          author: {
            id: p.author.id,
            name: p.author.name,
            role: p.author.role,
            email: p.author.email,
            roll: p.author.student?.roll,
            badges: authorBadges,
          },
          reactions: {
            likes: postLikes,
            dislikes: postDislikes,
            userReaction: myPostReaction || null,
          },
          markup: {
            netScore: postNetMarkup,
            supervisorVote: mySupervisorPostVote || null,
          },
          replies: formattedReplies,
        };
      })
    );

    return {
      success: true,
      data: {
        channel: 'GROUP',
        group: {
          id: group.id,
          number: group.number,
          batchId: group.batchId,
          topic: group.topic ? { code: group.topic.code, title: group.topic.title } : null,
          supervisor: {
            id: group.supervisor.id,
            name: group.supervisor.name,
            email: group.supervisor.email,
          },
        },
        supervisedGroups: supervisedGroupsList.map((g) => ({
          id: g.id,
          number: g.number,
          batchId: g.batchId,
          topicCode: g.topic?.code || '',
          topicTitle: g.topic?.title || '',
        })),
        currentUserRole: userRole,
        currentUserId: userId,
        isSupervisor,
        members: membersWithBadges,
        posts: formattedPosts,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 2. Create a New Discussion Thread / Post
 *
 * Supported Scopes:
 * - COMMITTEE: Supervisor <-> Admin Committee channel.
 * - SINGLE_GROUP: Specific group discussion.
 * - ALL_SUPERVISED_GROUPS: Broadcasts to all groups allotted to the supervisor.
 */
export async function createForumPostAction(data: {
  channel?: 'GROUP' | 'COMMITTEE';
  groupId?: string;
  targetScope?: 'SINGLE_GROUP' | 'ALL_SUPERVISED_GROUPS' | 'COMMITTEE';
  title: string;
  content: string;
  attachments?: ForumAttachment[];
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }

  const currentUser = session.user;
  const currentUserId = currentUser.id as string;
  const currentUserEmail = currentUser.email?.toLowerCase().trim();
  const currentUserRole = (currentUser as { role?: string }).role;

  const title = data.title?.trim();
  const content = data.content?.trim();
  if (!title || !content) {
    return { success: false, error: 'Please provide both a discussion title and body.' };
  }

  const channel = data.channel || 'GROUP';

  try {
    // ----------------------------------------------------
    // CASE A: Post to COMMITTEE Channel
    // ----------------------------------------------------
    if (channel === 'COMMITTEE') {
      if (currentUserRole !== 'FACULTY' && currentUserRole !== 'ADMIN') {
        return { success: false, error: 'Only faculty and administrators can post to Committee discussions.' };
      }

      let processedAttachments: ForumAttachment[] = [];
      if (data.attachments && data.attachments.length > 0) {
        processedAttachments = await Promise.all(
          data.attachments.map(async (att) => {
            const res = await uploadFileToGoogleDrive({
              fileName: att.name,
              size: att.size,
              mimeType: att.type,
              dataUrlOrBase64: att.url,
              batchId: 'Committee',
              groupNumber: 0,
              uploaderEmail: currentUserEmail,
            });

            return {
              name: res.fileName,
              size: res.size,
              type: res.mimeType,
              url: res.viewUrl,
              driveFileId: res.fileId,
              driveViewLink: res.viewUrl,
              driveDownloadLink: res.downloadUrl,
              hostedOn: res.hostedOn,
            };
          })
        );
      }

      await prisma.forumPost.create({
        data: {
          groupId: null,
          channel: 'COMMITTEE',
          targetScope: 'COMMITTEE',
          authorId: currentUserId,
          title,
          content,
          attachments: processedAttachments.length > 0 ? (processedAttachments as any) : null,
        },
      });

      revalidatePath('/faculty/forum');
      revalidatePath('/admin/forum');

      return { success: true, message: 'Committee discussion topic posted successfully.' };
    }

    // ----------------------------------------------------
    // CASE B: Post to GROUP Channel
    // ----------------------------------------------------
    if (currentUserRole === 'ADMIN') {
      return {
        success: false,
        error: 'Admins cannot post to student group discussions. Please use the Committee channel.',
      };
    }

    // Faculty Broadcasting to ALL Supervised Groups
    if (currentUserRole === 'FACULTY' && data.targetScope === 'ALL_SUPERVISED_GROUPS') {
      const supervisedGroups = await prisma.group.findMany({
        where: { supervisorId: currentUserId },
      });

      if (supervisedGroups.length === 0) {
        return { success: false, error: 'You do not supervise any groups to broadcast to.' };
      }

      let processedAttachments: ForumAttachment[] = [];
      if (data.attachments && data.attachments.length > 0) {
        processedAttachments = await Promise.all(
          data.attachments.map(async (att) => {
            const res = await uploadFileToGoogleDrive({
              fileName: att.name,
              size: att.size,
              mimeType: att.type,
              dataUrlOrBase64: att.url,
              batchId: 'Broadcast',
              groupNumber: 0,
              uploaderEmail: currentUserEmail,
            });

            return {
              name: res.fileName,
              size: res.size,
              type: res.mimeType,
              url: res.viewUrl,
              driveFileId: res.fileId,
              driveViewLink: res.viewUrl,
              driveDownloadLink: res.downloadUrl,
              hostedOn: res.hostedOn,
            };
          })
        );
      }

      // Create identical post for each group
      await Promise.all(
        supervisedGroups.map((g) =>
          prisma.forumPost.create({
            data: {
              groupId: g.id,
              channel: 'GROUP',
              targetScope: 'ALL_SUPERVISED_GROUPS',
              authorId: currentUserId,
              title,
              content,
              attachments: processedAttachments.length > 0 ? (processedAttachments as any) : null,
            },
          })
        )
      );

      revalidatePath('/student/forum');
      revalidatePath('/faculty/forum');

      return {
        success: true,
        message: `Discussion broadcast to all ${supervisedGroups.length} supervised groups successfully.`,
      };
    }

    // Single Group Post (Student or Faculty)
    if (!data.groupId) {
      return { success: false, error: 'Group ID is required for a group discussion post.' };
    }

    const group = await prisma.group.findUnique({
      where: { id: data.groupId },
      include: {
        members: { include: { student: true } },
      },
    });

    if (!group) {
      return { success: false, error: 'Group not found.' };
    }

    const isSupervisor = group.supervisorId === currentUserId;
    const isMember = group.members.some(
      (m) =>
        m.student.userId === currentUserId ||
        (currentUserEmail && m.student.email?.toLowerCase().trim() === currentUserEmail)
    );

    if (!isSupervisor && !isMember) {
      return { success: false, error: 'You are not a participant in this group forum.' };
    }

    let processedAttachments: ForumAttachment[] = [];
    if (data.attachments && data.attachments.length > 0) {
      processedAttachments = await Promise.all(
        data.attachments.map(async (att) => {
          const res = await uploadFileToGoogleDrive({
            fileName: att.name,
            size: att.size,
            mimeType: att.type,
            dataUrlOrBase64: att.url,
            batchId: group.batchId,
            groupNumber: group.number,
            uploaderEmail: currentUserEmail,
          });

          return {
            name: res.fileName,
            size: res.size,
            type: res.mimeType,
            url: res.viewUrl,
            driveFileId: res.fileId,
            driveViewLink: res.viewUrl,
            driveDownloadLink: res.downloadUrl,
            hostedOn: res.hostedOn,
          };
        })
      );
    }

    await prisma.forumPost.create({
      data: {
        groupId: data.groupId,
        channel: 'GROUP',
        targetScope: 'SINGLE_GROUP',
        authorId: currentUserId,
        title,
        content,
        attachments: processedAttachments.length > 0 ? (processedAttachments as any) : null,
      },
    });

    revalidatePath('/student/forum');
    revalidatePath('/faculty/forum');

    return { success: true, message: 'Discussion post published successfully.' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 3. Reply / Answer to an Existing Post
 */
export async function createForumReplyAction(data: {
  postId: string;
  content: string;
  attachments?: ForumAttachment[];
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }

  const currentUser = session.user;
  const currentUserId = currentUser.id as string;
  const currentUserEmail = currentUser.email?.toLowerCase().trim();
  const currentUserRole = (currentUser as { role?: string }).role;

  const content = data.content?.trim();
  if (!content) {
    return { success: false, error: 'Reply content cannot be empty.' };
  }

  try {
    const post = await prisma.forumPost.findUnique({
      where: { id: data.postId },
      include: {
        group: {
          include: {
            members: { include: { student: true } },
          },
        },
      },
    });

    if (!post) {
      return { success: false, error: 'Discussion post not found.' };
    }

    let batchId = 'Discussion';
    let groupNumber = 0;

    if (post.channel === 'COMMITTEE') {
      if (currentUserRole !== 'FACULTY' && currentUserRole !== 'ADMIN') {
        return { success: false, error: 'Unauthorized: Students cannot reply to Committee posts.' };
      }
      batchId = 'Committee';
    } else {
      // Group Channel
      if (currentUserRole === 'ADMIN') {
        return {
          success: false,
          error: 'Admins cannot view or reply to student group discussions.',
        };
      }

      if (!post.group) {
        return { success: false, error: 'Group associated with this post was not found.' };
      }

      const isSupervisor = post.group.supervisorId === currentUserId;
      const isMember = post.group.members.some(
        (m) =>
          m.student.userId === currentUserId ||
          (currentUserEmail && m.student.email?.toLowerCase().trim() === currentUserEmail)
      );

      if (!isSupervisor && !isMember) {
        return { success: false, error: 'You are not a participant in this group forum.' };
      }

      batchId = post.group.batchId;
      groupNumber = post.group.number;
    }

    let processedAttachments: ForumAttachment[] = [];
    if (data.attachments && data.attachments.length > 0) {
      processedAttachments = await Promise.all(
        data.attachments.map(async (att) => {
          const res = await uploadFileToGoogleDrive({
            fileName: att.name,
            size: att.size,
            mimeType: att.type,
            dataUrlOrBase64: att.url,
            batchId,
            groupNumber,
            uploaderEmail: currentUserEmail,
          });

          return {
            name: res.fileName,
            size: res.size,
            type: res.mimeType,
            url: res.viewUrl,
            driveFileId: res.fileId,
            driveViewLink: res.viewUrl,
            driveDownloadLink: res.downloadUrl,
            hostedOn: res.hostedOn,
          };
        })
      );
    }

    await prisma.forumReply.create({
      data: {
        postId: data.postId,
        authorId: currentUserId,
        content,
        attachments: processedAttachments.length > 0 ? (processedAttachments as any) : null,
      },
    });

    revalidatePath('/student/forum');
    revalidatePath('/faculty/forum');
    revalidatePath('/admin/forum');

    return { success: true, message: 'Reply posted.' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 4. Toggle Like / Dislike Reaction
 */
export async function toggleForumReactionAction(data: {
  postId?: string;
  replyId?: string;
  type: 'LIKE' | 'DISLIKE';
}): Promise<{
  success: boolean;
  userReaction?: 'LIKE' | 'DISLIKE' | null;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }

  if (!data.postId && !data.replyId) {
    return { success: false, error: 'Target post or reply required.' };
  }

  try {
    const userId = session.user.id;
    const userRole = (session.user as { role?: string }).role;

    // Check post channel permissions
    if (data.postId) {
      const post = await prisma.forumPost.findUnique({
        where: { id: data.postId },
        include: { group: { include: { members: { include: { student: true } } } } },
      });
      if (!post) return { success: false, error: 'Post not found.' };

      if (post.channel === 'COMMITTEE' && userRole === 'STUDENT') {
        return { success: false, error: 'Unauthorized.' };
      }
      if (post.channel === 'GROUP') {
        if (userRole === 'ADMIN') return { success: false, error: 'Unauthorized.' };
        const isSupervisor = post.group?.supervisorId === userId;
        const isMember = post.group?.members.some((m) => m.student.userId === userId);
        if (!isSupervisor && !isMember) return { success: false, error: 'Unauthorized.' };
      }

      const existing = await prisma.forumReaction.findUnique({
        where: {
          userId_postId: { userId, postId: data.postId },
        },
      });

      if (existing) {
        if (existing.type === data.type) {
          await prisma.forumReaction.delete({ where: { id: existing.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          revalidatePath('/admin/forum');
          return { success: true, userReaction: null };
        } else {
          await prisma.forumReaction.update({
            where: { id: existing.id },
            data: { type: data.type },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          revalidatePath('/admin/forum');
          return { success: true, userReaction: data.type };
        }
      } else {
        await prisma.forumReaction.create({
          data: {
            userId,
            postId: data.postId,
            type: data.type,
          },
        });
        revalidatePath('/student/forum');
        revalidatePath('/faculty/forum');
        revalidatePath('/admin/forum');
        return { success: true, userReaction: data.type };
      }
    } else if (data.replyId) {
      const reply = await prisma.forumReply.findUnique({
        where: { id: data.replyId },
        include: { post: { include: { group: { include: { members: { include: { student: true } } } } } } },
      });
      if (!reply) return { success: false, error: 'Reply not found.' };

      if (reply.post.channel === 'COMMITTEE' && userRole === 'STUDENT') {
        return { success: false, error: 'Unauthorized.' };
      }
      if (reply.post.channel === 'GROUP') {
        if (userRole === 'ADMIN') return { success: false, error: 'Unauthorized.' };
        const isSupervisor = reply.post.group?.supervisorId === userId;
        const isMember = reply.post.group?.members.some((m) => m.student.userId === userId);
        if (!isSupervisor && !isMember) return { success: false, error: 'Unauthorized.' };
      }

      const existing = await prisma.forumReaction.findUnique({
        where: {
          userId_replyId: { userId, replyId: data.replyId },
        },
      });

      if (existing) {
        if (existing.type === data.type) {
          await prisma.forumReaction.delete({ where: { id: existing.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          revalidatePath('/admin/forum');
          return { success: true, userReaction: null };
        } else {
          await prisma.forumReaction.update({
            where: { id: existing.id },
            data: { type: data.type },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          revalidatePath('/admin/forum');
          return { success: true, userReaction: data.type };
        }
      } else {
        await prisma.forumReaction.create({
          data: {
            userId,
            replyId: data.replyId,
            type: data.type,
          },
        });
        revalidatePath('/student/forum');
        revalidatePath('/faculty/forum');
        revalidatePath('/admin/forum');
        return { success: true, userReaction: data.type };
      }
    }

    return { success: false, error: 'Invalid reaction request.' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 5. Supervisor-Only Mark Up (+1) / Mark Down (-1) Feedback
 *
 * Applicable ONLY in Group Discussions. Disabled in Committee discussions.
 */
export async function castSupervisorMarkupAction(data: {
  postId?: string;
  replyId?: string;
  targetUserId: string;
  value: 1 | -1;
  reason?: string;
}): Promise<{
  success: boolean;
  currentVote?: 1 | -1 | null;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }

  const supervisorId = session.user.id;
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'FACULTY' && userRole !== 'ADMIN') {
    return { success: false, error: 'Only the project supervisor can cast Mark Up or Mark Down.' };
  }

  if (data.targetUserId === supervisorId) {
    return { success: false, error: 'Supervisors cannot award marks to themselves.' };
  }

  try {
    if (data.postId) {
      const post = await prisma.forumPost.findUnique({
        where: { id: data.postId },
        select: {
          channel: true,
          groupId: true,
          group: { select: { supervisorId: true } },
        },
      });
      if (!post) return { success: false, error: 'Post not found.' };

      if (post.channel === 'COMMITTEE' || !post.groupId) {
        return { success: false, error: 'Mark Up / Mark Down badges are not applicable in Committee discussions.' };
      }

      if (post.group?.supervisorId !== supervisorId && userRole !== 'ADMIN') {
        return { success: false, error: 'Only the assigned supervisor can mark up/down this post.' };
      }

      const existingVote = await prisma.forumMarkupVote.findUnique({
        where: {
          supervisorId_postId: {
            supervisorId,
            postId: data.postId,
          },
        },
      });

      if (existingVote) {
        if (existingVote.value === data.value) {
          // Toggle off
          await prisma.forumMarkupVote.delete({ where: { id: existingVote.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return {
            success: true,
            currentVote: null,
            message: 'Feedback vote retracted.',
          };
        } else {
          // Flip vote
          await prisma.forumMarkupVote.update({
            where: { id: existingVote.id },
            data: { value: data.value, reason: data.reason },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return {
            success: true,
            currentVote: data.value,
            message: data.value === 1 ? 'Mark Up (+1) recorded.' : 'Mark Down (-1) recorded.',
          };
        }
      } else {
        await prisma.forumMarkupVote.create({
          data: {
            supervisorId,
            targetUserId: data.targetUserId,
            postId: data.postId,
            value: data.value,
            reason: data.reason,
          },
        });
        revalidatePath('/student/forum');
        revalidatePath('/faculty/forum');
        return {
          success: true,
          currentVote: data.value,
          message: data.value === 1 ? 'Mark Up (+1) awarded.' : 'Mark Down (-1) applied.',
        };
      }
    } else if (data.replyId) {
      const reply = await prisma.forumReply.findUnique({
        where: { id: data.replyId },
        select: {
          post: {
            select: {
              channel: true,
              groupId: true,
              group: { select: { supervisorId: true } },
            },
          },
        },
      });
      if (!reply) return { success: false, error: 'Reply not found.' };

      if (reply.post.channel === 'COMMITTEE' || !reply.post.groupId) {
        return { success: false, error: 'Mark Up / Mark Down badges are not applicable in Committee discussions.' };
      }

      if (reply.post.group?.supervisorId !== supervisorId && userRole !== 'ADMIN') {
        return { success: false, error: 'Only the assigned supervisor can mark up/down this reply.' };
      }

      const existingVote = await prisma.forumMarkupVote.findUnique({
        where: {
          supervisorId_replyId: {
            supervisorId,
            replyId: data.replyId,
          },
        },
      });

      if (existingVote) {
        if (existingVote.value === data.value) {
          await prisma.forumMarkupVote.delete({ where: { id: existingVote.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return {
            success: true,
            currentVote: null,
            message: 'Feedback vote retracted.',
          };
        } else {
          await prisma.forumMarkupVote.update({
            where: { id: existingVote.id },
            data: { value: data.value, reason: data.reason },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return {
            success: true,
            currentVote: data.value,
            message: data.value === 1 ? 'Mark Up (+1) recorded.' : 'Mark Down (-1) recorded.',
          };
        }
      } else {
        await prisma.forumMarkupVote.create({
          data: {
            supervisorId,
            targetUserId: data.targetUserId,
            replyId: data.replyId,
            value: data.value,
            reason: data.reason,
          },
        });
        revalidatePath('/student/forum');
        revalidatePath('/faculty/forum');
        return {
          success: true,
          currentVote: data.value,
          message: data.value === 1 ? 'Mark Up (+1) awarded.' : 'Mark Down (-1) applied.',
        };
      }
    }

    return { success: false, error: 'Invalid markup request.' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
