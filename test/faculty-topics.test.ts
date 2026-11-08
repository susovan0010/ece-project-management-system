import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  searchFacultyTopicsAction,
  getFacultyTopicDetailAction,
} from '../app/actions/faculty-topics';
import { prisma } from '../lib/prisma';
import { auth } from '@/auth';

describe('Faculty Topics: Role Isolation & Authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
  });

  it('rejects unauthenticated requests to search faculty topics', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await searchFacultyTopicsAction({ query: 'IoT' });
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('rejects unauthenticated requests to get faculty topic detail', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await getFacultyTopicDetailAction('topic-id-123');
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });
});

describe('Faculty Topics: Query & Filtering Execution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
  });

  it('builds proper Prisma filters for query, category, and SDG IDs', async () => {
    // Mock faculty session
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY', email: 'prof@heritageit.edu' },
    } as any);

    // Mock Prisma count and findMany
    const mockTopics = [
      {
        id: 'top-1',
        code: 'SIH26001',
        title: 'Smart Solar Telemetry System',
        source: 'SIH',
        category: 'Hardware',
        domain: 'IoT',
        organization: 'MNRE',
        description: 'Solar monitoring unit with LoRa communication.',
        tags: ['solar', 'iot'],
        sdgs: [{ sdgId: 7, target: '7.2', sdg: { id: 7, title: 'Affordable and Clean Energy' } }],
        attributes: [
          { level: 2, origin: 'RULE', attribute: { code: 'WP1', kind: 'WP', title: 'Depth of Knowledge' } },
        ],
        proposer: null,
      },
    ];

    const countSpy = vi.spyOn(prisma.topic, 'count').mockResolvedValue(1);
    const findManySpy = vi.spyOn(prisma.topic, 'findMany').mockResolvedValue(mockTopics as any);
    const sdgFindManySpy = vi.spyOn(prisma.sdg, 'findMany').mockResolvedValue([
      { id: 7, title: 'Affordable and Clean Energy' },
    ] as any);

    const res = await searchFacultyTopicsAction({
      query: 'Solar',
      category: 'Hardware',
      source: 'SIH',
      sdgIds: [7],
      page: 1,
      pageSize: 12,
    });

    expect(res.error).toBeUndefined();
    expect(res.topics?.length).toBe(1);
    expect(res.totalCount).toBe(1);
    expect(res.totalPages).toBe(1);

    // Check where clauses passed to Prisma count
    expect(countSpy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        source: 'SIH',
        category: { equals: 'Hardware', mode: 'insensitive' },
        sdgs: { some: { sdgId: { in: [7] } } },
        OR: expect.arrayContaining([
          expect.objectContaining({ title: { contains: 'Solar', mode: 'insensitive' } }),
        ]),
      }),
    });
  });

  it('returns not found error when topic id or code does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.topic, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue(null);

    const res = await getFacultyTopicDetailAction('non-existent-id');
    expect(res.error).toBe('Topic not found.');
  });

  it('retrieves topic detail by code or by id for customizing/editing', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY' },
    } as any);

    const mockDetail = {
      id: 'ugr-cuid-1',
      code: 'UGR-017',
      title: 'UG Research Drone Telemetry',
      source: 'UG_RESEARCH',
      category: 'Hardware',
      description: 'Existing prefilled abstract description.',
      sdgs: [],
      attributes: [],
      versions: [],
      declarations: [],
      proposer: null,
    };

    const findFirstSpy = vi.spyOn(prisma.topic, 'findFirst').mockResolvedValue(mockDetail as any);

    const res = await getFacultyTopicDetailAction('UGR-017');
    expect(res.error).toBeUndefined();
    expect(res.topic?.title).toBe('UG Research Drone Telemetry');
    expect(res.topic?.description).toBe('Existing prefilled abstract description.');
    expect(findFirstSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: 'UGR-017' }, { code: 'UGR-017' }],
        },
      })
    );
  });

  it('rejects unauthenticated requests to get my confirmed topics', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { getMyConfirmedTopicsAction } = await import('../app/actions/faculty-topics');
    const res = await getMyConfirmedTopicsAction();
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Unauthorized');
  });

  it('retrieves confirmed topics for logged in supervisor', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY' },
    } as any);

    const findManySpy = vi.spyOn(prisma.topic, 'findMany').mockResolvedValue([
      { id: 'top-1', code: 'FAC-2026-001', title: '5G Array' },
    ] as any);

    const { getMyConfirmedTopicsAction } = await import('../app/actions/faculty-topics');
    const res = await getMyConfirmedTopicsAction();
    expect(res.error).toBeUndefined();
    expect(res.topics).toHaveLength(1);
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { proposerId: 'faculty-user-1' },
            { groups: { some: { supervisorId: 'faculty-user-1' } } },
          ],
        },
      })
    );
  });

  it('isolates topics so that topics proposed by another faculty are hidden in search', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-A', role: 'FACULTY' },
    } as any);

    const countSpy = vi.spyOn(prisma.topic, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.topic, 'findMany').mockResolvedValue([] as any);
    vi.spyOn(prisma.sdg, 'findMany').mockResolvedValue([] as any);

    await searchFacultyTopicsAction({});

    // Verify privacy filter is applied: must only see own topics or unassigned pool topics
    expect(countSpy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          {
            OR: [
              { proposerId: 'faculty-A' },
              { proposerId: null },
            ],
          },
        ]),
      }),
    });
  });

  it('blocks faculty from accessing topic details proposed by another faculty member', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-A', role: 'FACULTY' },
    } as any);

    // Topic belongs to faculty-B
    const topicProposedByB = {
      id: 'topic-b-1',
      code: 'FAC-2026-099',
      title: 'Private Topic of Faculty B',
      proposerId: 'faculty-B',
      groups: [],
    };

    vi.spyOn(prisma.topic, 'findFirst').mockResolvedValue(topicProposedByB as any);

    const res = await getFacultyTopicDetailAction('topic-b-1');
    expect(res.error).toBe('Unauthorized: Topics submitted by other faculty members are private.');
  });
});
