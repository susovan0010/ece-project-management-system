import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
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

  it('returns not found error when topic id does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'faculty-user-1', role: 'FACULTY' },
    } as any);

    vi.spyOn(prisma.topic, 'findUnique').mockResolvedValue(null);

    const res = await getFacultyTopicDetailAction('non-existent-id');
    expect(res.error).toBe('Topic not found.');
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
});
