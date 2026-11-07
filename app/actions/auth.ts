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
import { isPriorityAAdmin, PRIORITY_A_ADMIN_EMAIL } from '@/lib/admin-priority';
import { getBaseUrl } from '@/lib/url';
import { sendEmail } from '@/lib/email';
import { isValidDomain } from '@/lib/constants/domains';

// ----------------------------------------------------
// 1. Credentials Sign-In Action
// ----------------------------------------------------

const SignInSchema = z.object({
  email: z.string().email('Please enter a valid institute or registered email.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  loginRole: z.enum(['FACULTY', 'ADMIN', 'STUDENT']).default('FACULTY'),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const rawRole = (formData.get('loginRole') as string) || 'FACULTY';
  const loginRole =
    rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'STUDENT' ? 'STUDENT' : 'FACULTY';

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

    if (user && parsed.data.loginRole === 'STUDENT' && user.role !== 'STUDENT') {
      return {
        error:
          'Access denied: This account is not registered as a Student. Please select Supervisor or Admin to sign in.',
      };
    }

    if (user && user.role === 'STUDENT' && parsed.data.loginRole !== 'STUDENT') {
      return {
        error:
          'Access denied: Student accounts must sign in using the Student portal role.',
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
      redirectTo:
        parsed.data.loginRole === 'ADMIN'
          ? '/admin/dashboard'
          : parsed.data.loginRole === 'STUDENT'
          ? '/student/project-details'
          : '/faculty/topics',
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
  const explicitOrigin = formData.get('origin') as string | null;
  const baseUrl = getBaseUrl(explicitOrigin);
  const inviteUrl = `${baseUrl}/accept-invite?token=${invite.token}`;

  // Automatically dispatch invitation email to recipient
  const inviteEmailHtml = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C5C3C6; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #4C5C68 0%, #1985A1 100%); padding: 24px; text-align: center; color: #ffffff; border-bottom: 3px solid #146E85;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Department of Electronics and Communication Engineering</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #DCDCDD;">Heritage Institute of Technology, Kolkata • Project Committee</p>
    </div>
    
    <div style="padding: 32px 28px; color: #46494C; line-height: 1.6;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #46494C;">Portal Invitation</h3>
      
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #46494C;">
        You have been invited to join the <strong>HITK ECE Project Management System</strong> portal as a <strong>${role === 'ADMIN' ? 'Project Committee Administrator' : 'Faculty Supervisor'}</strong>.
      </p>

      <p style="margin: 0 0 20px 0; font-size: 14px; color: #46494C;">
        Please click the button below to accept your invitation and activate your account:
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background-color: #1985A1; color: #ffffff; padding: 12px 28px; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(25, 133, 161, 0.25);">
          Accept Invitation & Set Password
        </a>
      </div>

      <div style="background-color: #f4f7f9; border-left: 4px solid #1985A1; padding: 12px 16px; margin: 24px 0; font-size: 12px; color: #4C5C68;">
        <strong>Notice:</strong> This invitation link is valid for <strong>72 hours</strong>.
      </div>

      <p style="margin: 20px 0 6px 0; font-size: 12px; color: #4C5C68;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin: 0; font-size: 12px; word-break: break-all; color: #1985A1;">
        <a href="${inviteUrl}" style="color: #1985A1; text-decoration: underline;">${inviteUrl}</a>
      </p>
    </div>

    <div style="background-color: #f4f7f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #4C5C68; border-top: 1px solid #C5C3C6;">
      <p style="margin: 0;">Sent by Project Committee Administration, Department of Electronics and Communication Engineering</p>
      <p style="margin: 4px 0 0 0;">Heritage Institute of Technology, Kolkata</p>
    </div>
  </div>
  `;

  await sendEmail({
    to: email,
    subject: `Portal Invitation - HITK ECE Project Management System (${role === 'ADMIN' ? 'Committee Admin' : 'Faculty'})`,
    html: inviteEmailHtml,
    text: `Portal Invitation\n\nYou have been invited to join the HITK ECE Project Management System portal as ${role}.\n\nPlease accept your invitation at:\n${inviteUrl}\n\nThis link is valid for 72 hours.`,
  }).catch((err) => console.error('Failed to send invite email:', err));

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

  // If Student, link to Student model
  if (invite.role === 'STUDENT') {
    await prisma.student.updateMany({
      where: { email: invite.email.toLowerCase() },
      data: { userId: newUser.id },
    });
  }

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
  const explicitOrigin = formData.get('origin') as string | null;
  const baseUrl = getBaseUrl(explicitOrigin);
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

  // Build branded HTML template for password reset email
  const resetEmailHtml = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C5C3C6; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #4C5C68 0%, #1985A1 100%); padding: 24px; text-align: center; color: #ffffff; border-bottom: 3px solid #146E85;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Department of Electronics and Communication Engineering</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #DCDCDD;">Heritage Institute of Technology, Kolkata • Project Committee</p>
    </div>
    
    <div style="padding: 32px 28px; color: #46494C; line-height: 1.6;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #46494C;">Password Reset Request</h3>
      
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #46494C;">
        Dear <strong>${user.name || 'Faculty Member'}</strong>,
      </p>

      <p style="margin: 0 0 20px 0; font-size: 14px; color: #46494C;">
        We received a request to reset the password for your account (<strong>${user.email}</strong>) on the <strong>ECE Project Management System</strong> portal. Click the button below to set a new password:
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #1985A1; color: #ffffff; padding: 12px 28px; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(25, 133, 161, 0.25);">
          Reset My Password
        </a>
      </div>

      <div style="background-color: #f4f7f9; border-left: 4px solid #1985A1; padding: 12px 16px; margin: 24px 0; font-size: 12px; color: #4C5C68;">
        <strong>Security Notice:</strong> This link is single-use and will automatically expire in <strong>2 hours</strong>. If you did not make this request, you can safely ignore this email — your account remains completely secure.
      </div>

      <p style="margin: 20px 0 6px 0; font-size: 12px; color: #4C5C68;">
        If the button above does not work, copy and paste the following URL into your browser:
      </p>
      <p style="margin: 0; font-size: 12px; word-break: break-all; color: #1985A1;">
        <a href="${resetUrl}" style="color: #1985A1; text-decoration: underline;">${resetUrl}</a>
      </p>
    </div>

    <div style="background-color: #f4f7f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #4C5C68; border-top: 1px solid #C5C3C6;">
      <p style="margin: 0;">Sent by Project Committee Administration, Department of Electronics and Communication Engineering</p>
      <p style="margin: 4px 0 0 0;">Heritage Institute of Technology, Kolkata</p>
      <p style="margin: 4px 0 0 0; color: #8c9398;">This is an automated security dispatch from the HITK ECE Project Management System.</p>
    </div>
  </div>
  `;

  const emailResult = await sendEmail({
    to: user.email,
    subject: 'Password Reset Request - HITK ECE Project Management System',
    html: resetEmailHtml,
    text: `Password Reset Request\n\nDear ${user.name || 'Faculty Member'},\n\nWe received a request to reset your password. Please visit the following link to set a new password:\n\n${resetUrl}\n\nThis link is valid for 2 hours. If you did not request this, please ignore this email.\n\nProject Committee Administration\nDepartment of Electronics and Communication Engineering\nHeritage Institute of Technology, Kolkata`,
  });

  // Log in audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'REQUEST_PASSWORD_RESET',
      entity: 'PasswordResetToken',
      entityId: resetToken.id,
      payload: {
        email,
        emailDispatched: emailResult.success,
        provider: emailResult.provider,
      },
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

  // Parse domain expertise (if submitted)
  const rawDomains = formData.getAll('domains');
  let domains: string[] = [];
  if (rawDomains.length === 1 && typeof rawDomains[0] === 'string' && rawDomains[0].startsWith('[')) {
    try {
      domains = JSON.parse(rawDomains[0]);
    } catch {
      domains = [];
    }
  } else {
    domains = rawDomains.map((d) => String(d)).filter(Boolean);
  }

  const validDomains = domains.filter((d) => isValidDomain(d));
  if (domains.length > 0 && validDomains.length === 0) {
    return { error: 'Please select valid domain(s) of expertise from the list.' };
  }

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

    const facultyUpdateData: any = {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    };
    if (validDomains.length > 0) {
      facultyUpdateData.domainExpertise = validDomains;
    }

    await prisma.user.update({
      where: { id: userId },
      data: facultyUpdateData,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'FIRST_LOGIN_PASSWORD_CHANGED',
        entity: 'User',
        entityId: userId,
        payload: {
          role: 'FACULTY',
          domainCount: validDomains.length,
          domains: validDomains,
        },
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

  const adminUpdateData: any = {
    name: updatedName,
    email: updatedEmail,
    passwordHash: newPasswordHash,
    mustChangePassword: false,
  };
  if (validDomains.length > 0) {
    adminUpdateData.domainExpertise = validDomains;
  }

  await prisma.user.update({
    where: { id: userId },
    data: adminUpdateData,
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
// 5B. Update User Domain Expertise Action
// Allows faculty, admins, and HOD to record or update their areas of specialization.
// ----------------------------------------------------

export async function updateUserDomainsAction(domains: string[]) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be signed in.' };
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { error: 'User account not found.' };
  }

  if (!Array.isArray(domains) || domains.length === 0) {
    return { error: 'Please select at least one domain of expertise.' };
  }

  const validDomains = domains.filter((d) => isValidDomain(d));
  if (validDomains.length === 0) {
    return { error: 'Please select at least one valid domain of expertise from the list.' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      domainExpertise: validDomains,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'USER_DOMAIN_EXPERTISE_UPDATED',
      entity: 'User',
      entityId: userId,
      payload: {
        role: user.role,
        domainCount: validDomains.length,
        domains: validDomains,
      },
    },
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/faculty');
  return {
    success: true,
    message: 'Domain expertise recorded successfully!',
    domains: validDomains,
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


