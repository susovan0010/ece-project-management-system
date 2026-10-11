// ========================================================
// ECE Capstone Project Management System - Audit Log Unit Tests
// Tests audit trail logging helper and role-isolated admin audit action.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { recordAuditLog } from '../lib/audit';
import { getAuditLogsAction } from '../app/actions/audit';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('System Audit: Helper & Event Logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('records audit events into database', async () => {
    const createSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({
      id: 'log-1',
      userId: 'usr-1',
      action: 'UPDATE_MARK',
      entity: 'Group',
      entityId: 'grp-1',
      payload: { marks: 25 },
      timestamp: new Date(),
    } as any);

    const log = await recordAuditLog({
      userId: 'usr-1',
      action: 'UPDATE_MARK',
      entity: 'Group',
      entityId: 'grp-1',
      payload: { marks: 25 },
    });

    expect(log).toBeDefined();
    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'usr-1',
        action: 'UPDATE_MARK',
        entity: 'Group',
        entityId: 'grp-1',
      }),
    });
  });
});

describe('System Audit: Role Isolation & Access Control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to view audit logs', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getAuditLogsAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY user from viewing system audit trail', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await getAuditLogsAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Only Project Committee Admins');
  });

  it('allows ADMIN to query audit trail with action filtering', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.auditLog, 'findMany')
      .mockResolvedValueOnce([
        {
          id: 'log-1',
          action: 'LOCK_WINDOW',
          entity: 'MarkWindow',
          entityId: 'win-1',
          user: { name: 'Admin User', email: 'admin@hitk.edu', role: 'ADMIN' },
          timestamp: new Date(),
        },
      ] as any)
      .mockResolvedValueOnce([{ action: 'LOCK_WINDOW' }, { action: 'CONFIRM_CAPSTONE' }] as any);

    const res = await getAuditLogsAction('LOCK_WINDOW');
    expect(res.error).toBeUndefined();
    expect(res.logs).toHaveLength(1);
    expect(res.actions).toContain('LOCK_WINDOW');
  });
});
