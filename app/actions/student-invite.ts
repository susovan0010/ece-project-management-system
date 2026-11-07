'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createInviteToken } from '@/lib/tokens';
import { getBaseUrl } from '@/lib/url';
import { sendEmail, getCommunicationConfig } from '@/lib/email';
import { revalidatePath } from 'next/cache';

const COMMUNICATION_HISTORY_KEY = 'communication_history';

export interface StudentInviteStats {
  totalAllocatedStudents: number;
  studentsWithValidEmail: number;
  activeAccountsCount: number;
  pendingInviteCount: number;
  uninvitedCount: number;
}

export type StudentAccountStatus = 'ACTIVE' | 'INVITED' | 'READY_TO_INVITE' | 'NO_EMAIL';

/**
 * 1. Get Student Invitation & Account Status Statistics
 */
export async function getStudentAllocationInviteStatsAction(batchId = 'ALL'): Promise<{
  success: boolean;
  stats?: StudentInviteStats;
  statusMap?: Record<string, StudentAccountStatus>; // studentId -> status
  error?: string;
}> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  try {
    const groupMemberFilter: any = {};
    if (batchId !== 'ALL') {
      groupMemberFilter.group = { batchId };
    }

    const groupMembers = await prisma.groupMember.findMany({
      where: groupMemberFilter,
      include: {
        student: {
          select: {
            id: true,
            roll: true,
            name: true,
            email: true,
            userId: true,
          },
        },
      },
    });

    const studentMap = new Map<string, { id: string; email: string | null; userId: string | null }>();
    groupMembers.forEach((gm) => {
      if (!studentMap.has(gm.student.id)) {
        studentMap.set(gm.student.id, gm.student);
      }
    });

    const students = Array.from(studentMap.values());
    const validEmails = students
      .map((s) => s.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e && e.includes('@')));

    // Check active User accounts
    const activeUsers = await prisma.user.findMany({
      where: {
        email: { in: validEmails },
        role: 'STUDENT',
        active: true,
      },
      select: { email: true, id: true },
    });
    const activeUserEmailSet = new Set(activeUsers.map((u) => u.email.toLowerCase()));

    // Check pending InviteTokens
    const inviteTokens = await prisma.inviteToken.findMany({
      where: {
        email: { in: validEmails },
        role: 'STUDENT',
        expiresAt: { gt: new Date() },
      },
      select: { email: true },
    });
    const pendingInviteEmailSet = new Set(inviteTokens.map((it) => it.email.toLowerCase()));

    const statusMap: Record<string, StudentAccountStatus> = {};
    let activeAccountsCount = 0;
    let pendingInviteCount = 0;
    let uninvitedCount = 0;

    students.forEach((s) => {
      const email = s.email?.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        statusMap[s.id] = 'NO_EMAIL';
      } else if (activeUserEmailSet.has(email)) {
        statusMap[s.id] = 'ACTIVE';
        activeAccountsCount++;
      } else if (pendingInviteEmailSet.has(email)) {
        statusMap[s.id] = 'INVITED';
        pendingInviteCount++;
      } else {
        statusMap[s.id] = 'READY_TO_INVITE';
        uninvitedCount++;
      }
    });

    return {
      success: true,
      stats: {
        totalAllocatedStudents: students.length,
        studentsWithValidEmail: validEmails.length,
        activeAccountsCount,
        pendingInviteCount,
        uninvitedCount,
      },
      statusMap,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 2. Send Bulk Student Login Invitations
 */
export async function sendBulkStudentInvitationsAction(
  batchId = 'ALL',
  origin?: string
): Promise<{
  success: boolean;
  totalEligible: number;
  sentCount: number;
  skippedActiveCount: number;
  failedCount: number;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return {
      success: false,
      totalEligible: 0,
      sentCount: 0,
      skippedActiveCount: 0,
      failedCount: 0,
      error: 'Unauthorized: Only Project Committee Admins can dispatch student invitations.',
    };
  }

  try {
    const groupMemberFilter: any = {};
    if (batchId !== 'ALL') {
      groupMemberFilter.group = { batchId };
    }

    const members = await prisma.groupMember.findMany({
      where: groupMemberFilter,
      include: {
        student: true,
        group: {
          include: {
            topic: {
              select: {
                title: true,
                code: true,
              },
            },
            supervisor: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const baseUrl = getBaseUrl(origin);
    const senderConfig = await getCommunicationConfig();

    let sentCount = 0;
    let skippedActiveCount = 0;
    let failedCount = 0;
    const sentStudentEmails: string[] = [];
    const seenEmails = new Set<string>();

    for (const item of members) {
      const student = item.student;
      const rawEmail = student.email?.trim().toLowerCase();
      if (!rawEmail || !rawEmail.includes('@') || seenEmails.has(rawEmail)) {
        continue;
      }
      seenEmails.add(rawEmail);

      // Check if user account already active
      const existingUser = await prisma.user.findUnique({
        where: { email: rawEmail },
      });

      if (existingUser && existingUser.passwordHash && existingUser.active) {
        skippedActiveCount++;
        continue;
      }

      // Generate 7-day invite token (role: 'STUDENT')
      const invite = await createInviteToken(rawEmail, 'STUDENT', 168);
      const inviteUrl = `${baseUrl}/accept-invite?token=${invite.token}`;

      const groupNum = item.group?.number ?? 0;
      const batchCode = item.group?.batchId ?? '';
      const supervisorName = item.group?.supervisor?.name ?? 'Not Assigned';
      const topicTitle = item.group?.topic?.title ?? 'Topic Not Allocated';
      const topicCode = item.group?.topic?.code ?? '';

      const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #1985A1; color: #ffffff; padding: 24px 28px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Department of Electronics and Communication Engineering</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Heritage Institute of Technology, Kolkata • Project Committee</p>
        </div>

        <div style="padding: 28px;">
          <div style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; border: 1px solid #a7f3d0; margin-bottom: 14px;">
            Official Student Portal Invitation
          </div>

          <h3 style="margin: 0 0 14px 0; color: #0f172a; font-size: 18px;">Welcome, ${student.name}!</h3>
          
          <p style="font-size: 13px; color: #334155; margin: 0 0 18px 0;">
            You have been officially enrolled in the <strong>ECE Capstone Project Management System</strong> for Batch <strong>${batchCode}</strong>.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 22px;">
            <div style="font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px;">
              Your Project Allocation Summary
            </div>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 140px;">Roll Number:</td>
                <td style="padding: 4px 0; font-weight: 700; font-family: monospace; color: #0f172a;">${student.roll}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Allotted Group:</td>
                <td style="padding: 4px 0; font-weight: 700; color: #1985A1;">Group #${groupNum} (Batch ${batchCode})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Faculty Supervisor:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${supervisorName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b; vertical-align: top;">Project Topic:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${topicTitle} <span style="font-family: monospace; font-size: 11px; color: #1985A1;">(${topicCode})</span></td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #334155; margin: 0 0 20px 0;">
            Activate your student account to inspect your full project details, access continuous assessment rubrics, and collaborate with your project group:
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteUrl}" style="background-color: #1985A1; color: #ffffff; padding: 13px 32px; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(25, 133, 161, 0.3);">
              Activate Student Account &amp; Access Portal →
            </a>
          </div>

          <div style="background-color: #f1f5f9; border-left: 4px solid #1985A1; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
            <strong>Notice:</strong> This secure invitation link is active for <strong>7 days</strong>. You will be asked to choose your password upon activation.
          </div>

          <p style="font-size: 11px; color: #64748b; margin: 18px 0 4px 0;">
            If the button doesn&apos;t work, copy and paste this link into your browser:
          </p>
          <p style="font-size: 11px; word-break: break-all; color: #1985A1; margin: 0;">
            <a href="${inviteUrl}" style="color: #1985A1;">${inviteUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

          <p style="font-size: 11px; color: #64748b; margin: 0;">
            Sent by <strong>${senderConfig.senderName}</strong> &lt;${senderConfig.senderEmail}&gt;<br />
            Official Contact: <a href="mailto:ece.project.committee@heritageit.edu" style="color: #1985A1;">ece.project.committee@heritageit.edu</a>
          </p>
        </div>
      </div>
      `;

      try {
        const sendResult = await sendEmail({
          to: rawEmail,
          subject: `Student Portal Invitation - ECE Capstone Project (${batchCode} Group #${groupNum})`,
          html: emailHtml,
          text: `Welcome ${student.name}!\n\nYou have been invited to the ECE Capstone Project Management System for Batch ${batchCode}, Group #${groupNum}.\nProject: ${topicTitle} (${topicCode})\nSupervisor: ${supervisorName}\n\nActivate your account at:\n${inviteUrl}\n\nThis link is valid for 7 days.`,
          fromEmail: senderConfig.senderEmail,
          fromName: senderConfig.senderName,
          replyTo: senderConfig.replyTo || senderConfig.senderEmail,
        });

        if (sendResult.success) {
          sentCount++;
          sentStudentEmails.push(rawEmail);
        } else {
          failedCount++;
        }
      } catch (e) {
        failedCount++;
      }
    }

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SEND_BULK_STUDENT_INVITATIONS',
        entity: 'Student',
        entityId: batchId,
        payload: {
          batchId,
          totalEligible: seenEmails.size,
          sentCount,
          skippedActiveCount,
          failedCount,
        },
      },
    });

    // Record into communication_history
    if (sentCount > 0) {
      const historySetting = await prisma.setting.findUnique({
        where: { key: COMMUNICATION_HISTORY_KEY },
      });
      const currentHistory: any[] = Array.isArray(historySetting?.value)
        ? (historySetting.value as any[])
        : [];

      currentHistory.unshift({
        id: `hist-invite-${Date.now()}`,
        sentAt: new Date().toISOString(),
        senderEmail: senderConfig.senderEmail,
        senderName: senderConfig.senderName,
        subject: `[Student Portal Invitation] Batch ${batchId} Allocated Groups`,
        messageBody: `Dispatched student portal activation invitations to ${sentCount} allocated student(s).`,
        batchId,
        groupNumbers: [],
        recipientCount: sentCount,
        recipients: sentStudentEmails,
        audienceSummary: `Student Portal Invitations (${sentCount} students)`,
      });

      await prisma.setting.upsert({
        where: { key: COMMUNICATION_HISTORY_KEY },
        create: { key: COMMUNICATION_HISTORY_KEY, value: currentHistory as any },
        update: { value: currentHistory as any },
      });
    }

    revalidatePath('/admin/allocation');

    return {
      success: true,
      totalEligible: seenEmails.size,
      sentCount,
      skippedActiveCount,
      failedCount,
      message: `Dispatched ${sentCount} student invitation(s) successfully.${skippedActiveCount > 0 ? ` (${skippedActiveCount} student(s) already active)` : ''}${failedCount > 0 ? ` (${failedCount} failed to deliver)` : ''}`,
    };
  } catch (err) {
    return {
      success: false,
      totalEligible: 0,
      sentCount: 0,
      skippedActiveCount: 0,
      failedCount: 0,
      error: (err as Error).message,
    };
  }
}

/**
 * 3. Send Single Student Login Invitation
 */
export async function sendSingleStudentInviteAction(
  studentId: string,
  origin?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  inviteUrl?: string;
}> {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        groups: {
          include: {
            group: {
              include: {
                topic: true,
                supervisor: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      return { success: false, error: 'Student not found.' };
    }

    if (student.userId) {
      return {
        success: false,
        error: `Student "${student.name}" already has an active account. If they cannot sign in, send a password reset link instead.`,
      };
    }

    const email = student.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { success: false, error: `Student "${student.name}" does not have a valid email address recorded.` };
    }

    const primaryGroup = student.groups[0]?.group;
    if (!primaryGroup) {
      return { success: false, error: `Student "${student.name}" is not allocated to any project group yet.` };
    }

    const baseUrl = getBaseUrl(origin);
    const senderConfig = await getCommunicationConfig();
    const invite = await createInviteToken(email, 'STUDENT', 168);
    const inviteUrl = `${baseUrl}/accept-invite?token=${invite.token}`;

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
      <div style="background-color: #1985A1; color: #ffffff; padding: 24px 28px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Department of Electronics and Communication Engineering</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Heritage Institute of Technology, Kolkata • Project Committee</p>
      </div>

      <div style="padding: 28px;">
        <div style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; border: 1px solid #a7f3d0; margin-bottom: 14px;">
          Student Portal Invitation
        </div>

        <h3 style="margin: 0 0 14px 0; color: #0f172a; font-size: 18px;">Welcome, ${student.name}!</h3>
        
        <p style="font-size: 13px; color: #334155; margin: 0 0 18px 0;">
          You are invited to access the <strong>HITK ECE Capstone Project Management System</strong> for Batch <strong>${primaryGroup.batchId}</strong>, Group <strong>#${primaryGroup.number}</strong>.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 22px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 140px;">Roll Number:</td>
              <td style="padding: 4px 0; font-weight: 700; font-family: monospace; color: #0f172a;">${student.roll}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Project Topic:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${primaryGroup.topic.title} (${primaryGroup.topic.code})</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Faculty Supervisor:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${primaryGroup.supervisor.name}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${inviteUrl}" style="background-color: #1985A1; color: #ffffff; padding: 13px 32px; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block;">
            Activate Student Account &amp; Access Portal →
          </a>
        </div>

        <p style="font-size: 11px; color: #64748b; margin: 18px 0 0 0;">
          Direct link: <a href="${inviteUrl}" style="color: #1985A1;">${inviteUrl}</a> (valid for 7 days)
        </p>
      </div>
    </div>
    `;

    const sendRes = await sendEmail({
      to: email,
      subject: `Student Portal Invitation - ECE Capstone (${primaryGroup.batchId} Group #${primaryGroup.number})`,
      html: emailHtml,
      text: `Hello ${student.name},\n\nPlease activate your account at: ${inviteUrl}`,
      fromEmail: senderConfig.senderEmail,
      fromName: senderConfig.senderName,
      replyTo: senderConfig.replyTo || senderConfig.senderEmail,
    });

    if (!sendRes.success) {
      return { success: false, error: sendRes.error || 'Failed to dispatch email.' };
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'STUDENT_INVITE_SENT',
        entity: 'Student',
        entityId: student.id,
        payload: {
          studentName: student.name,
          email,
          roll: student.roll,
          groupNumber: primaryGroup.number,
          batchId: primaryGroup.batchId,
        },
      },
    });

    revalidatePath('/admin/allocation');

    return {
      success: true,
      message: `Invitation successfully sent to ${student.name} (${email}).`,
      inviteUrl,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
