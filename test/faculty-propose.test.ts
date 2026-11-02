// ========================================================
// ECE Capstone Project Management System - Faculty Proposal Unit Tests
// Verifies code sequence (FAC-YYYY-NNN), 500-word ceiling enforcement,
// role isolation (Faculty vs Admin), and live capstone qualification.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import {
  getFacultyProposalMetadataAction,
  saveFacultyTopicProposalAction,
  checkCapstoneQualificationAction,
  generateAiDescriptionDraftAction,
  checkSdgCompatibilityAction,
  suggestSupportedSdgsAction,
} from '../app/actions/faculty-propose';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Faculty Proposal: Role Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to get proposal metadata', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await getFacultyProposalMetadataAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects ADMIN user from proposing a topic (Mandatory Rule: Admin cannot propose)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-user-1', role: 'ADMIN', email: 'admin@heritageit.edu' },
    } as any);

    const res = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-001',
      title: 'Admin Proposed Topic',
      category: 'Hardware',
      description: 'Attempting to create topic as admin.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Administrators cannot propose or edit topics');
  });
});

describe('Faculty Proposal: 500-Word Ceiling Enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects descriptions exceeding 500 words', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    // Generate 505 words
    const longDescription = new Array(505).fill('engineering').join(' ');

    const res = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-001',
      title: 'Valid Project Title',
      category: 'Hardware',
      description: longDescription,
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('500-word limit');
  });
});

describe('Faculty Proposal: Live Capstone Qualification Check', () => {
  it('correctly qualifies when WP1>=2, three of WP2..7>=2, two of EA1..5>=2, and SDG target named', async () => {
    const levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };

    const res = await checkCapstoneQualificationAction(levels, true);
    expect(res.isQualified).toBe(true);
    expect(res.breakdown.wp1Met).toBe(true);
    expect(res.breakdown.wpOfSixMet).toBe(true);
    expect(res.breakdown.eaMet).toBe(true);
    expect(res.breakdown.hasSdgTarget).toBe(true);
  });

  it('fails qualification when WP1 < 2', async () => {
    const levels = {
      WP1: 1, // Fails
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };

    const res = await checkCapstoneQualificationAction(levels, true);
    expect(res.isQualified).toBe(false);
    expect(res.breakdown.wp1Met).toBe(false);
  });

  it('fails qualification when no SDG target is named', async () => {
    const levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };

    const res = await checkCapstoneQualificationAction(levels, false);
    expect(res.isQualified).toBe(false);
    expect(res.breakdown.hasSdgTarget).toBe(false);
  });
});

describe('Faculty Proposal: AI Abstract Drafting with Extended Context', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates abstract draft reflecting WP1 Level 2 and project context', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    (vi.spyOn(prisma.aiProvider, 'findMany') as any).mockResolvedValue([]);
    (vi.spyOn(prisma.user, 'findUnique') as any).mockResolvedValue({ preferredAiProvider: null });

    const res = await generateAiDescriptionDraftAction({
      title: 'Design of Reconfigurable Intelligent Surface for 6G',
      category: 'HARDWARE',
      theme: 'Wireless Communications',
      tags: ['RIS', '6G', 'Metasurface'],
      existingAbstract: 'Initial work on unit cell phase control.',
      targetAttributes: [{ code: 'WP1', level: 2, reason: 'Complex depth of knowledge' }],
      targetSdgs: [{ sdg: 9, target: '9.5', title: 'Industry, Innovation and Infrastructure' }],
    });

    expect(res.description).toBeDefined();
    expect(res.description).toContain('Design of Reconfigurable Intelligent Surface for 6G');
    expect(res.description).toContain('WP1');
    expect(res.description).toContain('Level 2');
    expect(res.providerUsed).toBeDefined();
  });

  it('checks SDG compatibility via checkSdgCompatibilityAction', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    (vi.spyOn(prisma.aiProvider, 'findMany') as any).mockResolvedValue([]);
    (vi.spyOn(prisma.user, 'findUnique') as any).mockResolvedValue({ preferredAiProvider: null });

    const res = await checkSdgCompatibilityAction({
      title: 'Solar Inverter Design',
      category: 'HARDWARE',
      theme: 'Renewable Energy',
      tags: ['Solar', 'Inverter'],
      selectedSdgs: [
        { sdg: 7, target: '7.2', title: 'Affordable and Clean Energy' },
        { sdg: 9, target: '9.5', title: 'Industry, Innovation and Infrastructure' },
      ],
    });

    expect(res.result).toBeDefined();
    expect(res.result?.satisfiable).toBe(true);
  });

  it('suggests SDGs via suggestSupportedSdgsAction', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    (vi.spyOn(prisma.aiProvider, 'findMany') as any).mockResolvedValue([]);
    (vi.spyOn(prisma.user, 'findUnique') as any).mockResolvedValue({ preferredAiProvider: null });

    const res = await suggestSupportedSdgsAction({
      title: 'Precision Agricultural Soil Sensor',
      category: 'HARDWARE',
      theme: 'Agriculture',
      tags: ['Soil', 'Farming', 'Telemetry'],
    });

    expect(res.suggestions).toBeDefined();
    expect(res.suggestions?.length).toBeGreaterThan(0);
    expect(res.suggestions?.some((s) => s.sdg === 2)).toBe(true);
  });
});
