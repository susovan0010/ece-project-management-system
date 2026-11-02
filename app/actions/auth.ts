'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth, signIn, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  createInviteToken,
  validateInviteToken,
  createPasswordResetToken,
  validatePasswordResetToken,
} from '@/lib/tokens';
import { isPriorityAAdmin, PRIORITY_A_ADMIN_EMAIL } from '@/app/actions/admin-directory';

// ----------------------------------------------------
// 1. Credentials Sign-In Action
// ----------------------------------------------------

const SignInSchema = z.object({
  email: z.string().email('Please enter a valid institute or registered email.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  loginRole: z.enum(['FACULTY', 'ADMIN']).default('FACULTY'),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const rawRole = (formData.get('loginRole') as string) || 'FACULTY';
  const loginRole = rawRole === 'ADMIN' ? 'ADMIN' : 'FACULTY';

  const parsed = SignInSchema.safeParse({ email, password, loginRole });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    const cleanEmail = parsed.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, role: true, active: true },
    });

    if (user && parsed.data.loginRole === 'ADMIN' && user.role !== 'ADMIN') {
      return {
        error:
          'Access denied: Your account does not have Project Committee Admin privileges. Please select Supervisor to sign in.',
      };
    }

    // Authenticate through NextAuth with selected loginRole
    await signIn('credentials', {
      email: cleanEmail,
      password: parsed.data.password,
      loginRole: parsed.data.loginRole,
      redirect: false,
    });

    return {
      success: true,
      redirectTo: parsed.data.loginRole === 'ADMIN' ? '/admin/dashboard' : '/faculty/topics',
    };
  } catch (err) {
    return { error: 'Invalid email or password. Please verify credentials.' };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}

// ----------------------------------------------------
// 2. Admin Create Invite Action (Rule 1: Role check on server)
// ----------------------------------------------------

export async function createInviteAction(prevState: unknown, formData: FormData) {
  const session = await auth();

  // Strict Server-Side Role Enforcement
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can generate faculty invites.' };
  }

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const role = ((formData.get('role') as string) || 'FACULTY') as 'FACULTY' | 'ADMIN';

  if (role === 'ADMIN' && !isPriorityAAdmin(session.user.email)) {
    return {
      error: `Permission denied: Only Priority A Admin (${PRIORITY_A_ADMIN_EMAIL}) can generate invites for Project Committee Admins.`,
    };
  }

  if (!email || !z.string().email().safeParse(email).success) {
    return { error: 'Please provide a valid faculty email address.' };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { error: `An account already exists for ${email}.` };
  }

  const invite = await createInviteToken(email, role, 72);
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/accept-invite?token=${invite.token}`;

  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string,
      action: 'CREATE_FACULTY_INVITE',
      entity: 'InviteToken',
      entityId: invite.id,
      payload: { email, role },
    },
  });

  return {
    success: true,
    inviteUrl,
    email,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

// ----------------------------------------------------
// 3. Accept Invite Action
// ----------------------------------------------------

const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required.'),
  name: z.string().min(2, 'Full name is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export async function acceptInviteAction(prevState: unknown, formData: FormData) {
  const token = formData.get('token') as string;
  const name = formData.get('name') as string;
  const password = formData.get('password') as string;

  const parsed = AcceptInviteSchema.safeParse({ token, name, password });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const tokenValidation = await validateInviteToken(parsed.data.token);
  if (!tokenValidation.valid || !tokenValidation.invite) {
    return { error: tokenValidation.error || 'Invalid or expired invite token.' };
  }

  const invite = tokenValidation.invite;
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const newUser = await prisma.user.create({
    data: {
      email: invite.email,
      name: parsed.data.name.trim(),
      passwordHash,
      role: invite.role,
      active: true,
    },
  });

  // Consume token
  await prisma.inviteToken.delete({ where: { id: invite.id } });

  await prisma.auditLog.create({
    data: {
      userId: newUser.id,
      action: 'ACCEPT_INVITE_REGISTER',
      entity: 'User',
      entityId: newUser.id,
      payload: { email: invite.email, role: invite.role },
    },
  });

  return {
    success: true,
    message: 'Account created successfully! You may now sign in.',
  };
}

// ----------------------------------------------------
// 4. Password Reset Request & Reset Actions
// ----------------------------------------------------

export async function requestPasswordResetAction(prevState: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email || !z.string().email().safeParse(email).success) {
    return { error: 'Please enter a valid registered email address.' };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Return friendly generic message to prevent email enumeration
    return {
      success: true,
      message: 'If an account exists with this email, a reset link has been dispatched.',
    };
  }

  const resetToken = await createPasswordResetToken(email, 2);
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

  // Log in audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'REQUEST_PASSWORD_RESET',
      entity: 'PasswordResetToken',
      entityId: resetToken.id,
      payload: { email },
    },
  });

  return {
    success: true,
    message: 'If an account exists with this email, a reset link has been dispatched.',
    devResetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
  };
}

export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  const token = formData.get('token') as string;
  const newPassword = formData.get('newPassword') as string;

  if (!token || !newPassword || newPassword.length < 6) {
    return { error: 'Password must be at least 6 characters long.' };
  }

  const tokenValidation = await validatePasswordResetToken(token);
  if (!tokenValidation.valid || !tokenValidation.reset) {
    return { error: tokenValidation.error || 'Invalid or expired password reset token.' };
  }

  const reset = tokenValidation.reset;
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { email: reset.email },
    data: { passwordHash, mustChangePassword: false },
  });

  await prisma.passwordResetToken.delete({ where: { id: reset.id } });

  await prisma.auditLog.create({
    data: {
      userId: updatedUser.id,
      action: 'RESET_PASSWORD_COMPLETED',
      entity: 'User',
      entityId: updatedUser.id,
    },
  });

  return {
    success: true,
    message: 'Password reset successfully. You may now sign in with your new password.',
  };
}

// ----------------------------------------------------
// 5. First-Time Login & Credential Update Action
// Admin: Can change user name (display name & login email) + password
// Faculty: Cannot change user name; prompted to change password only
// ----------------------------------------------------

export async function completeFirstLoginAction(prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be signed in.' };
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.passwordHash) {
    return { error: 'User account not found.' };
  }

  const currentPassword = (formData.get('currentPassword') as string) || '';
  const newPassword = (formData.get('newPassword') as string) || '';
  const confirmPassword = (formData.get('confirmPassword') as string) || '';
  const requestedName = (formData.get('name') as string | null)?.trim();
  const requestedEmail = (formData.get('email') as string | null)?.trim().toLowerCase();

  if (!currentPassword) {
    return { error: 'Please enter your current password.' };
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return { error: 'Current password is incorrect.' };
  }

  if (newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters long.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'New password and confirmation do not match.' };
  }

  if (newPassword === currentPassword) {
    return { error: 'New password must be different from your initial/current password.' };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  if (user.role === 'FACULTY') {
    // Rule: Faculty cannot change their user name or login email
    if (
      (requestedName && requestedName !== user.name) ||
      (requestedEmail && requestedEmail !== user.email)
    ) {
      return { error: 'Forbidden: Faculty members cannot change their user name.' };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'FIRST_LOGIN_PASSWORD_CHANGED',
        entity: 'User',
        entityId: userId,
        payload: { role: 'FACULTY' },
      },
    });

    revalidatePath('/', 'layout');
    return {
      success: true,
      message: 'Your password has been updated successfully.',
    };
  }

  // ADMIN role: Can change user name (name and/or login email) + password
  const updatedName = requestedName ? requestedName : user.name;
  const updatedEmail = requestedEmail ? requestedEmail : user.email;

  if (updatedName.length < 2) {
    return { error: 'User name must be at least 2 characters long.' };
  }

  if (!z.string().email().safeParse(updatedEmail).success) {
    return { error: 'Please provide a valid login email address.' };
  }

  if (updatedEmail !== user.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: updatedEmail } });
    if (emailTaken && emailTaken.id !== userId) {
      return { error: `The login email ${updatedEmail} is already in use.` };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: updatedName,
      email: updatedEmail,
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'ADMIN_CREDENTIALS_UPDATED',
      entity: 'User',
      entityId: userId,
      payload: {
        previousName: user.name,
        updatedName,
        previousEmail: user.email,
        updatedEmail,
      },
    },
  });

  revalidatePath('/', 'layout');
  return {
    success: true,
    message: 'Admin user name and password updated successfully.',
  };
}

// ----------------------------------------------------
// 6. Admin Direct Faculty Account Provisioning
// Creates a faculty account with a fixed user name and temporary password
// that triggers the first-time password change prompt upon login.
// ----------------------------------------------------

export async function createFacultyAccountAction(prevState: unknown, formData: FormData) {
  const session = await auth();

  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can create faculty accounts.' };
  }

  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const tempPassword = (formData.get('tempPassword') as string) || '';
  const role = ((formData.get('role') as string) || 'FACULTY') as 'FACULTY' | 'ADMIN';

  if (role === 'ADMIN' && !isPriorityAAdmin(session.user.email)) {
    return {
      error: `Permission denied: Only Priority A Admin (${PRIORITY_A_ADMIN_EMAIL}) can create new Project Committee Admins.`,
    };
  }

  if (!name || name.length < 2) {
    return { error: 'Please provide the faculty member’s full user name.' };
  }

  if (!email || !z.string().email().safeParse(email).success) {
    return { error: 'Please provide a valid faculty email address.' };
  }

  if (tempPassword.length < 6) {
    return { error: 'Initial temporary password must be at least 6 characters.' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: `An account already exists for ${email}.` };
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      active: true,
      mustChangePassword: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string,
      action: 'CREATE_FACULTY_ACCOUNT',
      entity: 'User',
      entityId: createdUser.id,
      payload: { name, email, role },
    },
  });

  revalidatePath('/admin/faculty');
  return {
    success: true,
    message: `Account created for ${name} (${email}). They will be prompted to change their password on first login.`,
  };
}


