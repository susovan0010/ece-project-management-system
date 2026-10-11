import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let dbStatus = 'unconfigured';
    if (process.env.DATABASE_URL) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'ok';
      } catch {
        dbStatus = 'disconnected';
      }
    }

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'ECE Capstone Project Management System',
        department: 'Electronics and Communication Engineering (HITK)',
        database: dbStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
