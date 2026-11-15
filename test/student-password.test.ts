import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { changeStudentPasswordAction, completeFirstLoginAction } from '@/app/actions/auth';

function buildFormData(currentPassword: string, newPassword: string, confirmPassword: string) {
  const fd = new FormData();
  fd.append('currentPassword', currentPassword);
  fd.append('newPassword', newPassword);
  fd.append('confirmPassword', confirmPassword);
  return fd;
}

describe('Student Self-Service Password Change', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await changeStudentPasswordAction(null, buildFormData('old123', 'new1234', 'new1234'));
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects non-STUDENT roles (e.g. FACULTY or ADMIN)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'fac-1', role: 'FACULTY' },
    } as any);

    const res = await changeStudentPasswordAction(null, buildFormData('old123', 'new1234', 'new1234'));
    expect(res.error).toContain('Forbidden');
  });

  it('rejects incorrect current password', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'stu-user-1', role: 'STUDENT' },
    } as any);

    const currentHash = await bcrypt.hash('correctPass1', 4);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'stu-user-1',
      role: 'STUDENT',
      passwordHash: currentHash,
    } as any);

    const res = await changeStudentPasswordAction(null, buildFormData('wrongPass', 'newPass1', 'newPass1'));
    expect(res.error).toContain('Current password is incorrect');
  });

  it('rejects short, mismatched, or identical new passwords', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'stu-user-1', role: 'STUDENT' },
    } as any);

    const currentHash = await bcrypt.hash('oldPass1', 4);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'stu-user-1',
      role: 'STUDENT',
      passwordHash: currentHash,
    } as any);

    const shortRes = await changeStudentPasswordAction(null, buildFormData('oldPass1', '123', '123'));
    expect(shortRes.error).toContain('at least 6 characters');

    const mismatchRes = await changeStudentPasswordAction(null, buildFormData('oldPass1', 'newPass1', 'newPass2'));
    expect(mismatchRes.error).toContain('do not match');

    const sameRes = await changeStudentPasswordAction(null, buildFormData('oldPass1', 'oldPass1', 'oldPass1'));
    expect(sameRes.error).toContain('must be different');
  });

  it('hashes and updates passwordHash, clears mustChangePassword, and records AuditLog on valid submission', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'stu-user-1', role: 'STUDENT' },
    } as any);

    const currentHash = await bcrypt.hash('oldPass1', 4);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'stu-user-1',
      role: 'STUDENT',
      passwordHash: currentHash,
    } as any);

    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({ id: 'stu-user-1' } as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const res = await changeStudentPasswordAction(null, buildFormData('oldPass1', 'newSecure99', 'newSecure99'));
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const updateCall = updateSpy.mock.calls[0][0] as any;
    expect(updateCall.where).toEqual({ id: 'stu-user-1' });
    expect(updateCall.data.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('newSecure99', updateCall.data.passwordHash)).toBe(true);

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'stu-user-1',
          action: 'STUDENT_PASSWORD_CHANGED',
        }),
      })
    );
  });

  it('blocks STUDENT from falling through to the ADMIN branch in completeFirstLoginAction', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'stu-user-1', role: 'STUDENT' },
    } as any);

    const currentHash = await bcrypt.hash('oldPass1', 4);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'stu-user-1',
      role: 'STUDENT',
      passwordHash: currentHash,
    } as any);

    const updateSpy = vi.spyOn(prisma.user, 'update');
    const res = await completeFirstLoginAction(null, buildFormData('oldPass1', 'newSecure99', 'newSecure99'));
    expect(res.error).toContain('Forbidden');
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
