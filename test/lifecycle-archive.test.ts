import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  claimAndConfirmBankTopicAction,
  completeAndArchiveTopicAction,
  getArchivedProjectsAction,
  deleteUnconfirmedTopicAction,
  requestTopicDeletionAction,
  resolveTopicDeleteRequestAction,
  finalDeleteApprovedTopicAction,
} from '@/app/actions/project-lifecycle';
import { processRawImportData } from '@/lib/import/parser';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    topic: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    group: {
      delete: vi.fn(),
    },
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe('Phase 16: Topic Lifecycle, Active Confirmation & Comprehensive Archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects ADMIN from claiming a topic as proposer (Mandatory Rule 1)', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    });

    const res = await claimAndConfirmBankTopicAction('topic-1');
    expect(res.error).toContain('Unauthorized: Only Faculty Supervisors');
    expect(prisma.topic.update).not.toHaveBeenCalled();
  });

  it('allows FACULTY supervisor to select and confirm a bank topic as ACTIVE (CONFIRMED)', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-1',
      code: 'UGR-015',
      title: 'RISC-V Processor Design on FPGA',
      status: 'DRAFT',
      proposerId: null,
      proposer: null,
    });

    (prisma.topic.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-1',
      code: 'UGR-015',
      title: 'RISC-V Processor Design on FPGA',
      status: 'CONFIRMED',
      proposerId: 'fac-1',
    });

    const res = await claimAndConfirmBankTopicAction('topic-1');
    expect(res.success).toBe(true);
    expect(res.topic?.status).toBe('CONFIRMED');
    expect(prisma.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic-1' },
      data: {
        proposerId: 'fac-1',
        status: 'CONFIRMED',
      },
    });
  });

  it('prevents a different FACULTY member from claiming an already-claimed topic', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-2', role: 'FACULTY' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-1',
      code: 'UGR-015',
      title: 'RISC-V Processor Design on FPGA',
      status: 'CONFIRMED',
      proposerId: 'fac-1',
      proposer: { id: 'fac-1', name: 'Dr. S. Roy' },
    });

    const res = await claimAndConfirmBankTopicAction('topic-1');
    expect(res.error).toContain('already been selected and confirmed by Dr. S. Roy');
  });

  it('allows supervisor or admin to deactivate/complete a project into ARCHIVED status', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-1',
      code: 'FAC-2026-001',
      title: 'Millimeter-Wave MIMO Antenna Array',
      status: 'ALLOTTED',
      proposerId: 'fac-1',
      groups: [{ id: 'grp-1', number: 1, supervisorId: 'fac-1' }],
    });

    (prisma.topic.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-1',
      code: 'FAC-2026-001',
      title: 'Millimeter-Wave MIMO Antenna Array',
      status: 'ARCHIVED',
    });

    const res = await completeAndArchiveTopicAction('topic-1');
    expect(res.success).toBe(true);
    expect(res.topic?.status).toBe('ARCHIVED');
  });

  it('aggregates all-semester marks (Sem 6, Sem 7, Sem 8) in getArchivedProjectsAction', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    });

    (prisma.topic.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'topic-1',
        code: 'FAC-2026-001',
        title: 'Millimeter-Wave MIMO Antenna Array',
        category: 'Hardware',
        source: 'FACULTY',
        domain: 'RF & Microwave',
        updatedAt: new Date('2026-05-20T10:00:00Z'),
        proposer: { id: 'fac-1', name: 'Dr. S. Roy', email: 'sroy@hitk.edu' },
        sdgs: [{ sdgId: 9, sdg: { id: 9, title: 'Industry, Innovation and Infrastructure' } }],
        attributes: [{ level: 3, attribute: { code: 'WP1', kind: 'WP', title: 'Depth of Knowledge' } }],
        groups: [
          {
            id: 'grp-1',
            number: 4,
            batchId: '2023-2027',
            supervisor: { id: 'fac-1', name: 'Dr. S. Roy', email: 'sroy@hitk.edu' },
            members: [
              {
                student: {
                  id: 'st-1',
                  name: 'Ananya Chatterjee',
                  roll: '12622003001',
                  email: 'ananya@hitk.edu',
                  phone: '9876543210',
                },
              },
            ],
            markEntries: [
              // Sem 6: Rubric A (50) + Rubric B (35) = 85
              { criterionId: 1, studentId: null, examinerSlot: 1, marks: 50, criterion: { rubricCode: 'A', scope: 'GROUP' } },
              { criterionId: 2, studentId: 'st-1', examinerSlot: 1, marks: 35, criterion: { rubricCode: 'B', scope: 'STUDENT' } },
              // Sem 7: Rubric C (42) + Rubric D averaged across 2 slots (40, 44 -> 42) = 84
              { criterionId: 3, studentId: null, examinerSlot: 1, marks: 42, criterion: { rubricCode: 'C', scope: 'GROUP' } },
              { criterionId: 4, studentId: 'st-1', examinerSlot: 1, marks: 40, criterion: { rubricCode: 'D', scope: 'STUDENT' } },
              { criterionId: 4, studentId: 'st-1', examinerSlot: 2, marks: 44, criterion: { rubricCode: 'D', scope: 'STUDENT' } },
              // Sem 8: Rubric E (36) + Rubric F (54) = 90
              { criterionId: 5, studentId: null, examinerSlot: 1, marks: 36, criterion: { rubricCode: 'E', scope: 'GROUP' } },
              { criterionId: 6, studentId: 'st-1', examinerSlot: 1, marks: 54, criterion: { rubricCode: 'F', scope: 'STUDENT' } },
            ],
          },
        ],
      },
    ]);

    const res = await getArchivedProjectsAction();
    expect(res.archivedProjects).toHaveLength(1);
    const proj = res.archivedProjects![0];
    expect(proj.code).toBe('FAC-2026-001');
    expect(proj.groups[0].groupNumber).toBe(4);

    const st = proj.groups[0].students[0];
    expect(st.name).toBe('Ananya Chatterjee');
    expect(st.sem6Total).toBe(85);
    expect(st.sem7Total).toBe(84);
    expect(st.sem8Total).toBe(90);
    expect(st.grandTotal).toBe(259);
  });

  it('appends new topic rows without colliding with existing UGR codes when Code is blank', () => {
    const existingCodes = new Set(['UGR-001', 'UGR-002']);
    const existingTitles = new Set(['existing project']);

    const rows = [
      {
        Title: 'New VLSI Low Power SRAM Array',
        Category: 'Hardware',
        Domain: 'VLSI',
        Description: 'Design of 6T SRAM cell with reduced leakage.',
        'Mapped SDG(s)': '9',
      },
    ];

    const parsed = processRawImportData(rows, 'UG_RESEARCH', existingCodes, existingTitles);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe('UGR-003');
    expect(parsed[0].isDuplicate).toBe(false);
  });

  it('allows a supervisor to directly delete their own topic BEFORE confirming (DRAFT status)', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', name: 'Dr. S. Roy' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-draft-1',
      code: 'FAC-2026-009',
      title: 'Draft IoT Sensor Array',
      status: 'DRAFT',
      proposerId: 'fac-1',
    });

    (prisma.topic.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-draft-1',
    });

    const res = await deleteUnconfirmedTopicAction('topic-draft-1');
    expect(res.success).toBe(true);
    expect(prisma.topic.delete).toHaveBeenCalledWith({ where: { id: 'topic-draft-1' } });
  });

  it('blocks a supervisor from directly deleting a topic AFTER confirming (requires request to Admin)', async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', name: 'Dr. S. Roy' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-conf-1',
      code: 'FAC-2026-010',
      title: 'Confirmed Smart Grid Topic',
      status: 'CONFIRMED',
      proposerId: 'fac-1',
    });

    const res = await deleteUnconfirmedTopicAction('topic-conf-1');
    expect(res.error).toContain('Once a project is confirmed, you must request deletion from the Admin');
    expect(prisma.topic.delete).not.toHaveBeenCalled();
  });

  it('enforces the 3-step delete workflow: Supervisor requests -> Admin agrees -> Supervisor clicks Final Delete to remove from supervisor account', async () => {
    // Step 1: Supervisor requests deletion
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', name: 'Dr. S. Roy', email: 'sroy@hitk.edu' },
    });

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-conf-1',
      code: 'UGR-042',
      title: 'FPGA Neural Accelerator',
      status: 'CONFIRMED',
      proposerId: 'fac-1',
      groups: [],
    });

    (prisma.setting.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const reqRes = await requestTopicDeletionAction('topic-conf-1', 'Selected wrong topic');
    expect(reqRes.success).toBe(true);
    expect(reqRes.request?.status).toBe('PENDING');

    // Step 2: Admin agrees -> marks request as APPROVED (waiting for supervisor Final Delete)
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', name: 'Committee Admin' },
    });

    (prisma.setting.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      key: 'TOPIC_DELETE_REQUESTS',
      value: [reqRes.request],
    });

    const approveRes = await resolveTopicDeleteRequestAction('topic-conf-1', 'fac-1', 'APPROVE');
    expect(approveRes.success).toBe(true);
    // Topic is NOT removed yet until supervisor clicks Final Delete
    expect(prisma.topic.update).not.toHaveBeenCalled();

    // Step 3: Supervisor clicks "Final Delete" -> removed from supervisor's pool and hidden from supervisor's account
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY', name: 'Dr. S. Roy', email: 'sroy@hitk.edu' },
    });

    (prisma.setting.findUnique as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { key: string } }) => {
        if (where.key === 'TOPIC_DELETE_REQUESTS') {
          return {
            key: 'TOPIC_DELETE_REQUESTS',
            value: [{ ...reqRes.request, status: 'APPROVED' }],
          };
        }
        return null;
      }
    );

    (prisma.topic.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'topic-conf-1',
      code: 'UGR-042',
      title: 'FPGA Neural Accelerator',
      status: 'CONFIRMED',
      proposerId: 'fac-1',
      groups: [],
    });

    const finalRes = await finalDeleteApprovedTopicAction('topic-conf-1');
    expect(finalRes.success).toBe(true);
    expect(prisma.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic-conf-1' },
      data: {
        proposerId: null,
        status: 'DRAFT',
      },
    });
    expect(prisma.topic.delete).not.toHaveBeenCalled();
  });
});
