import https from 'https';
import { URL } from 'url';
import { prisma } from './prisma';

export interface GoogleDriveConfig {
  webhookUrl: string | null;
  targetEmail: string;
  isConfigured: boolean;
}

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId?: string;
  viewUrl: string;
  downloadUrl?: string;
  fileName: string;
  size: number;
  mimeType: string;
  hostedOn: 'GOOGLE_DRIVE' | 'LOCAL_FALLBACK';
  error?: string;
}

export const OFFICIAL_DRIVE_ACCOUNT = 'ece.project.committee@heritageit.edu';

/**
 * Standard Google Apps Script deployment code for ece.project.committee@heritageit.edu
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * Google Apps Script for Hosting ECE Capstone Forum Attachments
 * Target Account: ece.project.committee@heritageit.edu
 *
 * Instructions:
 * 1. Log into script.google.com with ece.project.committee@heritageit.edu
 * 2. Create a New Project named "ECE Project Committee Drive Webhook"
 * 3. Replace all contents with this script and Save (Ctrl+S).
 * 4. FIRST: Select "authorizeDrive" from the function dropdown at the top, and click "Run" (▶️).
 *    Google will ask to review permissions -> Select account -> Advanced -> Allow.
 * 5. Click Deploy -> New deployment (or Manage Deployments -> Edit).
 * 6. Select type: "Web app"
 * 7. Execute as: "Me (ece.project.committee@heritageit.edu)"
 * 8. Who has access: "Anyone"
 * 9. Click Deploy and copy the Web App URL (starts with https://script.google.com/macros/s/...)
 * 10. Paste the URL into the Admin Settings / Google Drive config.
 */

// One-time authorization trigger for Google Drive
function authorizeDrive() {
  var root = DriveApp.getRootFolder();
  Logger.log("DriveApp successfully authorized for: " + root.getName());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No payload received in request."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var rootFolderName = data.folderName || "ECE_Capstone_Forum_Attachments";

    // 1. Get or Create Root Folder
    var rootFolders = DriveApp.getFoldersByName(rootFolderName);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootFolderName);

    // 2. Get or Create Group Subfolder (e.g. Batch_2023-2027_Group_1)
    var targetFolder = rootFolder;
    if (data.subFolder) {
      var subFolders = rootFolder.getFoldersByName(data.subFolder);
      targetFolder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(data.subFolder);
    }

    // 3. Decode Base64 and Create File in Google Drive
    var base64Clean = data.base64 || "";
    if (base64Clean.indexOf("base64,") !== -1) {
      base64Clean = base64Clean.split("base64,")[1];
    }

    var decoded = Utilities.base64Decode(base64Clean);
    var blob = Utilities.newBlob(decoded, data.mimeType || "application/octet-stream", data.fileName || "attachment");
    var file = targetFolder.createFile(blob);

    // 4. Set Sharing (Protected against Google Workspace domain security restrictions)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      try {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (domainErr) {
        // If domain admin disallows link sharing, file remains stored in committee drive
      }
    }

    var fileId = file.getId();
    var viewUrl = file.getUrl();
    var downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: fileId,
      viewUrl: viewUrl,
      downloadUrl: downloadUrl,
      fileName: file.getName(),
      size: file.getSize(),
      mimeType: file.getMimeType(),
      folder: targetFolder.getName()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    account: "ece.project.committee@heritageit.edu",
    service: "ECE Capstone Forum Google Drive Storage Hook"
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

/**
 * Standard appsscript.json manifest configuration with explicit Drive scope
 */
export const GOOGLE_APPSSCRIPT_MANIFEST = `{
  "timeZone": "Asia/Kolkata",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive"
  ]
}`;

/**
 * Robust HTTPS client to handle Google Apps Script 302 redirects & TLS certificate validation
 */
export function postJsonToAppsScript(
  urlStr: string,
  data: any
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    function execute(currentUrl: string, method: string, payload: string | null, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects while communicating with Google Apps Script.'));
      }

      const parsed = new URL(currentUrl);
      const agent = new https.Agent({
        rejectUnauthorized:
          process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_ENV !== 'production'
            ? false
            : true,
      });

      const options: https.RequestOptions = {
        method,
        agent,
        headers: {},
      };

      if (payload) {
        options.headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        };
      }

      const req = https.request(parsed, options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
          const redirectLocation = res.headers.location;
          if (!redirectLocation) {
            return reject(new Error(`Received redirect ${res.statusCode} without Location header.`));
          }
          // After 302/303 redirect on POST, Google Apps Script redirects to a GET URL with user_content_key
          execute(redirectLocation, 'GET', null, redirectCount + 1);
          return;
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode || 200, body });
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    }

    execute(urlStr, 'POST', JSON.stringify(data));
  });
}

export const googleDriveHttpClient = {
  postJsonToAppsScript,
};

/**
 * Retrieve Google Drive configuration from Environment or Database Setting
 */
export async function getGoogleDriveConfig(): Promise<GoogleDriveConfig> {
  const envUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim();
  if (envUrl) {
    return {
      webhookUrl: envUrl,
      targetEmail: OFFICIAL_DRIVE_ACCOUNT,
      isConfigured: true,
    };
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'google_drive_config' },
    });

    if (setting && setting.value) {
      const val = setting.value as { webhookUrl?: string };
      if (val.webhookUrl && val.webhookUrl.trim()) {
        return {
          webhookUrl: val.webhookUrl.trim(),
          targetEmail: OFFICIAL_DRIVE_ACCOUNT,
          isConfigured: true,
        };
      }
    }
  } catch (err) {
    // Non-fatal if database setting table lookup fails
  }

  return {
    webhookUrl: null,
    targetEmail: OFFICIAL_DRIVE_ACCOUNT,
    isConfigured: false,
  };
}

/**
 * Upload an attachment to Google Drive of ece.project.committee@heritageit.edu
 */
export async function uploadFileToGoogleDrive(params: {
  fileName: string;
  size: number;
  mimeType: string;
  dataUrlOrBase64: string;
  batchId?: string;
  groupNumber?: number;
  uploaderEmail?: string;
}): Promise<GoogleDriveUploadResult> {
  const { fileName, size, mimeType, dataUrlOrBase64, batchId, groupNumber, uploaderEmail } = params;

  // Extract pure base64
  let base64 = dataUrlOrBase64;
  if (base64.includes('base64,')) {
    base64 = base64.split('base64,')[1];
  }

  const config = await getGoogleDriveConfig();

  // If not configured, fall back gracefully to local data URL
  if (!config.isConfigured || !config.webhookUrl) {
    return {
      success: true,
      fileName,
      size,
      mimeType,
      viewUrl: dataUrlOrBase64, // local data url
      downloadUrl: dataUrlOrBase64,
      hostedOn: 'LOCAL_FALLBACK',
    };
  }

  let subFolder = 'General_Discussions';
  if (batchId === 'Committee') {
    subFolder = 'Committee_Discussions';
  } else if (batchId && groupNumber !== undefined) {
    subFolder = `Batch_${batchId}_Group_${groupNumber}`;
  }

  try {
    const response = await googleDriveHttpClient.postJsonToAppsScript(config.webhookUrl, {
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      base64,
      folderName: 'ECE_Capstone_Forum_Attachments',
      subFolder,
      uploader: uploaderEmail || OFFICIAL_DRIVE_ACCOUNT,
    });

    if (response.status === 403) {
      throw new Error(
        'Google Apps Script returned HTTP 403 (Permission Denied). In Google Apps Script, go to Deploy -> Manage deployments -> Edit (pencil icon), and change "Who has access" to "Anyone", choose New Version, and click Deploy.'
      );
    }

    if (response.status !== 200) {
      throw new Error(`Google Drive webhook responded with HTTP ${response.status}`);
    }

    let result: any = null;
    try {
      result = JSON.parse(response.body);
    } catch {
      throw new Error(`Unexpected non-JSON response from Google Apps Script: ${response.body.slice(0, 150)}`);
    }

    if (!result.success) {
      if (typeof result.error === 'string' && result.error.includes('Access denied: DriveApp')) {
        throw new Error(
          'Google Drive Access Denied: In script.google.com, open Deploy -> Manage deployments -> Edit. Ensure "Execute as" is set to "Me (ece.project.committee@heritageit.edu)" (NOT "User accessing web app") and "Who has access" is "Anyone". Also ensure Drive scope is in appsscript.json, select "New version", and click Deploy.'
        );
      }
      throw new Error(result.error || 'Failed to upload file to Google Drive.');
    }

    return {
      success: true,
      fileId: result.fileId,
      viewUrl: result.viewUrl,
      downloadUrl: result.downloadUrl || `https://drive.google.com/uc?export=download&id=${result.fileId}`,
      fileName: result.fileName || fileName,
      size: result.size || size,
      mimeType: result.mimeType || mimeType,
      hostedOn: 'GOOGLE_DRIVE',
    };
  } catch (error) {
    console.error('[Google Drive Upload Error]:', error);
    // Graceful fallback so post/reply publishing does not fail
    return {
      success: true,
      fileName,
      size,
      mimeType,
      viewUrl: dataUrlOrBase64,
      downloadUrl: dataUrlOrBase64,
      hostedOn: 'LOCAL_FALLBACK',
      error: (error as Error).message,
    };
  }
}
