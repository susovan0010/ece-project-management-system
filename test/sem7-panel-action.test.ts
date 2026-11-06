// ========================================================
// ECE Capstone Project Management System - 7th Sem Panel Server Action Unit Tests
// Tests role protection, data loading, M.Tech reservation, and panel generation.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  getSem7PanelOverviewAction,
  saveSem7ReservedMTechFacultyAction,
  generateAndSaveSem7PanelsAction,
  clearSem7PanelsAction,
} from '../app/actions/sem7-panel';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('7th Sem Panel Server Actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to view panel overview', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getSem7PanelOverviewAction();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('Unauthorized');
    }
  });

  it('rejects non-admin (FACULTY) from panel actions', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    const res = await getSem7PanelOverviewAction();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('Unauthorized');
    }
  });

  it('loads overview data for ADMIN with batches, groups, and faculty', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.batch, 'findMany').mockResolvedValue([
      { id: '2023-2027', active: true } as any,
    ]);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 't-1',
        supervisorId: 'fac-1',
        topic: { id: 't-1', code: 'ECE-01', title: 'Smart Antenna', category: 'VLSI' },
        supervisor: { id: 'fac-1', name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        members: [{ student: { name: 'Student A', roll: '12623001001' } }],
      } as any,
    ]);

    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      {
        id: 'fac-1',
        name: 'Dr. Debasish Saha',
        email: 'debasish@hitk.edu',
        role: 'FACULTY',
        domainExpertise: ['Antenna', '5G Communication'],
      } as any,
      {
        id: 'admin-1',
        name: 'Dr. Susovan Mandal',
        email: 'ece.project.committee@heritageit.edu',
        role: 'ADMIN',
        domainExpertise: ['AI and ML'],
      } as any,
    ]);

    vi.spyOn(prisma.setting, 'findUnique')
      .mockResolvedValueOnce({ key: 'sem7_reserved_mtech_faculty', value: [] } as any)
      .mockResolvedValueOnce(null); // savedPanels

    const res = await getSem7PanelOverviewAction('2023-2027');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.totalGroupsCount).toBe(1);
      expect(res.data.totalFacultyCount).toBe(2);
      expect(res.data.recommendedPanelCount).toBe(1);
    }
  });

  it('saves M.Tech reserved faculty and creates audit log', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const res = await saveSem7ReservedMTechFacultyAction(['fac-1', 'fac-2']);
    expect(res.success).toBe(true);
    expect(res.message).toContain('2 faculty reserved');
    expect(upsertSpy).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'MTECH_FACULTY_RESERVATION_UPDATED',
        }),
      })
    );
  });

  it('generates panels and persists them in settings', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.group, 'findMany').mockResolvedValue([
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 't-1',
        supervisorId: 'fac-1',
        topic: { id: 't-1', code: 'ECE-01', title: '5G Project' },
        supervisor: { id: 'fac-1', name: 'Dr. Debasish Saha', email: 'debasish@hitk.edu' },
        members: [{ student: { name: 'Student A', roll: '12623001001' } }],
      } as any,
      {
        id: 'grp-2',
        number: 2,
        batchId: '2023-2027',
        topicId: 't-2',
        supervisorId: 'fac-2',
        topic: { id: 't-2', code: 'ECE-02', title: 'VLSI Project' },
        supervisor: { id: 'fac-2', name: 'Prof. Ananya', email: 'ananya@heritageit.edu' },
        members: [{ student: { name: 'Student B', roll: '12623001002' } }],
      } as any,
    ]);

    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      {
        id: 'fac-1',
        name: 'Dr. Debasish Saha',
        email: 'debasish@hitk.edu',
        role: 'FACULTY',
        domainExpertise: ['Antenna', '5G Communication'],
      } as any,
      {
        id: 'fac-2',
        name: 'Prof. Ananya',
        email: 'ananya@heritageit.edu',
        role: 'FACULTY',
        domainExpertise: ['Analog VLSI', 'Digital VLSI'],
      } as any,
    ]);

    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const res = await generateAndSaveSem7PanelsAction({
      batchId: '2023-2027',
      reservedMTechIds: [],
      maxGroupsPerPanel: 1, // 2 groups -> 2 panels
    });

    expect(res.success).toBe(true);
    expect(res.panelCount).toBe(2);
    expect(res.conflictsDetected).toBe(0);
    expect(upsertSpy).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalled();
  });

  it('clears saved panels for a batch', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const deleteSpy = vi.spyOn(prisma.setting, 'deleteMany').mockResolvedValue({ count: 1 } as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const res = await clearSem7PanelsAction('2023-2027');
    expect(res.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalled();
  });
});
