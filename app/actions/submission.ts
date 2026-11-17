'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToGoogleDrive } from '@/lib/google-drive';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type DocTypeValue = 'PROGRESS_REPORT' | 'PRESENTATION';
export type SubmissionStatusValue = 'SUBMITTED' | 'REVISION_REQUESTED' | 'COMPLETED';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const UploadSchema = z.object({
  semester: z.union([z.literal(6), z.literal(7), z.literal(8)]),
  docType: z.enum(['PROGRESS_REPORT', 'PRESENTATION']),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(150),
  fileSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'File size must not exceed 15 MB.'),
  dataUrlOrBase64: z.string().min(1),
});

function extractExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx === -1) return '';
  return fileName.slice(idx + 1).trim().toLowerCase();
}

function isAllowedExtension(docType: DocTypeValue, ext: string): boolean {
  if (docType === 'PROGRESS_REPORT') {
    return ['doc', 'docx', 'pdf'].includes(ext);
  }
  return ['ppt', 'pptx', 'pdf'].includes(ext);
}

async function getSemesterOpenMap(): Promise<Record<6 | 7 | 8, boolean>> {
  const windows = await prisma.markWindow.findMany({
    where: { semester: { in: [6, 7, 8] } },
    select: { semester: true, isLocked: true },
  });

  return {
    6: windows.some((w) => w.semester === 6 && !w.isLocked),
    7: windows.some((w) => w.semester === 7 && !w.isLocked),
    8: windows.some((w) => w.semester === 8 && !w.isLocked),
  };
}

// ----------------------------------------------------
// 1. Student: Get Submissions & Semester Lock Status
// ----------------------------------------------------
export async function getStudentSubmissionsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'STUDENT') {
    return { error: 'Unauthorized: Student access required.' };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      include: {
        groups: {
          include: {
            group: {
              include: {
                topic: { select: { code: true, title: true } },
                supervisor: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    });

    const activeMembership = student?.groups?.find((gm) => !gm.group.isArchived) || student?.groups?.[0];
    if (!activeMembership) {
      return { error: 'No allotted project group found for your student account.' };
    }

    const group = activeMembership.group;
    const [openSemesters, submissions] = await Promise.all([
      getSemesterOpenMap(),
      prisma.semesterSubmission.findMany({
        where: { groupId: group.id },
        orderBy: [{ semester: 'asc' }, { docType: 'asc' }],
      }),
    ]);

    return {
      success: true,
      group: {
        id: group.id,
        number: group.number,
        batchId: group.batchId,
        topicCode: group.topic?.code || 'N/A',
        topicTitle: group.topic?.title || `Group ${group.number}`,
        supervisorName: group.supervisor?.name || 'Unassigned',
      },
      openSemesters,
      submissions: submissions.map((s) => ({
        ...s,
        uploadedAt: s.uploadedAt.toISOString(),
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      })),
    };
  } catch (err) {
    return { error: `Failed to load submissions: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Student: Upload / Replace Semester Document
// ----------------------------------------------------
export async function uploadStudentSubmissionAction(input: z.infer<typeof UploadSchema>) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'STUDENT') {
    return { error: 'Unauthorized: Student access required.' };
  }

  const parsed = UploadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid submission payload.' };
  }

  const { semester, docType, fileName, mimeType, fileSize, dataUrlOrBase64 } = parsed.data;
  const ext = extractExtension(fileName);

  if (!isAllowedExtension(docType, ext)) {
    return {
      error:
        docType === 'PROGRESS_REPORT'
          ? 'Progress Report must be a .doc, .docx, or .pdf file.'
          : 'Presentation must be a .ppt, .pptx, or .pdf file.',
    };
  }

  try {
    // 1. Verify semester is unlocked by Admin (MarkWindow.isLocked === false)
    const openMap = await getSemesterOpenMap();
    if (!openMap[semester]) {
      return {
        error: `Semester ${semester} submissions are currently locked. They will open automatically once the Admin unlocks Semester ${semester} marks.`,
      };
    }

    // 2. Resolve student's group
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      include: {
        groups: {
          include: { group: true },
        },
      },
    });
    const activeMembership = student?.groups?.find((gm) => !gm.group.isArchived) || student?.groups?.[0];
    if (!activeMembership) {
      return { error: 'No allotted project group found for your account.' };
    }
    const group = activeMembership.group;

    // 3. Prevent overwriting an already-approved (COMPLETED) submission
    const existing = await prisma.semesterSubmission.findUnique({
      where: {
        groupId_semester_docType: {
          groupId: group.id,
          semester,
          docType,
        },
      },
    });

    if (existing?.status === 'COMPLETED') {
      return {
        error:
          'This submission has already been marked Completed by your supervisor and cannot be replaced.',
      };
    }

    // 4. Upload to Google Drive (single canonical submission record in DB replaces prior one)
    const driveRes = await uploadFileToGoogleDrive({
      fileName,
      size: fileSize,
      mimeType,
      dataUrlOrBase64,
      folderName: 'ECE_Capstone_Submissions',
      subFolder: `Batch_${group.batchId}_Sem${semester}_Group_${group.number}`,
      uploaderEmail: session.user.email || undefined,
    });

    if (driveRes.error) {
      return { error: `Google Drive upload failed: ${driveRes.error}` };
    }

    const uploaderName =
      (session.user as { name?: string }).name || student?.name || session.user.email || 'Student';

    const saved = await prisma.semesterSubmission.upsert({
      where: {
        groupId_semester_docType: {
          groupId: group.id,
          semester,
          docType,
        },
      },
      update: {
        fileName,
        fileExtension: ext,
        mimeType,
        fileSize,
        driveFileId: driveRes.fileId || null,
        driveViewLink: driveRes.viewUrl,
        driveDownloadLink: driveRes.downloadUrl || null,
        hostedOn: driveRes.hostedOn,
        status: 'SUBMITTED',
        uploadedByUserId: session.user.id,
        uploadedByName: uploaderName,
        uploadedAt: new Date(),
        reviewedAt: null,
      },
      create: {
        groupId: group.id,
        semester,
        docType,
        fileName,
        fileExtension: ext,
        mimeType,
        fileSize,
        driveFileId: driveRes.fileId || null,
        driveViewLink: driveRes.viewUrl,
        driveDownloadLink: driveRes.downloadUrl || null,
        hostedOn: driveRes.hostedOn,
        status: 'SUBMITTED',
        uploadedByUserId: session.user.id,
        uploadedByName: uploaderName,
        uploadedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'STUDENT_SUBMISSION_UPLOADED',
        entity: 'SemesterSubmission',
        entityId: saved.id,
        payload: {
          groupId: group.id,
          semester,
          docType,
          fileName,
          replacedPrevious: Boolean(existing),
        },
      },
    });

    revalidatePath('/student/submission');
    revalidatePath('/faculty/submission');
    revalidatePath('/admin/submission');

    return {
      success: true,
      submission: {
        ...saved,
        uploadedAt: saved.uploadedAt.toISOString(),
      },
      message: existing
        ? `Replaced previous ${docType === 'PROGRESS_REPORT' ? 'Progress Report' : 'Presentation'} with "${fileName}" as the group's latest submission.`
        : `Uploaded "${fileName}" successfully for Semester ${semester}.`,
    };
  } catch (err) {
    return { error: `Submission upload failed: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2b. Student: Delete Own Group's Submission (Before Supervisor Marks Completed)
// ----------------------------------------------------
export async function deleteStudentSubmissionAction(submissionId: string) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'STUDENT') {
    return { error: 'Unauthorized: Only student members of the group can delete a submission.' };
  }

  try {
    const existing = await prisma.semesterSubmission.findUnique({
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

    if (!existing) {
      return { error: 'Submission not found.' };
    }

    const isGroupMember = existing.group.members.some(
      (m) => m.student.userId === session.user!.id
    );
    if (!isGroupMember) {
      return { error: 'Forbidden: You can only delete submissions belonging to your own group.' };
    }

    if (existing.status === 'COMPLETED') {
      return {
        error: 'Cannot delete: This submission has already been marked Completed by your supervisor.',
      };
    }

    await prisma.semesterSubmission.delete({
      where: { id: submissionId },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'STUDENT_SUBMISSION_DELETED',
        entity: 'SemesterSubmission',
        entityId: submissionId,
        payload: {
          groupId: existing.groupId,
          semester: existing.semester,
          docType: existing.docType,
          fileName: existing.fileName,
        },
      },
    });

    revalidatePath('/student/submission');
    revalidatePath('/faculty/submission');
    revalidatePath('/admin/submission');

    return {
      success: true,
      message: `Deleted "${existing.fileName}" from Semester ${existing.semester}.`,
    };
  } catch (err) {
    return { error: `Failed to delete submission: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Faculty / Supervisor: Get Group Submissions (Strict Supervisor Isolation)
// ----------------------------------------------------
export async function getFacultySubmissionsAction() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user?.id || (role !== 'FACULTY' && role !== 'ADMIN')) {
    return { error: 'Unauthorized: Supervisor access required.' };
  }

  try {
    const groups = await prisma.group.findMany({
      where: { supervisorId: session.user.id, isArchived: false },
      include: {
        topic: { select: { code: true, title: true } },
        members: {
          include: {
            student: { select: { name: true, roll: true, universityRoll: true } },
          },
        },
        submissions: {
          orderBy: [{ semester: 'asc' }, { docType: 'asc' }],
        },
      },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    return {
      success: true,
      groups: groups.map((g) => ({
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topicCode: g.topic?.code || 'N/A',
        topicTitle: g.topic?.title || `Group ${g.number}`,
        students: g.members.map((m) => ({
          name: m.student.name,
          roll: m.student.roll,
          universityRoll: m.student.universityRoll || null,
        })),
        submissions: g.submissions.map((s) => ({
          ...s,
          uploadedAt: s.uploadedAt.toISOString(),
          reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
          completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        })),
      })),
    };
  } catch (err) {
    return { error: `Failed to load supervisor submissions: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Faculty / Supervisor: Review & Return or Mark Completed
// ----------------------------------------------------
export async function reviewFacultySubmissionAction(
  submissionId: string,
  decision: 'REVISION_REQUESTED' | 'COMPLETED',
  comment?: string
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user?.id || (role !== 'FACULTY' && role !== 'ADMIN')) {
    return { error: 'Unauthorized: Supervisor access required.' };
  }

  if (decision === 'REVISION_REQUESTED' && (!comment || comment.trim().length < 2)) {
    return { error: 'Please provide review comments before returning the document for revision.' };
  }

  try {
    const existing = await prisma.semesterSubmission.findUnique({
      where: { id: submissionId },
      include: {
        group: { select: { supervisorId: true, number: true } },
      },
    });

    if (!existing) {
      return { error: 'Submission not found.' };
    }

    if (existing.group.supervisorId !== session.user.id) {
      return { error: 'Forbidden: You can only review submissions for your own allotted groups.' };
    }

    const updated = await prisma.semesterSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision,
        supervisorComment: comment?.trim() || existing.supervisorComment || null,
        reviewedAt: new Date(),
        completedAt: decision === 'COMPLETED' ? new Date() : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FACULTY_SUBMISSION_REVIEWED',
        entity: 'SemesterSubmission',
        entityId: updated.id,
        payload: {
          groupId: existing.groupId,
          semester: existing.semester,
          docType: existing.docType,
          decision,
        },
      },
    });

    revalidatePath('/faculty/submission');
    revalidatePath('/student/submission');
    revalidatePath('/admin/submission');

    return {
      success: true,
      submission: {
        ...updated,
        uploadedAt: updated.uploadedAt.toISOString(),
      },
      message:
        decision === 'COMPLETED'
          ? `Marked "${existing.fileName}" as Completed. Thumbnail link is now visible to Admins.`
          : `Returned "${existing.fileName}" to Group ${existing.group.number} with revision comments.`,
    };
  } catch (err) {
    return { error: `Failed to review submission: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Admin: List Completed Submissions (Thumbnail Links Only, No Copies)
// ----------------------------------------------------
export async function getAdminCompletedSubmissionsAction(params?: {
  sortBy?: 'group' | 'supervisor' | 'extension';
  extensionFilter?: 'ALL' | 'DOC' | 'PDF' | 'PPT';
  semesterFilter?: number | 'ALL';
}) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can view completed submissions.' };
  }

  const {
    sortBy = 'group',
    extensionFilter = 'ALL',
    semesterFilter = 'ALL',
  } = params || {};

  try {
    const where: any = {
      status: 'COMPLETED',
    };

    if (semesterFilter && semesterFilter !== 'ALL') {
      where.semester = Number(semesterFilter);
    }

    if (extensionFilter === 'DOC') {
      where.fileExtension = { in: ['doc', 'docx'] };
    } else if (extensionFilter === 'PDF') {
      where.fileExtension = 'pdf';
    } else if (extensionFilter === 'PPT') {
      where.fileExtension = { in: ['ppt', 'pptx'] };
    }

    const items = await prisma.semesterSubmission.findMany({
      where,
      include: {
        group: {
          include: {
            supervisor: { select: { id: true, name: true, email: true } },
            topic: { select: { code: true, title: true } },
          },
        },
      },
    });

    const mapped = items.map((s) => ({
      id: s.id,
      semester: s.semester,
      docType: s.docType,
      fileName: s.fileName,
      fileExtension: s.fileExtension,
      mimeType: s.mimeType,
      fileSize: s.fileSize,
      driveFileId: s.driveFileId,
      driveViewLink: s.driveViewLink,
      driveDownloadLink: s.driveDownloadLink,
      hostedOn: s.hostedOn,
      supervisorComment: s.supervisorComment,
      uploadedByName: s.uploadedByName,
      completedAt: s.completedAt ? s.completedAt.toISOString() : s.updatedAt.toISOString(),
      groupId: s.groupId,
      batchId: s.group.batchId,
      groupNumber: s.group.number,
      topicCode: s.group.topic?.code || 'N/A',
      topicTitle: s.group.topic?.title || `Group ${s.group.number}`,
      supervisorName: s.group.supervisor?.name || 'Unassigned',
      supervisorEmail: s.group.supervisor?.email || '',
    }));

    mapped.sort((a, b) => {
      if (sortBy === 'supervisor') {
        const cmp = a.supervisorName.localeCompare(b.supervisorName);
        if (cmp !== 0) return cmp;
        return a.groupNumber - b.groupNumber;
      }
      if (sortBy === 'extension') {
        const cmp = a.fileExtension.localeCompare(b.fileExtension);
        if (cmp !== 0) return cmp;
        return a.groupNumber - b.groupNumber;
      }
      // Default: groupwise
      const batchCmp = b.batchId.localeCompare(a.batchId);
      if (batchCmp !== 0) return batchCmp;
      if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
      return a.semester - b.semester;
    });

    return {
      success: true,
      submissions: mapped,
    };
  } catch (err) {
    return { error: `Failed to load completed submissions: ${(err as Error).message}` };
  }
}
