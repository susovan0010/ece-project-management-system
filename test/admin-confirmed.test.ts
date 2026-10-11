// ========================================================
// ECE Capstone Project Management System - Admin Confirmed & Exports Tests
// Verifies CSV formula sanitization, supervisor attribution,
// role-based access control, and student PII omission in export schemas.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  getAdminConfirmedTopicsAction,
  exportStudentTopicsDataAction,
  updateTopicStatusAction,
} from '../app/actions/admin-confirmed';
import { sanitizeCellForCsv } from '../lib/csv-sanitize';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Admin Confirmed Topics: Security & CSV Injection Prevention', () => {
  it('escapes leading dangerous formula characters (=, +, -, @) with a leading single quote', () => {
    expect(sanitizeCellForCsv('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCellForCsv('+cmd|/C calc')).toBe("'+cmd|/C calc");
    expect(sanitizeCellForCsv('-123+cmd')).toBe("'-123+cmd");
    expect(sanitizeCellForCsv('@SUM(1,2)')).toBe("'@SUM(1,2)");
  });

  it('preserves normal safe strings without modification', () => {
    expect(sanitizeCellForCsv('SIH26001')).toBe('SIH26001');
    expect(sanitizeCellForCsv('Design of 5G Microstrip Patch Antenna')).toBe(
      'Design of 5G Microstrip Patch Antenna'
    );
    expect(sanitizeCellForCsv('')).toBe('');
    expect(sanitizeCellForCsv(null)).toBe('');
  });
});

describe('Admin Confirmed Topics: Role Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects FACULTY user from accessing admin confirmed topics ledger', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'prof@heritageit.edu' },
    } as any);

    const res = await getAdminConfirmedTopicsAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects FACULTY user from generating student catalog export', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'prof@heritageit.edu' },
    } as any);

    const res = await exportStudentTopicsDataAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });
});

describe('Admin Confirmed Topics: Export Attribution & Zero-PII Compliance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('includes supervisor attribution (Decision 3) and omits any student contact data (Rule 2 & Decision 5)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    const mockTopics = [
      {
        id: 't-1',
        code: 'SIH26001',
        title: 'Smart Solar Telemetry',
        category: 'Hardware',
        source: 'SIH',
        domain: 'IoT & Renewable',
        organization: 'MNRE',
        description: 'Sanitized abstract text under 500 words.',
        proposer: {
          name: 'Dr. Soumyo Chatterjee',
          email: 'soumyo@heritageit.edu',
        },
        sdgs: [{ sdgId: 7, target: '7.2', sdg: { title: 'Affordable and Clean Energy' } }],
        attributes: [
          { level: 3, attribute: { code: 'WP1', kind: 'WP', title: 'Knowledge Depth' } },
        ],
      },
    ];

    vi.spyOn(prisma.topic, 'findMany').mockResolvedValue(mockTopics as any);

    const res = await exportStudentTopicsDataAction();
    expect(res.error).toBeUndefined();
    expect(res.rows?.length).toBe(1);

    const row = res.rows![0];
    // Decision 3: Supervisor Name displayed
    expect(row.supervisor).toBe('Dr. Soumyo Chatterjee');
    expect(row.code).toBe('SIH26001');

    // Rule 2 & Decision 5: No student rolls, phone numbers, or student emails
    const keys = Object.keys(row);
    expect(keys).not.toContain('studentName');
    expect(keys).not.toContain('roll');
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('studentEmail');
  });
});
