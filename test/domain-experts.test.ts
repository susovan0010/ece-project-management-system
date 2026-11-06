// ========================================================
// ECE Capstone Project Management System - Domain Experts Mapping Unit Tests
// Tests role protection, aggregation across categories, and statistics.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { getDomainExpertsMappingAction } from '../app/actions/domain-experts';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Domain Experts Mapping Server Action', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getDomainExpertsMappingAction();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('Unauthorized');
    }
  });

  it('rejects non-admin roles (FACULTY)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY' },
    } as any);

    const res = await getDomainExpertsMappingAction();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('Unauthorized');
    }
  });

  it('returns structured categorized domain mappings for ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      {
        id: 'fac-1',
        name: 'Dr. Debasish Saha',
        email: 'debasish@hitk.edu',
        role: 'FACULTY',
        domainExpertise: ['5G Communication', 'Antenna', 'AI and ML'],
        mustChangePassword: false,
        _count: { topics: 3, groups: 2 },
      },
      {
        id: 'fac-2',
        name: 'Prof. Ananya Chattopadhyay',
        email: 'ananya@heritageit.edu',
        role: 'FACULTY',
        domainExpertise: ['Analog VLSI', 'Digital VLSI'],
        mustChangePassword: false,
        _count: { topics: 2, groups: 1 },
      },
      {
        id: 'admin-1',
        name: 'Dr. Susovan Mandal',
        email: 'ece.project.committee@heritageit.edu',
        role: 'ADMIN',
        domainExpertise: ['AI and ML', 'Python', '5G Communication'],
        mustChangePassword: false,
        _count: { topics: 0, groups: 0 },
      },
    ] as any);

    const res = await getDomainExpertsMappingAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.stats.totalFaculty).toBe(3);
      expect(res.data.stats.completedProfiles).toBe(3);
      expect(res.data.stats.pendingProfiles).toBe(0);
      expect(res.data.stats.coveredDomainsCount).toBeGreaterThan(0);
      expect(res.data.categories.length).toBe(5);

      // Verify domain '5G Communication' has both Dr. Debasish Saha and Dr. Susovan Mandal
      const commCat = res.data.categories.find((c) => c.id === 'comm-rf');
      expect(commCat).toBeDefined();
      const fiveG = commCat?.domains.find((d) => d.domain === '5G Communication');
      expect(fiveG).toBeDefined();
      expect(fiveG?.expertCount).toBe(2);
      expect(fiveG?.experts.map((e) => e.name)).toContain('Dr. Debasish Saha');
      expect(fiveG?.experts.map((e) => e.name)).toContain('Dr. Susovan Mandal');

      // Verify top domains
      const topDomainNames = res.data.stats.topDomains.map((t) => t.domain);
      expect(topDomainNames).toContain('5G Communication');
      expect(topDomainNames).toContain('AI and ML');
    }
  });
});
