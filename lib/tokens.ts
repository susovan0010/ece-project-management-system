import crypto from 'crypto';
import { prisma } from './prisma';

/**
 * Generates an invite token for a faculty member.
 * Default validity: 72 hours.
 */
export async function createInviteToken(email: string, role: 'FACULTY' | 'ADMIN' = 'FACULTY', hoursValid = 72) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000);

  // Remove any existing invite token for this email
  await prisma.inviteToken.deleteMany({ where: { email } });

  const record = await prisma.inviteToken.create({
    data: {
      email,
      token,
      role,
      expiresAt,
    },
  });

  return record;
}

/**
 * Validates an invite token.
 */
export async function validateInviteToken(token: string) {
  const record = await prisma.inviteToken.findUnique({
    where: { token },
  });

  if (!record) {
    return { valid: false, error: 'Invite token not found.' };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, error: 'Invite token has expired.' };
  }

  return { valid: true, invite: record };
}

/**
 * Generates a password reset token.
 * Default validity: 2 hours.
 */
export async function createPasswordResetToken(email: string, hoursValid = 2) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({ where: { email } });

  const record = await prisma.passwordResetToken.create({
    data: {
      email,
      token,
      expiresAt,
    },
  });

  return record;
}

/**
 * Validates a password reset token.
 */
export async function validatePasswordResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!record) {
    return { valid: false, error: 'Password reset token not found.' };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, error: 'Password reset token has expired.' };
  }

  return { valid: true, reset: record };
}
