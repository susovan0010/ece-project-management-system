'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function getAuditLogsAction(actionFilter?: string) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Only Project Committee Admins can access system audit logs.' };
  }

  try {
    const where: any = {};
    if (actionFilter && actionFilter !== 'ALL') {
      where.action = actionFilter;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const uniqueActions = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
    });

    return {
      logs,
      actions: uniqueActions.map((a) => a.action),
    };
  } catch (err) {
    return { error: `Failed to fetch audit logs: ${(err as Error).message}` };
  }
}
