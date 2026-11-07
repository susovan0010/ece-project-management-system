'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  getGoogleDriveConfig,
  OFFICIAL_DRIVE_ACCOUNT,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  GOOGLE_APPSSCRIPT_MANIFEST,
  uploadFileToGoogleDrive,
} from '@/lib/google-drive';

/**
 * 1. Get Google Drive Configuration Status
 */
export async function getGoogleDriveStatusAction(): Promise<{
  success: boolean;
  isConfigured: boolean;
  targetEmail: string;
  maskedWebhookUrl: string | null;
  scriptTemplate: string;
  manifestTemplate: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user) {
    return {
      success: false,
      isConfigured: false,
      targetEmail: OFFICIAL_DRIVE_ACCOUNT,
      maskedWebhookUrl: null,
      scriptTemplate: GOOGLE_APPS_SCRIPT_TEMPLATE,
      manifestTemplate: GOOGLE_APPSSCRIPT_MANIFEST,
      error: 'Unauthorized.',
    };
  }

  const config = await getGoogleDriveConfig();

  let masked: string | null = null;
  if (config.webhookUrl) {
    const len = config.webhookUrl.length;
    masked = len > 30 ? `${config.webhookUrl.slice(0, 32)}...${config.webhookUrl.slice(-8)}` : config.webhookUrl;
  }

  return {
    success: true,
    isConfigured: config.isConfigured,
    targetEmail: OFFICIAL_DRIVE_ACCOUNT,
    maskedWebhookUrl: masked,
    scriptTemplate: GOOGLE_APPS_SCRIPT_TEMPLATE,
    manifestTemplate: GOOGLE_APPSSCRIPT_MANIFEST,
  };
}

/**
 * 2. Save or Update Google Drive Webhook URL (Admin Only)
 */
export async function saveGoogleDriveWebhookAction(webhookUrl: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const session = await auth();
  const userRole = (session?.user as { role?: string })?.role;
  if (userRole !== 'ADMIN' && userRole !== 'FACULTY') {
    return { success: false, error: 'Only Project Committee Admins and Faculty can configure Google Drive integration.' };
  }

  const cleanUrl = webhookUrl.trim();
  if (cleanUrl && !cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      error: 'Invalid Google Apps Script Web App URL. It must begin with https://script.google.com/macros/s/...',
    };
  }

  try {
    await prisma.setting.upsert({
      where: { key: 'google_drive_config' },
      create: {
        key: 'google_drive_config',
        value: { webhookUrl: cleanUrl },
      },
      update: {
        value: { webhookUrl: cleanUrl },
      },
    });

    revalidatePath('/admin/communication');
    revalidatePath('/admin/forum');
    revalidatePath('/faculty/forum');
    revalidatePath('/student/forum');

    return {
      success: true,
      message: cleanUrl ? 'Google Drive Webhook connected successfully!' : 'Google Drive Webhook cleared.',
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * 3. Test Google Drive Connection
 */
export async function testGoogleDriveConnectionAction(): Promise<{
  success: boolean;
  message?: string;
  viewUrl?: string;
  error?: string;
}> {
  const session = await auth();
  const userRole = (session?.user as { role?: string })?.role;
  if (userRole !== 'ADMIN' && userRole !== 'FACULTY') {
    return { success: false, error: 'Unauthorized.' };
  }

  const config = await getGoogleDriveConfig();
  if (!config.isConfigured || !config.webhookUrl) {
    return {
      success: false,
      error: 'Google Drive is not configured yet. Please deploy the Apps Script Web App and provide the URL.',
    };
  }

  try {
    const testBase64 = Buffer.from(
      `ECE Project Committee Drive Connection Ping\nTimestamp: ${new Date().toISOString()}\nTarget: ${OFFICIAL_DRIVE_ACCOUNT}`
    ).toString('base64');

    const result = await uploadFileToGoogleDrive({
      fileName: `connection_test_${Date.now()}.txt`,
      size: 64,
      mimeType: 'text/plain',
      dataUrlOrBase64: `data:text/plain;base64,${testBase64}`,
      batchId: 'Diagnostic',
      groupNumber: 0,
      uploaderEmail: OFFICIAL_DRIVE_ACCOUNT,
    });

    if (result.hostedOn === 'GOOGLE_DRIVE') {
      return {
        success: true,
        message: `Successfully connected to Google Drive of ${OFFICIAL_DRIVE_ACCOUNT}!`,
        viewUrl: result.viewUrl,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Connection failed: Webhook did not confirm Google Drive file creation.',
      };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
