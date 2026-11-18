import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  getProjectInvitationStatusAction,
  toggleProjectInvitationAction,
} from '@/app/actions/project-invitation';
import { claimAndConfirmBankTopicAction } from '@/app/actions/project-lifecycle';
import { saveFacultyTopicProposalAction } from '@/app/actions/faculty-propose';
import { PROJECT_INVITATION_SETTING_KEY } from '@/lib/project-invitation';

describe('Supervisor Project Invitation Window (Admin/Student Allocation -> Faculty Confirm as Active)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to closed (enabled: false) when setting has not been configured yet', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);

    const res = await getProjectInvitationStatusAction();
    expect(res.success).toBe(true);
    expect(res.state?.enabled).toBe(false);
  });

  it('rejects FACULTY or non-ADMIN users from toggling the invitation window', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', name: 'Dr. Roy' },
    } as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert');
    const res = await toggleProjectInvitationAction(true);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Unauthorized');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('allows ADMIN to open and close the invitation window and logs to AuditLog', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', name: 'Committee Chair' },
    } as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const openRes = await toggleProjectInvitationAction(true);
    expect(openRes.success).toBe(true);
    expect(openRes.state?.enabled).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: PROJECT_INVITATION_SETTING_KEY },
      })
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'OPEN_SUPERVISOR_PROJECT_INVITATION',
        }),
      })
    );

    const closeRes = await toggleProjectInvitationAction(false);
    expect(closeRes.success).toBe(true);
    expect(closeRes.state?.enabled).toBe(false);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CLOSE_SUPERVISOR_PROJECT_INVITATION',
        }),
      })
    );
  });

  it('blocks claimAndConfirmBankTopicAction when invitation is closed, and permits it when open', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'topic-1',
      code: 'FAC-2026-001',
      title: 'VLSI Low-Power Router',
      description: 'Low-power NoC router architecture.',
      status: 'DRAFT',
      proposerId: 'fac-1',
      proposer: { id: 'fac-1', name: 'Dr. Roy' },
    } as any);

    const updateSpy = vi.spyOn(prisma.topic, 'update').mockResolvedValue({
      id: 'topic-1',
      status: 'CONFIRMED',
    } as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    // Closed -> blocked
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: PROJECT_INVITATION_SETTING_KEY,
      value: { enabled: false },
    } as any);

    const closedRes = await claimAndConfirmBankTopicAction('topic-1');
    expect(closedRes.error).toContain('Invite Project from Supervisors');
    expect(updateSpy).not.toHaveBeenCalled();

    // Open -> allowed
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: PROJECT_INVITATION_SETTING_KEY,
      value: { enabled: true },
    } as any);

    const openRes = await claimAndConfirmBankTopicAction('topic-1');
    expect(openRes.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('allows faculty to save a new DRAFT topic to the Topic Bank while invitation is closed, but blocks CONFIRMED', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.attribute, 'findMany').mockResolvedValue([
      { id: 1, code: 'WP1' },
    ] as any);
    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: PROJECT_INVITATION_SETTING_KEY,
      value: { enabled: false },
    } as any);

    // Attempting CONFIRMED when closed -> blocked
    const confirmAttempt = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-099',
      title: 'Edge AI Sensor Node',
      category: 'Hardware',
      domain: 'VLSI & Embedded Systems',
      description: 'TinyML-based environmental sensor node.',
      tags: ['TinyML'],
      status: 'CONFIRMED',
      attributes: [{ code: 'WP1', level: 2, reason: 'Engineering depth', origin: 'FACULTY' }],
      sdgs: [],
    });
    expect(confirmAttempt.error).toContain('Invite Project from Supervisors');

    // Saving as DRAFT when closed -> allowed (enters Topic Bank with source FACULTY)
    const createMock = vi.fn().mockResolvedValue({
      id: 'topic-new',
      code: 'FAC-2026-099',
      source: 'FACULTY',
      status: 'DRAFT',
    });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb({
        topic: { create: createMock },
        topicAttribute: { create: vi.fn().mockResolvedValue({}) },
        topicSdg: { create: vi.fn().mockResolvedValue({}) },
        descriptionVersion: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      })
    );

    const draftAttempt = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-099',
      title: 'Edge AI Sensor Node',
      category: 'Hardware',
      domain: 'VLSI & Embedded Systems',
      description: 'TinyML-based environmental sensor node.',
      tags: ['TinyML'],
      status: 'DRAFT',
      attributes: [{ code: 'WP1', level: 2, reason: 'Engineering depth', origin: 'FACULTY' }],
      sdgs: [],
    });
    expect(draftAttempt.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'FACULTY',
          status: 'DRAFT',
        }),
      })
    );
  });
});
