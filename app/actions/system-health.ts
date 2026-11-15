'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getGoogleDriveConfig } from '@/lib/google-drive';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export interface ReadinessCheckItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  severity: 'critical' | 'warning';
}

export interface BatchDeadlines {
  topicSelection?: string;
  sem7Panel?: string;
  sem8Marks?: string;
  note?: string;
  updatedAt?: string;
}

const DeadlinesSchema = z.object({
  batchId: z.string().min(1),
  topicSelection: z.string().max(40).optional(),
  sem7Panel: z.string().max(40).optional(),
  sem8Marks: z.string().max(40).optional(),
  note: z.string().max(240).optional(),
});

export async function getSystemReadinessAction(): Promise<{
  success: boolean;
  checks?: ReadinessCheckItem[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const checks: ReadinessCheckItem[] = [];

  // 1. Database connectivity
  try {
    const userCount = await prisma.user.count();
    checks.push({
      key: 'database',
      label: 'PostgreSQL Database',
      ok: true,
      detail: `Connected (${userCount} user accounts)`,
      severity: 'critical',
    });
  } catch (err) {
    checks.push({
      key: 'database',
      label: 'PostgreSQL Database',
      ok: false,
      detail: `Connection failed: ${(err as Error).message}`,
      severity: 'critical',
    });
  }

  // 2. Encryption key (AES-256-GCM)
  const encKey = process.env.APP_ENCRYPTION_KEY || '';
  checks.push({
    key: 'encryption',
    label: 'AES-256 Encryption Key',
    ok: encKey.length >= 32,
    detail: encKey.length >= 32 ? 'Configured (32+ chars)' : 'APP_ENCRYPTION_KEY missing or < 32 chars',
    severity: 'critical',
  });

  // 3. Google Drive Webhook
  try {
    const driveCfg = await getGoogleDriveConfig();
    checks.push({
      key: 'googleDrive',
      label: 'Google Drive Archival Webhook',
      ok: driveCfg.isConfigured,
      detail: driveCfg.isConfigured
        ? `Connected (${driveCfg.targetEmail})`
        : 'Not configured — archives will use local fallback',
      severity: 'warning',
    });
  } catch {
    checks.push({
      key: 'googleDrive',
      label: 'Google Drive Archival Webhook',
      ok: false,
      detail: 'Unable to read Google Drive configuration',
      severity: 'warning',
    });
  }

  // 4. Email / SMTP
  const hasEmail = Boolean(
    process.env.RESEND_API_KEY ||
      process.env.GOOGLE_WORKSPACE_SMTP_USER ||
      process.env.SMTP_USER ||
      process.env.GMAIL_APP_PASSWORD
  );
  checks.push({
    key: 'email',
    label: 'Email / SMTP Dispatch',
    ok: hasEmail,
    detail: hasEmail ? 'Email credentials configured' : 'No SMTP / Resend credentials detected',
    severity: 'warning',
  });

  // 5. AI Provider
  let activeAiProviders = 0;
  try {
    activeAiProviders = await prisma.aiProvider.count({ where: { enabled: true } });
  } catch {
    activeAiProviders = 0;
  }
  const hasAiEnv = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  checks.push({
    key: 'ai',
    label: 'AI Qualification & Mapping',
    ok: activeAiProviders > 0 || hasAiEnv,
    detail:
      activeAiProviders > 0
        ? `${activeAiProviders} active DB provider(s) configured`
        : hasAiEnv
        ? 'Environment API key detected'
        : 'No AI provider configured (using deterministic rule engine)',
    severity: 'warning',
  });

  // 6. Cron Secret
  const hasCron = Boolean(process.env.CRON_SECRET);
  checks.push({
    key: 'cron',
    label: 'Automated Cron Secret',
    ok: hasCron,
    detail: hasCron ? 'CRON_SECRET configured' : 'CRON_SECRET missing — scheduled reminders unprotected',
    severity: 'warning',
  });

  return { success: true, checks };
}

export async function getActiveBatchDeadlinesAction(): Promise<{
  batchId: string | null;
  deadlines: BatchDeadlines | null;
}> {
  const session = await auth();
  if (!session?.user) {
    return { batchId: null, deadlines: null };
  }

  try {
    const activeBatch = await prisma.batch.findFirst({
      where: { active: true, isArchived: false },
      orderBy: { id: 'desc' },
      select: { id: true, deadlines: true },
    });

    if (!activeBatch) {
      return { batchId: null, deadlines: null };
    }

    return {
      batchId: activeBatch.id,
      deadlines: (activeBatch.deadlines as BatchDeadlines | null) || null,
    };
  } catch {
    return { batchId: null, deadlines: null };
  }
}

export async function updateBatchDeadlinesAction(input: {
  batchId: string;
  topicSelection?: string;
  sem7Panel?: string;
  sem8Marks?: string;
  note?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { success: false, error: 'Unauthorized: Admin access required.' };
  }

  const parsed = DeadlinesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid deadline input.' };
  }

  try {
    const deadlinesPayload: BatchDeadlines = {
      topicSelection: parsed.data.topicSelection?.trim() || undefined,
      sem7Panel: parsed.data.sem7Panel?.trim() || undefined,
      sem8Marks: parsed.data.sem8Marks?.trim() || undefined,
      note: parsed.data.note?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    await prisma.batch.update({
      where: { id: parsed.data.batchId },
      data: { deadlines: deadlinesPayload as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: 'BATCH_DEADLINES_UPDATED',
        entity: 'Batch',
        entityId: parsed.data.batchId,
        payload: deadlinesPayload as any,
      },
    });

    revalidatePath('/', 'layout');
    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `Milestone deadlines updated for Batch ${parsed.data.batchId}.`,
    };
  } catch (err) {
    return { success: false, error: `Failed to update deadlines: ${(err as Error).message}` };
  }
}
