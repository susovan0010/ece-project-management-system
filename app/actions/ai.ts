'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  encryptApiKey,
  decryptApiKey,
  testAiProvider,
  AI_PRESETS,
  ProviderConfig,
} from '@/lib/ai';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Helper to mask key: Show first 3 chars, middle asterisks, last 4 chars
function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) {
    return '••••••••••••';
  }
  return `${plaintext.slice(0, 3)}••••••••${plaintext.slice(-4)}`;
}

// ----------------------------------------------------
// 1. Get Configured AI Providers (Admin Only)
// ----------------------------------------------------
export async function getAiProvidersAction() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access AI settings.' };
  }

  try {
    const providers = await prisma.aiProvider.findMany({
      orderBy: { priority: 'asc' },
    });

    const maskedProviders = providers.map((p) => {
      let masked = '••••••••••••';
      try {
        const decrypted = decryptApiKey(p.encryptedKey);
        masked = maskApiKey(decrypted);
      } catch {
        masked = '••••[invalid key]';
      }

      return {
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        model: p.model,
        maskedKey: masked,
        priority: p.priority,
        enabled: p.enabled,
        dailyLimit: p.dailyLimit,
        createdAt: p.createdAt,
      };
    });

    return { providers: maskedProviders, presets: AI_PRESETS };
  } catch (err) {
    return { error: `Failed to fetch AI providers: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Save / Upsert AI Provider (Admin Only)
// ----------------------------------------------------
const SaveProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url('Base URL must be a valid URL'),
  model: z.string().min(1, 'Model name is required'),
  apiKey: z.string().optional(), // If provided, update key. If editing and blank, keep existing.
  priority: z.number().int().min(1).default(1),
  enabled: z.boolean().default(true),
  dailyLimit: z.number().int().min(1).default(500),
});

export async function saveAiProviderAction(data: z.infer<typeof SaveProviderSchema>) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can modify AI settings.' };
  }

  const parsed = SaveProviderSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { id, name, baseUrl, model, apiKey, priority, enabled, dailyLimit } = parsed.data;

  try {
    if (id) {
      // Existing provider update
      const existing = await prisma.aiProvider.findUnique({ where: { id } });
      if (!existing) {
        return { error: 'Provider not found.' };
      }

      let encryptedKey = existing.encryptedKey;
      if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('••••')) {
        encryptedKey = encryptApiKey(apiKey.trim());
      }

      await prisma.aiProvider.update({
        where: { id },
        data: {
          name,
          baseUrl,
          model,
          encryptedKey,
          priority,
          enabled,
          dailyLimit,
        },
      });
    } else {
      // New provider creation
      if (!apiKey || apiKey.trim().length === 0) {
        return { error: 'API Key is required for new provider.' };
      }

      const encryptedKey = encryptApiKey(apiKey.trim());

      await prisma.aiProvider.create({
        data: {
          name,
          baseUrl,
          model,
          encryptedKey,
          priority,
          enabled,
          dailyLimit,
        },
      });
    }

    revalidatePath('/admin/settings/ai');
    return { success: true };
  } catch (err) {
    return { error: `Failed to save provider: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Test Connection with Live Ping (Admin Only)
// ----------------------------------------------------
export async function testAiProviderAction(providerId: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can test AI providers.' };
  }

  try {
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      return { error: 'Provider not found.' };
    }

    const config: ProviderConfig = {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      encryptedKey: provider.encryptedKey,
      priority: provider.priority,
      enabled: provider.enabled,
    };

    const result = await testAiProvider(config);
    return result;
  } catch (err) {
    return { success: false, latencyMs: 0, message: `Test ping error: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Toggle Enabled Status & Priority (Admin Only)
// ----------------------------------------------------
export async function toggleAiProviderAction(id: string, enabled: boolean) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    await prisma.aiProvider.update({
      where: { id },
      data: { enabled },
    });
    revalidatePath('/admin/settings/ai');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function updateAiProviderPriorityAction(id: string, priority: number) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    await prisma.aiProvider.update({
      where: { id },
      data: { priority },
    });
    revalidatePath('/admin/settings/ai');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 5. Delete AI Provider (Admin Only)
// ----------------------------------------------------
export async function deleteAiProviderAction(id: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    await prisma.aiProvider.delete({ where: { id } });
    revalidatePath('/admin/settings/ai');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 6. Get AI Call Logs & Analytics (Admin Only)
// ----------------------------------------------------
export async function getAiLogsAction(limit = 50) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    const logs = await prisma.aiCallLog.findMany({
      take: limit,
      orderBy: { calledAt: 'desc' },
    });

    const totalCalls = await prisma.aiCallLog.count();
    const successfulCalls = await prisma.aiCallLog.count({ where: { success: true } });

    // Aggregate by provider
    const providerStats = await prisma.aiCallLog.groupBy({
      by: ['providerName'],
      _count: { id: true },
      _avg: { latencyMs: true },
    });

    return {
      logs,
      totalCalls,
      successfulCalls,
      providerStats: providerStats.map((s) => ({
        provider: s.providerName,
        calls: s._count.id,
        avgLatencyMs: Math.round(s._avg.latencyMs || 0),
      })),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 7. Update Supervisor AI Preference (Supervisor / Faculty Only)
// ----------------------------------------------------
export async function updateSupervisorAiPreferenceAction(providerName: string | null) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized: You must be logged in to set AI preference.' };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferredAiProvider: providerName },
    });
    return { success: true, preferredAiProvider: providerName };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 8. Get Available AI Providers for Faculty Selection
// ----------------------------------------------------
export async function getAvailableProvidersForFacultyAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredAiProvider: true },
    });

    const activeProviders = await prisma.aiProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true, model: true, priority: true },
      orderBy: { priority: 'asc' },
    });

    return {
      preferredAiProvider: user?.preferredAiProvider || null,
      providers: activeProviders,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
