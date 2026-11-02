// ========================================================
// ECE Capstone Project Management System - Attainment Engine Unit Tests
// Tests pure engine attainment() calculation, 65% target threshold benchmark,
// role isolation for faculty, and admin department-wide aggregation.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  attainment,
  isMetricAttained,
  getAttainmentLevel,
  getAttainmentLevelDescription,
  calculateStudentAttainment,
  DEFAULT_ATTAINMENT_TARGET,
  MarkEntryInput,
  StudentMarkEntryInput,
} from '../lib/engine';
import {
  calculateAndSnapshotGroupAttainmentAction,
  getFacultyAttainmentAnalyticsAction,
  getAdminAttainmentAnalyticsAction,
} from '../app/actions/attainment';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Attainment Pure Engine: 65% Benchmark & Ratio Calculation', () => {
  it('returns null if no mark entries map to the target metric', () => {
    const inputs: MarkEntryInput[] = [
      { marks: 25, max: 30, maps: ['PO1', 'WK1'] },
      { marks: 15, max: 20, maps: ['PO2'] },
    ];

    expect(attainment(inputs, 'PO9')).toBeNull();
  });

  it('correctly calculates attainment ratio across single or multiple mapped criteria', () => {
    const inputs: MarkEntryInput[] = [
      { marks: 20, max: 30, maps: ['PO1', 'WP1'] }, // 20/30
      { marks: 16, max: 20, maps: ['PO1', 'WK2'] }, // 16/20
    ];

    // Total marks for PO1 = 20 + 16 = 36. Total max = 30 + 20 = 50.
    // Ratio = 36 / 50 = 0.72 (72%)
    const ratio = attainment(inputs, 'PO1');
    expect(ratio).toBeCloseTo(0.72, 4);
  });

  it('verifies 65% attainment threshold logic', () => {
    expect(DEFAULT_ATTAINMENT_TARGET).toBe(0.65);

    // Exactly 65%
    expect(isMetricAttained(0.65, DEFAULT_ATTAINMENT_TARGET)).toBe(true);
    // Above 65%
    expect(isMetricAttained(0.85, DEFAULT_ATTAINMENT_TARGET)).toBe(true);
    // Marginally below 65%
    expect(isMetricAttained(0.649, DEFAULT_ATTAINMENT_TARGET)).toBe(false);
    // Far below 65%
    expect(isMetricAttained(0.40, DEFAULT_ATTAINMENT_TARGET)).toBe(false);
  });

  it('correctly maps ratios and percentages to NBA 3-tier attainment levels (0, 1, 2, 3)', () => {
    // Level 0: < 65%
    expect(getAttainmentLevel(0.40)).toBe(0);
    expect(getAttainmentLevel(0.649)).toBe(0);
    expect(getAttainmentLevel(64)).toBe(0);

    // Level 1: 65% to 75%
    expect(getAttainmentLevel(0.65)).toBe(1);
    expect(getAttainmentLevel(0.70)).toBe(1);
    expect(getAttainmentLevel(0.749)).toBe(1);
    expect(getAttainmentLevel(74)).toBe(1);

    // Level 2: 75% to 85%
    expect(getAttainmentLevel(0.75)).toBe(2);
    expect(getAttainmentLevel(0.80)).toBe(2);
    expect(getAttainmentLevel(0.849)).toBe(2);
    expect(getAttainmentLevel(84)).toBe(2);

    // Level 3: >= 85%
    expect(getAttainmentLevel(0.85)).toBe(3);
    expect(getAttainmentLevel(0.92)).toBe(3);
    expect(getAttainmentLevel(1.0)).toBe(3);
    expect(getAttainmentLevel(95)).toBe(3);

    // Edge cases
    expect(getAttainmentLevel(null)).toBe(0);
    expect(getAttainmentLevel(NaN)).toBe(0);

    // Descriptions
    expect(getAttainmentLevelDescription(3)).toContain('Level 3');
    expect(getAttainmentLevelDescription(2)).toContain('Level 2');
    expect(getAttainmentLevelDescription(1)).toContain('Level 1');
    expect(getAttainmentLevelDescription(0)).toContain('Level 0');
  });

  it('calculates individual student attainment combining group-scope and individual-scope marks', () => {
    const entries: StudentMarkEntryInput[] = [
      // Group-scope criterion (studentId is null): e.g. Novelty out of 10 marks
      { marks: 8, max: 10, maps: ['PO3', 'WP3'], studentId: null },
      // Individual-scope criterion: e.g. Viva voce out of 10 marks for Student 1
      { marks: 9, max: 10, maps: ['PO1', 'PO9', 'WP1'], studentId: 'student-1' },
      // Individual-scope criterion for Student 2
      { marks: 6, max: 10, maps: ['PO1', 'PO9', 'WP1'], studentId: 'student-2' },
    ];

    // Student 1 PO1: 9 / 10 = 90% (Level 3)
    const st1Attainments = calculateStudentAttainment(entries, 'student-1', ['PO1', 'PO3', 'PO9']);
    expect(st1Attainments.PO1).toBeDefined();
    expect(st1Attainments.PO1.percentage).toBe(90);
    expect(st1Attainments.PO1.level).toBe(3);
    expect(st1Attainments.PO1.isAttained).toBe(true);

    // Student 1 PO3: 8 / 10 = 80% (Level 2)
    expect(st1Attainments.PO3.percentage).toBe(80);
    expect(st1Attainments.PO3.level).toBe(2);

    // Student 2 PO1: 6 / 10 = 60% (Level 0)
    const st2Attainments = calculateStudentAttainment(entries, 'student-2', ['PO1', 'PO3', 'PO9']);
    expect(st2Attainments.PO1.percentage).toBe(60);
    expect(st2Attainments.PO1.level).toBe(0);
    expect(st2Attainments.PO1.isAttained).toBe(false);

    // Student 2 PO3 inherits group mark: 8 / 10 = 80% (Level 2)
    expect(st2Attainments.PO3.percentage).toBe(80);
    expect(st2Attainments.PO3.level).toBe(2);
  });
});

describe('Attainment Server Actions: Group Snapshot Calculation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to calculate attainment', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await calculateAndSnapshotGroupAttainmentAction('grp-1');
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects snapshot calculation if group has no mark entries', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.group, 'findUnique').mockResolvedValue({
      id: 'grp-1',
      topicId: 'topic-1',
      markEntries: [],
    } as any);

    const res = await calculateAndSnapshotGroupAttainmentAction('grp-1');
    expect(res.error).toBeDefined();
    expect(res.error).toContain('No marks entered for this group yet');
  });

  it('calculates and snapshots attainment for mapped metrics', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.group, 'findUnique').mockResolvedValue({
      id: 'grp-1',
      topicId: 'topic-1',
      markEntries: [
        {
          marks: 25,
          criterion: {
            id: 1,
            maxMarks: 30,
            maps: [{ code: 'PO1' }, { code: 'WP1' }],
          },
        },
      ],
    } as any);

    const mockDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const mockCreate = vi.fn().mockResolvedValue({});

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        attainmentSnapshot: {
          deleteMany: mockDeleteMany,
          create: mockCreate,
        },
      });
    });

    const res = await calculateAndSnapshotGroupAttainmentAction('grp-1');
    expect(res.success).toBe(true);
    expect(res.count).toBe(2); // PO1 and WP1
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { groupId: 'grp-1' } });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe('Attainment Server Actions: Role Isolation & Analytics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces supervisor isolation when querying faculty attainment', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'supervisor-42', role: 'FACULTY' },
    } as any);

    const findManySpy = vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        topic: { code: 'UGR-001', title: 'Radar System' },
        snapshots: [
          { metric: 'PO1', attainment: 0.8, isAttained: true },
          { metric: 'PO2', attainment: 0.6, isAttained: false },
        ],
      },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);

    const res = await getFacultyAttainmentAnalyticsAction('2023-2027');
    expect(res.error).toBeUndefined();
    expect(res.groups).toHaveLength(1);
    expect(res.targetThreshold).toBe(65);

    // Verify query was strictly filtered by supervisor-42
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supervisorId: 'supervisor-42',
          batchId: '2023-2027',
        }),
      })
    );
  });

  it('rejects FACULTY user from accessing department-wide admin attainment audit', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await getAdminAttainmentAnalyticsAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized: Only Project Committee Admins');
  });

  it('allows ADMIN user to access department-wide attainment audit', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        topic: { code: 'UGR-001', title: 'Radar System' },
        supervisor: { name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        snapshots: [
          { metric: 'PO1', attainment: 0.75, isAttained: true },
        ],
      },
    ] as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([{ id: '2023-2027', active: true }] as any);

    const res = await getAdminAttainmentAnalyticsAction('2023-2027');
    expect(res.error).toBeUndefined();
    expect(res.totalGroups).toBe(1);
    expect(res.groupsWithSnapshots).toBe(1);
    expect(res.poSummary).toBeDefined();
    expect(res.targetThreshold).toBe(65);
  });
});
