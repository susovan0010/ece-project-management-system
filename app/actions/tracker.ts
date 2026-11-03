'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { sendEmail } from '@/lib/email';

export interface RubricCompletionStat {
  code: string;
  semester: number;
  title: string;
  maxMarks: number;
  totalGroups: number;
  completedGroups: number;
  partialGroups: number;
  pendingGroups: number;
  completionRate: number; // 0 - 100
}

export interface SupervisorTrackerStat {
  supervisorId: string;
  name: string;
  email: string;
  groupCount: number;
  groupNumbers: number[];
  rubricStatus: Record<string, 'COMPLETE' | 'PARTIAL' | 'PENDING'>;
  sem6Pending: number;
  sem7Pending: number;
  sem8Pending: number;
  lastReminderSent?: Date | null;
}

// ----------------------------------------------------
// 1. Get Marks Completion Tracker Data
// ----------------------------------------------------
export async function getMarksTrackerAction(batchId?: string, semesterFilter?: number) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access marks tracker.' };
  }

  try {
    const groupWhere: any = {};
    if (batchId && batchId !== 'ALL') {
      groupWhere.batchId = batchId;
    }

    // Ensure default MarkWindow records exist for all rubrics A-F if database is fresh
    const existingWindows = await prisma.markWindow.findMany({
      orderBy: [{ semester: 'asc' }, { rubric: 'asc' }],
    });

    if (existingWindows.length === 0) {
      const defaultDeadlines: Array<{ semester: number; rubric: string; daysFromNow: number }> = [
        { semester: 6, rubric: 'A', daysFromNow: 30 },
        { semester: 6, rubric: 'B', daysFromNow: 45 },
        { semester: 7, rubric: 'C', daysFromNow: 120 },
        { semester: 7, rubric: 'D', daysFromNow: 135 },
        { semester: 8, rubric: 'E', daysFromNow: 210 },
        { semester: 8, rubric: 'F', daysFromNow: 225 },
      ];

      for (const dw of defaultDeadlines) {
        const d = new Date();
        d.setDate(d.getDate() + dw.daysFromNow);
        await prisma.markWindow.create({
          data: {
            semester: dw.semester,
            rubric: dw.rubric,
            deadline: d,
            isLocked: false,
          },
        });
      }
    }

    const [groups, batches, rubrics, windows, reminderLogs] = await Promise.all([
      prisma.group.findMany({
        where: groupWhere,
        include: {
          supervisor: { select: { id: true, name: true, email: true } },
          members: true,
          markEntries: {
            include: {
              criterion: true,
            },
          },
        },
        orderBy: { number: 'asc' },
      }),
      prisma.batch.findMany({ orderBy: { id: 'desc' } }),
      prisma.rubric.findMany({
        include: { criteria: true },
        orderBy: [{ semester: 'asc' }, { code: 'asc' }],
      }),
      prisma.markWindow.findMany({
        orderBy: [{ semester: 'asc' }, { rubric: 'asc' }],
      }),
      prisma.reminderLog.findMany({
        orderBy: { sentAt: 'desc' },
        take: 20,
      }),
    ]);

    // Compute Rubric completion stats
    const filteredRubrics = semesterFilter
      ? rubrics.filter((r) => r.semester === semesterFilter)
      : rubrics;

    const rubricStats: RubricCompletionStat[] = filteredRubrics.map((r) => {
      let completed = 0;
      let partial = 0;
      let pending = 0;

      const totalCriteriaCount = r.criteria.length;

      groups.forEach((g) => {
        const rubricEntries = g.markEntries.filter(
          (m) => m.criterion?.rubricCode === r.code && m.criterion?.semester === r.semester
        );

        if (rubricEntries.length === 0) {
          pending++;
        } else {
          // Group has entries. Check if all criteria are covered
          const uniqueCritIds = new Set(rubricEntries.map((m) => m.criterionId));
          if (uniqueCritIds.size >= totalCriteriaCount) {
            completed++;
          } else {
            partial++;
          }
        }
      });

      const total = groups.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        code: r.code,
        semester: r.semester,
        title: r.title,
        maxMarks: r.maxMarks,
        totalGroups: total,
        completedGroups: completed,
        partialGroups: partial,
        pendingGroups: pending,
        completionRate: rate,
      };
    });

    // Compute Supervisor-level tracker stats
    const supervisorMap = new Map<string, SupervisorTrackerStat>();

    groups.forEach((g) => {
      const sup = g.supervisor;
      if (!supervisorMap.has(sup.id)) {
        // Find most recent reminder for supervisor
        const recentLog = reminderLogs.find((l) => l.supervisorId === sup.id);

        supervisorMap.set(sup.id, {
          supervisorId: sup.id,
          name: sup.name,
          email: sup.email,
          groupCount: 0,
          groupNumbers: [],
          rubricStatus: { A: 'PENDING', B: 'PENDING', C: 'PENDING', D: 'PENDING', E: 'PENDING', F: 'PENDING' },
          sem6Pending: 0,
          sem7Pending: 0,
          sem8Pending: 0,
          lastReminderSent: recentLog ? recentLog.sentAt : null,
        });
      }

      const sStat = supervisorMap.get(sup.id)!;
      sStat.groupCount++;
      sStat.groupNumbers.push(g.number);

      // Check status for each rubric across supervisor groups
      rubrics.forEach((r) => {
        const rubricEntries = g.markEntries.filter(
          (m) => m.criterion?.rubricCode === r.code && m.criterion?.semester === r.semester
        );
        const uniqueCritIds = new Set(rubricEntries.map((m) => m.criterionId));

        if (uniqueCritIds.size >= r.criteria.length) {
          // If already set to PENDING or unset, mark COMPLETE if this group complete
          if (sStat.rubricStatus[r.code] !== 'PARTIAL') {
            sStat.rubricStatus[r.code] = 'COMPLETE';
          }
        } else if (uniqueCritIds.size > 0) {
          sStat.rubricStatus[r.code] = 'PARTIAL';
        } else {
          // Has pending group in this rubric
          if (r.semester === 6) sStat.sem6Pending++;
          if (r.semester === 7) sStat.sem7Pending++;
          if (r.semester === 8) sStat.sem8Pending++;
        }
      });
    });

    const supervisorStats = Array.from(supervisorMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      batches,
      windows,
      rubricStats,
      supervisorStats,
      recentReminders: reminderLogs,
      totalGroups: groups.length,
    };
  } catch (err) {
    return { error: `Failed to load marks tracker: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Toggle Mark Window Lock Status
// ----------------------------------------------------
export async function toggleMarkWindowLockAction(windowId: string, isLocked: boolean) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can lock/unlock mark windows.' };
  }

  try {
    const updated = await prisma.markWindow.update({
      where: { id: windowId },
      data: { isLocked },
    });

    revalidatePath('/admin/marks-tracker');
    revalidatePath('/faculty/marks');
    return { success: true, window: updated };
  } catch (err) {
    return { error: `Failed to update window lock: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Update Mark Window Deadline
// ----------------------------------------------------
export async function updateMarkWindowDeadlineAction(windowId: string, deadline: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can modify deadlines.' };
  }

  try {
    const newDeadline = new Date(deadline);
    if (isNaN(newDeadline.getTime())) {
      return { error: 'Invalid deadline date format.' };
    }

    const updated = await prisma.markWindow.update({
      where: { id: windowId },
      data: { deadline: newDeadline },
    });

    revalidatePath('/admin/marks-tracker');
    revalidatePath('/faculty/marks');
    return { success: true, window: updated };
  } catch (err) {
    return { error: `Failed to update deadline: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Send Supervisor Reminder (One-Click Manual Dispatch)
// ----------------------------------------------------
export async function sendSupervisorReminderAction(input: {
  supervisorId: string;
  semester: number;
  groupsCount: number;
}) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can dispatch reminders.' };
  }

  try {
    const supervisor = await prisma.user.findUnique({
      where: { id: input.supervisorId },
      select: { name: true, email: true },
    });

    if (!supervisor) {
      return { error: 'Supervisor not found.' };
    }

    const emailRes = await sendEmail({
      to: supervisor.email,
      subject: `[ECE HITK] Urgent: Pending Capstone Marks Submission (Semester ${input.semester})`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #1e3a8a; color: white; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px;">Department of Electronics and Communication Engineering</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Heritage Institute of Technology, Kolkata</p>
          </div>
          <div style="padding: 24px;">
            <p>Dear <strong>${supervisor.name}</strong>,</p>
            <p>This is an official notification from the ECE Project Committee. You currently have <strong>${input.groupsCount} allocated group(s)</strong> with pending marks evaluation for <strong>Semester ${input.semester}</strong>.</p>
            <p>Please log in to your supervisor portal to record and submit the evaluation rubrics for your assigned groups:</p>
            <div style="margin: 22px 0; text-align: center;">
              <a href="https://ece-project-management-system.vercel.app/faculty/marks" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                Access Faculty Marks Portal →
              </a>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
              ECE Project Committee Administration<br/>
              Sender: susovan.mandal@heritageit.edu
            </p>
          </div>
        </div>
      `,
    });

    // Record in ReminderLog table
    await prisma.reminderLog.create({
      data: {
        supervisorId: input.supervisorId,
        semester: input.semester,
        groupsCount: input.groupsCount,
        success: emailRes.success,
        ...(emailRes.error ? { error: emailRes.error } : {}),
      },
    });

    revalidatePath('/admin/marks-tracker');

    if (!emailRes.success) {
      return {
        error: `Email transport notice: ${emailRes.error || 'Failed to dispatch email'}. (Reminder log recorded).`,
      };
    }

    const modeNotice = emailRes.simulated ? ' [Simulation Mode - Check Vercel RESEND_API_KEY for live delivery]' : '';
    return {
      success: true,
      message: `Reminder email successfully dispatched to ${supervisor.name} (${supervisor.email})${modeNotice}.`,
    };
  } catch (err) {
    return { error: `Failed to send reminder: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Send Bulk Reminders to All Pending Supervisors
// ----------------------------------------------------
export async function sendBulkRemindersAction(semester: number) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can dispatch bulk reminders.' };
  }

  try {
    // Find all supervisors with groups in this semester
    const groups = await prisma.group.findMany({
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        markEntries: {
          include: { criterion: true },
        },
      },
    });

    if (groups.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'No project groups are currently formed or allocated. Enrol and allocate student groups in "Student Allocation" to track and remind supervisors.',
      };
    }

    const pendingSupervisors = new Map<string, { count: number; name: string; email: string }>();

    groups.forEach((g) => {
      const hasEntries = g.markEntries.some((m) => m.criterion?.semester === semester);
      if (!hasEntries) {
        const existing = pendingSupervisors.get(g.supervisor.id);
        if (existing) {
          existing.count += 1;
        } else {
          pendingSupervisors.set(g.supervisor.id, {
            count: 1,
            name: g.supervisor.name,
            email: g.supervisor.email,
          });
        }
      }
    });

    if (pendingSupervisors.size === 0) {
      return { success: true, count: 0, message: `All supervisors have completed marks for Semester ${semester}!` };
    }

    let dispatched = 0;
    let anySimulated = false;

    for (const [supId, info] of Array.from(pendingSupervisors.entries())) {
      const emailRes = await sendEmail({
        to: info.email,
        subject: `[ECE HITK] Reminder: Pending Capstone Marks for Semester ${semester}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1e3a8a; color: white; padding: 18px 24px;">
              <h2 style="margin: 0; font-size: 18px;">Department of Electronics and Communication Engineering</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Heritage Institute of Technology, Kolkata</p>
            </div>
            <div style="padding: 24px;">
              <p>Dear <strong>${info.name}</strong>,</p>
              <p>This is a bulk reminder from the ECE Project Committee. You have <strong>${info.count} assigned project group(s)</strong> with pending marks evaluation for <strong>Semester ${semester}</strong>.</p>
              <p>Kindly complete the pending marks entries for your allotted students in the portal:</p>
              <div style="margin: 22px 0; text-align: center;">
                <a href="https://ece-project-management-system.vercel.app/faculty/marks" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                  Open Faculty Marks Portal →
                </a>
              </div>
              <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                ECE Project Committee Administration<br/>
                Sender: susovan.mandal@heritageit.edu
              </p>
            </div>
          </div>
        `,
      });

      if (emailRes.simulated) anySimulated = true;

      await prisma.reminderLog.create({
        data: {
          supervisorId: supId,
          semester,
          groupsCount: info.count,
          success: emailRes.success,
          ...(emailRes.error ? { error: emailRes.error } : {}),
        },
      });
      dispatched++;
    }

    revalidatePath('/admin/marks-tracker');
    const simNotice = anySimulated ? ' (Simulation Mode active - configure live RESEND_API_KEY on Vercel for inbox delivery)' : '';
    return {
      success: true,
      count: dispatched,
      message: `Dispatched reminders to ${dispatched} pending supervisors${simNotice}.`,
    };
  } catch (err) {
    return { error: `Failed to dispatch bulk reminders: ${(err as Error).message}` };
  }
}
