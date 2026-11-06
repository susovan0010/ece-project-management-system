'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  getCommunicationConfig,
  saveCommunicationConfig,
  sendEmail,
  CommunicationConfig,
  FACULTY_GOOGLE_GROUP_EMAIL,
} from '@/lib/email';

export interface CommunicationRecipient {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'CUSTOM';
  roll?: string;
  groupId?: string;
  groupNumber?: number;
  batchId?: string;
}

export interface CommunicationGroupSummary {
  id: string;
  number: number;
  batchId: string;
  topicCode?: string;
  topicTitle?: string;
  supervisor: {
    id: string;
    name: string;
    email: string;
  };
  students: {
    id: string;
    name: string;
    roll: string;
    email: string;
    phone?: string;
  }[];
}

export interface FacultyDirectoryItem {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface CommunicationHistoryItem {
  id: string;
  sentAt: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  messageBody: string;
  batchId: string;
  groupNumbers: number[];
  recipientCount: number;
  recipients: { name: string; email: string; role: string }[];
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  warning?: string;
  attachments?: { filename: string; size?: number }[];
}

// ----------------------------------------------------
// 1. Get & Update Sender Configuration
// ----------------------------------------------------
export async function getCommunicationConfigAction() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access communication configuration.' };
  }

  const config = await getCommunicationConfig();
  return { config };
}

export async function updateCommunicationConfigAction(config: CommunicationConfig) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can update communication configuration.' };
  }

  if (!config.senderEmail || !config.senderEmail.includes('@')) {
    return { error: 'A valid sender email address is required.' };
  }

  if (!config.senderName || config.senderName.trim().length === 0) {
    return { error: 'Sender display name is required.' };
  }

  const ok = await saveCommunicationConfig(config);
  if (!ok) {
    return { error: 'Failed to persist communication settings to the database.' };
  }

  revalidatePath('/admin/communication');
  return { success: true, message: 'Sender configuration saved successfully.' };
}

// ----------------------------------------------------
// 2. Fetch Roster & Targets (Batches, Groups, Students, Faculty)
// ----------------------------------------------------
export async function getCommunicationRosterAction(batchId?: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can view communication rosters.' };
  }

  try {
    const batches = await prisma.batch.findMany({
      orderBy: { id: 'desc' },
      select: { id: true, active: true },
    });

    const activeBatchId = batchId && batchId !== 'ALL'
      ? batchId
      : batches.find((b) => b.active)?.id || batches[0]?.id;

    const groupWhere = activeBatchId && activeBatchId !== 'ALL' ? { batchId: activeBatchId } : {};

    const rawGroups = await prisma.group.findMany({
      where: groupWhere,
      orderBy: [{ batchId: 'asc' }, { number: 'asc' }],
      include: {
        topic: { select: { code: true, title: true } },
        supervisor: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            student: { select: { id: true, name: true, roll: true, email: true, phone: true } },
          },
        },
      },
    });

    const groups: CommunicationGroupSummary[] = rawGroups.map((g) => ({
      id: g.id,
      number: g.number,
      batchId: g.batchId,
      topicCode: g.topic?.code,
      topicTitle: g.topic?.title,
      supervisor: {
        id: g.supervisor.id,
        name: g.supervisor.name,
        email: g.supervisor.email,
      },
      students: g.members.map((m) => ({
        id: m.student.id,
        name: m.student.name,
        roll: m.student.roll,
        email: m.student.email || '',
        phone: m.student.phone || undefined,
      })),
    }));

    const facultyList: FacultyDirectoryItem[] = await prisma.user.findMany({
      where: { role: { in: ['FACULTY', 'ADMIN'] }, active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });

    return {
      batches,
      selectedBatchId: activeBatchId || 'ALL',
      groups,
      facultyList,
    };
  } catch (err) {
    return { error: `Failed to load communication roster: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Update Recipient Email in Database
// ----------------------------------------------------
export async function updateRecipientEmailAction(
  type: 'STUDENT' | 'FACULTY',
  id: string,
  newEmail: string
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can update email addresses.' };
  }

  const cleanEmail = newEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    if (type === 'STUDENT') {
      await prisma.student.update({
        where: { id },
        data: { email: cleanEmail },
      });
      revalidatePath('/admin/allocation');
      revalidatePath('/admin/communication');
      return { success: true, email: cleanEmail, message: 'Student email updated successfully.' };
    } else {
      await prisma.user.update({
        where: { id },
        data: { email: cleanEmail },
      });
      revalidatePath('/admin/faculty');
      revalidatePath('/admin/communication');
      return { success: true, email: cleanEmail, message: 'Faculty email updated successfully.' };
    }
  } catch (err) {
    return { error: `Failed to update email: ${(err as Error).message}` };
  }
}

export interface CommunicationAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
  size?: number;
}

// ----------------------------------------------------
// 4. Send Message to Selected Groups / Students / Faculty / Google Group
// ----------------------------------------------------
export async function sendGroupCommunicationAction(input: {
  batchId?: string;
  selectedGroupIds?: string[];
  includeStudents?: boolean;
  includeFaculty?: boolean;
  sendToFacultyGoogleGroup?: boolean;
  selectedFacultyUserIds?: string[];
  customRecipients?: { name: string; email: string; role: string }[];
  subject: string;
  messageBody: string;
  attachments?: CommunicationAttachment[];
}) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can send communications.' };
  }

  if (!input.subject || input.subject.trim().length === 0) {
    return { error: 'Subject line cannot be empty.' };
  }

  if (!input.messageBody || input.messageBody.trim().length === 0) {
    return { error: 'Message content cannot be empty.' };
  }

  try {
    const config = await getCommunicationConfig();
    const recipientMap = new Map<string, { name: string; email: string; role: string }>();
    const audienceLabels: string[] = [];

    // 1. Target Department Faculty Google Group if selected
    if (input.sendToFacultyGoogleGroup) {
      recipientMap.set(FACULTY_GOOGLE_GROUP_EMAIL.toLowerCase(), {
        name: 'ECE Department Faculty Google Group',
        email: FACULTY_GOOGLE_GROUP_EMAIL,
        role: 'Faculty Google Group (All Teachers)',
      });
      audienceLabels.push(`Faculty Google Group (${FACULTY_GOOGLE_GROUP_EMAIL})`);
    }

    // 2. Target Individual Faculty Supervisors & Admins via their login IDs
    if (input.selectedFacultyUserIds && input.selectedFacultyUserIds.length > 0) {
      const targetUsers = await prisma.user.findMany({
        where: { id: { in: input.selectedFacultyUserIds }, role: { in: ['FACULTY', 'ADMIN'] } },
        select: { id: true, name: true, email: true, role: true },
      });

      targetUsers.forEach((u) => {
        const em = u.email?.trim().toLowerCase();
        if (em && em.includes('@')) {
          recipientMap.set(em, {
            name: u.name,
            email: em,
            role: u.role === 'ADMIN' ? 'Project Committee Admin' : 'Faculty Supervisor (Login ID)',
          });
        }
      });
      audienceLabels.push(`${targetUsers.length} Faculty Supervisors & Admins`);
    }

    // 3. Target Project Groups (Students & Guides) if selected
    let selectedGroups: any[] = [];
    if (input.selectedGroupIds && input.selectedGroupIds.length > 0) {
      selectedGroups = await prisma.group.findMany({
        where: {
          id: { in: input.selectedGroupIds },
        },
        include: {
          supervisor: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              student: { select: { id: true, name: true, roll: true, email: true } },
            },
          },
        },
      });

      // Add students if checked
      if (input.includeStudents !== false) {
        selectedGroups.forEach((g) => {
          g.members.forEach((m: any) => {
            const em = m.student.email?.trim().toLowerCase();
            if (em && em.includes('@')) {
              recipientMap.set(em, {
                name: m.student.name,
                email: em,
                role: `Student (Group ${g.number}, Roll ${m.student.roll})`,
              });
            }
          });
        });
      }

      // Add group supervisors if checked
      if (input.includeFaculty) {
        selectedGroups.forEach((g) => {
          const em = g.supervisor.email?.trim().toLowerCase();
          if (em && em.includes('@')) {
            recipientMap.set(em, {
              name: g.supervisor.name,
              email: em,
              role: `Supervisor (Group ${g.number})`,
            });
          }
        });
      }

      audienceLabels.push(`Project Groups: ${selectedGroups.map((g) => `Group ${g.number}`).join(', ')}`);
    }

    // 4. Add custom recipients
    if (input.customRecipients && input.customRecipients.length > 0) {
      input.customRecipients.forEach((cr) => {
        const em = cr.email?.trim().toLowerCase();
        if (em && em.includes('@')) {
          recipientMap.set(em, {
            name: cr.name || 'Recipient',
            email: em,
            role: cr.role || 'Ad-hoc Recipient',
          });
        }
      });
      audienceLabels.push(`${input.customRecipients.length} Custom Recipient(s)`);
    }

    const allRecipients = Array.from(recipientMap.values());

    if (allRecipients.length === 0) {
      return {
        error: 'No valid recipient email addresses found. Please select either the Faculty Google Group, one or more faculty supervisors, or project groups.',
      };
    }

    const recipientEmails = allRecipients.map((r) => r.email);

    // 5. Construct professional HTML email body with Industrial Blue corporate theme
    const formattedHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #46494C; max-width: 650px; margin: 0 auto; border: 1px solid #C5C3C6; border-radius: 10px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(76, 92, 104, 0.08);">
        <div style="background: linear-gradient(135deg, #4C5C68 0%, #1985A1 100%); color: white; padding: 22px 26px; border-bottom: 3px solid #146E85;">
          <h2 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.3px;">Department of Electronics and Communication Engineering</h2>
          <p style="margin: 5px 0 0; font-size: 13px; color: #DCDCDD; font-weight: 500;">Heritage Institute of Technology, Kolkata • Project Committee</p>
        </div>

        <div style="padding: 26px;">
          <div style="margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #DCDCDD;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1985A1; background-color: #e5f1f5; border: 1px solid #cce3eb; padding: 4px 10px; border-radius: 4px;">Official Announcement</span>
            <h3 style="margin: 12px 0 0; font-size: 18px; color: #46494C; font-weight: 700;">${input.subject}</h3>
          </div>

          <div style="font-size: 14px; color: #46494C; white-space: pre-wrap; margin-bottom: 24px; line-height: 1.7;">
${input.messageBody}
          </div>

          <div style="background-color: #f7f9fa; border: 1px solid #DCDCDD; border-left: 4px solid #1985A1; border-radius: 6px; padding: 14px; margin-top: 20px; font-size: 12px; color: #4C5C68;">
            <div style="font-weight: 700; color: #46494C; margin-bottom: 4px;">Target Audience:</div>
            <div>${audienceLabels.join(' • ') || 'General Department Notice'}</div>
          </div>

          <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #DCDCDD; font-size: 12px; color: #4C5C68;">
            <p style="margin: 0;">Sent by: <strong style="color: #46494C;">${config.senderName}</strong></p>
            <p style="margin: 4px 0 0;">Official Department Email: <a href="mailto:${config.senderEmail}" style="color: #1985A1; text-decoration: none; font-weight: 600;">${config.senderEmail}</a></p>
            <p style="margin: 10px 0 0; font-size: 11px; color: #8e959b;">This is an official communication dispatched from the HITK ECE Project Management System.</p>
          </div>
        </div>
      </div>
    `;

    // 6. Dispatch email via lib/email.ts
    const emailRes = await sendEmail({
      to: recipientEmails,
      subject: input.subject,
      html: formattedHtml,
      text: input.messageBody,
      fromEmail: config.senderEmail,
      fromName: config.senderName,
      replyTo: config.replyTo || config.senderEmail,
      attachments: input.attachments,
    });

    const status: 'SENT' | 'SIMULATED' | 'FAILED' = !emailRes.success
      ? 'FAILED'
      : emailRes.simulated
      ? 'SIMULATED'
      : 'SENT';

    // 7. Persist to Communication History in Setting table
    const historyItem: CommunicationHistoryItem = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sentAt: new Date().toISOString(),
      senderEmail: config.senderEmail,
      senderName: config.senderName,
      subject: input.subject,
      messageBody: input.messageBody,
      batchId: input.batchId || 'N/A',
      groupNumbers: selectedGroups.map((g) => g.number),
      recipientCount: allRecipients.length,
      recipients: allRecipients,
      status,
      warning: emailRes.error || (emailRes.simulated ? 'Simulation Mode' : undefined),
      attachments: input.attachments?.map((a) => ({ filename: a.filename, size: a.size })),
    };

    try {
      const existingHistorySetting = await prisma.setting.findUnique({
        where: { key: 'communication_history' },
      });

      const currentList: CommunicationHistoryItem[] =
        existingHistorySetting?.value && Array.isArray(existingHistorySetting.value)
          ? (existingHistorySetting.value as unknown as CommunicationHistoryItem[])
          : [];

      // Prepend newest item, keep last 50
      const updatedList = [historyItem, ...currentList].slice(0, 50);

      await prisma.setting.upsert({
        where: { key: 'communication_history' },
        update: { value: updatedList as any },
        create: { key: 'communication_history', value: updatedList as any },
      });
    } catch (logErr) {
      console.error('Failed to log communication history:', logErr);
    }

    revalidatePath('/admin/communication');

    if (!emailRes.success) {
      return {
        error: `Delivery notice: ${emailRes.error || 'Failed to dispatch emails'}. History recorded.`,
      };
    }

    return {
      success: true,
      count: allRecipients.length,
      recipients: recipientEmails,
      simulated: emailRes.simulated,
      message: `Successfully dispatched message to ${allRecipients.length} recipient inbox(es) (${audienceLabels.join(', ')}).`,
    };
  } catch (err) {
    return { error: `Failed to dispatch communication: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Get Communication History
// ----------------------------------------------------
export async function getCommunicationHistoryAction(): Promise<CommunicationHistoryItem[]> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'communication_history' },
    });

    if (setting && Array.isArray(setting.value)) {
      return setting.value as unknown as CommunicationHistoryItem[];
    }
  } catch (err) {
    console.error('Error fetching communication history:', err);
  }
  return [];
}
