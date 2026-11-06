'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  ScheduleTimeMode,
  ScheduleJobStatus,
  ScheduleRandomWindow,
  ScheduleOccurrence,
  validateScheduleConfig,
  generateScheduleOccurrences,
  calculateNextRun,
  getDueOccurrences,
} from '@/lib/engine/communication-scheduler';
import { sendEmail, getCommunicationConfig, CommunicationConfig, SendEmailOptions } from '@/lib/email';
import { CommunicationAttachment } from './communication';

const SCHEDULED_COMMUNICATIONS_KEY = 'scheduled_communications';
const COMMUNICATION_HISTORY_KEY = 'communication_history';

export interface ScheduledCommunicationJob {
  id: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  status: ScheduleJobStatus;

  // Email content
  subject: string;
  messageBody: string;
  attachments?: CommunicationAttachment[];

  // Audience
  audienceSummary: string;
  recipients: { name: string; email: string; role: string }[];

  // Schedule parameters
  startDate: string;
  endDate: string;
  frequencyPerDay: number;
  timeMode: ScheduleTimeMode;
  specificTimes: string[];
  randomWindow: ScheduleRandomWindow;

  // Occurrences tracking
  occurrences: ScheduleOccurrence[];
  totalOccurrencesCount: number;
  sentOccurrencesCount: number;
  lastSentAt?: string;
  nextRunAt?: string;
}

export interface CreateScheduledCommunicationInput {
  subject: string;
  messageBody: string;
  attachments?: CommunicationAttachment[];
  audienceSummary: string;
  recipients: { name: string; email: string; role: string }[];
  startDate: string;
  endDate: string;
  frequencyPerDay: number;
  timeMode: ScheduleTimeMode;
  specificTimes?: string[];
  randomWindow?: ScheduleRandomWindow;
}

/**
 * 1. Create a new Scheduled Communication Job
 */
export async function createScheduledCommunicationAction(
  input: CreateScheduledCommunicationInput
): Promise<{ success: boolean; error?: string; job?: ScheduledCommunicationJob }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Only Project Committee Admins can schedule communications.' };
  }

  if (!input.subject || input.subject.trim().length === 0) {
    return { success: false, error: 'Subject line cannot be empty.' };
  }

  if (!input.messageBody || input.messageBody.trim().length === 0) {
    return { success: false, error: 'Message content cannot be empty.' };
  }

  if (!input.recipients || input.recipients.length === 0) {
    return { success: false, error: 'Please select at least one recipient for this scheduled email.' };
  }

  const validation = validateScheduleConfig({
    startDate: input.startDate,
    endDate: input.endDate,
    frequencyPerDay: input.frequencyPerDay,
    timeMode: input.timeMode,
    specificTimes: input.specificTimes,
    randomWindow: input.randomWindow,
  });

  if (!validation.valid || !validation.cleanConfig) {
    return { success: false, error: validation.error || 'Invalid schedule configuration.' };
  }

  const config = validation.cleanConfig;

  // Generate occurrence plan
  const occurrences = generateScheduleOccurrences(
    config.startDate,
    config.endDate,
    config.frequencyPerDay,
    config.timeMode,
    config.specificTimes,
    config.randomWindow
  );

  const nextRun = calculateNextRun(occurrences);

  const newJob: ScheduledCommunicationJob = {
    id: `sched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    createdById: session.user.id || 'admin',
    createdByName: session.user.name || 'Project Committee Admin',
    status: 'ACTIVE',
    subject: input.subject.trim(),
    messageBody: input.messageBody.trim(),
    attachments: input.attachments || [],
    audienceSummary: input.audienceSummary || `${input.recipients.length} Recipient(s)`,
    recipients: input.recipients,
    startDate: config.startDate,
    endDate: config.endDate,
    frequencyPerDay: config.frequencyPerDay,
    timeMode: config.timeMode,
    specificTimes: config.specificTimes,
    randomWindow: config.randomWindow,
    occurrences,
    totalOccurrencesCount: occurrences.length,
    sentOccurrencesCount: 0,
    nextRunAt: nextRun?.scheduledAt,
  };

  try {
    const existing = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    const currentList: ScheduledCommunicationJob[] = Array.isArray(existing?.value)
      ? (existing.value as unknown as ScheduledCommunicationJob[])
      : [];

    currentList.unshift(newJob);

    await prisma.setting.upsert({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
      create: {
        key: SCHEDULED_COMMUNICATIONS_KEY,
        value: currentList as any,
      },
      update: {
        value: currentList as any,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: 'SCHEDULED_COMMUNICATION_CREATED',
        entity: 'Setting',
        entityId: newJob.id,
        payload: {
          jobId: newJob.id,
          subject: newJob.subject,
          startDate: newJob.startDate,
          endDate: newJob.endDate,
          frequencyPerDay: newJob.frequencyPerDay,
          totalOccurrences: newJob.totalOccurrencesCount,
          recipientCount: newJob.recipients.length,
        },
      },
    });

    revalidatePath('/admin/communication');
    return { success: true, job: newJob };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 2. Get all Scheduled Communication Jobs
 */
export async function getScheduledCommunicationsAction(): Promise<{
  success: boolean;
  jobs: ScheduledCommunicationJob[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, jobs: [], error: 'Unauthorized.' };
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    const jobs: ScheduledCommunicationJob[] = Array.isArray(setting?.value)
      ? (setting.value as unknown as ScheduledCommunicationJob[])
      : [];

    return { success: true, jobs };
  } catch (err) {
    return { success: false, jobs: [], error: (err as Error).message };
  }
}

/**
 * 3. Update Status of a Scheduled Job (Pause, Resume, Cancel)
 */
export async function updateScheduleStatusAction(
  jobId: string,
  newStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    const jobs: ScheduledCommunicationJob[] = Array.isArray(setting?.value)
      ? (setting.value as unknown as ScheduledCommunicationJob[])
      : [];

    const targetJob = jobs.find((j) => j.id === jobId);
    if (!targetJob) {
      return { success: false, error: 'Scheduled job not found.' };
    }

    targetJob.status = newStatus;

    await prisma.setting.update({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
      data: { value: jobs as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id!,
        action: 'SCHEDULED_COMMUNICATION_STATUS_CHANGED',
        entity: 'Setting',
        entityId: jobId,
        payload: { jobId, newStatus },
      },
    });

    revalidatePath('/admin/communication');
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 4. Delete a Scheduled Job
 */
export async function deleteScheduledCommunicationAction(
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    const jobs: ScheduledCommunicationJob[] = Array.isArray(setting?.value)
      ? (setting.value as unknown as ScheduledCommunicationJob[])
      : [];

    const filtered = jobs.filter((j) => j.id !== jobId);

    await prisma.setting.update({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
      data: { value: filtered as any },
    });

    revalidatePath('/admin/communication');
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Helper: Deliver email payload to recipients and record in history
 */
async function dispatchEmailPayload(
  job: ScheduledCommunicationJob,
  senderConfig: CommunicationConfig,
  triggerNote = 'Scheduled Automated Delivery'
) {
  const recipientEmails = Array.from(
    new Set(job.recipients.map((r) => r.email.trim().toLowerCase()))
  );

  const formattedHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
      <div style="background-color: #1985A1; color: #ffffff; padding: 22px 26px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.3px;">ECE Capstone Project Management System</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Heritage Institute of Technology, Kolkata • Project Committee</p>
      </div>
      <div style="padding: 26px; background-color: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <div style="display: inline-block; background-color: #f0fdf4; color: #166534; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; border: 1px solid #bbf7d0; margin-bottom: 12px;">
          ${triggerNote}
        </div>
        <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 17px; font-weight: 700;">${job.subject}</h3>
        <div style="white-space: pre-wrap; font-size: 14px; color: #334155; margin-bottom: 24px;">${job.messageBody}</div>
        ${job.attachments && job.attachments.length > 0 ? `
          <div style="padding: 12px 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 6px;">Attached Files (${job.attachments.length}):</div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #1985A1;">
              ${job.attachments.map((a) => `<li>${a.filename} (${Math.round((a.size || 0) / 1024)} KB)</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #64748b; margin: 0;">
          Sent by <strong>${senderConfig.senderName}</strong> &lt;${senderConfig.senderEmail}&gt;<br />
          Official Contact: <a href="mailto:ece.project.committee@heritageit.edu" style="color: #1985A1; font-weight: 600;">ece.project.committee@heritageit.edu</a>
        </p>
      </div>
    </div>
  `;

  const emailAttachments = job.attachments?.map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.content, 'base64'),
    contentType: a.contentType,
  }));

  const sendResult = await sendEmail({
    to: recipientEmails,
    subject: job.subject,
    html: formattedHtml,
    text: job.messageBody,
    fromEmail: senderConfig.senderEmail,
    fromName: senderConfig.senderName,
    replyTo: senderConfig.replyTo || senderConfig.senderEmail,
    attachments: emailAttachments,
  });

  // Record in communication_history
  const historySetting = await prisma.setting.findUnique({
    where: { key: COMMUNICATION_HISTORY_KEY },
  });

  const currentHistory: any[] = Array.isArray(historySetting?.value)
    ? (historySetting.value as any[])
    : [];

  const historyEntry = {
    id: `hist-${Date.now()}`,
    sentAt: new Date().toISOString(),
    senderEmail: senderConfig.senderEmail,
    senderName: senderConfig.senderName,
    subject: job.subject,
    messageBody: job.messageBody,
    batchId: 'SCHEDULED',
    groupNumbers: [],
    recipientCount: recipientEmails.length,
    recipients: recipientEmails,
    audienceSummary: `[Scheduled] ${job.audienceSummary}`,
    attachments: job.attachments?.map((a) => ({ filename: a.filename, size: a.size })),
  };

  currentHistory.unshift(historyEntry);

  await prisma.setting.upsert({
    where: { key: COMMUNICATION_HISTORY_KEY },
    create: { key: COMMUNICATION_HISTORY_KEY, value: currentHistory as any },
    update: { value: currentHistory as any },
  });

  return sendResult;
}

/**
 * 5. Trigger Immediate Dispatch of a Scheduled Job (Test / Urgent)
 */
export async function triggerScheduledEmailImmediateAction(
  jobId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    const jobs: ScheduledCommunicationJob[] = Array.isArray(setting?.value)
      ? (setting.value as unknown as ScheduledCommunicationJob[])
      : [];

    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      return { success: false, error: 'Scheduled job not found.' };
    }

    const senderConfig = await getCommunicationConfig();
    const result = await dispatchEmailPayload(job, senderConfig, 'Manual Immediate Test Dispatch');

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to dispatch email.' };
    }

    job.sentOccurrencesCount++;
    job.lastSentAt = new Date().toISOString();

    await prisma.setting.update({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
      data: { value: jobs as any },
    });

    revalidatePath('/admin/communication');
    return {
      success: true,
      message: `Dispatched immediate test run to ${job.recipients.length} recipients.`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 6. Background/Cron Runner: Process Due Occurrences
 * Scans active scheduled communications for any due occurrences and sends them.
 */
export async function processDueScheduledCommunicationsAction(): Promise<{
  success: boolean;
  dispatchedCount: number;
  message?: string;
  error?: string;
}> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SCHEDULED_COMMUNICATIONS_KEY },
    });

    if (!setting || !Array.isArray(setting.value)) {
      return { success: true, dispatchedCount: 0, message: 'No scheduled communications configured.' };
    }

    const jobs: ScheduledCommunicationJob[] = setting.value as unknown as ScheduledCommunicationJob[];
    const now = new Date();
    const senderConfig = await getCommunicationConfig();
    let totalDispatched = 0;
    let modified = false;

    for (const job of jobs) {
      if (job.status !== 'ACTIVE') continue;

      const due = getDueOccurrences(job.occurrences, now);
      if (due.length === 0) continue;

      for (const occ of due) {
        try {
          const sendRes = await dispatchEmailPayload(
            job,
            senderConfig,
            `Scheduled Run (${job.sentOccurrencesCount + 1} of ${job.totalOccurrencesCount})`
          );

          if (sendRes.success) {
            occ.status = 'SENT';
            occ.sentAt = new Date().toISOString();
            job.sentOccurrencesCount++;
            job.lastSentAt = occ.sentAt;
            totalDispatched++;
            modified = true;
          } else {
            occ.status = 'FAILED';
            occ.error = sendRes.error;
            modified = true;
          }
        } catch (e) {
          occ.status = 'FAILED';
          occ.error = (e as Error).message;
          modified = true;
        }
      }

      // Update next run
      const next = calculateNextRun(job.occurrences, now);
      job.nextRunAt = next?.scheduledAt;

      // Check if job completed
      const allDone = job.occurrences.every((o) => o.status !== 'PENDING');
      if (allDone) {
        job.status = 'COMPLETED';
        modified = true;
      }
    }

    if (modified) {
      await prisma.setting.update({
        where: { key: SCHEDULED_COMMUNICATIONS_KEY },
        data: { value: jobs as any },
      });
      revalidatePath('/admin/communication');
    }

    return {
      success: true,
      dispatchedCount: totalDispatched,
      message: `Processed scheduled communications. Delivered ${totalDispatched} email(s).`,
    };
  } catch (err) {
    return { success: false, dispatchedCount: 0, error: (err as Error).message };
  }
}
