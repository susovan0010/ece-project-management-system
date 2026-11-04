import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';

export interface InboxMessageSummary {
  uid: number;
  seq: number;
  subject: string;
  from: {
    name: string;
    address: string;
  };
  to: Array<{
    name: string;
    address: string;
  }>;
  date: string;
  seen: boolean;
  snippet?: string;
  hasAttachments?: boolean;
}

export interface InboxMessageDetail extends InboxMessageSummary {
  html: string;
  text: string;
  messageId?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface FetchInboxResult {
  success: boolean;
  messages: InboxMessageSummary[];
  totalCount: number;
  error?: string;
  simulated?: boolean;
}

export interface FetchDetailResult {
  success: boolean;
  message?: InboxMessageDetail;
  error?: string;
  simulated?: boolean;
}

/**
 * Creates an authenticated ImapFlow client using the application's
 * configured Google Workspace credentials.
 */
export function getImapClient() {
  const user = process.env.SMTP_USER?.trim() || process.env.MAIL_FROM?.trim();
  const pass = process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim();

  if (!user || !pass || pass === 'sample_smtp_pass_here') {
    return null;
  }

  const host = process.env.IMAP_HOST?.trim() || 'imap.gmail.com';
  const port = parseInt(process.env.IMAP_PORT?.trim() || '993', 10);

  return new ImapFlow({
    host,
    port,
    secure: true,
    tls: {
      rejectUnauthorized: false,
    },
    auth: {
      user,
      pass,
    },
    logger: false,
    clientInfo: {
      name: 'HITK-ECE-Project-Committee-Portal',
      version: '1.0.0',
    },
  });
}

/**
 * Fetches recent inbox messages in read-only mode from Google Workspace.
 */
export async function fetchRecentInboxEmails(
  page = 1,
  limit = 20,
  searchQuery?: string
): Promise<FetchInboxResult> {
  const client = getImapClient();

  if (!client) {
    return {
      success: true,
      simulated: true,
      totalCount: 2,
      messages: [
        {
          uid: 101,
          seq: 1,
          subject: 'Query regarding Capstone Project Allotment for Group 14',
          from: {
            name: 'Dr. Debasish Mandal',
            address: 'debasish@hitk.edu',
          },
          to: [{ name: 'Project Committee', address: 'susovan.mandal@heritageit.edu' }],
          date: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
          seen: false,
          snippet:
            'Dear Committee, Our group has reviewed the SDR hardware requirement and would like to request an updated milestone review date...',
          hasAttachments: false,
        },
        {
          uid: 102,
          seq: 2,
          subject: 'Submission of Draft Rubrics for Semester 7',
          from: {
            name: 'Dr. Ananya Chattopadhyay',
            address: 'ananya.chattopadhyay@heritageit.edu',
          },
          to: [{ name: 'Project Committee', address: 'susovan.mandal@heritageit.edu' }],
          date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
          seen: true,
          snippet:
            'Respected Dr. Mandal, The rubric marks for our assigned students have been cross-checked against the evaluation criteria...',
          hasAttachments: true,
        },
      ],
    };
  }

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });

    try {
      const mailbox = client.mailbox;
      const totalMessages = mailbox ? mailbox.exists : 0;

      if (totalMessages === 0) {
        return {
          success: true,
          messages: [],
          totalCount: 0,
        };
      }

      // Compute sequence window: newest messages have the highest sequence numbers
      const skip = (page - 1) * limit;
      const endSeq = Math.max(1, totalMessages - skip);
      const startSeq = Math.max(1, endSeq - limit + 1);

      const messages: InboxMessageSummary[] = [];

      // Fetch sequence range from IMAP
      for await (const msg of client.fetch(`${startSeq}:${endSeq}`, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
      })) {
        const fromItem = msg.envelope?.from?.[0];
        const fromName = fromItem?.name || fromItem?.address || 'Unknown Sender';
        const fromAddress = fromItem?.address || '';

        const toList = (msg.envelope?.to || []).map((t) => ({
          name: t.name || t.address || '',
          address: t.address || '',
        }));

        const isSeen = msg.flags?.has('\\Seen') || false;
        const subject = msg.envelope?.subject || '(No Subject)';
        const dateStr = msg.envelope?.date
          ? new Date(msg.envelope.date).toISOString()
          : new Date().toISOString();

        messages.push({
          uid: msg.uid,
          seq: msg.seq,
          subject,
          from: {
            name: fromName,
            address: fromAddress,
          },
          to: toList,
          date: dateStr,
          seen: isSeen,
          snippet: subject,
          hasAttachments: Boolean(
            msg.bodyStructure?.childNodes?.some(
              (part) => part.disposition === 'attachment'
            )
          ),
        });
      }

      // Newest messages first
      messages.reverse();

      // Filter by search query if provided
      const filtered = searchQuery?.trim()
        ? messages.filter((m) => {
            const q = searchQuery.toLowerCase();
            return (
              m.subject.toLowerCase().includes(q) ||
              m.from.name.toLowerCase().includes(q) ||
              m.from.address.toLowerCase().includes(q)
            );
          })
        : messages;

      return {
        success: true,
        messages: filtered,
        totalCount: totalMessages,
      };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error('[IMAP Inbox Error]:', err);
    return {
      success: false,
      messages: [],
      totalCount: 0,
      error: err.message || 'Failed to connect to Google Workspace IMAP mailbox.',
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Fetches the full content of an email message by UID.
 */
export async function fetchInboxEmailDetail(uid: number): Promise<FetchDetailResult> {
  const client = getImapClient();

  if (!client) {
    // Simulated detail fallback
    return {
      success: true,
      simulated: true,
      message: {
        uid,
        seq: 1,
        subject:
          uid === 101
            ? 'Query regarding Capstone Project Allotment for Group 14'
            : 'Submission of Draft Rubrics for Semester 7',
        from:
          uid === 101
            ? { name: 'Dr. Debasish Mandal', address: 'debasish@hitk.edu' }
            : { name: 'Dr. Ananya Chattopadhyay', address: 'ananya.chattopadhyay@heritageit.edu' },
        to: [{ name: 'Project Committee', address: 'susovan.mandal@heritageit.edu' }],
        date: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        seen: true,
        messageId: `<simulated-msg-${uid}@heritageit.edu>`,
        snippet: 'Our group has reviewed the SDR hardware requirement...',
        text: `Dear Committee,\n\nOur group has reviewed the SDR hardware requirement and would like to request an updated milestone review date for next Tuesday.\n\nThank you.\nDr. Debasish Mandal`,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #46494C;">
          <p>Dear Committee,</p>
          <p>Our group has reviewed the SDR hardware requirement and would like to request an updated milestone review date for next Tuesday.</p>
          <p>Thank you.<br/><strong>Dr. Debasish Mandal</strong></p>
        </div>`,
        attachments:
          uid === 102
            ? [
                {
                  filename: 'Group14_Preliminary_Rubrics.pdf',
                  contentType: 'application/pdf',
                  size: 245100,
                },
              ]
            : [],
      },
    };
  }

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });

    try {
      const download = await client.download(String(uid), undefined, { uid: true });
      if (!download?.content) {
        return { success: false, error: 'Email content could not be retrieved.' };
      }

      const parsed: ParsedMail = await simpleParser(download.content);

      const fromItem = parsed.from?.value?.[0];
      const fromName = fromItem?.name || fromItem?.address || 'Unknown Sender';
      const fromAddress = fromItem?.address || '';

      const toList: Array<{ name: string; address: string }> = [];
      if (parsed.to) {
        const toArray = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
        for (const item of toArray) {
          if (item?.value) {
            for (const addr of item.value) {
              toList.push({
                name: addr.name || addr.address || '',
                address: addr.address || '',
              });
            }
          }
        }
      }

      const attachments = (parsed.attachments || []).map((att) => ({
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
      }));

      const detail: InboxMessageDetail = {
        uid,
        seq: 0,
        subject: parsed.subject || '(No Subject)',
        from: {
          name: fromName,
          address: fromAddress,
        },
        to: toList,
        date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
        seen: true,
        messageId: parsed.messageId,
        snippet: parsed.text ? parsed.text.slice(0, 140).trim() : '',
        text: parsed.text || '',
        html: parsed.html || parsed.textAsHtml || `<pre style="white-space: pre-wrap;">${parsed.text || ''}</pre>`,
        attachments,
      };

      return {
        success: true,
        message: detail,
      };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error(`[IMAP Fetch UID ${uid} Error]:`, err);
    return {
      success: false,
      error: err.message || `Failed to download email UID ${uid}.`,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore cleanup error
    }
  }
}
