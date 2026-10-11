import { prisma } from './prisma';

export async function recordAuditLog(params: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  payload?: any;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        payload: params.payload ?? undefined,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
    return null;
  }
}
