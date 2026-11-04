'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  fetchRecentInboxEmails,
  fetchInboxEmailDetail,
  InboxMessageSummary,
  InboxMessageDetail,
} from '@/lib/imap';
import { sendEmail, getCommunicationConfig } from '@/lib/email';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type { InboxMessageSummary, InboxMessageDetail };

export interface GetInboxResult {
  success: boolean;
  messages?: InboxMessageSummary[];
  totalCount?: number;
  error?: string;
  simulated?: boolean;
}

export interface GetDetailResult {
  success: boolean;
  message?: InboxMessageDetail;
  error?: string;
  simulated?: boolean;
}

export interface QuickReplyResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 1. Fetch recent emails from Google Workspace IMAP mailbox.
 * Strictly guarded for ADMIN role only.
 */
export async function getInboxEmailsAction(
  page = 1,
  limit = 20,
  searchQuery?: string
): Promise<GetInboxResult> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  if (!user?.id || user.role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Administrators can view the incoming mailbox.',
    };
  }

  try {
    const res = await fetchRecentInboxEmails(page, limit, searchQuery);
    return res;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve inbox messages.',
    };
  }
}

/**
 * 2. Fetch full email content and attachments by message UID.
 * Strictly guarded for ADMIN role only.
 */
export async function getEmailDetailAction(uid: number): Promise<GetDetailResult> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;

  if (!user?.id || user.role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Administrators can read incoming emails.',
    };
  }

  if (!uid || isNaN(uid)) {
    return {
      success: false,
      error: 'Invalid message UID requested.',
    };
  }

  try {
    const res = await fetchInboxEmailDetail(uid);
    return res;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to download email content.',
    };
  }
}

const QuickReplySchema = z.object({
  toEmail: z.string().email(),
  toName: z.string().optional(),
  subject: z.string().min(1),
  replyText: z.string().min(1, 'Reply message cannot be empty.'),
  originalSnippet: z.string().optional(),
});

/**
 * 3. Send a quick reply to an incoming email directly from within the portal.
 * Strictly guarded for ADMIN role only.
 */
export async function quickReplyAction(
  input: z.infer<typeof QuickReplySchema>
): Promise<QuickReplyResult> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; name?: string; email?: string } | undefined;

  if (!user?.id || user.role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Administrators can send email replies.',
    };
  }

  const parsed = QuickReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }

  const { toEmail, toName, subject, replyText, originalSnippet } = parsed.data;
  const config = await getCommunicationConfig();

  const formattedSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const htmlContent = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #46494C; max-width: 650px; margin: 0 auto; border: 1px solid #C5C3C6; border-radius: 10px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(76, 92, 104, 0.08);">
    <div style="background: linear-gradient(135deg, #4C5C68 0%, #1985A1 100%); color: white; padding: 22px 26px; border-bottom: 3px solid #146E85;">
      <h2 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.3px;">Department of Electronics and Communication Engineering</h2>
      <p style="margin: 5px 0 0; font-size: 13px; color: #DCDCDD; font-weight: 500;">Heritage Institute of Technology, Kolkata • Project Committee</p>
    </div>

    <div style="padding: 26px;">
      <div style="margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #DCDCDD;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1985A1; background-color: #e5f1f5; border: 1px solid #cce3eb; padding: 4px 10px; border-radius: 4px;">Direct Response</span>
        <h3 style="margin: 12px 0 0; font-size: 17px; color: #46494C; font-weight: 700;">${formattedSubject}</h3>
      </div>

      <p style="margin-top: 0; color: #46494C;">Dear <strong>${toName || 'Colleague'}</strong>,</p>

      <div style="margin: 18px 0; font-size: 14px; color: #46494C; white-space: pre-wrap; line-height: 1.7;">
${replyText}
      </div>

      ${
        originalSnippet
          ? `
      <div style="margin: 24px 0 16px; padding: 12px 16px; background-color: #f8fafc; border-left: 3px solid #C5C3C6; font-size: 12px; color: #4C5C68;">
        <strong>In response to:</strong><br/>
        <em style="color: #64748b;">"${originalSnippet}"</em>
      </div>
      `
          : ''
      }

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #DCDCDD; font-size: 12px; color: #4C5C68;">
        <p style="margin: 0; font-weight: 600;">Sent by: ${user.name || config.senderName}</p>
        <p style="margin: 2px 0 0;">Project Committee Administration, Department of ECE</p>
        <p style="margin: 2px 0 0; color: #1985A1;">${config.senderEmail}</p>
      </div>
    </div>

    <div style="background-color: #f4f7f9; padding: 14px 24px; font-size: 11px; color: #4C5C68; border-top: 1px solid #C5C3C6; text-align: center;">
      <p style="margin: 0;">Heritage Institute of Technology, Kolkata • ECE Project Management System</p>
    </div>
  </div>
  `;

  const emailRes = await sendEmail({
    to: toEmail,
    subject: formattedSubject,
    html: htmlContent,
    text: replyText,
  });

  if (!emailRes.success) {
    return {
      success: false,
      error: emailRes.error || 'Failed to dispatch email reply.',
    };
  }

  // Record in Audit Log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'INBOX_QUICK_REPLY',
      entity: 'Communication',
      entityId: emailRes.id || toEmail,
      payload: {
        toEmail,
        toName,
        subject: formattedSubject,
        simulated: emailRes.simulated || false,
      },
    },
  });

  // Append to communication_history in Setting table
  try {
    const existingHistorySetting = await prisma.setting.findUnique({
      where: { key: 'communication_history' },
    });

    const currentList =
      existingHistorySetting?.value && Array.isArray(existingHistorySetting.value)
        ? (existingHistorySetting.value as any[])
        : [];

    const historyItem = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sentAt: new Date().toISOString(),
      senderEmail: config.senderEmail,
      senderName: user.name || config.senderName,
      subject: formattedSubject,
      messageBody: replyText,
      batchId: 'N/A',
      groupNumbers: [],
      recipientCount: 1,
      recipients: [{ name: toName || toEmail, email: toEmail, role: 'INBOX_REPLY' }],
      status: emailRes.simulated ? 'SIMULATED' : 'SENT',
    };

    const updatedList = [historyItem, ...currentList].slice(0, 50);

    await prisma.setting.upsert({
      where: { key: 'communication_history' },
      update: { value: updatedList },
      create: { key: 'communication_history', value: updatedList },
    });
  } catch (logErr) {
    console.error('Failed to append to communication history:', logErr);
  }

  revalidatePath('/admin/communication');

  return {
    success: true,
    messageId: emailRes.id,
  };
}
