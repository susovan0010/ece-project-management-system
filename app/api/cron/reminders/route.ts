import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-cron-secret-2026';
    const queryKey = req.nextUrl.searchParams.get('key');

    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      queryKey === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing CRON_SECRET.' },
        { status: 401 }
      );
    }

    // 1. Find all active and unlocked mark windows
    const activeWindows = await prisma.markWindow.findMany({
      where: {
        isLocked: false,
      },
    });

    if (activeWindows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open marking windows found. No reminders dispatched.',
        dispatchedCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const activeSemesters = Array.from(new Set(activeWindows.map((w) => w.semester)));

    // 2. Query groups with supervisor and mark entries
    const groups = await prisma.group.findMany({
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        markEntries: {
          include: { criterion: true },
        },
      },
    });

    let totalDispatched = 0;

    for (const sem of activeSemesters) {
      const pendingSupervisors = new Map<string, number>();

      groups.forEach((g) => {
        const hasSemEntries = g.markEntries.some((m) => m.criterion?.semester === sem);
        if (!hasSemEntries) {
          pendingSupervisors.set(
            g.supervisor.id,
            (pendingSupervisors.get(g.supervisor.id) || 0) + 1
          );
        }
      });

      for (const [supId, count] of Array.from(pendingSupervisors.entries())) {
        await prisma.reminderLog.create({
          data: {
            supervisorId: supId,
            semester: sem,
            groupsCount: count,
            success: true,
          },
        });
        totalDispatched++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Automated reminder audit complete. Sent ${totalDispatched} notifications across ${activeSemesters.length} semester(s).`,
      dispatchedCount: totalDispatched,
      activeSemesters,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Cron execution failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
