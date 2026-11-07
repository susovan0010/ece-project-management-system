import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createScheduledCommunicationAction,
  getScheduledCommunicationsAction,
  updateScheduleStatusAction,
  deleteScheduledCommunicationAction,
  triggerScheduledEmailImmediateAction,
  processDueScheduledCommunicationsAction,
  ScheduledCommunicationJob,
} from '@/app/actions/communication-schedule';
import { GET as cronGET, POST as cronPOST } from '@/app/api/cron/scheduled-communications/route';

// In-memory mock store for settings
let mockSettingsStore: Record<string, any> = {};

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const val = mockSettingsStore[where.key];
        return val !== undefined ? { id: `mock-${where.key}`, key: where.key, value: val } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: any } }) => {
        mockSettingsStore[where.key] = data.value;
        return { id: `mock-${where.key}`, key: where.key, value: data.value };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        mockSettingsStore[where.key] = update?.value ?? create?.value;
        return { id: `mock-${where.key}`, key: where.key, value: mockSettingsStore[where.key] };
      }),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: 'mock-audit-id' })),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'mock-smtp-sched-123' })),
  getCommunicationConfig: vi.fn(async () => ({
    senderEmail: 'ece.project.committee@heritageit.edu',
    senderName: 'ECE Project Committee',
    replyTo: 'ece.project.committee@heritageit.edu',
  })),
}));

describe('Scheduled Communication Server Actions & Cron Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore = {};
    process.env.CRON_SECRET = 'test-cron-secret-123';
  });

  it('rejects unauthorized non-admin users from creating scheduled emails', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValueOnce({
      user: { id: 'fac-1', name: 'Faculty Member', role: 'FACULTY' },
    });

    const res = await createScheduledCommunicationAction({
      subject: 'Test Schedule',
      messageBody: 'Body content',
      audienceSummary: 'Faculty Group',
      recipients: [{ name: 'Test', email: 'test@heritageit.edu', role: 'Faculty' }],
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      frequencyPerDay: 2,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00', '15:00'],
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/i);
  });

  it('creates an active scheduled job with occurrences and valid boundary dates', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'admin-1', name: 'Committee Admin', role: 'ADMIN' },
    });

    const res = await createScheduledCommunicationAction({
      subject: 'Notice on Synopsis Submission',
      messageBody: 'All project groups must submit draft synopses.',
      audienceSummary: 'All Project Groups',
      recipients: [
        { name: 'Student 1', email: 's1@heritageit.edu', role: 'Student' },
        { name: 'Faculty 1', email: 'f1@heritageit.edu', role: 'Supervisor' },
      ],
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      frequencyPerDay: 2,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00', '15:00'],
    });

    expect(res.success).toBe(true);
    expect(res.job).toBeDefined();
    expect(res.job?.status).toBe('ACTIVE');
    expect(res.job?.frequencyPerDay).toBe(2);
    expect(res.job?.occurrences.length).toBe(6); // 3 days * 2 = 6 occurrences
    expect(res.job?.totalOccurrencesCount).toBe(6);
    expect(res.job?.sentOccurrencesCount).toBe(0);

    // Verify stored in Settings
    const getRes = await getScheduledCommunicationsAction();
    expect(getRes.success).toBe(true);
    expect(getRes.jobs.length).toBe(1);
    expect(getRes.jobs[0].id).toBe(res.job?.id);
  });

  it('allows pausing, resuming, and deleting a scheduled job', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'admin-1', name: 'Committee Admin', role: 'ADMIN' },
    });

    // Create job first
    const createRes = await createScheduledCommunicationAction({
      subject: 'Weekly Reminder',
      messageBody: 'Weekly reminder body',
      audienceSummary: 'Faculty',
      recipients: [{ name: 'F1', email: 'f1@heritageit.edu', role: 'Faculty' }],
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      frequencyPerDay: 1,
      timeMode: 'RANDOM_WINDOW',
      randomWindow: { startTime: '09:00', endTime: '17:00' },
    });

    const jobId = createRes.job!.id;

    // Pause
    const pauseRes = await updateScheduleStatusAction(jobId, 'PAUSED');
    expect(pauseRes.success).toBe(true);
    let list = (await getScheduledCommunicationsAction()).jobs;
    expect(list.find((j) => j.id === jobId)?.status).toBe('PAUSED');

    // Resume
    const resumeRes = await updateScheduleStatusAction(jobId, 'ACTIVE');
    expect(resumeRes.success).toBe(true);
    list = (await getScheduledCommunicationsAction()).jobs;
    expect(list.find((j) => j.id === jobId)?.status).toBe('ACTIVE');

    // Delete
    const delRes = await deleteScheduledCommunicationAction(jobId);
    expect(delRes.success).toBe(true);
    list = (await getScheduledCommunicationsAction()).jobs;
    expect(list.find((j) => j.id === jobId)).toBeUndefined();
  });

  it('triggers an immediate test email and updates sentOccurrencesCount and history', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'admin-1', name: 'Committee Admin', role: 'ADMIN' },
    });

    const createRes = await createScheduledCommunicationAction({
      subject: 'Test Email Run',
      messageBody: 'This is an immediate test run check.',
      audienceSummary: 'Test Recipient',
      recipients: [{ name: 'Test User', email: 'test@heritageit.edu', role: 'Student' }],
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      frequencyPerDay: 1,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00'],
    });

    const jobId = createRes.job!.id;

    const testRunRes = await triggerScheduledEmailImmediateAction(jobId);
    expect(testRunRes.success).toBe(true);
    expect(testRunRes.message).toMatch(/Dispatched immediate test run/i);

    const jobs = (await getScheduledCommunicationsAction()).jobs;
    const updatedJob = jobs.find((j) => j.id === jobId);
    expect(updatedJob?.sentOccurrencesCount).toBe(1);
    expect(updatedJob?.lastSentAt).toBeDefined();

    // Verify written to communication_history
    expect(mockSettingsStore['communication_history']).toBeDefined();
    expect(mockSettingsStore['communication_history'].length).toBeGreaterThanOrEqual(1);
    expect(mockSettingsStore['communication_history'][0].subject).toBe('Test Email Run');
  });

  it('processes due occurrences in background and marks job COMPLETED when all finished', async () => {
    // Setup a job where an occurrence is already due (scheduled in the past)
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
    const mockJob: ScheduledCommunicationJob = {
      id: 'job-due-1',
      createdAt: new Date().toISOString(),
      createdById: 'admin-1',
      createdByName: 'Admin',
      status: 'ACTIVE',
      subject: 'Due Schedule Test',
      messageBody: 'Body of due email',
      audienceSummary: 'Audience',
      recipients: [{ name: 'User 1', email: 'u1@heritageit.edu', role: 'Student' }],
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      frequencyPerDay: 1,
      timeMode: 'SPECIFIC',
      specificTimes: ['10:00'],
      randomWindow: { startTime: '09:00', endTime: '18:00' },
      occurrences: [
        {
          id: 'occ-1',
          scheduledAt: pastTime,
          status: 'PENDING',
        },
      ],
      totalOccurrencesCount: 1,
      sentOccurrencesCount: 0,
      nextRunAt: pastTime,
    };

    mockSettingsStore['scheduled_communications'] = [mockJob];

    const processRes = await processDueScheduledCommunicationsAction();
    expect(processRes.success).toBe(true);
    expect(processRes.dispatchedCount).toBe(1);

    const jobs = mockSettingsStore['scheduled_communications'] as ScheduledCommunicationJob[];
    expect(jobs[0].occurrences[0].status).toBe('SENT');
    expect(jobs[0].sentOccurrencesCount).toBe(1);
    expect(jobs[0].status).toBe('COMPLETED');
  });

  it('secures the cron endpoint: 401 when unauthorized, 200 when valid secret provided', async () => {
    // 1. Missing secret -> 401
    const unauthReq = new Request('http://localhost:3000/api/cron/scheduled-communications', {
      method: 'GET',
    });
    const resUnauth = await cronGET(unauthReq);
    expect(resUnauth.status).toBe(401);

    // 2. Valid Bearer Token -> 200
    const authReq = new Request('http://localhost:3000/api/cron/scheduled-communications', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-cron-secret-123',
      },
    });
    const resAuth = await cronPOST(authReq);
    expect(resAuth.status).toBe(200);
    const body = await resAuth.json();
    expect(body.success).toBe(true);
  });
});
