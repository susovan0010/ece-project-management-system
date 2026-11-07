'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  attainment,
  getAttainmentLevel,
  getAttainmentLevelDescription,
  calculateCohortAttainmentLevel,
  DEFAULT_ATTAINMENT_TARGET,
  MarkEntryInput,
  Levels,
} from '@/lib/engine';
import { evaluateCapstone, CapstoneInput, CapstoneResult } from '@/lib/engine/capstone';
import { calculateStudentBadges, StudentBadgeSummary } from '@/lib/engine/badge-engine';

// ----------------------------------------------------
// 0. Load Available Options for Report Selection
// ----------------------------------------------------
export interface ReportFilterOptions {
  batches: Array<{ id: string; name: string }>;
  semesters: number[];
  groups: Array<{ id: string; number: number; batchId: string; topicTitle: string; supervisorName: string }>;
}

export async function getAdminReportOptionsAction(): Promise<{
  success: boolean;
  data?: ReportFilterOptions;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    return { success: false, error: 'Access denied: Project Committee Admin access required.' };
  }

  try {
    const batches = await prisma.batch.findMany({
      orderBy: { id: 'desc' },
      select: { id: true, active: true },
    });

    const groups = await prisma.group.findMany({
      select: {
        id: true,
        number: true,
        batchId: true,
        topic: { select: { title: true } },
        supervisor: { select: { name: true } },
      },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    return {
      success: true,
      data: {
        batches:
          batches.length > 0
            ? batches.map((b) => ({ id: b.id, name: `Batch ${b.id}` }))
            : [{ id: '2023-2027', name: 'Batch 2023-2027' }],
        semesters: [6, 7, 8],
        groups: groups.map((g) => ({
          id: g.id,
          number: g.number,
          batchId: g.batchId,
          topicTitle: g.topic?.title || 'Untitled Topic',
          supervisorName: g.supervisor?.name || 'Unassigned',
        })),
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 1. Generate Semester-wise Group Report
// ----------------------------------------------------
export interface GroupReportStudentMember {
  id: string;
  name: string;
  roll: string;
  // NOTE: Strictly ONLY badges, NOT markup score
  badges: {
    diamonds: number;
    gold: number;
    silver: number;
    copper: number;
    iron: number;
    totalBadgesCount: number;
    hasAnyBadge: boolean;
  };
}

export interface GroupReportPOAttainment {
  po: string;
  percentage: number;
  level: number;
  levelDescription: string;
  isAttained: boolean;
  // Last semester comparison & improvement
  previousPercentage: number | null;
  previousLevel: number | null;
  deltaPercentage: number | null;
  hasImproved: boolean;
  improvementText?: string;
}

export interface SemesterGroupReportData {
  generatedAt: string;
  semester: number;
  group: {
    id: string;
    number: number;
    batchId: string;
  };
  project: {
    code: string;
    title: string;
    domain: string;
    category: string;
    description: string;
    source: string;
    sdgs: Array<{ code: string; title: string; target?: string }>;
    attributes: Array<{ code: string; title: string; kind: string; level: number }>;
  };
  supervisor: {
    name: string;
    email: string;
  };
  students: GroupReportStudentMember[];
  poAttainments: GroupReportPOAttainment[];
  overallAttainedPOCount: number;
  capstone: {
    isCapstone: boolean;
    status: 'QUALIFIED' | 'FAILED' | 'PENDING';
    summary: string;
    whatIsNeeded: string[];
    steps: {
      step1: { passed: boolean; details: string };
      step2: { passed: boolean; pending: boolean; details: string };
      step3: { passed: boolean; pending: boolean; details: string };
      step4: { passed: boolean; details: string };
    };
  };
}

export async function generateSemesterGroupReportAction(
  groupId: string,
  semester: number
): Promise<{
  success: boolean;
  data?: SemesterGroupReportData;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    return { success: false, error: 'Access denied: Project Committee Admin access required.' };
  }

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        topic: {
          include: {
            sdgs: { include: { sdg: true } },
            attributes: { include: { attribute: true } },
          },
        },
        supervisor: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            student: true,
          },
        },
        markEntries: {
          include: {
            criterion: {
              include: {
                maps: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return { success: false, error: 'Group record not found.' };
    }

    // 1. Process Student Members and Earned Badges (Strictly excluding mark up score)
    const studentsWithBadges: GroupReportStudentMember[] = await Promise.all(
      group.members.map(async (gm) => {
        let diamonds = 0;
        let gold = 0;
        let silver = 0;
        let copper = 0;
        let iron = 0;

        if (gm.student.userId) {
          const votes = await prisma.forumMarkupVote.findMany({
            where: { targetUserId: gm.student.userId },
            select: { value: true },
          });
          const netMarks = votes.reduce((sum, v) => sum + (v.value || 0), 0);
          const badgeSummary = calculateStudentBadges(netMarks);
          diamonds = badgeSummary.diamonds;
          gold = badgeSummary.gold;
          silver = badgeSummary.silver;
          copper = badgeSummary.copper;
          iron = badgeSummary.iron;
        }

        const totalBadgesCount = diamonds + gold + silver + copper + iron;
        return {
          id: gm.student.id,
          name: gm.student.name,
          roll: gm.student.roll,
          badges: {
            diamonds,
            gold,
            silver,
            copper,
            iron,
            totalBadgesCount,
            hasAnyBadge: totalBadgesCount > 0,
          },
        };
      })
    );

    // 2. Prepare Current Semester Mark Inputs
    const currentSemEntries = group.markEntries.filter((m) => m.criterion.semester === semester);
    const prevSemester = semester > 6 ? semester - 1 : null;
    const prevSemEntries = prevSemester
      ? group.markEntries.filter((m) => m.criterion.semester === prevSemester)
      : [];

    const buildMarkInputs = (entries: typeof group.markEntries): MarkEntryInput[] => {
      const map = new Map<number, { sum: number; count: number; max: number; maps: string[] }>();
      for (const e of entries) {
        const critId = e.criterionId;
        const maps = e.criterion.maps.map((m) => m.code);
        if (!map.has(critId)) {
          map.set(critId, { sum: e.marks, count: 1, max: e.criterion.maxMarks, maps });
        } else {
          const cur = map.get(critId)!;
          cur.sum += e.marks;
          cur.count += 1;
        }
      }
      return Array.from(map.values()).map((v) => ({
        marks: v.sum / v.count,
        max: v.max,
        maps: v.maps,
      }));
    };

    const currentMarkInputs = buildMarkInputs(currentSemEntries);
    const prevMarkInputs = buildMarkInputs(prevSemEntries);

    // 3. Compute PO Attainment for PO1 to PO11 & Improvement Tracking
    const poList = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);
    const poAttainments: GroupReportPOAttainment[] = [];

    for (const po of poList) {
      const curAtt = attainment(currentMarkInputs, po);
      const curPct = curAtt !== null ? Number((curAtt * 100).toFixed(1)) : 0;
      const curLevel = curAtt !== null ? getAttainmentLevel(curAtt) : 0;
      const isAttained = curLevel >= 1 || curPct >= 65;

      let prevPct: number | null = null;
      let prevLevel: number | null = null;
      let deltaPct: number | null = null;
      let hasImproved = false;
      let improvementText: string | undefined;

      if (prevSemester) {
        const pAtt = attainment(prevMarkInputs, po);
        if (pAtt !== null) {
          prevPct = Number((pAtt * 100).toFixed(1));
          prevLevel = getAttainmentLevel(pAtt);
          deltaPct = Number((curPct - prevPct).toFixed(1));
          if (deltaPct > 0) {
            hasImproved = true;
            improvementText = `+${deltaPct}% improvement (Level ${prevLevel} → Level ${curLevel})`;
          } else if (deltaPct === 0) {
            improvementText = `Maintained steady at ${curPct}%`;
          } else {
            improvementText = `${deltaPct}% vs Sem ${prevSemester}`;
          }
        }
      }

      poAttainments.push({
        po,
        percentage: curPct,
        level: curLevel,
        levelDescription: getAttainmentLevelDescription(curLevel),
        isAttained,
        previousPercentage: prevPct,
        previousLevel: prevLevel,
        deltaPercentage: deltaPct,
        hasImproved,
        improvementText,
      });
    }

    const overallAttainedPOCount = poAttainments.filter((p) => p.isAttained).length;

    // 4. Capstone Status & Missing Requirements Engine
    const topicLevels: Levels = {};
    for (const attr of group.topic.attributes) {
      topicLevels[attr.attribute.code] = attr.level;
    }
    const hasSdgTarget = group.topic.sdgs.length > 0;

    // Extract Rubric D (Sem 7) and Rubric F (Sem 8) scores for capstone engine
    const rubricDEntries = group.markEntries.filter((m) => m.criterion.rubricCode === 'D');
    const rubricFEntries = group.markEntries.filter((m) => m.criterion.rubricCode === 'F');

    // Group rubric D by examinerSlot
    const rubricDScoresMap = new Map<number, { novelty: number; realisticProblem: number; impactOnSociety: number }>();
    for (const entry of rubricDEntries) {
      const slot = entry.examinerSlot || 1;
      if (!rubricDScoresMap.has(slot)) {
        rubricDScoresMap.set(slot, { novelty: 0, realisticProblem: 0, impactOnSociety: 0 });
      }
      const record = rubricDScoresMap.get(slot)!;
      if (entry.criterion.key.includes('novelty')) record.novelty = entry.marks;
      else if (entry.criterion.key.includes('problem') || entry.criterion.key.includes('realistic')) record.realisticProblem = entry.marks;
      else if (entry.criterion.key.includes('impact') || entry.criterion.key.includes('society')) record.impactOnSociety = entry.marks;
    }

    const rubricDScores = Array.from(rubricDScoresMap.entries()).map(([examinerSlot, s]) => ({
      examinerSlot,
      novelty: s.novelty,
      realisticProblem: s.realisticProblem,
      impactOnSociety: s.impactOnSociety,
    }));

    // Rubric F
    let rubricFScore: { novelty: number; realisticProblem: number; impactOnSociety: number } | undefined;
    if (rubricFEntries.length > 0) {
      let novelty = 0;
      let realisticProblem = 0;
      let impactOnSociety = 0;
      for (const entry of rubricFEntries) {
        if (entry.criterion.key.includes('novelty')) novelty = entry.marks;
        else if (entry.criterion.key.includes('problem') || entry.criterion.key.includes('realistic')) realisticProblem = entry.marks;
        else if (entry.criterion.key.includes('impact') || entry.criterion.key.includes('society')) impactOnSociety = entry.marks;
      }
      rubricFScore = { novelty, realisticProblem, impactOnSociety };
    }

    const capstoneEval = evaluateCapstone({
      topicLevels,
      hasSdgTarget,
      rubricDScores: rubricDScores.length > 0 ? rubricDScores : undefined,
      rubricFScore,
      declarationsConfirmed: false,
    });

    // Determine what is needed to make the project capstone
    const whatIsNeeded: string[] = [];
    if (!capstoneEval.step1.passed) {
      whatIsNeeded.push('Step 1 (Topic Qualification): Attain WP1 ≥ 2, at least three of WP2..WP7 ≥ 2, at least two of EA1..EA5 ≥ 2, and link at least 1 SDG.');
    }
    if (!capstoneEval.step2.passed) {
      if (capstoneEval.step2.pending) {
        whatIsNeeded.push('Step 2 (Semester 7 Panel Evaluation): Complete Sem 7 Rubric D assessment achieving Novelty ≥ 5/7, Realistic Problem ≥ 5/7, and Social/Environmental Impact ≥ 2/3.');
      } else {
        whatIsNeeded.push('Step 2 (Semester 7 Panel Evaluation): Score fell below required Rubric D cut-offs (Novelty ≥ 5, Problem ≥ 5, Impact ≥ 2).');
      }
    }
    if (!capstoneEval.step3.passed) {
      if (capstoneEval.step3.pending) {
        whatIsNeeded.push('Step 3 (Semester 8 External Examiner Evaluation): Complete Sem 8 Rubric F assessment achieving Novelty ≥ 6/8, Realistic Problem ≥ 6/8, and Social/Environmental Impact ≥ 2/3.');
      } else {
        whatIsNeeded.push('Step 3 (Semester 8 External Examiner Evaluation): Score fell below required Rubric F cut-offs (Novelty ≥ 6, Problem ≥ 6, Impact ≥ 2).');
      }
    }
    if (!capstoneEval.step4.passed) {
      whatIsNeeded.push('Step 4 (Supervisor Complexity Declaration): Faculty supervisor must submit the declaration confirming unassessed complex engineering attributes (WP5, WP7, etc.).');
    }

    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        semester,
        group: {
          id: group.id,
          number: group.number,
          batchId: group.batchId,
        },
        project: {
          code: group.topic.code,
          title: group.topic.title,
          domain: group.topic.domain || 'General',
          category: group.topic.category || 'General',
          description: group.topic.description || 'No description provided.',
          source: group.topic.source,
          sdgs: group.topic.sdgs.map((s) => ({
            code: `SDG ${s.sdg.id}`,
            title: s.sdg.title,
            target: s.target || undefined,
          })),
          attributes: group.topic.attributes.map((a) => ({
            code: a.attribute.code,
            title: a.attribute.title,
            kind: a.attribute.kind,
            level: a.level,
          })),
        },
        supervisor: {
          name: group.supervisor.name,
          email: group.supervisor.email,
        },
        students: studentsWithBadges,
        poAttainments,
        overallAttainedPOCount,
        capstone: {
          isCapstone: capstoneEval.isCapstone,
          status: capstoneEval.status,
          summary: capstoneEval.summary,
          whatIsNeeded,
          steps: {
            step1: { passed: capstoneEval.step1.passed, details: capstoneEval.step1.details },
            step2: { passed: capstoneEval.step2.passed, pending: capstoneEval.step2.pending, details: capstoneEval.step2.details },
            step3: { passed: capstoneEval.step3.passed, pending: capstoneEval.step3.pending, details: capstoneEval.step3.details },
            step4: { passed: capstoneEval.step4.passed, details: capstoneEval.step4.details },
          },
        },
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------
// 2. Generate Semester-wise Overall Batch Report
// ----------------------------------------------------
export interface OverallReportPOCohortAttainment {
  po: string;
  attainmentLevel: number; // 0, 1, 2, 3
  levelDescription: string;
  isAttained: boolean;
  pctGte65: number;
  pctGte75: number;
  pctGte85: number;
  totalStudentsEvaluated: number;
}

export interface OverallReportCapstoneProjectItem {
  groupId: string;
  groupNumber: number;
  projectCode: string;
  projectTitle: string;
  supervisorName: string;
  studentNames: string[];
  attributeAttainments: Array<{ code: string; percentage: number; level: number }>;
  poAttainments: Array<{ po: string; percentage: number; level: number }>;
}

export interface SemesterOverallReportData {
  generatedAt: string;
  batchId: string;
  semester: number;
  // Summary Metrics (No student detail, just numbers)
  totalGroups: number;
  totalStudents: number;
  totalCapstoneQualifiedGroups: number;
  capstonePercentage: number;
  // Cohort NBA PO Attainment
  poAttainments: OverallReportPOCohortAttainment[];
  overallAttainedPOCount: number;
  // Capstone Projects Showcase (Details of those projects ONLY)
  capstoneProjects: OverallReportCapstoneProjectItem[];
}

export async function generateSemesterOverallReportAction(
  batchId: string,
  semester: number
): Promise<{
  success: boolean;
  data?: SemesterOverallReportData;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized.' };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    return { success: false, error: 'Access denied: Project Committee Admin access required.' };
  }

  try {
    // 1. Fetch all groups for this batch with full relational tree
    const groups = await prisma.group.findMany({
      where: { batchId },
      include: {
        topic: {
          include: {
            sdgs: true,
            attributes: { include: { attribute: true } },
          },
        },
        supervisor: { select: { name: true } },
        members: {
          include: { student: true },
        },
        markEntries: {
          where: {
            criterion: { semester },
          },
          include: {
            criterion: {
              include: { maps: true },
            },
          },
        },
      },
      orderBy: { number: 'asc' },
    });

    const totalGroups = groups.length;
    // Count distinct students across groups
    const studentIdSet = new Set<string>();
    groups.forEach((g) => g.members.forEach((m) => studentIdSet.add(m.studentId)));
    const totalStudents = studentIdSet.size;

    // 2. Compute NBA Cohort Attainment for PO1 to PO11 across all students
    const poList = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);
    const poCohortAttainments: OverallReportPOCohortAttainment[] = [];

    // Map each group to its averaged criterion marks for current semester
    const groupMarkInputsMap = new Map<string, MarkEntryInput[]>();
    for (const g of groups) {
      const critMap = new Map<number, { sum: number; count: number; max: number; maps: string[] }>();
      for (const e of g.markEntries) {
        const critId = e.criterionId;
        const maps = e.criterion.maps.map((m) => m.code);
        if (!critMap.has(critId)) {
          critMap.set(critId, { sum: e.marks, count: 1, max: e.criterion.maxMarks, maps });
        } else {
          const cur = critMap.get(critId)!;
          cur.sum += e.marks;
          cur.count += 1;
        }
      }
      const inputs: MarkEntryInput[] = Array.from(critMap.values()).map((v) => ({
        marks: v.sum / v.count,
        max: v.max,
        maps: v.maps,
      }));
      groupMarkInputsMap.set(g.id, inputs);
    }

    for (const po of poList) {
      // Collect student percentages for this PO
      const studentPcts: number[] = [];
      for (const g of groups) {
        const inputs = groupMarkInputsMap.get(g.id) || [];
        const att = attainment(inputs, po);
        const pct = att !== null ? att * 100 : 0;
        // Each student in this group receives this group PO attainment score
        g.members.forEach(() => studentPcts.push(pct));
      }

      const cohortDist = calculateCohortAttainmentLevel(studentPcts, 60);
      poCohortAttainments.push({
        po,
        attainmentLevel: cohortDist.attainmentLevel,
        levelDescription: getAttainmentLevelDescription(cohortDist.attainmentLevel),
        isAttained: cohortDist.isAttained,
        pctGte65: cohortDist.pctGte65,
        pctGte75: cohortDist.pctGte75,
        pctGte85: cohortDist.pctGte85,
        totalStudentsEvaluated: studentPcts.length,
      });
    }

    const overallAttainedPOCount = poCohortAttainments.filter((p) => p.isAttained).length;

    // 3. Evaluate Capstone Projects & Collect Details of THOSE Projects ONLY
    const capstoneProjects: OverallReportCapstoneProjectItem[] = [];

    for (const g of groups) {
      const topicLevels: Levels = {};
      for (const attr of g.topic.attributes) {
        topicLevels[attr.attribute.code] = attr.level;
      }
      const hasSdgTarget = g.topic.sdgs.length > 0;

      // Evaluate Capstone Input
      const capstoneEval = evaluateCapstone({
        topicLevels,
        hasSdgTarget,
        declarationsConfirmed: true, // check if qualified at topic & rubric stage
      });

      // If Step 1 meets qualification or qualifies as capstone
      if (capstoneEval.step1.passed) {
        const inputs = groupMarkInputsMap.get(g.id) || [];

        // Compute POs for this capstone project
        const groupPOAttainments = poList.map((po) => {
          const att = attainment(inputs, po);
          const percentage = att !== null ? Number((att * 100).toFixed(1)) : 0;
          return {
            po,
            percentage,
            level: getAttainmentLevel(att),
          };
        });

        // Compute Washington Accord attribute attainments (WP, WK, EA)
        const attributeCodes = [
          'WP1', 'WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7',
          'WK1', 'WK2', 'WK3', 'WK4', 'WK5', 'WK6', 'WK7', 'WK8', 'WK9',
          'EA1', 'EA2', 'EA3', 'EA4', 'EA5',
        ];
        const groupAttrAttainments = attributeCodes
          .map((code) => {
            const att = attainment(inputs, code);
            if (att === null) return null;
            return {
              code,
              percentage: Number((att * 100).toFixed(1)),
              level: getAttainmentLevel(att),
            };
          })
          .filter(Boolean) as Array<{ code: string; percentage: number; level: number }>;

        capstoneProjects.push({
          groupId: g.id,
          groupNumber: g.number,
          projectCode: g.topic.code,
          projectTitle: g.topic.title,
          supervisorName: g.supervisor.name,
          studentNames: g.members.map((m) => m.student.name),
          attributeAttainments: groupAttrAttainments,
          poAttainments: groupPOAttainments,
        });
      }
    }

    const totalCapstoneQualifiedGroups = capstoneProjects.length;
    const capstonePercentage = totalGroups > 0 ? Number(((totalCapstoneQualifiedGroups / totalGroups) * 100).toFixed(1)) : 0;

    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        batchId,
        semester,
        totalGroups,
        totalStudents,
        totalCapstoneQualifiedGroups,
        capstonePercentage,
        poAttainments: poCohortAttainments,
        overallAttainedPOCount,
        capstoneProjects,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
