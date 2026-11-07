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
  badges: StudentBadgeSummary;
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
  groupId: string;
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
  };
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
 * 1. Load Forum Data for a Group
 */
export async function getGroupForumDataAction(requestedGroupId?: string): Promise<{
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

  try {
    let targetGroupId = requestedGroupId;
    let supervisedGroupsList: any[] = [];

    if (userRole === 'STUDENT') {
      // Find the student's allocated group
      const studentRecord = await prisma.student.findFirst({
        where: {
          OR: [
            { userId },
            userEmail ? { email: { equals: userEmail, mode: 'insensitive' } } : {},
          ],
        },
        include: {
          groups: {
            include: {
              group: true,
            },
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
      // Find all groups supervised by this faculty
      supervisedGroupsList = await prisma.group.findMany({
        where: { supervisorId: userId },
        include: {
          topic: { select: { code: true, title: true } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      });

      if (supervisedGroupsList.length === 0) {
        return {
          success: false,
          error: 'You do not have any allotted project groups assigned as supervisor yet.',
        };
      }

      if (!targetGroupId || !supervisedGroupsList.some((g) => g.id === targetGroupId)) {
        targetGroupId = supervisedGroupsList[0].id;
      }
    } else {
      // ADMIN (can supervise groups and observe all groups)
      supervisedGroupsList = await prisma.group.findMany({
        include: {
          topic: { select: { code: true, title: true } },
          supervisor: { select: { id: true, name: true } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      });

      if (supervisedGroupsList.length === 0) {
        return { success: false, error: 'No project groups exist yet.' };
      }

      if (!targetGroupId) {
        // If current admin supervises any groups, default to their supervised group
        const mySupervisedGroup = supervisedGroupsList.find((g) => g.supervisorId === userId);
        targetGroupId = mySupervisedGroup ? mySupervisedGroup.id : supervisedGroupsList[0].id;
      }
    }

    if (!targetGroupId) {
      return { success: false, error: 'Target project group not found.' };
    }

    // Fetch Group details and members
    const group = await prisma.group.findUnique({
      where: { id: targetGroupId },
      include: {
        topic: { select: { code: true, title: true } },
        supervisor: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            student: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return { success: false, error: 'Project group not found.' };
    }

    const isSupervisor = group.supervisorId === userId;

    // Verify student is a member of this group
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

    // Calculate badge summaries for all group members
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

    // Fetch forum posts with replies, reactions, and markup votes
    const posts = await prisma.forumPost.findMany({
      where: { groupId: targetGroupId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            student: { select: { roll: true } },
          },
        },
        reactions: true,
        markupVotes: true,
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                student: { select: { roll: true } },
              },
            },
            reactions: true,
            markupVotes: true,
          },
        },
      },
    });

    // Helper to calculate badges for an author
    const getAuthorBadges = async (authorId: string): Promise<StudentBadgeSummary> => {
      const votes = await prisma.forumMarkupVote.findMany({
        where: { targetUserId: authorId },
        select: { value: true },
      });
      const score = votes.reduce((acc, v) => acc + v.value, 0);
      return calculateStudentBadges(score);
    };

    // Map posts into clean client shape
    const formattedPosts: ForumPostItem[] = await Promise.all(
      posts.map(async (p) => {
        const authorBadges = await getAuthorBadges(p.authorId);

        // Post reactions
        const postLikes = p.reactions.filter((r) => r.type === 'LIKE').length;
        const postDislikes = p.reactions.filter((r) => r.type === 'DISLIKE').length;
        const myPostReaction = p.reactions.find((r) => r.userId === userId)?.type as
          | 'LIKE'
          | 'DISLIKE'
          | undefined;

        // Post markup
        const postNetMarkup = p.markupVotes.reduce((acc, v) => acc + v.value, 0);
        const mySupervisorPostVote = p.markupVotes.find((v) => v.supervisorId === group.supervisorId)
          ?.value as 1 | -1 | undefined;

        // Replies
        const formattedReplies: ForumReplyItem[] = await Promise.all(
          p.replies.map(async (r) => {
            const replyAuthorBadges = await getAuthorBadges(r.authorId);
            const rLikes = r.reactions.filter((rx) => rx.type === 'LIKE').length;
            const rDislikes = r.reactions.filter((rx) => rx.type === 'DISLIKE').length;
            const myReplyReaction = r.reactions.find((rx) => rx.userId === userId)?.type as
              | 'LIKE'
              | 'DISLIKE'
              | undefined;
            const rNetMarkup = r.markupVotes.reduce((acc, v) => acc + v.value, 0);
            const mySupervisorReplyVote = r.markupVotes.find((v) => v.supervisorId === group.supervisorId)
              ?.value as 1 | -1 | undefined;

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
                badges: replyAuthorBadges,
              },
              reactions: {
                likes: rLikes,
                dislikes: rDislikes,
                userReaction: myReplyReaction || null,
              },
              markup: {
                netScore: rNetMarkup,
                supervisorVote: mySupervisorReplyVote || null,
              },
            };
          })
        );

        return {
          id: p.id,
          groupId: p.groupId,
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
 */
export async function createForumPostAction(data: {
  groupId: string;
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

  try {
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
    const isAdmin = currentUserRole === 'ADMIN';

    if (!isSupervisor && !isMember && !isAdmin) {
      return { success: false, error: 'You are not a participant in this group forum.' };
    }

    // Process attachments: upload each file to Google Drive (ece.project.committee@heritageit.edu)
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
        authorId: currentUserId,
        title,
        content,
        attachments: processedAttachments.length > 0 ? (processedAttachments as any) : null,
      },
    });

    revalidatePath('/student/forum');
    revalidatePath('/faculty/forum');
    revalidatePath('/admin/forum');

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

    const isSupervisor = post.group.supervisorId === currentUserId;
    const isMember = post.group.members.some(
      (m) =>
        m.student.userId === currentUserId ||
        (currentUserEmail && m.student.email?.toLowerCase().trim() === currentUserEmail)
    );
    const isAdmin = currentUserRole === 'ADMIN';

    if (!isSupervisor && !isMember && !isAdmin) {
      return { success: false, error: 'You are not a participant in this group forum.' };
    }

    // Process attachments: upload each file to Google Drive (ece.project.committee@heritageit.edu)
    let processedAttachments: ForumAttachment[] = [];
    if (data.attachments && data.attachments.length > 0) {
      processedAttachments = await Promise.all(
        data.attachments.map(async (att) => {
          const res = await uploadFileToGoogleDrive({
            fileName: att.name,
            size: att.size,
            mimeType: att.type,
            dataUrlOrBase64: att.url,
            batchId: post.group.batchId,
            groupNumber: post.group.number,
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

    if (data.postId) {
      const existing = await prisma.forumReaction.findUnique({
        where: {
          userId_postId: { userId, postId: data.postId },
        },
      });

      if (existing) {
        if (existing.type === data.type) {
          // Toggle off
          await prisma.forumReaction.delete({ where: { id: existing.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return { success: true, userReaction: null };
        } else {
          // Change reaction
          await prisma.forumReaction.update({
            where: { id: existing.id },
            data: { type: data.type },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
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
        return { success: true, userReaction: data.type };
      }
    } else if (data.replyId) {
      const existing = await prisma.forumReaction.findUnique({
        where: {
          userId_replyId: { userId, replyId: data.replyId },
        },
      });

      if (existing) {
        if (existing.type === data.type) {
          // Toggle off
          await prisma.forumReaction.delete({ where: { id: existing.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return { success: true, userReaction: null };
        } else {
          await prisma.forumReaction.update({
            where: { id: existing.id },
            data: { type: data.type },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
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
    // Verify that current user is the supervisor of this post's group
    let groupId = '';
    if (data.postId) {
      const post = await prisma.forumPost.findUnique({
        where: { id: data.postId },
        select: { groupId: true, group: { select: { supervisorId: true } } },
      });
      if (!post) return { success: false, error: 'Post not found.' };
      if (post.group.supervisorId !== supervisorId && userRole !== 'ADMIN') {
        return { success: false, error: 'Only the assigned supervisor can mark up/down this post.' };
      }
      groupId = post.groupId;

      const existingVote = await prisma.forumMarkupVote.findUnique({
        where: {
          supervisorId_postId: { supervisorId, postId: data.postId },
        },
      });

      if (existingVote) {
        if (existingVote.value === data.value) {
          // Toggle off
          await prisma.forumMarkupVote.delete({ where: { id: existingVote.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return { success: true, currentVote: null, message: 'Supervisor feedback cleared.' };
        } else {
          // Change value
          await prisma.forumMarkupVote.update({
            where: { id: existingVote.id },
            data: { value: data.value, reason: data.reason },
          });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return {
            success: true,
            currentVote: data.value,
            message: data.value === 1 ? 'Mark Up (+1) recorded!' : 'Mark Down (-1) recorded.',
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
          message: data.value === 1 ? 'Mark Up (+1) recorded!' : 'Mark Down (-1) recorded.',
        };
      }
    } else if (data.replyId) {
      const reply = await prisma.forumReply.findUnique({
        where: { id: data.replyId },
        select: { post: { select: { groupId: true, group: { select: { supervisorId: true } } } } },
      });
      if (!reply) return { success: false, error: 'Reply not found.' };
      if (reply.post.group.supervisorId !== supervisorId && userRole !== 'ADMIN') {
        return { success: false, error: 'Only the assigned supervisor can mark up/down this reply.' };
      }
      groupId = reply.post.groupId;

      const existingVote = await prisma.forumMarkupVote.findUnique({
        where: {
          supervisorId_replyId: { supervisorId, replyId: data.replyId },
        },
      });

      if (existingVote) {
        if (existingVote.value === data.value) {
          await prisma.forumMarkupVote.delete({ where: { id: existingVote.id } });
          revalidatePath('/student/forum');
          revalidatePath('/faculty/forum');
          return { success: true, currentVote: null, message: 'Supervisor feedback cleared.' };
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
            message: data.value === 1 ? 'Mark Up (+1) recorded!' : 'Mark Down (-1) recorded.',
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
          message: data.value === 1 ? 'Mark Up (+1) recorded!' : 'Mark Down (-1) recorded.',
        };
      }
    }

    return { success: false, error: 'Invalid target for supervisor evaluation.' };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
