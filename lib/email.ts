import { prisma } from './prisma';
import nodemailer from 'nodemailer';

export const DEFAULT_SENDER_EMAIL = 'susovan.mandal@heritageit.edu';
export const DEFAULT_SENDER_NAME = 'Dr. Susovan Mandal (ECE Project Committee)';
export const FACULTY_GOOGLE_GROUP_EMAIL = 'hit_ece_faculties@googlegroups.com';

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
  provider?: 'smtp' | 'resend' | 'simulated';
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
 * Sends an email using:
 * 1. Google Workspace SMTP (if SMTP_PASS / SMTP_PASSWORD is configured)
 * 2. Resend REST API (if RESEND_API_KEY is configured)
 * 3. Simulation mode (logs and records in database)
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

  const formattedFrom = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  // ------------------------------------------------------------------
  // 1. Google Workspace SMTP Transport (Highest Priority)
  // ------------------------------------------------------------------
  const smtpUser = process.env.SMTP_USER?.trim() || fromEmail;
  const smtpPass = process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim();

  if (smtpPass && smtpPass !== 'sample_smtp_pass_here') {
    try {
      const port = parseInt(process.env.SMTP_PORT?.trim() || '465', 10);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const info = await transporter.sendMail({
        from: formattedFrom,
        to: cleanRecipients,
        replyTo: replyTo,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
      });

      console.log(`[Google Workspace SMTP] Delivered email from ${formattedFrom} to ${cleanRecipients.join(', ')} (Message ID: ${info.messageId})`);

      return {
        success: true,
        id: info.messageId,
        provider: 'smtp',
        recipientCount: cleanRecipients.length,
      };
    } catch (smtpErr) {
      console.error('Google Workspace SMTP Delivery failed:', smtpErr);
      return {
        success: false,
        error: `Google Workspace SMTP Delivery failed: ${(smtpErr as Error).message}`,
        provider: 'smtp',
      };
    }
  }

  // ------------------------------------------------------------------
  // 2. Resend API Transport (Secondary Fallback)
  // ------------------------------------------------------------------
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const isSampleResendKey = !apiKey || apiKey.startsWith('re_sample_') || apiKey === 're_...';

  if (!isSampleResendKey && apiKey) {
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
      console.error('Exception in sendEmail via Resend:', err);
      return {
        success: false,
        error: `Network error sending email via Resend: ${(err as Error).message}`,
        provider: 'resend',
      };
    }
  }

  // ------------------------------------------------------------------
  // 3. Simulation & Audit Log Mode
  // ------------------------------------------------------------------
  console.log(`[Email Simulated Delivery] From: ${formattedFrom} | To: ${cleanRecipients.join(', ')} | Subject: ${options.subject}`);
  return {
    success: true,
    simulated: true,
    provider: 'simulated',
    recipientCount: cleanRecipients.length,
    id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };
}
