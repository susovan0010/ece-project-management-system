import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const submissionId = context.params.id;
  const submission = await prisma.semesterSubmission.findUnique({
    where: { id: submissionId },
    include: {
      group: {
        include: {
          members: {
            include: {
              student: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  const currentUserId = session.user.id;
  const role = (session.user as { role?: string }).role;
  const isSupervisor = submission.group.supervisorId === currentUserId;
  const isAdminCompleted = role === 'ADMIN' && submission.status === 'COMPLETED';
  const isGroupStudent =
    role === 'STUDENT' &&
    submission.group.members.some((m) => m.student.userId === currentUserId);

  if (!isSupervisor && !isAdminCompleted && !isGroupStudent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Local base64 data URL fallback
  if (submission.driveViewLink.startsWith('data:') && submission.driveViewLink.includes('base64,')) {
    const base64Part = submission.driveViewLink.split('base64,')[1] || '';
    const buf = Buffer.from(base64Part, 'base64');
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': submission.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${submission.fileName.replace(/"/g, '')}"`,
      },
    });
  }

  // 2. Try server-side fetch of Google Drive download URL (avoids browser authuser=0 403 conflict)
  const downloadUrl =
    submission.driveDownloadLink ||
    (submission.driveFileId
      ? `https://drive.google.com/uc?export=download&id=${submission.driveFileId}`
      : null);

  if (downloadUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(downloadUrl, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timer);

      const contentType = res.headers.get('content-type') || '';
      // Ensure Drive returned actual file bytes, not an HTML login/403 page
      if (res.ok && !contentType.includes('text/html')) {
        const buf = Buffer.from(await res.arrayBuffer());
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': submission.mimeType || contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${submission.fileName.replace(/"/g, '')}"`,
          },
        });
      }
    } catch {
      // Fall through to Drive Viewer redirect
    }
  }

  // 3. Fallback: Redirect to Drive Viewer (which authenticates cleanly with user's Workspace session)
  return NextResponse.redirect(submission.driveViewLink);
}
