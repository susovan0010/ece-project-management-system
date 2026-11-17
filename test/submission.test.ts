import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStudentSubmissionsAction,
  uploadStudentSubmissionAction,
  deleteStudentSubmissionAction,
  getFacultySubmissionsAction,
  reviewFacultySubmissionAction,
  getAdminCompletedSubmissionsAction,
  requestAdminSubmissionDeleteAction,
  respondToAdminSubmissionDeleteAction,
  adminDeleteSubmissionAction,
} from '@/app/actions/submission';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/google-drive', () => ({
  uploadFileToGoogleDrive: vi.fn().mockResolvedValue({
    success: true,
    fileId: 'drive-file-999',
    viewUrl: 'https://drive.google.com/file/d/drive-file-999/view',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=drive-file-999',
    hostedOn: 'GOOGLE_DRIVE',
  }),
  deleteFileFromGoogleDrive: vi.fn().mockResolvedValue(true),
}));

const db = {
  markWindows: [] as any[],
  submissions: [] as any[],
  groups: [] as any[],
  students: [] as any[],
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    markWindow: {
      findMany: vi.fn().mockImplementation(() => db.markWindows),
    },
    student: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return db.students.find((s) => s.userId === where.userId) || null;
      }),
    },
    group: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return db.groups
          .filter((g) => g.supervisorId === where.supervisorId)
          .map((g) => ({
            ...g,
            submissions: db.submissions.filter((s) => s.groupId === g.id),
          }));
      }),
    },
    semesterSubmission: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return db.submissions
          .filter((s) => {
            if (where?.groupId && s.groupId !== where.groupId) return false;
            if (where?.status && s.status !== where.status) return false;
            if (where?.semester && s.semester !== where.semester) return false;
            if (where?.fileExtension?.in && !where.fileExtension.in.includes(s.fileExtension)) return false;
            if (typeof where?.fileExtension === 'string' && s.fileExtension !== where.fileExtension) return false;
            return true;
          })
          .map((s) => ({
            ...s,
            group: db.groups.find((g) => g.id === s.groupId),
          }));
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.id) {
          const found = db.submissions.find((s) => s.id === where.id);
          if (!found) return null;
          return { ...found, group: db.groups.find((g) => g.id === found.groupId) };
        }
        if (where?.groupId_semester_docType) {
          const k = where.groupId_semester_docType;
          return (
            db.submissions.find(
              (s) => s.groupId === k.groupId && s.semester === k.semester && s.docType === k.docType
            ) || null
          );
        }
        return null;
      }),
      upsert: vi.fn().mockImplementation(({ where, update, create }: any) => {
        const k = where.groupId_semester_docType;
        const idx = db.submissions.findIndex(
          (s) => s.groupId === k.groupId && s.semester === k.semester && s.docType === k.docType
        );
        if (idx >= 0) {
          db.submissions[idx] = { ...db.submissions[idx], ...update, updatedAt: new Date() };
          return db.submissions[idx];
        }
        const created = {
          id: `sub-${db.submissions.length + 1}`,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        db.submissions.push(created);
        return created;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const item = db.submissions.find((s) => s.id === where.id);
        if (item) Object.assign(item, data, { updatedAt: new Date() });
        return item;
      }),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        db.submissions = db.submissions.filter((s) => s.id !== where.id);
        return { id: where.id };
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('Phase 75: Student Semester Submissions Workflow', () => {
  beforeEach(async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValue({
      user: { id: 'stu-u1', role: 'STUDENT', name: 'Aarav', email: 'aarav@hitk.edu' },
    });

    db.markWindows = [
      { semester: 6, rubric: 'A', isLocked: true },
      { semester: 7, rubric: 'C', isLocked: true },
      { semester: 8, rubric: 'E', isLocked: true },
    ];
    db.groups = [
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        supervisorId: 'fac-1',
        isArchived: false,
        topic: { code: 'ECE-01', title: 'IoT Telemetry' },
        supervisor: { id: 'fac-1', name: 'Prof. Roy', email: 'roy@hitk.edu' },
        members: [{ student: { userId: 'stu-u1', name: 'Aarav', roll: '2355001', universityRoll: '12600323001' } }],
      },
    ];
    db.students = [
      {
        id: 'stu-1',
        userId: 'stu-u1',
        name: 'Aarav',
        groups: [{ group: db.groups[0] }],
      },
    ];
    db.submissions = [];
  });

  it('blocks student submission when semester marks are locked, and allows once Admin unlocks', async () => {
    const lockedRes = await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PROGRESS_REPORT',
      fileName: 'report_v1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 1024,
      dataUrlOrBase64: 'data:application/octet-stream;base64,QQ==',
    });
    expect(lockedRes.error).toContain('currently locked');

    // Admin unlocks Sem 6 marks
    db.markWindows[0].isLocked = false;

    const badExt = await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PROGRESS_REPORT',
      fileName: 'slides.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 1024,
      dataUrlOrBase64: 'data:application/octet-stream;base64,QQ==',
    });
    expect(badExt.error).toContain('.doc, .docx, or .pdf');

    const ok1 = await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PROGRESS_REPORT',
      fileName: 'report_v1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 1024,
      dataUrlOrBase64: 'data:application/octet-stream;base64,QQ==',
    });
    expect(ok1.success).toBe(true);
    expect(db.submissions).toHaveLength(1);

    // Replace with different filename -> still 1 record in DB (replaces previous)
    const ok2 = await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PROGRESS_REPORT',
      fileName: 'final_report_revised.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      dataUrlOrBase64: 'data:application/pdf;base64,QQ==',
    });
    expect(ok2.success).toBe(true);
    expect(db.submissions).toHaveLength(1);
    expect(db.submissions[0].fileName).toBe('final_report_revised.pdf');
    expect(db.submissions[0].fileExtension).toBe('pdf');
  });

  it('enforces supervisor-only review, revision comments, completion lock, and Admin thumbnail sorting', async () => {
    db.markWindows[0].isLocked = false;
    await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PRESENTATION',
      fileName: 'deck_v1.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 4096,
      dataUrlOrBase64: 'data:application/octet-stream;base64,QQ==',
    });

    const { auth } = await import('@/auth');
    // Another supervisor cannot review
    (auth as any).mockResolvedValue({ user: { id: 'fac-other', role: 'FACULTY' } });
    const forbidden = await reviewFacultySubmissionAction(db.submissions[0].id, 'COMPLETED');
    expect(forbidden.error).toContain('Forbidden');

    // Assigned supervisor returns for revision
    (auth as any).mockResolvedValue({ user: { id: 'fac-1', role: 'FACULTY' } });
    const facList = await getFacultySubmissionsAction();
    expect(facList.groups).toHaveLength(1);

    const revRes = await reviewFacultySubmissionAction(
      db.submissions[0].id,
      'REVISION_REQUESTED',
      'Add block diagram on slide 4'
    );
    expect(revRes.success).toBe(true);
    expect(db.submissions[0].status).toBe('REVISION_REQUESTED');

    // Supervisor marks Completed
    const compRes = await reviewFacultySubmissionAction(db.submissions[0].id, 'COMPLETED', 'Looks good');
    expect(compRes.success).toBe(true);
    expect(db.submissions[0].status).toBe('COMPLETED');

    // Student cannot overwrite after Completed
    (auth as any).mockResolvedValue({ user: { id: 'stu-u1', role: 'STUDENT', name: 'Aarav' } });
    const blockedOverwrite = await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PRESENTATION',
      fileName: 'deck_v2.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 4096,
      dataUrlOrBase64: 'data:application/octet-stream;base64,QQ==',
    });
    expect(blockedOverwrite.error).toContain('already been marked Completed');

    // Admin sees thumbnail link with extension & supervisor sorting
    (auth as any).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const adminRes = await getAdminCompletedSubmissionsAction({
      sortBy: 'extension',
      extensionFilter: 'PPT',
      semesterFilter: 6,
    });
    expect(adminRes.success).toBe(true);
    expect(adminRes.submissions).toHaveLength(1);
    expect(adminRes.submissions![0].driveViewLink).toContain('drive.google.com');

    // Supervisor cannot delete submission
    (auth as any).mockResolvedValue({ user: { id: 'fac-1', role: 'FACULTY' } });
    const facDel = await deleteStudentSubmissionAction(db.submissions[0].id);
    expect(facDel.error).toContain('Only student members');

    // Student cannot delete once Completed
    (auth as any).mockResolvedValue({ user: { id: 'stu-u1', role: 'STUDENT' } });
    const stuDelCompleted = await deleteStudentSubmissionAction(db.submissions[0].id);
    expect(stuDelCompleted.error).toContain('already been marked Completed');

    // Student CAN delete before Completed
    db.submissions[0].status = 'SUBMITTED';
    const stuDelOk = await deleteStudentSubmissionAction(db.submissions[0].id);
    expect(stuDelOk.success).toBe(true);
    expect(db.submissions).toHaveLength(0);
  });

  it('allows Admin to delete a submission only after the group supervisor grants permission', async () => {
    db.markWindows[0].isLocked = false;
    await uploadStudentSubmissionAction({
      semester: 6,
      docType: 'PROGRESS_REPORT',
      fileName: 'final_doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      dataUrlOrBase64: 'data:application/pdf;base64,QQ==',
    });

    const subId = db.submissions[0].id;
    const { auth } = await import('@/auth');

    // 1. Admin cannot delete without supervisor permission
    (auth as any).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const blocked = await adminDeleteSubmissionAction(subId);
    expect(blocked.error).toContain('Supervisor permission is required');

    // 2. Admin requests deletion
    const reqRes = await requestAdminSubmissionDeleteAction(subId);
    expect(reqRes.success).toBe(true);
    expect(db.submissions[0].adminDeleteRequested).toBe(true);

    // 3. Wrong supervisor cannot approve
    (auth as any).mockResolvedValue({ user: { id: 'fac-other', role: 'FACULTY' } });
    const wrongSup = await respondToAdminSubmissionDeleteAction(subId, true);
    expect(wrongSup.error).toContain('Forbidden');

    // 4. Assigned supervisor approves
    (auth as any).mockResolvedValue({ user: { id: 'fac-1', role: 'FACULTY' } });
    const approveRes = await respondToAdminSubmissionDeleteAction(subId, true);
    expect(approveRes.success).toBe(true);
    expect(db.submissions[0].adminDeleteApproved).toBe(true);

    // 5. Admin now deletes successfully
    (auth as any).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const delRes = await adminDeleteSubmissionAction(subId);
    expect(delRes.success).toBe(true);
    expect(db.submissions).toHaveLength(0);
  });
});
