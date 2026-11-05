// ========================================================
// ECE Capstone Project Management System - Communication Hub Unit Tests
// Tests sender configuration, student/faculty recipient email updates,
// group messaging delivery, and communication audit logging.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-smtp-msg-id-123' }),
    })),
  },
}));

import {
  getCommunicationConfigAction,
  updateCommunicationConfigAction,
  getCommunicationRosterAction,
  updateRecipientEmailAction,
  sendGroupCommunicationAction,
  getCommunicationHistoryAction,
} from '../app/actions/communication';
import { getCommunicationConfig, DEFAULT_SENDER_EMAIL } from '../lib/email';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Communication Hub: Sender Configuration & Defaults', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to official ECE Project Committee email by default', async () => {
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null as any);

    const config = await getCommunicationConfig();
    expect(config.senderEmail).toBe('ece.project.committee@heritageit.edu');
    expect(config.senderName).toContain('ECE Project Committee');
  });

  it('rejects unauthenticated requests to update communication config', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await updateCommunicationConfigAction({
      senderEmail: 'test@heritageit.edu',
      senderName: 'Test Name',
    });
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('saves and updates sender configuration for Project Committee Admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const res = await updateCommunicationConfigAction({
      senderEmail: 'ece.project.committee@heritageit.edu',
      senderName: 'ECE Project Committee',
      replyTo: 'ece.project.committee@heritageit.edu',
    });

    expect(res.success).toBe(true);
    expect(upsertSpy).toHaveBeenCalled();
  });
});

describe('Communication Hub: Recipient Email Updates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid email formats', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const res = await updateRecipientEmailAction('STUDENT', 'st-1', 'not-an-email');
    expect(res.error).toBeDefined();
    expect(res.error).toContain('valid email');
  });

  it('updates student email address in the database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const updateSpy = vi.spyOn(prisma.student, 'update').mockResolvedValue({} as any);

    const res = await updateRecipientEmailAction('STUDENT', 'st-1', 'student.ece@heritageit.edu');
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'st-1' },
      data: { email: 'student.ece@heritageit.edu' },
    });
  });

  it('updates faculty email address in the database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

    const res = await updateRecipientEmailAction('FACULTY', 'fac-1', 'faculty.ece@heritageit.edu');
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'fac-1' },
      data: { email: 'faculty.ece@heritageit.edu' },
    });
  });
});

describe('Communication Hub: Message Dispatch & History', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers messages to individual student members of selected groups', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: 'communication_config',
      value: {
        senderEmail: 'susovan.mandal@heritageit.edu',
        senderName: 'Dr. Susovan Mandal (ECE Project Committee)',
      },
    } as any);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        supervisor: { id: 'fac-1', name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        members: [
          {
            student: {
              id: 'st-1',
              name: 'Sourav Roy',
              roll: '12623001001',
              email: 'sourav.roy@heritageit.edu',
            },
          },
          {
            student: {
              id: 'st-2',
              name: 'Ananya Sen',
              roll: '12623001002',
              email: 'ananya.sen@heritageit.edu',
            },
          },
        ],
      },
    ] as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const res = await sendGroupCommunicationAction({
      batchId: '2023-2027',
      selectedGroupIds: ['grp-1'],
      includeStudents: true,
      includeFaculty: false,
      subject: 'Capstone Viva Voce Schedule Notice',
      messageBody: 'Viva will take place this Thursday at 10 AM in Lab 3.',
    });

    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(res.recipients).toContain('sourav.roy@heritageit.edu');
    expect(res.recipients).toContain('ananya.sen@heritageit.edu');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('delivers broadcast message to Department Faculty Google Group (hit_ece_faculties@googlegroups.com)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null as any);
    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const res = await sendGroupCommunicationAction({
      sendToFacultyGoogleGroup: true,
      subject: 'Important Faculty Meeting Notice',
      messageBody: 'All ECE faculty are requested to attend the meeting tomorrow.',
    });

    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
    expect(res.recipients).toContain('hit_ece_faculties@googlegroups.com');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('delivers messages to individual faculty supervisors via login email IDs', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null as any);

    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      { id: 'fac-1', name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
      { id: 'fac-2', name: 'Prof. Ananya Chattopadhyay', email: 'ananya.chattopadhyay@heritageit.edu' },
    ] as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const res = await sendGroupCommunicationAction({
      selectedFacultyUserIds: ['fac-1', 'fac-2'],
      subject: 'Capstone Project Evaluation Guidelines for Supervisors',
      messageBody: 'Guidelines for 6th semester evaluation rubrics attached.',
    });

    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(res.recipients).toContain('debasish@hitk.edu');
    expect(res.recipients).toContain('ananya.chattopadhyay@heritageit.edu');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('delivers messages with attachments and saves attachment metadata in history', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const mockAttachments = [
      {
        filename: 'Rubric_Guidelines.pdf',
        content: Buffer.from('PDF_CONTENT').toString('base64'),
        contentType: 'application/pdf',
        size: 1024,
      },
      {
        filename: 'Evaluation_Schedule.xlsx',
        content: Buffer.from('XLSX_CONTENT').toString('base64'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
      },
    ];

    const res = await sendGroupCommunicationAction({
      sendToFacultyGoogleGroup: true,
      subject: 'Notice with Attached Guidelines',
      messageBody: 'Please find the attached guidelines.',
      attachments: mockAttachments,
    });

    expect(res.success).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'communication_history' },
        create: expect.objectContaining({
          value: expect.arrayContaining([
            expect.objectContaining({
              attachments: [
                { filename: 'Rubric_Guidelines.pdf', size: 1024 },
                { filename: 'Evaluation_Schedule.xlsx', size: 2048 },
              ],
            }),
          ]),
        }),
      })
    );
  });
});
