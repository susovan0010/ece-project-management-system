import { NextRequest, NextResponse } from 'next/server';
import { processDueScheduledCommunicationsAction } from '@/app/actions/communication-schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest | Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-cron-secret-2026';
    const url = (req as NextRequest).nextUrl || new URL(req.url);
    const queryKey = url.searchParams.get('key');

    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      queryKey === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing CRON_SECRET.' },
        { status: 401 }
      );
    }

    const result = await processDueScheduledCommunicationsAction();

    return NextResponse.json({
      success: result.success,
      dispatchedCount: result.dispatchedCount,
      message: result.message || (result.error ? `Error: ${result.error}` : 'Processed.'),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Cron execution failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest | Request) {
  return GET(req);
}
