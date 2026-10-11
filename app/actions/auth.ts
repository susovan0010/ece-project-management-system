'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auth, signIn, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  createInviteToken,
  validateInviteToken,
  createPasswordResetToken,
  validatePasswordResetToken,
} from '@/lib/tokens';

// ----------------------------------------------------
// 1. Credentials Sign-In Action
// ----------------------------------------------------

const SignInSchema = z.object({
  email: z.string().email('Please enter a valid institute or registered email.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const parsed = SignInSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    // Authenticate through NextAuth
    await signIn('credentials', {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      redirect: false,
    });

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
      select: { role: true },
    });

    return {
      success: true,
      redirectTo: user?.role === 'ADMIN' ? '/admin/dashboard' : '/faculty/topics',
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
    data: { passwordHash },
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
