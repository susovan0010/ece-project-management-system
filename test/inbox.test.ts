import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  getInboxEmailsAction,
  getEmailDetailAction,
  quickReplyAction,
} from '../app/actions/inbox';
import { auth } from '@/auth';
import { prisma } from '../lib/prisma';
import * as emailModule from '../lib/email';
import * as imapModule from '../lib/imap';

describe('Admin Inbox: Role Isolation & Access Control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to read inbox emails', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getInboxEmailsAction();
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY users from viewing the admin incoming mailbox', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    const res = await getInboxEmailsAction();
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Administrators');
  });

  it('allows ADMIN to fetch inbox emails and returns simulated or live messages', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    vi.spyOn(imapModule, 'fetchRecentInboxEmails').mockResolvedValue({
      success: true,
      totalCount: 1,
      messages: [
        {
          uid: 101,
          seq: 1,
          subject: 'Query regarding Capstone Project Allotment for Group 14',
          from: { name: 'Dr. Debasish Mandal', address: 'debasish@hitk.edu' },
          to: [{ name: 'Project Committee', address: 'susovan.mandal@heritageit.edu' }],
          date: new Date().toISOString(),
          seen: false,
        },
      ],
    });

    const res = await getInboxEmailsAction(1, 10);
    expect(res.success).toBe(true);
    expect(res.messages).toBeDefined();
    expect(Array.isArray(res.messages)).toBe(true);
    expect(res.messages!.length).toBeGreaterThan(0);
    expect(res.messages![0]).toHaveProperty('subject');
    expect(res.messages![0]).toHaveProperty('from');
  });

  it('rejects FACULTY users from reading email detail', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    const res = await getEmailDetailAction(101);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Only Project Committee Administrators');
  });

  it('allows ADMIN to fetch email detail for a specific message UID', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    vi.spyOn(imapModule, 'fetchInboxEmailDetail').mockResolvedValue({
      success: true,
      message: {
        uid: 101,
        seq: 1,
        subject: 'Query regarding Capstone Project Allotment for Group 14',
        from: { name: 'Dr. Debasish Mandal', address: 'debasish@hitk.edu' },
        to: [{ name: 'Project Committee', address: 'susovan.mandal@heritageit.edu' }],
        date: new Date().toISOString(),
        seen: true,
        html: '<p>Test email body</p>',
        text: 'Test email body',
        attachments: [],
      },
    });

    const res = await getEmailDetailAction(101);
    expect(res.success).toBe(true);
    expect(res.message).toBeDefined();
    expect(res.message?.uid).toBe(101);
    expect(res.message?.subject).toContain('Group 14');
  });
});

describe('Admin Inbox: Quick Reply Functionality', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects reply without a valid recipient email or empty body', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    const res = await quickReplyAction({
      toEmail: 'invalid-email',
      subject: 'Re: Test',
      replyText: '',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('dispatches quick reply email and logs communication event in database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', name: 'Dr. Susovan Mandal', email: 'susovan.mandal@heritageit.edu' },
    } as any);

    vi.spyOn(emailModule, 'sendEmail').mockResolvedValue({
      success: true,
      id: 'mock-reply-id-123',
      provider: 'smtp',
    });

    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

    const res = await quickReplyAction({
      toEmail: 'debasish@hitk.edu',
      toName: 'Dr. Debasish Mandal',
      subject: 'Query regarding Capstone Project Allotment for Group 14',
      replyText: 'Dear Dr. Mandal, The review date has been rescheduled to Tuesday 3 PM.',
      originalSnippet: 'Our group has reviewed the SDR hardware requirement...',
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe('mock-reply-id-123');
  });
});
