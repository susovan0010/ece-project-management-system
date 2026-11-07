import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as googleDriveModule from '@/lib/google-drive';

// Mock dependencies
let mockSetting: any = null;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    setting: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.key === 'google_drive_config') {
          return mockSetting;
        }
        return null;
      }),
      upsert: vi.fn().mockImplementation(({ where, create, update }: any) => {
        mockSetting = { key: where.key, value: update?.value || create?.value };
        return mockSetting;
      }),
    },
  },
}));

describe('Google Drive Attachment Hosting (ece.project.committee@heritageit.edu)', () => {
  const originalEnv = process.env.GOOGLE_DRIVE_WEBHOOK_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetting = null;
    delete process.env.GOOGLE_DRIVE_WEBHOOK_URL;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.GOOGLE_DRIVE_WEBHOOK_URL = originalEnv;
    } else {
      delete process.env.GOOGLE_DRIVE_WEBHOOK_URL;
    }
  });

  it('correctly targets ece.project.committee@heritageit.edu account', async () => {
    const config = await googleDriveModule.getGoogleDriveConfig();
    expect(config.targetEmail).toBe('ece.project.committee@heritageit.edu');
    expect(config.isConfigured).toBe(false);
  });

  it('detects Google Drive configuration from Database Setting', async () => {
    mockSetting = {
      key: 'google_drive_config',
      value: { webhookUrl: 'https://script.google.com/macros/s/test-script-123/exec' },
    };

    const config = await googleDriveModule.getGoogleDriveConfig();
    expect(config.isConfigured).toBe(true);
    expect(config.webhookUrl).toBe('https://script.google.com/macros/s/test-script-123/exec');
    expect(config.targetEmail).toBe(googleDriveModule.OFFICIAL_DRIVE_ACCOUNT);
  });

  it('falls back gracefully to local data URL when unconfigured', async () => {
    const result = await googleDriveModule.uploadFileToGoogleDrive({
      fileName: 'circuit_diagram.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      dataUrlOrBase64: 'data:application/pdf;base64,JVBERi0xLjQK...',
      batchId: '2023-2027',
      groupNumber: 1,
      uploaderEmail: 'student.demo@heritageit.edu',
    });

    expect(result.success).toBe(true);
    expect(result.hostedOn).toBe('LOCAL_FALLBACK');
    expect(result.fileName).toBe('circuit_diagram.pdf');
    expect(result.viewUrl).toContain('data:application/pdf');
  });

  it('uploads to Google Drive when Webhook URL is configured', async () => {
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/test-deploy-xyz/exec';

    const spy = vi.spyOn(googleDriveModule.googleDriveHttpClient, 'postJsonToAppsScript').mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        fileId: 'gdrive-file-abc-999',
        viewUrl: 'https://drive.google.com/file/d/gdrive-file-abc-999/view',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=gdrive-file-abc-999',
        fileName: 'simulation_report.docx',
        size: 51200,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    });

    const result = await googleDriveModule.uploadFileToGoogleDrive({
      fileName: 'simulation_report.docx',
      size: 51200,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dataUrlOrBase64: 'data:application/docx;base64,UEsDBBQAA...',
      batchId: '2023-2027',
      groupNumber: 1,
      uploaderEmail: 'susovan.mandal@heritageit.edu',
    });

    expect(result.success).toBe(true);
    expect(result.hostedOn).toBe('GOOGLE_DRIVE');
    expect(result.fileId).toBe('gdrive-file-abc-999');
    expect(result.viewUrl).toBe('https://drive.google.com/file/d/gdrive-file-abc-999/view');
    expect(result.downloadUrl).toContain('export=download&id=gdrive-file-abc-999');

    expect(spy).toHaveBeenCalledTimes(1);
    const [calledUrl, payload] = spy.mock.calls[0];
    expect(calledUrl).toBe('https://script.google.com/macros/s/test-deploy-xyz/exec');
    expect(payload.folderName).toBe('ECE_Capstone_Forum_Attachments');
    expect(payload.subFolder).toBe('Batch_2023-2027_Group_1');
    expect(payload.uploader).toBe('susovan.mandal@heritageit.edu');
    expect(payload.fileName).toBe('simulation_report.docx');
  });

  it('handles DriveApp permission error with specific guidance', async () => {
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/test-deploy-xyz/exec';

    vi.spyOn(googleDriveModule.googleDriveHttpClient, 'postJsonToAppsScript').mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: false,
        error: 'Exception: Access denied: DriveApp.',
      }),
    });

    const result = await googleDriveModule.uploadFileToGoogleDrive({
      fileName: 'report.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      dataUrlOrBase64: 'data:application/pdf;base64,JVBER...',
      batchId: '2023-2027',
      groupNumber: 1,
      uploaderEmail: 'susovan.mandal@heritageit.edu',
    });

    expect(result.success).toBe(true);
    expect(result.hostedOn).toBe('LOCAL_FALLBACK');
    expect(result.error).toContain('Google Drive Permission Required');
  });

  it('handles network failure with resilient fallback without crashing user flow', async () => {
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/broken-url/exec';

    vi.spyOn(googleDriveModule.googleDriveHttpClient, 'postJsonToAppsScript').mockRejectedValue(
      new Error('Network timeout connecting to script.google.com')
    );

    const result = await googleDriveModule.uploadFileToGoogleDrive({
      fileName: 'code.py',
      size: 1024,
      mimeType: 'text/x-python',
      dataUrlOrBase64: 'data:text/plain;base64,cHJpbnQoImhlbGxvIik=',
      batchId: '2023-2027',
      groupNumber: 1,
      uploaderEmail: 'student.demo@heritageit.edu',
    });

    expect(result.success).toBe(true);
    expect(result.hostedOn).toBe('LOCAL_FALLBACK');
    expect(result.error).toContain('Network timeout');
  });
});
