import { prisma } from './prisma';

export const DEFAULT_SENDER_EMAIL = 'susovan.mandal@heritageit.edu';
export const DEFAULT_SENDER_NAME = 'Dr. Susovan Mandal (ECE Project Committee)';

export interface CommunicationConfig {
  senderEmail: string;
  senderName: string;
  replyTo?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  simulated?: boolean;
  provider?: 'resend' | 'simulated';
  recipientCount?: number;
}

/**
 * Retrieves the persisted sender configuration from the Setting table,
 * falling back to Dr. Susovan Mandal's departmental email address.
 */
export async function getCommunicationConfig(): Promise<CommunicationConfig> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'communication_config' },
    });

    if (setting && setting.value && typeof setting.value === 'object') {
      const val = setting.value as Record<string, any>;
      return {
        senderEmail: val.senderEmail?.trim() || process.env.MAIL_FROM || DEFAULT_SENDER_EMAIL,
        senderName: val.senderName?.trim() || DEFAULT_SENDER_NAME,
        replyTo: val.replyTo?.trim() || val.senderEmail?.trim() || process.env.MAIL_FROM || DEFAULT_SENDER_EMAIL,
      };
    }
  } catch (err) {
    console.error('Error fetching communication config from DB:', err);
  }

  return {
    senderEmail: process.env.MAIL_FROM || DEFAULT_SENDER_EMAIL,
    senderName: DEFAULT_SENDER_NAME,
    replyTo: process.env.MAIL_FROM || DEFAULT_SENDER_EMAIL,
  };
}

/**
 * Persists updated sender configuration to the Setting table.
 */
export async function saveCommunicationConfig(config: CommunicationConfig): Promise<boolean> {
  try {
    const payload = {
      senderEmail: config.senderEmail.trim(),
      senderName: config.senderName.trim(),
      replyTo: (config.replyTo || config.senderEmail).trim(),
      updatedAt: new Date().toISOString(),
    };

    await prisma.setting.upsert({
      where: { key: 'communication_config' },
      update: { value: payload },
      create: { key: 'communication_config', value: payload },
    });

    return true;
  } catch (err) {
    console.error('Error saving communication config:', err);
    return false;
  }
}

/**
 * Sends an email via Resend API if a live RESEND_API_KEY is available,
 * or safely logs and simulates delivery if in sandbox/development mode.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const config = await getCommunicationConfig();
  const fromEmail = options.fromEmail?.trim() || config.senderEmail;
  const fromName = options.fromName?.trim() || config.senderName;
  const replyTo = options.replyTo?.trim() || config.replyTo || fromEmail;

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const cleanRecipients = recipients.map((r) => r.trim()).filter((r) => r.length > 0 && r.includes('@'));

  if (cleanRecipients.length === 0) {
    return { success: false, error: 'No valid recipient email addresses provided.' };
  }

  const formattedFrom = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const apiKey = process.env.RESEND_API_KEY?.trim();

  // If apiKey is missing or placeholder sample key, simulate and log
  const isSampleKey = !apiKey || apiKey.startsWith('re_sample_') || apiKey === 're_...';

  if (isSampleKey) {
    console.log(`[Email Simulated Delivery] From: ${formattedFrom} | To: ${cleanRecipients.join(', ')} | Subject: ${options.subject}`);
    return {
      success: true,
      simulated: true,
      provider: 'simulated',
      recipientCount: cleanRecipients.length,
      id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formattedFrom,
        to: cleanRecipients,
        reply_to: replyTo,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Resend API Error response:', data);
      return {
        success: false,
        error: data.message || `Resend API failed with HTTP ${res.status}: ${res.statusText}`,
        provider: 'resend',
      };
    }

    return {
      success: true,
      id: data.id,
      provider: 'resend',
      recipientCount: cleanRecipients.length,
    };
  } catch (err) {
    console.error('Exception in sendEmail:', err);
    return {
      success: false,
      error: `Network/transport error sending email: ${(err as Error).message}`,
      provider: 'resend',
    };
  }
}
