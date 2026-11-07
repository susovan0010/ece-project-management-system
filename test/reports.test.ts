import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAdminReportOptionsAction,
  generateSemesterGroupReportAction,
  generateSemesterOverallReportAction,
} from '@/app/actions/reports';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

let mockBatches: any[] = [];
let mockGroups: any[] = [];
let mockStudents: any[] = [];
let mockUsers: any[] = [];
let mockTopics: any[] = [];
let mockMarkupVotes: any[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    batch: {
      findMany: vi.fn().mockImplementation(() => mockBatches),
    },
    user: {
      findMany: vi.fn().mockImplementation(() => mockUsers),
    },
    forumMarkupVote: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.targetUserId) {
          return mockMarkupVotes.filter((v) => v.targetUserId === where.targetUserId);
        }
        return mockMarkupVotes;
      }),
    },
    group: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        let list = [...mockGroups];
        if (where?.batchId) {
          list = list.filter((g) => g.batchId === where.batchId);
        }
        return list.map((g) => ({
          ...g,
          topic: mockTopics.find((t) => t.id === g.topicId) || null,
          supervisor: mockUsers.find((u) => u.id === g.supervisorId) || null,
          members: g.members || [],
          markEntries: g.markEntries || [],
        }));
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const g = mockGroups.find((group) => group.id === where.id);
        if (!g) return null;
        return {
          ...g,
          topic: mockTopics.find((t) => t.id === g.topicId) || null,
          supervisor: mockUsers.find((u) => u.id === g.supervisorId) || null,
          members: g.members || [],
          markEntries: g.markEntries || [],
        };
      }),
    },
  },
}));

import { auth } from '@/auth';

describe('Admin Reports Hub Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockBatches = [
      { id: '2023-2027', name: 'Batch 2023-2027' },
      { id: '2022-2026', name: 'Batch 2022-2026' },
    ];

    mockUsers = [
      { id: 'admin-1', name: 'Prof. Subhashis Majumder', email: 'admin@heritageit.edu', role: 'ADMIN' },
      { id: 'fac-1', name: 'Dr. Susovan Mandal', email: 'susovan.mandal@heritageit.edu', role: 'FACULTY' },
      { id: 'stud-user-1', name: 'Sourav Roy', email: 'sourav.roy@heritageit.edu', role: 'STUDENT' },
      { id: 'stud-user-2', name: 'Ananya Sen', email: 'ananya.sen@heritageit.edu', role: 'STUDENT' },
    ];

    mockTopics = [
      {
        id: 'topic-1',
        code: 'SIH26015',
        title: 'Geospatial AI Watershed Analysis',
        domain: 'AI and ML',
        category: 'SOFTWARE',
        description: 'Advanced computer vision on satellite imagery for water resource management.',
        source: 'SIH',
        sdgs: [
          { sdg: { code: 'SDG 6', title: 'Clean Water and Sanitation' }, target: 'Target 6.4' },
        ],
        attributes: [
          { level: 3, attribute: { code: 'WP1', title: 'Depth of Knowledge Required', kind: 'WP' } },
          { level: 2, attribute: { code: 'WP2', title: 'Range of Conflicting Requirements', kind: 'WP' } },
          { level: 2, attribute: { code: 'WP3', title: 'Depth of Analysis Required', kind: 'WP' } },
          { level: 2, attribute: { code: 'WP4', title: 'Familiarity of Issues', kind: 'WP' } },
          { level: 2, attribute: { code: 'EA1', title: 'Scope of Engineering Activities', kind: 'EA' } },
          { level: 2, attribute: { code: 'EA2', title: 'Resource Requirements', kind: 'EA' } },
          { level: 2, attribute: { code: 'WK1', title: 'Natural Sciences Knowledge', kind: 'WK' } },
          { level: 3, attribute: { code: 'WK5', title: 'Engineering Design Knowledge', kind: 'WK' } },
        ],
      },
    ];

    // Marks for Semester 6 and 7
    const markEntries = [
      // Sem 6: Criterion mapped to PO1 with 60%
      {
        id: 'm-1',
        criterionId: 101,
        marks: 12,
        examinerSlot: 1,
        criterion: {
          id: 101,
          semester: 6,
          rubricCode: 'A',
          key: 'lit_survey',
          maxMarks: 20,
          maps: [{ code: 'PO1' }, { code: 'WP1' }],
        },
      },
      // Sem 7: Criterion mapped to PO1 with 80% (Improved!)
      {
        id: 'm-2',
        criterionId: 201,
        marks: 16,
        examinerSlot: 1,
        criterion: {
          id: 201,
          semester: 7,
          rubricCode: 'C',
          key: 'implementation',
          maxMarks: 20,
          maps: [{ code: 'PO1' }, { code: 'WP1' }],
        },
      },
      // Sem 7 Rubric D Panel scores
      {
        id: 'm-3',
        criterionId: 202,
        marks: 6, // Novelty >= 5
        examinerSlot: 1,
        criterion: {
          id: 202,
          semester: 7,
          rubricCode: 'D',
          key: 'novelty_panel',
          maxMarks: 7,
          maps: [{ code: 'PO2' }, { code: 'EA1' }],
        },
      },
      {
        id: 'm-4',
        criterionId: 203,
        marks: 6, // Problem >= 5
        examinerSlot: 1,
        criterion: {
          id: 203,
          semester: 7,
          rubricCode: 'D',
          key: 'problem_panel',
          maxMarks: 7,
          maps: [{ code: 'PO3' }, { code: 'EA2' }],
        },
      },
      {
        id: 'm-5',
        criterionId: 204,
        marks: 2.5, // Impact >= 2
        examinerSlot: 1,
        criterion: {
          id: 204,
          semester: 7,
          rubricCode: 'D',
          key: 'impact_panel',
          maxMarks: 3,
          maps: [{ code: 'PO6' }],
        },
      },
    ];

    mockGroups = [
      {
        id: 'group-1',
        number: 1,
        batchId: '2023-2027',
        topicId: 'topic-1',
        supervisorId: 'fac-1',
        members: [
          {
            studentId: 'st-1',
            student: { id: 'st-1', userId: 'stud-user-1', name: 'Sourav Roy', roll: '12620003001' },
          },
          {
            studentId: 'st-2',
            student: { id: 'st-2', userId: 'stud-user-2', name: 'Ananya Sen', roll: '12620003002' },
          },
        ],
        markEntries,
      },
    ];

    // 12 markup votes = Iron badge
    mockMarkupVotes = Array(12).fill({ targetUserId: 'stud-user-1', value: 1 });
  });

  describe('getAdminReportOptionsAction', () => {
    it('rejects non-admin access', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'fac-1', role: 'FACULTY' },
      });
      const res = await getAdminReportOptionsAction();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/admin/i);
    });

    it('returns available batches, semesters, and groups for admin', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN' },
      });
      const res = await getAdminReportOptionsAction();
      expect(res.success).toBe(true);
      expect(res.data?.batches.length).toBe(2);
      expect(res.data?.semesters).toEqual([6, 7, 8]);
      expect(res.data?.groups.length).toBe(1);
    });
  });

  describe('generateSemesterGroupReportAction', () => {
    it('generates detailed semester-wise group report with only badges and attainment improvement', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN' },
      });

      const res = await generateSemesterGroupReportAction('group-1', 7);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const report = res.data!;
      expect(report.project.code).toBe('SIH26015');
      expect(report.supervisor.name).toBe('Dr. Susovan Mandal');

      // 1. Student members and strictly ONLY badges (no markup score)
      expect(report.students.length).toBe(2);
      const student1 = report.students.find((s) => s.roll === '12620003001')!;
      expect(student1.name).toBe('Sourav Roy');
      expect(student1.badges.iron).toBe(1);
      expect((student1 as any).effectiveScore).toBeUndefined();
      expect((student1 as any).markupScore).toBeUndefined();

      // 2. PO Attainment and bar percentages
      const po1Attainment = report.poAttainments.find((p) => p.po === 'PO1')!;
      expect(po1Attainment.percentage).toBe(80.0);
      expect(po1Attainment.level).toBe(2);
      expect(po1Attainment.isAttained).toBe(true);

      // 3. Emphasized improvement from Sem 6 (60%) to Sem 7 (80%)
      expect(po1Attainment.previousPercentage).toBe(60.0);
      expect(po1Attainment.hasImproved).toBe(true);
      expect(po1Attainment.deltaPercentage).toBe(20.0);
      expect(po1Attainment.improvementText).toMatch(/\+20% improvement/);

      // 4. Capstone Status and actionable missing requirements
      expect(report.capstone.steps.step1.passed).toBe(true);
      expect(report.capstone.steps.step2.passed).toBe(true);
      expect(report.capstone.whatIsNeeded.length).toBeGreaterThan(0);
      expect(report.capstone.whatIsNeeded.some((msg) => msg.includes('Semester 8'))).toBe(true);
    });
  });

  describe('generateSemesterOverallReportAction', () => {
    it('generates semester overall report with pure counts and details of capstone projects only', async () => {
      (auth as any).mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN' },
      });

      const res = await generateSemesterOverallReportAction('2023-2027', 7);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const report = res.data!;
      // Summary Metrics (Numbers only, no detail)
      expect(report.totalGroups).toBe(1);
      expect(report.totalStudents).toBe(2);
      expect(report.totalCapstoneQualifiedGroups).toBe(1);
      expect(report.capstonePercentage).toBe(100.0);

      // NBA Cohort PO Attainments
      expect(report.poAttainments.length).toBe(11);
      const po1Cohort = report.poAttainments.find((p) => p.po === 'PO1')!;
      expect(po1Cohort.isAttained).toBe(true);

      // Capstone Projects Showcase (Details of those projects ONLY)
      expect(report.capstoneProjects.length).toBe(1);
      const capstoneProject = report.capstoneProjects[0];
      expect(capstoneProject.projectCode).toBe('SIH26015');
      expect(capstoneProject.supervisorName).toBe('Dr. Susovan Mandal');
      expect(capstoneProject.studentNames).toContain('Sourav Roy');
      expect(capstoneProject.studentNames).toContain('Ananya Sen');
      expect(capstoneProject.attributeAttainments.length).toBeGreaterThan(0);
      expect(capstoneProject.poAttainments.length).toBe(11);
    });
  });
});
