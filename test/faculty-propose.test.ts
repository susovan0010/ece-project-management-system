// ========================================================
// ECE Capstone Project Management System - Faculty Proposal Unit Tests
// Verifies code sequence (FAC-YYYY-NNN), 500-word ceiling enforcement,
// role isolation (Faculty vs Admin), and live capstone qualification.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
    expect(res.description).not.toMatch(/\b(WP\d|WK\d|EA\d)\b/);
    expect(res.description).not.toMatch(/\bSDG\b/i);
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

describe('Faculty Proposal: Project Editing, SIH Title Lock & Mandatory Abstract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: 'INVITE_PROJECTS_FROM_SUPERVISORS',
      value: { enabled: true },
    } as any);
  });

  it('rejects topic proposal or edit if project abstract is blank', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    const res = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-001',
      title: 'Valid Project Title',
      category: 'Hardware',
      description: '   ',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Project Abstract is mandatory');
  });

  it('prohibits editing the title of an SIH topic while allowing abstract updates', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    vi.spyOn(prisma.attribute, 'findMany').mockResolvedValue([
      { id: 1, code: 'WP1' },
      { id: 2, code: 'WK5' },
    ] as any);

    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'sih-topic-1',
      code: 'SIH26001',
      title: 'Smart Disaster Early Warning Mesh Network',
      source: 'SIH',
      category: 'Hardware',
      description: 'Old abstract description.',
      proposerId: null,
      attributes: [],
      sdgs: [],
    } as any);

    // Attempting to change title of SIH topic
    const res = await saveFacultyTopicProposalAction({
      code: 'SIH26001',
      title: 'Modified SIH Title Not Allowed',
      category: 'Hardware',
      description: 'New refined abstract for SIH disaster management challenge.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Titles of SIH projects are locked');
  });

  it('allows editing both the title and abstract for UG Research topics', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    vi.spyOn(prisma.attribute, 'findMany').mockResolvedValue([
      { id: 1, code: 'WP1' },
      { id: 2, code: 'WK5' },
    ] as any);

    vi.spyOn(prisma.aiProvider, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ preferredAiProvider: null } as any);

    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'ugr-topic-1',
      code: 'UGR-017',
      title: 'Initial UG Research Title',
      source: 'UG_RESEARCH',
      category: 'Both',
      description: 'Initial UG research abstract description.',
      proposerId: null,
      attributes: [],
      sdgs: [],
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        topic: {
          update: vi.fn().mockResolvedValue({
            id: 'ugr-topic-1',
            code: 'UGR-017',
            title: 'Updated Advanced UG Research Title',
            status: 'CONFIRMED',
          }),
        },
        topicAttribute: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({}),
        },
        topicSdg: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({}),
        },
        descriptionVersion: {
          create: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      });
    });

    const res = await saveFacultyTopicProposalAction({
      code: 'UGR-017',
      title: 'Updated Advanced UG Research Title',
      category: 'Both',
      description: 'Deep technical abstract incorporating hardware telemetry and SDR analysis.',
      tags: ['SDR', 'DSP'],
      status: 'CONFIRMED',
      attributes: [{ code: 'WP1', level: 2, reason: 'Depth of knowledge', origin: 'FACULTY' }],
      sdgs: [{ sdgId: 9, target: '9.5', reason: 'Infrastructure and innovation' }],
      reEvaluateAiOnConfirm: true,
    });

    expect(res.success).toBe(true);
    expect(res.code).toBe('UGR-017');
    expect(res.updated).toBe(true);
  });

  it('rejects proposed topics with blank or missing title (mandatory field)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    const res = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-099',
      title: '   ',
      category: 'Software',
      description: 'A valid abstract describing the algorithmic pipeline and ML methodology.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Project Title is mandatory');
  });

  it('rejects proposed topics with blank or whitespace-only abstract (mandatory field)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty@heritageit.edu' },
    } as any);

    const res = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-099',
      title: 'Valid Proposed Topic Title',
      category: 'Hardware',
      description: '   ',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain('Project Abstract is mandatory');
  });

  it('requires a mandatory subtitle for SIH projects and allows multiple supervisors to adopt the same SIH topic', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-2', role: 'FACULTY', email: 'faculty2@heritageit.edu' },
    } as any);

    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      key: 'project_invitation_state',
      value: { enabled: true },
    } as any);
    vi.spyOn(prisma.attribute, 'findMany').mockResolvedValue([
      { id: 1, code: 'WP1', kind: 'WP', title: 'Depth', text: '...' },
    ] as any);
    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'sih-bank-1',
      code: 'SIH26001',
      title: 'Smart Border Surveillance & Intrusion Detection System',
      source: 'SIH',
      category: 'Both',
      domain: 'Embedded & AI',
      organization: 'Ministry of Defence',
      proposerId: null,
      status: 'DRAFT',
      attributes: [],
      sdgs: [],
    } as any);

    // 1. Missing subtitle -> rejected
    const missingSub = await saveFacultyTopicProposalAction({
      code: 'SIH26001',
      title: 'Smart Border Surveillance & Intrusion Detection System',
      subtitle: '',
      category: 'Both',
      description: 'Radar + thermal camera edge fusion on Jetson.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });
    expect(missingSub.error).toContain('Subtitle is mandatory for SIH');

    // 2. Valid subtitle -> forks a supervisor-owned SIH adoption (SIH26001-2) keeping SIH26001 intact
    vi.spyOn(prisma.topic, 'findMany').mockResolvedValue([{ code: 'SIH26001-1' }] as any);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ preferredAiProvider: null } as any);
    vi.spyOn(prisma.aiProvider, 'findMany').mockResolvedValue([]);

    let createdPayload: any = null;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        topic: {
          create: vi.fn().mockImplementation(async ({ data }: any) => {
            createdPayload = data;
            return { id: 'sih-fork-2', ...data };
          }),
        },
        topicAttribute: { create: vi.fn().mockResolvedValue({}) },
        topicSdg: { create: vi.fn().mockResolvedValue({}) },
        descriptionVersion: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      });
    });

    const adopted = await saveFacultyTopicProposalAction({
      code: 'SIH26001',
      title: 'Smart Border Surveillance & Intrusion Detection System',
      subtitle: 'LoRaWAN Acoustic & Thermal Edge Sensor Array',
      category: 'Both',
      description: 'Specific implementation using LoRaWAN nodes and thermal edge inference.',
      tags: ['LoRaWAN'],
      status: 'CONFIRMED',
      attributes: [{ code: 'WP1', level: 2, reason: 'Depth', origin: 'FACULTY' }],
      sdgs: [{ sdgId: 9, target: '9.5', reason: 'Innovation' }],
    });

    expect(adopted.success).toBe(true);
    expect(adopted.code).toBe('SIH26001-2');
    expect(adopted.forkedFrom).toBe('SIH26001');
    expect(createdPayload.title).toBe('Smart Border Surveillance & Intrusion Detection System');
    expect(createdPayload.subtitle).toBe('LoRaWAN Acoustic & Thermal Edge Sensor Array');
    expect(createdPayload.source).toBe('SIH');
    expect(createdPayload.proposerId).toBe('faculty-2');
  });

  it('blocks editing a confirmed own project unless Admin has unlocked editUnlockedByAdmin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-1', role: 'FACULTY', email: 'faculty1@heritageit.edu' },
    } as any);

    vi.spyOn(prisma.attribute, 'findMany').mockResolvedValue([
      { id: 1, code: 'WP1', kind: 'WP', title: 'Depth', text: '...' },
    ] as any);

    // 1. Locked by default (editUnlockedByAdmin: false)
    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'fac-topic-1',
      code: 'FAC-2026-001',
      title: 'Original Confirmed Title',
      source: 'FACULTY',
      status: 'CONFIRMED',
      proposerId: 'faculty-1',
      editUnlockedByAdmin: false,
      attributes: [],
      sdgs: [],
    } as any);

    const lockedRes = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-001',
      title: 'Modified Title',
      category: 'Hardware',
      description: 'Updated abstract text.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(lockedRes.error).toContain('locked for editing');

    // 2. Unlocked by Admin (editUnlockedByAdmin: true) -> succeeds
    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue({
      id: 'fac-topic-1',
      code: 'FAC-2026-001',
      title: 'Original Confirmed Title',
      source: 'FACULTY',
      status: 'CONFIRMED',
      proposerId: 'faculty-1',
      editUnlockedByAdmin: true,
      attributes: [],
      sdgs: [],
    } as any);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ preferredAiProvider: null } as any);
    vi.spyOn(prisma.aiProvider, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        topic: {
          update: vi.fn().mockResolvedValue({
            id: 'fac-topic-1',
            code: 'FAC-2026-001',
            title: 'Modified Title',
            status: 'CONFIRMED',
          }),
        },
        topicAttribute: { deleteMany: vi.fn(), create: vi.fn() },
        topicSdg: { deleteMany: vi.fn(), create: vi.fn() },
        descriptionVersion: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      });
    });

    const unlockedRes = await saveFacultyTopicProposalAction({
      code: 'FAC-2026-001',
      title: 'Modified Title',
      category: 'Hardware',
      description: 'Updated abstract text.',
      tags: [],
      status: 'CONFIRMED',
      attributes: [],
      sdgs: [],
    });

    expect(unlockedRes.success).toBe(true);
    expect(unlockedRes.updated).toBe(true);
  });
});
