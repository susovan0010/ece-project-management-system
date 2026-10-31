'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { TopicStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export interface RawAllocationRow {
  groupNumber: number;
  batchId: string;
  topicCode: string;
  supervisorEmail: string;
  studentRoll: string;
  studentName: string;
  studentEmail?: string;
  studentPhone?: string;
}

export interface ValidationReport {
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  missingTopics: string[];
  missingSupervisors: string[];
  invalidRows: Array<{
    rowNumber: number;
    error: string;
    data: RawAllocationRow;
  }>;
}

// ----------------------------------------------------
// 1. Pre-flight Foreign Key Validation
// ----------------------------------------------------
export async function validateAllocationDataAction(rows: RawAllocationRow[]): Promise<ValidationReport | { error: string }> {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can validate allocations.' };
  }

  if (!rows || rows.length === 0) {
    return {
      totalRows: 0,
      validRowsCount: 0,
      invalidRowsCount: 0,
      missingTopics: [],
      missingSupervisors: [],
      invalidRows: [],
    };
  }

  try {
    // Collect unique topic codes and supervisor emails
    const topicCodes = Array.from(new Set(rows.map((r) => r.topicCode?.trim().toUpperCase()).filter(Boolean)));
    const supervisorEmails = Array.from(new Set(rows.map((r) => r.supervisorEmail?.trim().toLowerCase()).filter(Boolean)));

    // Fetch existing records from DB
    const [existingTopics, existingSupervisors] = await Promise.all([
      prisma.topic.findMany({
        where: { code: { in: topicCodes } },
        select: { code: true },
      }),
      prisma.user.findMany({
        where: {
          email: { in: supervisorEmails },
          active: true,
        },
        select: { email: true },
      }),
    ]);

    const validTopicSet = new Set(existingTopics.map((t) => t.code.toUpperCase()));
    const validSupervisorSet = new Set(existingSupervisors.map((s) => s.email.toLowerCase()));

    const missingTopics: string[] = [];
    const missingSupervisors: string[] = [];
    const invalidRows: ValidationReport['invalidRows'] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Accounting for 1-indexed row + header
      const tCode = row.topicCode?.trim().toUpperCase();
      const sEmail = row.supervisorEmail?.trim().toLowerCase();

      const errors: string[] = [];
      if (!row.groupNumber || row.groupNumber < 1) {
        errors.push('Invalid Group Number.');
      }
      if (!row.batchId?.trim()) {
        errors.push('Batch ID is missing.');
      }
      if (!row.studentRoll?.trim() || !row.studentName?.trim()) {
        errors.push('Student Roll or Name is missing.');
      }
      if (!validTopicSet.has(tCode)) {
        errors.push(`Topic Code "${tCode}" does not exist in Topic Bank.`);
        if (!missingTopics.includes(tCode)) missingTopics.push(tCode);
      }
      if (!validSupervisorSet.has(sEmail)) {
        errors.push(`Supervisor "${sEmail}" is not registered as an active faculty member.`);
        if (!missingSupervisors.includes(sEmail)) missingSupervisors.push(sEmail);
      }

      if (errors.length > 0) {
        invalidRows.push({
          rowNumber: rowNum,
          error: errors.join('; '),
          data: row,
        });
      }
    });

    const validRowsCount = rows.length - invalidRows.length;

    return {
      totalRows: rows.length,
      validRowsCount,
      invalidRowsCount: invalidRows.length,
      missingTopics,
      missingSupervisors,
      invalidRows,
    };
  } catch (err) {
    return { error: `Validation failed: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Chunked Allocation Ingestion Action (Max 100 rows per call)
// ----------------------------------------------------
export async function commitAllocationChunkAction(chunk: RawAllocationRow[]) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can commit allocations.' };
  }

  const userId = session.user.id;

  if (!chunk || chunk.length === 0) {
    return { count: 0 };
  }

  // Cap chunk size to 100
  const batchRows = chunk.slice(0, 100);

  try {
    let committedRows = 0;

    // Process chunk in a transaction
    await prisma.$transaction(
      async (tx) => {
        // Collect batches, topics, and supervisors
        for (const row of batchRows) {
          const batchId = row.batchId.trim();
          const topicCode = row.topicCode.trim().toUpperCase();
          const supervisorEmail = row.supervisorEmail.trim().toLowerCase();
          const studentRoll = row.studentRoll.trim();
          const studentName = row.studentName.trim();

          // 1. Ensure Batch exists
          await tx.batch.upsert({
            where: { id: batchId },
            update: { active: true },
            create: { id: batchId, active: true },
          });

          // 2. Find Topic & Supervisor
          const topic = await tx.topic.findUnique({ where: { code: topicCode } });
          const supervisor = await tx.user.findUnique({ where: { email: supervisorEmail } });

          if (!topic || !supervisor) {
            continue; // Skip invalid records during chunking
          }

          // 3. Upsert Student
          const student = await tx.student.upsert({
            where: { roll: studentRoll },
            update: {
              name: studentName,
              email: row.studentEmail?.trim() || null,
              phone: row.studentPhone?.trim() || null,
            },
            create: {
              roll: studentRoll,
              name: studentName,
              email: row.studentEmail?.trim() || null,
              phone: row.studentPhone?.trim() || null,
            },
          });

          // 4. Upsert Group (unique by batchId + number)
          const group = await tx.group.upsert({
            where: {
              batchId_number: {
                batchId,
                number: Number(row.groupNumber),
              },
            },
            update: {
              topicId: topic.id,
              supervisorId: supervisor.id,
            },
            create: {
              number: Number(row.groupNumber),
              batchId,
              topicId: topic.id,
              supervisorId: supervisor.id,
            },
          });

          // 5. Connect Student to Group via GroupMember
          await tx.groupMember.upsert({
            where: {
              groupId_studentId: {
                groupId: group.id,
                studentId: student.id,
              },
            },
            update: {},
            create: {
              groupId: group.id,
              studentId: student.id,
            },
          });

          // 6. Mark Topic as ALLOTTED
          await tx.topic.update({
            where: { id: topic.id },
            data: { status: TopicStatus.ALLOTTED },
          });

          committedRows++;
        }

        // Log to AuditLog
        await tx.auditLog.create({
          data: {
            userId,
            action: 'COMMIT_ALLOCATION_CHUNK',
            entity: 'Group',
            entityId: 'MULTIPLE',
            payload: {
              rowsCount: committedRows,
            },
          },
        });
      },
      { timeout: 15000 }
    );

    revalidatePath('/admin/allocation');
    revalidatePath('/faculty/groups');
    return { success: true, count: committedRows };
  } catch (err) {
    return { error: `Failed to commit allocation chunk: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Get Allocation Summary Metrics
// ----------------------------------------------------
export async function getAllocationSummaryAction() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized.' };
  }

  try {
    const [totalGroups, totalBatches, totalStudents, batchesList] = await Promise.all([
      prisma.group.count(),
      prisma.batch.count(),
      prisma.student.count(),
      prisma.batch.findMany({
        orderBy: { id: 'desc' },
        include: {
          _count: {
            select: { groups: true },
          },
        },
      }),
    ]);

    return {
      totalGroups,
      totalBatches,
      totalStudents,
      batches: batchesList,
    };
  } catch (err) {
    return { error: `Failed to load allocation summary: ${(err as Error).message}` };
  }
}
