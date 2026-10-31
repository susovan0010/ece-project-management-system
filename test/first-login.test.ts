// ========================================================
// ECE Capstone Project Management System - First-Time Login & Credentials Tests
// Verifies Admin user name + password update on first login, and
// Faculty locked user name + mandatory password change prompt.
// ========================================================

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

import { completeFirstLoginAction, createFacultyAccountAction } from '../app/actions/auth';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('First-Time Login Credential Update (Admin vs Faculty)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows ADMIN to change user name, login email, and password on first login', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    const initialHash = await bcrypt.hash('AdminPass@2026', 10);

    vi.spyOn(prisma.user, 'findUnique')
      .mockResolvedValueOnce({
        id: 'admin-1',
        name: 'Project Committee Admin',
        email: 'admin.project@heritageit.edu',
        passwordHash: initialHash,
        role: 'ADMIN',
        mustChangePassword: true,
      } as any)
      .mockResolvedValueOnce(null); // emailTaken check

    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const formData = new FormData();
    formData.append('name', 'Dr. Susovan Mondal (Admin)');
    formData.append('email', 'hod.ece@heritageit.edu');
    formData.append('currentPassword', 'AdminPass@2026');
    formData.append('newPassword', 'NewAdminPass@2027');
    formData.append('confirmPassword', 'NewAdminPass@2027');

    const res = await completeFirstLoginAction(null, formData);
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-1' },
        data: expect.objectContaining({
          name: 'Dr. Susovan Mondal (Admin)',
          email: 'hod.ece@heritageit.edu',
          mustChangePassword: false,
        }),
      })
    );
  });

  it('allows FACULTY to change password on first login when user name is not changed', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const initialHash = await bcrypt.hash('FacultyPass@2026', 10);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'faculty-1',
      name: 'Dr. Subhashish Roy',
      email: 'faculty.test@heritageit.edu',
      passwordHash: initialHash,
      role: 'FACULTY',
      mustChangePassword: true,
    } as any);

    const updateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const formData = new FormData();
    formData.append('currentPassword', 'FacultyPass@2026');
    formData.append('newPassword', 'MySecurePass@99');
    formData.append('confirmPassword', 'MySecurePass@99');

    const res = await completeFirstLoginAction(null, formData);
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'faculty-1' },
        data: expect.objectContaining({
          mustChangePassword: false,
        }),
      })
    );
  });

  it('blocks FACULTY from changing their user name or login email', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const initialHash = await bcrypt.hash('FacultyPass@2026', 10);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'faculty-1',
      name: 'Dr. Subhashish Roy',
      email: 'faculty.test@heritageit.edu',
      passwordHash: initialHash,
      role: 'FACULTY',
      mustChangePassword: true,
    } as any);

    const formData = new FormData();
    formData.append('name', 'Attempted New Name');
    formData.append('currentPassword', 'FacultyPass@2026');
    formData.append('newPassword', 'MySecurePass@99');
    formData.append('confirmPassword', 'MySecurePass@99');

    const res = await completeFirstLoginAction(null, formData);
    expect(res.error).toBe('Forbidden: Faculty members cannot change their user name.');
  });

  it('rejects password update when current password is wrong or new password is unchanged', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const initialHash = await bcrypt.hash('FacultyPass@2026', 10);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'faculty-1',
      name: 'Dr. Subhashish Roy',
      email: 'faculty.test@heritageit.edu',
      passwordHash: initialHash,
      role: 'FACULTY',
      mustChangePassword: true,
    } as any);

    const formData = new FormData();
    formData.append('currentPassword', 'FacultyPass@2026');
    formData.append('newPassword', 'FacultyPass@2026');
    formData.append('confirmPassword', 'FacultyPass@2026');

    const res = await completeFirstLoginAction(null, formData);
    expect(res.error).toContain('New password must be different');
  });

  it('allows ADMIN to directly create a faculty account with fixed user name and mustChangePassword=true', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.user, 'create').mockResolvedValue({
      id: 'new-fac-1',
      name: 'Dr. Anindya Sen',
      email: 'anindya.sen@heritageit.edu',
    } as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const formData = new FormData();
    formData.append('name', 'Dr. Anindya Sen');
    formData.append('email', 'anindya.sen@heritageit.edu');
    formData.append('tempPassword', 'Welcome@2026');
    formData.append('role', 'FACULTY');

    const res = await createFacultyAccountAction(null, formData);
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Dr. Anindya Sen',
          email: 'anindya.sen@heritageit.edu',
          role: 'FACULTY',
          mustChangePassword: true,
        }),
      })
    );
  });
});
