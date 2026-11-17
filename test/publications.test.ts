import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  doesAuthorListMatchName,
  parseBibtexEntries,
  fetchOpenAlexWorks,
} from '@/lib/publications';
import {
  getMyPublicationsAction,
  createManualPublicationAction,
  deletePublicationAction,
} from '@/app/actions/publications';
import {
  getAdminShowcasePublicationsAction,
  saveShowcaseProductAction,
  saveIndustryCollaborationAction,
} from '@/app/actions/showcase';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const db = {
  users: [] as any[],
  students: [] as any[],
  groups: [] as any[],
  publications: [] as any[],
  showcaseProducts: [] as any[],
  industryCollaborations: [] as any[],
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return db.users.find((u) => u.id === where.id) || null;
      }),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.role?.in) {
          return db.users.filter((u) => where.role.in.includes(u.role));
        }
        return db.users;
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    student: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return db.students.find((s) => s.userId === where.userId) || null;
      }),
    },
    group: {
      findMany: vi.fn().mockImplementation(() => db.groups),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return db.groups.find((g) => g.id === where.id) || null;
      }),
    },
    publication: {
      findMany: vi.fn().mockImplementation(() => db.publications),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return db.publications.find((p) => p.id === where.id) || null;
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row = {
          id: `pub-${db.publications.length + 1}`,
          createdAt: new Date('2026-11-17T10:00:00Z'),
          ...data,
        };
        db.publications.push(row);
        return row;
      }),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        db.publications = db.publications.filter((p) => p.id !== where.id);
        return { id: where.id };
      }),
    },
    showcaseProduct: {
      findMany: vi.fn().mockImplementation(() => db.showcaseProducts),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row = {
          id: `prod-${db.showcaseProducts.length + 1}`,
          createdAt: new Date('2026-11-17T10:00:00Z'),
          ...data,
        };
        db.showcaseProducts.push(row);
        return row;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const idx = db.showcaseProducts.findIndex((p) => p.id === where.id);
        if (idx >= 0) db.showcaseProducts[idx] = { ...db.showcaseProducts[idx], ...data };
        return db.showcaseProducts[idx];
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    industryCollaboration: {
      findMany: vi.fn().mockImplementation(() => db.industryCollaborations),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row = {
          id: `ind-${db.industryCollaborations.length + 1}`,
          createdAt: new Date('2026-11-17T10:00:00Z'),
          ...data,
        };
        db.industryCollaborations.push(row);
        return row;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const idx = db.industryCollaborations.findIndex((c) => c.id === where.id);
        if (idx >= 0) db.industryCollaborations[idx] = { ...db.industryCollaborations[idx], ...data };
        return db.industryCollaborations[idx];
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { auth } from '@/auth';

describe('Publications Utilities & Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.users = [
      {
        id: 'fac-1',
        name: 'Dr. Susovan Mandal',
        email: 'susovan@heritageit.edu',
        role: 'FACULTY',
        orcidId: '0000-0001-2345-6789',
        scholarUrl: null,
      },
      {
        id: 'stu-1',
        name: 'Sourav Roy',
        email: 'sourav@heritageit.edu',
        role: 'STUDENT',
        orcidId: null,
        scholarUrl: null,
      },
      {
        id: 'admin-1',
        name: 'Committee Admin',
        email: 'admin@heritageit.edu',
        role: 'ADMIN',
        orcidId: null,
        scholarUrl: null,
      },
    ];
    db.groups = [
      {
        id: 'grp-1',
        number: 1,
        batchId: '2023-2027',
        isArchived: false,
        supervisorId: 'fac-1',
        supervisor: { id: 'fac-1', name: 'Dr. Susovan Mandal', email: 'susovan@heritageit.edu' },
        topic: { code: 'ECE-CAP-01', title: 'Low-Power Edge AI ECG Sensor' },
        members: [
          {
            student: {
              name: 'Sourav Roy',
              roll: '2351001',
              universityRoll: '12623003001',
            },
          },
        ],
      },
    ];
    db.students = [
      {
        id: 'student-row-1',
        userId: 'stu-1',
        name: 'Sourav Roy',
        roll: '2351001',
        groups: [{ group: db.groups[0] }],
      },
    ];
    db.publications = [];
    db.showcaseProducts = [];
    db.industryCollaborations = [];
  });

  it('matches author names across honorifics and Last, First formatting while avoiding false positives', () => {
    expect(doesAuthorListMatchName('Sourav Roy, Susovan Mandal', 'Dr. Susovan Mandal')).toBe(true);
    expect(doesAuthorListMatchName('Mandal, Susovan; Roy, S.', 'Dr. Susovan Mandal')).toBe(true);
    expect(doesAuthorListMatchName('S. Mandal, Sourav Roy', 'Dr. Susovan Mandal')).toBe(false);
    expect(doesAuthorListMatchName('Ananya Sen, Rahul Mukherjee', 'Dr. Susovan Mandal')).toBe(false);
    expect(doesAuthorListMatchName('Ananya Sen, Rahul Mukherjee', 'Sourav Roy')).toBe(false);
  });

  it('parses Google Scholar BibTeX entries accurately', () => {
    const bibtex = `
@article{roy2026edge,
  title={Low-Power Edge AI for {ECG} Monitoring},
  author={Roy, Sourav and Mandal, Susovan},
  journal={IEEE Sensors Journal},
  year={2026},
  doi={10.1109/JSEN.2026.12345}
}
@inproceedings{mandal2025vlsi,
  title={CMOS Subthreshold Amplifier Design},
  author={Mandal, Susovan and Sen, Ananya},
  booktitle={IEEE VLSID},
  year={2025}
}
`;
    const parsed = parseBibtexEntries(bibtex);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      title: 'Low-Power Edge AI for ECG Monitoring',
      authors: 'Sourav Roy, Susovan Mandal',
      venue: 'IEEE Sensors Journal',
      year: 2026,
      pubType: 'JOURNAL',
      doiUrl: 'https://doi.org/10.1109/JSEN.2026.12345',
    });
    expect(parsed[1].pubType).toBe('CONFERENCE');
  });

  it('fetches verified works from ORCID Public API and enriches authors via OpenAlex DOI lookup', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('pub.orcid.org') && url.endsWith('/works')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            group: [
              {
                'work-summary': [
                  {
                    title: { title: { value: 'Hardware-Aware Quantization on FPGA' } },
                    'publication-date': { year: { value: '2026' } },
                    'journal-title': { value: 'IEEE Transactions on Circuits' },
                    type: 'journal-article',
                    'external-ids': {
                      'external-id': [
                        { 'external-id-type': 'doi', 'external-id-value': '10.1000/xyz' },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        });
      }
      if (url.includes('pub.orcid.org') && url.endsWith('/person')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: {
              'given-names': { value: 'Susovan' },
              'family-name': { value: 'Mandal' },
            },
          }),
        });
      }
      if (url.includes('api.openalex.org/works')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'https://openalex.org/W999',
                doi: 'https://doi.org/10.1000/xyz',
                cited_by_count: 7,
                authorships: [
                  { author: { display_name: 'Susovan Mandal' } },
                  { author: { display_name: 'Sourav Roy' } },
                ],
                primary_location: {
                  source: { display_name: 'IEEE Transactions on Circuits' },
                },
              },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchOpenAlexWorks({ orcidId: '0000-0001-2345-6789' });
    expect(res.error).toBeUndefined();
    expect(res.matchedAuthorName).toBe('Susovan Mandal');
    expect(res.works).toHaveLength(1);
    expect(res.works[0]).toMatchObject({
      title: 'Hardware-Aware Quantization on FPGA',
      authors: 'Susovan Mandal, Sourav Roy',
      venue: 'IEEE Transactions on Circuits',
      year: 2026,
      pubType: 'JOURNAL',
      doiUrl: 'https://doi.org/10.1000/xyz',
      citationsCount: 7,
      openAlexId: 'https://openalex.org/W999',
    });
    vi.unstubAllGlobals();
  });

  it('supports bidirectional author-name cross-matching between student and supervisor', async () => {
    // 1. Student adds a publication naming supervisor as co-author
    (auth as any).mockResolvedValue({ user: { id: 'stu-1', role: 'STUDENT' } });
    const createStu = await createManualPublicationAction({
      title: 'Student-Led Edge ECG Paper',
      authors: 'Sourav Roy, Susovan Mandal',
      venue: 'IEEE INDICON',
      year: 2026,
      pubType: 'CONFERENCE',
    });
    expect(createStu.success).toBe(true);

    // 2. Supervisor adds a publication naming student as co-author
    (auth as any).mockResolvedValue({ user: { id: 'fac-1', role: 'FACULTY' } });
    const createFac = await createManualPublicationAction({
      title: 'Faculty-Led VLSI Paper',
      authors: 'Dr. Susovan Mandal, Sourav Roy',
      venue: 'IEEE TCAS-II',
      year: 2026,
      pubType: 'JOURNAL',
    });
    expect(createFac.success).toBe(true);

    // 3. Supervisor sees both: their own + student's paper matched by author name
    const facView = await getMyPublicationsAction();
    expect(facView.publications).toHaveLength(2);
    const stuPaperInFac = facView.publications!.find((p) => p.title === 'Student-Led Edge ECG Paper');
    expect(stuPaperInFac?.matchTag).toContain('Matched by Author Name');
    expect(stuPaperInFac?.canDelete).toBe(false);

    // 4. Student sees both: their own + supervisor's paper matched by author name
    (auth as any).mockResolvedValue({ user: { id: 'stu-1', role: 'STUDENT' } });
    const stuView = await getMyPublicationsAction();
    expect(stuView.publications).toHaveLength(2);
    const facPaperInStu = stuView.publications!.find((p) => p.title === 'Faculty-Led VLSI Paper');
    expect(facPaperInStu?.matchTag).toContain('Matched by Author Name');
    expect(facPaperInStu?.canDelete).toBe(false);

    // 5. Student cannot delete supervisor's publication
    const delFail = await deletePublicationAction(facPaperInStu!.id);
    expect(delFail.error).toContain('only delete publications you added');
  });

  it('links publications to project, group, students, and supervisor in Admin Showcase', async () => {
    (auth as any).mockResolvedValue({ user: { id: 'stu-1', role: 'STUDENT' } });
    await createManualPublicationAction({
      title: 'Capstone Edge ECG Implementation',
      authors: 'Sourav Roy, Susovan Mandal',
      venue: 'IEEE Sensors',
      year: 2026,
      pubType: 'JOURNAL',
    });

    // Non-admin blocked
    const denied = await getAdminShowcasePublicationsAction();
    expect(denied.error).toContain('Unauthorized');

    // Admin sees full linkage
    (auth as any).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const res = await getAdminShowcasePublicationsAction();
    expect(res.success).toBe(true);
    expect(res.publications).toHaveLength(1);
    expect(res.publications![0]).toMatchObject({
      title: 'Capstone Edge ECG Implementation',
      groupNumber: 1,
      batchId: '2023-2027',
      topicCode: 'ECE-CAP-01',
      topicTitle: 'Low-Power Edge AI ECG Sensor',
      supervisorName: 'Dr. Susovan Mandal',
    });
    expect(res.publications![0].studentMembers[0].name).toBe('Sourav Roy');

    // Admin can save Showcase Product & Industry Collaboration
    const prodRes = await saveShowcaseProductAction({
      title: 'Edge ECG Wearable',
      description: 'Real-time arrhythmia detection wearable prototype.',
      category: 'Hardware Prototype',
      trlLevel: 6,
      groupId: 'grp-1',
      featured: false,
    });
    expect(prodRes.success).toBe(true);

    const indRes = await saveIndustryCollaborationAction({
      companyName: 'Texas Instruments India',
      collaborationType: 'Sponsored Project',
      projectTitle: 'Ultra-Low-Power Biomedical Front-End',
      startYear: 2026,
      status: 'ACTIVE',
      groupId: 'grp-1',
    });
    expect(indRes.success).toBe(true);
  });
});
