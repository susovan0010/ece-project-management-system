// ========================================================
// ECE Capstone Project Management System - Capstone Engine Unit Tests
// Tests 4-step capstone pipeline, admin decision endorsement,
// role isolation, panel slot averaging, and complexity declarations.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  getAdminCapstoneEvaluationAction,
  confirmCapstoneDecisionAction,
  saveComplexityDeclarationAction,
} from '../app/actions/capstone';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Capstone Decision: Role Security & Access Control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to get capstone evaluations', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getAdminCapstoneEvaluationAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY user from viewing admin capstone evaluations (Admin only)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await getAdminCapstoneEvaluationAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });

  it('rejects FACULTY user from confirming capstone decisions', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await confirmCapstoneDecisionAction({
      topicId: 'topic-1',
      status: 'CONFIRMED',
      step1Qualify: true,
      step2Panel: true,
      step3External: true,
      step4Declared: true,
      isCapstone: true,
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });
});

describe('Capstone 4-Step Pipeline: Evaluation Logic & Missing Marks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly marks incomplete semester evaluations as PENDING status', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    // Group with qualifying topic, but NO Rubric D or F marks yet
    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        supervisor: { name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        topic: {
          id: 'topic-1',
          code: 'UGR-001',
          title: 'Quantum Radar',
          attributes: [
            { level: 2, attribute: { code: 'WP1' } },
            { level: 2, attribute: { code: 'WP2' } },
            { level: 2, attribute: { code: 'WP3' } },
            { level: 2, attribute: { code: 'WP4' } },
            { level: 2, attribute: { code: 'EA1' } },
            { level: 2, attribute: { code: 'EA2' } },
          ],
          sdgs: [{ target: 'Target 9.5', sdg: { code: 'SDG9' } }],
          declarations: [{ id: 'dec-1', attributeCode: 'WP5', confirmed: true }],
          decisions: [],
        },
        markEntries: [],
      },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);

    const res = await getAdminCapstoneEvaluationAction('2023-2027');
    expect(res.error).toBeUndefined();
    expect(res.groups).toHaveLength(1);

    const grpEval = res.groups![0];
    expect(grpEval.evaluation.step1.passed).toBe(true);
    expect(grpEval.evaluation.step2.pending).toBe(true);
    expect(grpEval.evaluation.step3.pending).toBe(true);
    expect(grpEval.evaluation.status).toBe('PENDING');
    expect(grpEval.evaluation.isCapstone).toBe(false);
  });

  it('qualifies project when all 4 steps satisfy departmental cut-offs', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    // Group with complete marks meeting cut-offs
    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        supervisor: { name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        topic: {
          id: 'topic-1',
          code: 'UGR-001',
          title: 'Smart Grid Sensor Array',
          attributes: [
            { level: 2, attribute: { code: 'WP1' } },
            { level: 2, attribute: { code: 'WP2' } },
            { level: 2, attribute: { code: 'WP3' } },
            { level: 2, attribute: { code: 'WP4' } },
            { level: 2, attribute: { code: 'EA1' } },
            { level: 2, attribute: { code: 'EA2' } },
          ],
          sdgs: [{ target: 'Target 7.1', sdg: { code: 'SDG7' } }],
          declarations: [{ id: 'dec-1', attributeCode: 'WP5', confirmed: true }],
          decisions: [],
        },
        markEntries: [
          // Rubric D panel slot 1: 12/15 (5.6/7), 12/15 (5.6/7), 4/5 (2.4/3)
          {
            examinerSlot: 1,
            marks: 12,
            criterion: { key: 'novelty', maxMarks: 15, rubric: { code: 'D', semester: 7 } },
          },
          {
            examinerSlot: 1,
            marks: 12,
            criterion: { key: 'realistic_problem', maxMarks: 15, rubric: { code: 'D', semester: 7 } },
          },
          {
            examinerSlot: 1,
            marks: 4,
            criterion: { key: 'impact_society', maxMarks: 5, rubric: { code: 'D', semester: 7 } },
          },
          // Rubric F external: 13/15 (6.9/8), 13/15 (6.9/8), 4/5 (2.4/3)
          {
            marks: 13,
            criterion: { key: 'novelty', maxMarks: 15, rubric: { code: 'F', semester: 8 } },
          },
          {
            marks: 13,
            criterion: { key: 'realistic_problem', maxMarks: 15, rubric: { code: 'F', semester: 8 } },
          },
          {
            marks: 4,
            criterion: { key: 'impact_society', maxMarks: 5, rubric: { code: 'F', semester: 8 } },
          },
        ],
      },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);

    const res = await getAdminCapstoneEvaluationAction('2023-2027');
    expect(res.error).toBeUndefined();

    const grpEval = res.groups![0];
    expect(grpEval.evaluation.step1.passed).toBe(true);
    expect(grpEval.evaluation.step2.passed).toBe(true);
    expect(grpEval.evaluation.step3.passed).toBe(true);
    expect(grpEval.evaluation.step4.passed).toBe(true);
    expect(grpEval.evaluation.isCapstone).toBe(true);
    expect(grpEval.evaluation.status).toBe('QUALIFIED');
  });
});

describe('Capstone Decision Endorsement & Complexity Declarations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('records admin capstone endorsement in database', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.capstoneDecision, 'findFirst').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.capstoneDecision, 'create').mockResolvedValue({} as any);

    const res = await confirmCapstoneDecisionAction({
      topicId: 'topic-1',
      status: 'CONFIRMED',
      step1Qualify: true,
      step2Panel: true,
      step3External: true,
      step4Declared: true,
      isCapstone: true,
      notes: 'Endorsed by project committee meeting on 12-May.',
    });

    expect(res.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId: 'topic-1',
          status: 'CONFIRMED',
          isCapstone: true,
          notes: 'Endorsed by project committee meeting on 12-May.',
        }),
      })
    );
  });

  it('upserts complexity declarations for unassessed attributes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    const upsertSpy = vi.spyOn(prisma.complexityDeclaration, 'upsert').mockResolvedValue({} as any);

    const res = await saveComplexityDeclarationAction({
      topicId: 'topic-1',
      attributeCode: 'WP5',
      justification: 'Simulated high-frequency parasitic effects using ANSYS HFSS.',
      confirmed: true,
    });

    expect(res.success).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          topicId_attributeCode: {
            topicId: 'topic-1',
            attributeCode: 'WP5',
          },
        },
        update: expect.objectContaining({
          justification: 'Simulated high-frequency parasitic effects using ANSYS HFSS.',
          confirmed: true,
        }),
      })
    );
  });
});
